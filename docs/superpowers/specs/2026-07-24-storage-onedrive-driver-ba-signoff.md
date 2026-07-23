# BA Validation & Sign-off — Per-Tenant Storage Provider: Microsoft OneDrive Driver (Sub-project 3 of 3)

**Agent:** @ba-agent (Step 3 of Anemal pipeline)
**Date:** 2026-07-24
**Inputs reviewed:**
- Design: `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md` (Q1–Q4 resolved 2026-07-24, commit `d528b10`)
- Predecessor conventions: `docs/superpowers/specs/2026-07-23-storage-google-drive-driver-{design,ba-signoff}.md`, `docs/superpowers/specs/2026-07-23-storage-custom-path-driver-{design,ba-signoff}.md`, `docs/adr/0023-per-tenant-network-share-storage-driver.md` (incl. Google Drive amendment §11–17)
- **Live source (this is where the substantive finding came from):** `src/backend/controllers/oauth-google.controller.ts` (shipped callback), `src/backend/controllers/settings.controller.ts` (`googleAuthorize`, `storageConfigSchema`), `src/backend/models/oauth-connect-nonce.repository.ts` (`consumeNonce`), `src/backend/services/storage-config.service.ts` (`updateStorageConfig`, `resolveStorageConfig`, disconnect-nulls-columns), `src/backend/models/tenant-storage-config.repository.ts`, `src/backend/routes/{oauth-google,settings}.routes.ts`
- Branch state: `git log main..feature/tenant-storage-provider` (confirms Google Sub-PR A/B commits present; PR #48 already squash-merged to `main` and reconciled back — the design's "sequenced after Google Sub-PR B lands" dependency is satisfied)
**Skills applied:** `anemal-rbac-matrix` (+ `references/permission-matrix.md`), `anemal-functional-reqs` (FR-14), `anemal-db-context`, `anemal-ba-toolkit`
**Gate role:** Gates Step 3.5 (`/grill-with-docs`) and Step 4 (`/write-plan`). Verdict at foot.

---

## 0. Product decisions (Q1–Q4) — accepted as final, not re-opened

Q1 (both account types → `{audience}=common`), Q2 (private app folder / `Files.ReadWrite.AppFolder`), Q3 (dev team owns the Entra app registration + secret rotation; display name "Anemal"), Q4 (accept "Need admin approval" friction for v1) are recorded in §0 of the design as product-owner answers. **I treat all four as settled and did not re-derive them.** The §0 "FYI" (Microsoft has no app-side self-revoke) is decision-neutral and is handled technically by M-3 — not an open question.

**No new open business decision surfaced during validation.** Every gap I found (below) is a *technical/security invariant already committed to by this project* (the G-4b "no stale secret at rest after a switch" rule), not a product choice — so I resolve it as a required engineering change, not an escalation. Nothing here needs the product owner.

---

## 1. Inherited-decision audit (I-1..I-20) — applied correctly, one gap

I checked each of the 20 inherited rows against the live shipped predecessor code, not just against the design's own prose. Result: **19 of 20 correctly applied; I-14 is applied only in the disconnect direction and leaves the connect direction under-specified (F-OD-1).**

| # | Verdict |
|---|---|
| I-1 build order / one branch | ✔ Correct — Google Sub-PR B (PR #48) is merged to `main` and reconciled into the branch; the sequencing precondition is met, not a pipeline risk. |
| I-2 least-privilege scope | ✔ `Files.ReadWrite.AppFolder` (approot) is the true least-privilege analog of `drive.file`; external ref verified (works for both account types, Q1). |
| I-3 `getStorageDriver` single switch point | ✔ One `provider === 'onedrive'` branch, zero call-site churn — matches how `google_drive` was added. `parseKey` reuse contract preserved. |
| I-4 tenant-scoped folder prefix | ✔ **Reasoning is correct and non-trivially so:** approot is per-app+per-Microsoft-account, so two Anemal tenants on one Microsoft account share one approot — the `tenant-{id}` prefix is required for exactly the N-2 reason, and the design says so explicitly rather than assuming "one account = one tenant." Good. |
| I-5 error-never-fallback | ✔ Same `StorageNotFoundError`/`StorageUnavailableError` contract; M-9 maps onto it. |
| I-6 `clinic.integrations.edit` write / `clinic.profile.view` read, deny-by-default | ✔ Confirmed against `settings.routes.ts:23-24` — reuses the exact codes; §5 adds no new permission. See §3. |
| I-7 tokens encrypted, never returned by GET | ✔ Same `encryptField`; §5 keeps the `configured`/`connected` boolean stand-in. |
| I-8 `/authorize` split-hop, server-derived origin | ✔ Mirrors the shipped `googleAuthorize` (`deriveTenantFrontendOrigin(tenant.subdomain)`, `settings.controller.ts:226`) — origin never client-supplied. |
| I-9 callback on own top-level provider-generic path | ✔ `GET /oauth/onedrive/callback` beside `oauth-google.routes.ts`'s `/google/callback`; the top-level prefix was chosen precisely so this sub-project reuses it order-independently. |
| I-10 HKDF-HMAC signed `state`, 10-min TTL, atomic single-use nonce | ✔ Reuses `oauth-state.ts` + `OAuthConnectNonce` verbatim, plus the M-7 hardening (below). |
| I-11 invalid/expired state → fixed default origin | ✔ Matches `oauth-google.controller.ts:42-46` (`DEFAULT_ERROR_ORIGIN`, never reads the untrusted state). |
| I-12 re-verify active user + permission + tenant at callback | ✔ Mirrors the shipped N-9 block (`oauth-google.controller.ts:63-74`), `perms.has('clinic.integrations.edit')`. |
| I-13 OAuth env lazy-checked, never boot-required | ✔ `ONEDRIVE_OAUTH_*`, `503 ONEDRIVE_OAUTH_NOT_CONFIGURED`, mirrors N-6. |
| **I-14 disconnect nulls provider columns in the same write** | **⚠ Applied to disconnect only.** The design nulls the three `oneDrive*` columns when switching *away* from onedrive (correct — mirrors `updateStorageConfig`'s `googleColumnResets`, `storage-config.service.ts:147-149`). **But the symmetric invariant on the *connect* side is missing — see F-OD-1.** |
| I-15 refresh write-back: same helper, tenant-scoped, audit-exempt, race-safe conditional update | ✔ M-2 extends it correctly; the conditional-update `WHERE ... provider='onedrive' AND oneDriveRefreshTokenEncrypted IS NOT NULL` mirrors the shipped Google guard (`tenant-storage-config.repository.ts:55`). |
| I-16 live status check on load only, blip never flips connected | ✔ `GET /me/drive` ping; `checkOneDriveConnected` analog of the shipped `checkGoogleDriveConnected` (`storage-config.service.ts:60-79`); M-9 classifies auth-invalid vs transient. |
| I-17 switch-confirmation reuse, custody note | ✔ No new confirmation UI; §6 adapts the custody copy for personal-vs-work accounts. |
| I-18 don't log full callback URLs | ✔ Same hygiene rule. |
| I-19 no migration on switch, warn-only | ✔ Unchanged. |
| I-20 accepted residual risks carried forward | ✔ Correctly notes the N-2 *revoke-cross-break* half **shrinks** on OneDrive (no app-side revoke exists), which is an accurate downgrade, not a silent change. |

**No inherited decision was silently altered.** The one place the design departs from Google's mechanism — dropping the folder-ID cache columns (M-4, path-addressing) — is a provider-specific *implementation* difference that is explicitly stated and justified; it does **not** change the inherited *decision* I-4 (the tenant-scoped prefix is preserved). That is a correct adaptation, not a violation.

---

## 2. New OneDrive decisions (M-1..M-9) — sound; two carry follow-through obligations

- **M-1 (v2.0 auth-code flow, `common`, `prompt=select_account` not `prompt=consent`)** — ✔ Correct and better-reasoned than a blind copy: Microsoft re-issues a refresh token whenever `offline_access` is consented, so Google's `prompt=consent`-for-refresh-token workaround is genuinely unnecessary; `select_account` is the right choice given Q1=both. Accepted.
- **M-2 (refresh-token rotation → write back BOTH tokens + expiry)** — ✔ This is the single most important behavioral difference from Google and the design handles it correctly (proactive-by-expiry + reactive-401, conditional write-back of both columns). The "config row already read per operation by `resolveStorageConfig`" claim is accurate (`storage-config.service.ts:21-22`). Risk OD-1 tracks the mishandling case. Grill must stress it (below).
- **M-3 (disconnect = null-tokens-only, no revoke)** — ✔ Accurate; Microsoft has no per-grant app revoke, `revokeSignInSessions` is correctly rejected as over-broad. Disconnect copy names the manual-removal location. Accepted.
- **M-4 (path-addressing, no folder-ID columns, ensure-parent-chain with 409-as-success)** — ✔ Genuinely simpler than Google and race-safe by construction (two racers converge on one folder). The N-1-class "photo replace yields one file" regression test is correctly retained even though path-PUT makes it structurally hard to fail. Good.
- **M-5 (4 MB simple-PUT / >4 MB upload-session, `conflictBehavior: replace`)** — ✔ The atomicity argument (driveItem materializes only on final-chunk commit) satisfies ADR-0023 §7 intent. The >4 MB path is the least-exercised code in the sub-project (OD-5) — grill/QA item, not a design defect.
- **M-6 (no SDK, plain Graph REST behind `onedrive-client.ts`, zero new deps)** — ✔ MSAL correctly rejected (its hidden-refresh-token cache is incompatible with the per-tenant encrypted-columns pattern I-7/I-15). Ships lighter than Google's `googleapis` — answers the standing Ponytail note.
- **M-7 (provider-matched nonce consume)** — ✔ **Premise independently verified in live source:** `consumeNonce(rawNonce)` (`oauth-connect-nonce.repository.ts:40-47`) matches only on `nonceHash + consumedAt IS NULL` — **no `provider` predicate** — and the shipped Google callback calls it with no provider (`oauth-google.controller.ts:49`). Once two providers share the table and the one HKDF signing key, a Google-minted state verifies and consumes at the OneDrive callback and vice versa. The one-line fix (`AND provider = ?`) is correct. **Carries an obligation — F-OD-2.**
- **M-8 (env vars, expired-secret failure mode)** — ✔ Correctly distinguishes "vars absent → 503 NOT_CONFIGURED" from "vars present but secret expired → failed exchange / red status." Accepted with the operator rotation reminder (Q3, risk OD-3).
- **M-9 (error classification)** — ✔ 404→not-found, 401/`invalid_grant`/AADSTS-expired→auth-invalid (→ `connected:false`), 429/other→unavailable (never flips connected). Mirrors the `GoogleDriveAuthInvalidError` posture. Accepted.

---

## 3. Authorization design review — correct, no new codes ✔

| Surface | Method/path | Code | Verdict |
|---|---|---|---|
| Connect-initiate | `GET /clinic/storage-config/onedrive/authorize` | `clinic.integrations.edit` | ✔ Write/infrastructure action — same class as the shipped `google/authorize` (`settings.routes.ts:24`) and SMB config (ADR-0023 §4). |
| OAuth callback | `GET /oauth/onedrive/callback` | none — signed single-use `state` | ✔ In principle — the inherent, precedent-blessed OAuth exception. Trust boundary = signature + ≤10-min expiry + **M-7 provider-matched atomic consume** + N-9 active re-checks, all **before any read/persist**. Mirrors the shipped Google callback exactly. |
| Config read + live status | `GET /clinic/storage-config` (existing) | `clinic.profile.view` | ✔ Read code for a read; `connected?` now also for `onedrive`; tokens never returned (I-7). |
| Disconnect / switch | `PUT /clinic/storage-config` (existing) | `clinic.integrations.edit` | ✔ Reuses the existing write endpoint; nulls `oneDrive*` (I-14). |

**FR-14 view/edit separation respected; no default-matrix change; no platform-plane involvement; `TenantStorageConfig` still holds no PII** (tokens + expiry only). Deny-by-default preserved. ✔

**Consistency note (non-blocking, accepted per predecessors):** doctor/staff hold `clinic.profile.view`, so `GET /clinic/storage-config` — now firing a live `GET /me/drive` ping when `provider === 'onedrive'` — is reachable by a non-admin server-side. Response exposes only `provider`/`configured`/`connected` (no tokens, no account email). Blast radius = one throttled Graph ping per page load using the tenant's own tokens. Negligible; same accepted posture as sub-projects 1–2.

**Implementation guard worth stating in the design (minor):** the shipped `storageConfigSchema` Zod enum is `['local','custom_path']` (`settings.controller.ts:78`) — connect to a cloud provider is **callback-only**, never a `PUT`. Disconnect from onedrive = `PUT provider=local|custom_path`, with `updateStorageConfig` detecting `current.provider === 'onedrive'` and nulling `oneDrive*`. The design should state explicitly that the PUT enum stays `['local','custom_path']` (do **not** add `'onedrive'` to it), so a dev doesn't wire connect through the PUT path. Non-blocking write-plan note.

---

## 4. Findings

### 🔴 F-OD-1 (required, Medium) — the connect-to-OneDrive callback must null the *other* providers' secret columns (`smb*` **and** `google*`), and best-effort-revoke a previous Google token

**Finding.** The design specifies the callback "encrypts and persists both tokens + expiry with `provider: 'onedrive'`" (§3) and the data model (§4) lists only the three `oneDrive*` columns. **Neither says the same `upsert` must clear a *prior* provider's secret columns.** Against live source this is a real omission:

- The **shipped Google callback nulls `smb*` on connect** — `oauth-google.controller.ts:104`: `smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null`, with the comment *"A stale SMB credential must not survive a switch to google_drive, same invariant as BA G-4b."* This exact line was added by **QA round 2 on Sub-PR B** ("connecting Drive left a stale SMB credential at rest" — CLAUDE.md changelog).
- OneDrive inherits a **stricter** version of the same rule: by its ship time `google_drive` is a live provider a tenant can be switching *from*. So the OneDrive connect `upsert` must null **`smb*` AND `google*`** columns (`googleAccessTokenEncrypted`, `googleRefreshTokenEncrypted`, `googleRootFolderId`, `googleEmrFolderId`, `googlePhotoFolderId`) — otherwise a stale encrypted Google **refresh token** (or SMB password) survives at rest on a row whose provider is now `onedrive`. That is precisely the G-4b / I-14 "no stale encrypted secret at rest after a confirmed switch" invariant — which the design applies to the *disconnect* direction but not the *connect* direction.
- **Revoke half:** unlike Microsoft, Google *does* support token revocation, and the shipped Google callback best-effort-revokes a *previous Google* token on reconnect (N-10, `oauth-google.controller.ts:89-94`). By symmetry, when OneDrive connect overwrites a prior `google_drive` row, it should best-effort-revoke that previous Google refresh token before nulling it — leaving a live Google grant behind is the same stale-grant hazard N-10 exists to prevent. M-3 ("OneDrive has no revoke") is about revoking OneDrive's *own* grant and does not address a *previous Google* grant.

**Why it matters.** Not a live escalation (the stale column isn't read once `provider !== google_drive/custom_path`, so `resolveStorageConfig` won't use it) — but it violates an invariant this project has explicitly committed to *and shipped a QA fix for on the immediately preceding sub-project*. Repeating the predecessor's caught bug in the successor is exactly what a BA gate must stop.

**Required (fold into design + carry into grill):**
1. §3 callback + §4: the connect `upsert` nulls **all** foreign-provider secret columns (`smb*` and `google*`) in the same write that sets the `oneDrive*` columns.
2. §3/§7: if the previous row was `provider === 'google_drive'` with a stored refresh token, **best-effort-revoke at Google** (logged on failure, never blocks the connect) before nulling — N-10 cross-provider analog.
3. §9: add ACs/regression tests — (a) connect from a `custom_path` tenant leaves `smb*` NULL; (b) connect from a `google_drive` tenant leaves all `google*` NULL and attempts the Google revoke; (c) the stale-secret-at-rest assertion, mirroring the shipped Google-side test.

### 🟠 F-OD-2 (required verification, Low-Med) — M-7 edits already-merged Google code; add a Google-flow *non-regression* test, not only the new cross-provider test

**Finding.** M-7 changes `consumeNonce`'s signature to take a `provider` argument. That function and its **only current caller — the shipped, merged Google callback (`oauth-google.controller.ts:49`)** — are production code on `main`. Verified safe *as designed*: the Google authorize stores `provider: 'google'` (`settings.controller.ts:225`), so the Google callback must pass `'google'` (matches) and the OneDrive callback passes `'onedrive'`. But the design's §9 test list only names the *new* direction ("Google-provider nonce presented at the OneDrive callback rejected"). It must **also** assert the **existing Google connect flow still consumes its own nonce** after the signature change — i.e. a `'google'`-minted nonce still consumes at the Google callback. Without that, a plausible dev error (passing `'google_drive'` instead of `'google'`, or forgetting to thread the arg into the Google call site) silently bricks the shipped Google connect and no test catches it.

**Required:** §9 adds a Google-flow non-regression AC alongside the cross-provider-rejection AC. (No design change to M-7 itself — its logic is correct; this is a blast-radius test obligation on shipped code.)

### 🟡 F-OD-3 (note) — the §"Definition-of-Ready check" self-assessment over-claims four rows

Because F-OD-1 is missing, four rows the design marks ✔ are **not fully met as written**:
- *Business rules / isolation listed* — the connect-side secret-nulling invariant is absent.
- *Exceptions covered* — the "connect over a prior `google_drive`/`custom_path` row" case is not in §7.
- *Acceptance criteria testable* — no AC for connect-nulls-foreign-secrets / previous-Google-revoke.
- *Risks & dependencies recorded* — F-OD-1 is not in the risk register.

All four flip to genuine ✔ once F-OD-1 is folded in. (The other five DoR rows — objective, actors/roles, permission codes, NFR impact, product decisions — are correctly ✔.)

**Cosmetic:** §6's "Q4 note in connect helper copy (if Q4 = a)" is a leftover conditional — Q4 *is* (a), so make it unconditional. Non-blocking.

---

## 5. NFR impact

- **Security:** net acceptable **after F-OD-1 lands.** Token-at-rest meets the SMB/Drive bar (same `encryptField`, never returned); `Files.ReadWrite.AppFolder` bounds blast radius; M-7 closes the cross-flow nonce-replay class; callback trust boundary reuses the shipped, precedent-blessed signed-state + N-9 pattern. The one open security-hygiene item is F-OD-1 (stale foreign-provider secret at rest on connect).
- **Performance:** path-addressing makes reads/exists a single Graph call (cheaper than Google's folder-resolve+list chain) — plausibly the cheapest cloud driver. Proactive refresh ≈ one token call/hour/tenant; +1 `GET /me/drive` per Storage-page load. No caching. Accepted, documented (§8).
- **Availability:** a dead/again-un-consented OneDrive degrades *that tenant only* → existing retryable errors + red status. **OD-3 (client-secret expiry) is a genuine tenant-wide availability cliff** — all OneDrive tenants fail at once when the ≤24-month secret lapses; mitigated only by an operator calendar reminder (Q3), no code mitigation this round. Correctly surfaced and accepted, but the grill should confirm the operator reminder is actually owned by someone.
- **Maintainability:** one more `getStorageDriver` branch, zero call-site churn, no SDK. ✔

---

## 6. Risk register — additions/confirmations vs the design's own table

The design's OD-1..OD-6 are well-formed and I concur with all six. Add:

| ID | Risk | Sev | Mitigation | Owner |
|---|---|---|---|---|
| OD-7 | Connect-to-OneDrive leaves a prior provider's encrypted secret (Google refresh token / SMB password) at rest; a prior Google grant left live at Google | **Med (F-OD-1)** | Connect `upsert` nulls `smb*`+`google*`; best-effort-revoke a previous Google token; regression tests mirroring the shipped Google-side fix | dev — **must be in design + plan** |
| OD-8 | M-7 signature change silently bricks the shipped Google connect (wrong/omitted provider string) | Low-Med (F-OD-2) | Google-flow non-regression test that a `'google'` nonce still consumes at the Google callback, in addition to the cross-provider rejection test | dev / qa |

---

## 7. Definition-of-Ready check (BA-corrected)

| Criterion | Status |
|---|---|
| Objective stated | ✔ (§gap analysis STORAGE-OD-1) |
| Actors/roles named | ✔ (clinic_admin write; all three read — I-6) |
| Permission codes assigned & correct | ✔ (§5 — `integrations.edit` write / `profile.view` read; no new codes; FR-14-consistent) |
| Business rules / isolation listed | ⚠ → ✔ once **F-OD-1** (connect nulls foreign-provider secrets) is folded in |
| Exceptions covered | ⚠ → ✔ once F-OD-1's connect-over-prior-provider case is added to §7 |
| NFR impact noted | ✔ (§5 here; §8 design) incl. OD-3 availability cliff |
| Acceptance criteria testable | ⚠ → ✔ once F-OD-1 + F-OD-2 ACs are added to §9 |
| Risks & dependencies recorded | ⚠ → ✔ once OD-7/OD-8 are added |
| Product decisions resolved | ✔ (Q1–Q4, §0) |

---

## 8. What is left for the mandatory grill (Step 3.5) to stress-test

Not blockers to *entering* the grill — these are the assumptions the grill must actually hammer:

1. **F-OD-1 resolution correctness** — does the connect `upsert` clear *every* foreign-provider secret column, and does the previous-Google revoke fire on the google→onedrive path? (Highest-value stress target — it's a repeat-class of a QA-caught predecessor bug.)
2. **M-2 refresh-token rotation under race** — proactive-by-expiry + reactive-401 both write back **both** rotated columns; a refresh completing *after* a disconnect writes zero rows (N-4 analog conditional update). Assert both.
3. **M-5 >4 MB upload-session path** — the least-exercised code (OD-5): chunk sizing, `conflictBehavior:replace`, mid-session drop leaves the prior file intact.
4. **M-8 / OD-3 expired client secret** — surfaces as red status + failing exchanges with no distinct copy; confirm this is genuinely acceptable and the connect-error copy covers "contact support," and confirm an owner holds the rotation reminder.
5. **90-day sliding inactivity window** (M-2) — confirm degrade-to-normal-reconnect needs no special handling.
6. **Shared-Microsoft-account-two-tenants** (I-20/N-2 analog) — prefix isolates files; a *manual* Microsoft-side revocation breaks all tenants on that account; confirm accepted.
7. **M-7 shipped-code blast radius** (F-OD-2) — the Google connect flow still works after the `consumeNonce` signature change.

---

## 9. Verdict

The architecture is right and, pleasingly, *smaller* than its Google predecessor: one more `StorageDriver` behind `getStorageDriver(tenantId)`, three nullable token columns on the existing `TenantStorageConfig`, a callback that is a near-verbatim clone of the shipped, precedent-hardened Google one, connect UI reusing the existing radio + switch-confirmation. The provider-specific adaptations are not blind copies — `Files.ReadWrite.AppFolder`, `prompt=select_account` (M-1), refresh-token rotation write-back (M-2), null-only disconnect (M-3), path-addressing with no folder-ID cache (M-4), 4 MB upload split (M-5), no-SDK REST (M-6), and provider-matched nonce consume (M-7) are each correctly reasoned against Microsoft's actual behavior and verified external references. All 20 inherited decisions are applied; **none was silently changed** (the dropped folder-ID cache is a stated mechanism difference, not a decision reversal). Authorization is correct and adds **no new permission code** — `clinic.integrations.edit` write / `clinic.profile.view` read, deny-by-default, callback-as-the-single-signed-state exception — with no platform-plane involvement and no PII on the table. Q1–Q4 are final; **no open business decision surfaced.**

**It is not a clean APPROVE** because of one real, source-confirmed gap: the connect-to-OneDrive callback does not null a *prior* provider's encrypted secrets (`smb*` and `google*`) — the exact "stale credential at rest on connect" class that QA caught and fixed on the immediately preceding Google sub-project, made *broader* here because `google_drive` is now a live source-provider (F-OD-1). Plus one shipped-code test obligation (M-7 edits the merged Google callback — F-OD-2) and a DoR self-assessment that over-claims four rows on account of F-OD-1 (F-OD-3). None of these touches the architecture, the authorization model, or tenant isolation of the file namespace; all are foldable without redesign.

**Required before `/write-plan` (fold into design, carry into `/grill-with-docs`):**
1. **(F-OD-1)** Connect `upsert` nulls `smb*` **and** `google*` secret columns in the same write; best-effort-revoke a previous Google refresh token on the `google_drive → onedrive` connect path; add the three regression ACs to §9; add OD-7 to the risk register; add the exception to §7.
2. **(F-OD-2)** Add a Google-flow non-regression AC (a `'google'` nonce still consumes at the Google callback after the `consumeNonce` signature change), alongside the existing cross-provider-rejection AC; add OD-8.
3. **(F-OD-3)** Correct the DoR self-assessment once (1) lands; make §6's "(if Q4 = a)" copy unconditional.

**Non-blocking write-plan notes:** state that the `PUT /clinic/storage-config` Zod enum stays `['local','custom_path']` (connect is callback-only); confirm an owner holds the OD-3 client-secret rotation reminder.

---

**BA SIGN-OFF: APPROVE-WITH-FINDINGS.** Architecture, authorization (no new permission codes — `clinic.integrations.edit` / `clinic.profile.view`, reused verbatim), tenant-isolation namespacing (I-4 prefix under approot, correctly reasoned), and all 20 inherited decisions are sound and correctly applied — none silently changed. The design may proceed to `/grill-with-docs`. Three findings must be folded into the design and carried into the grill before `/write-plan`: **F-OD-1 (required, Medium)** — the connect callback must null the prior provider's `smb*`+`google*` secret columns and best-effort-revoke a previous Google token, closing the same "stale secret at rest on connect" gap QA caught on the Google sub-project (this is the one substantive change, and it is the reason four Definition-of-Ready rows are not yet truly met); **F-OD-2 (required verification)** — the M-7 `consumeNonce` signature change edits shipped, merged Google code, so add a Google-flow non-regression test, not only the new cross-provider one; **F-OD-3 (note)** — correct the over-claimed DoR rows once F-OD-1 lands. No REJECT: the gaps are hygiene/test-coverage completions of an already-committed invariant, not architectural or authorization defects, and there is no unresolved product decision.
