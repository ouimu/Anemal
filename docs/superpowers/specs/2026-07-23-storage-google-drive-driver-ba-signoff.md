# BA Validation & Sign-off — Per-Tenant Storage Provider: Google Drive Driver (Sub-project 2 of 3)

**Agent:** @ba-agent (Step 3 of Anemal pipeline)
**Date:** 2026-07-23
**Inputs reviewed:**
- Design: `docs/superpowers/specs/2026-07-23-storage-google-drive-driver-design.md` (post-Step-2-review revision, commit `15bca8f`)
- Predecessor conventions: `docs/superpowers/specs/2026-07-23-storage-custom-path-driver-{design,ba-signoff,grill}.md`, `docs/adr/0023-per-tenant-network-share-storage-driver.md`
- Live source: `src/backend/routes/settings.routes.ts` (mount + middleware chain), `src/backend/middlewares/auth.middleware.ts`, `src/backend/app.ts`, `src/backend/utils/encryption.ts`, `src/backend/config/env.ts`, existing `GET/PUT /clinic/storage-config` wiring
- Branch state: `git log main..feature/tenant-storage-provider` (confirms PR #46 core merged, PR #47 API+UI committed-not-merged, 2 GDrive design commits)
**Skills applied:** `anemal-rbac-matrix` (+ `references/permission-matrix.md`), `anemal-functional-reqs` (FR-14), `anemal-db-context`, `anemal-ba-toolkit`
**Gate role:** Gates Step 3.5 (`/grill-with-docs`) and Step 4 (`/write-plan`). Verdict at foot.

---

## 0. Independent validation of the 6 Step-2 flags

Reviewed each from scratch against the current design text and live source — not rubber-stamped.

| # | Step-2 flag | Independent verdict |
|---|---|---|
| 1 | JWT-over-redirect gap for `/authorize` — claimed fixed | **Confirmed fixed, on the `/authorize` side.** The split-hop (authenticated `fetch` → `{url}` JSON → frontend does `window.location.href = url` straight to Google) is coherent and is the correct pattern; the protected call stays inside the Bearer path. **But the counterpart `/callback` side has a distinct, unaddressed mounting/middleware gap that Step 2 did not surface — see G-1.** Item 1 as scoped is resolved; the adjacent callback gap is new. |
| 2 | Redirect-target/subdomain ambiguity → `state` carries origin — claimed fixed, verify no open-redirect | **Partially resolved — one hardening still required (G-2).** State-carried origin is the right idea, but "the frontend origin the admin is currently on" reads as *client-influenced* (header/param), and **signing an attacker-chosen origin does not make it safe** — it yields a signature-blessed open redirect. Origin must be derived server-side from the authenticated tenant's canonical host. Also no anti-replay nonce (G-2b). |
| 3 | Sequencing on the shared, unmerged branch — confirm acceptable | **Agreed, acceptable, not a pipeline violation.** One-branch build order is the locked user decision; git log confirms #46 core is on `main`, #47 (API+UI) + the design commits are on `feature/tenant-storage-provider`. The design already states this PR must not be openable/mergeable ahead of #47 and that `main`/roadmap must not describe Sub-PR B as shipped until #47 merges. No BA objection. |
| 4 | `prompt=consent` for refresh-token reliability — claimed fixed, spot-check | **Correctly justified.** Google returns a `refresh_token` only when the consent screen is actually shown; `access_type=offline` alone does not re-issue one on a *second* authorization after a prior revoke. Given decision 7 (disconnect forces re-consent through Google), `prompt=consent` is *necessary* for reconnect to yield a usable refresh token. Accepted friction (consent screen every connect) is the right trade. |
| 5 | Orphaned folder-ID self-heal (re-create-on-miss) — sanity-check for escape | **No security hole.** Folder IDs are server-managed (`TenantStorageConfig`), never client-supplied, and every ID lives inside *the admin's own single-tenant Google account* — there is no cross-tenant Drive to escape into (each tenant = a separate Google account, which is exactly why decision 5 drops the `tenants/{id}/` prefix). Worst case is a re-created folder at Drive root instead of nested — a cosmetic issue in the tenant's own Drive. One non-security nuance noted below (renamed-not-deleted folder can split files across two "Anemal" folders — accepted, consistent with the not-fatal posture). |
| 6 | Quota-exceeded + concurrent-connect-race deferred — confirm not blocking | **Agreed, neither blocks sign-off.** Quota → generic `StorageUnavailableError`, consistent with the SMB precedent; a "Drive full" message is a nice-to-have. Concurrent connect → `upsert` on `tenantId` PK, last-writer-wins, actor pool is Clinic Admin only, outcome benign. Both correctly low-priority. |

Net: flags 3/4/5/6 are cleanly resolved; flag 1 is resolved *as scoped* but exposed an adjacent callback gap (G-1); flag 2 needs one more hardening turn (G-2). My own from-scratch pass adds G-1..G-4 below.

---

## 1. Requirement validation against locked decisions

Objective is clear and traceable to the parent goal + the standing memory note ("BYO Google Drive per-tenant driver REQUIRED before production ship"). All 8 locked decisions are internally consistent and workable. `drive.file` scope (decision 2) is the correct least-privilege choice and is the key mitigation that bounds refresh-token blast radius (see G-3). Architecture claim verified: `getStorageDriver(tenantId)` is already the single provider switch point ADR-0022/0023 promised; adding a `google_drive` branch touches zero call sites. ✔ Minimal and correct.

---

## 2. Gap analysis — AS-IS / TO-BE

The design (like sub-project 1's) carries no explicit AS-IS/TO-BE table; supplying it here (this is the sign-off's job, not a design defect).

```
ID: STORAGE-GD-1     Objective: cloud BYO-storage with no on-prem infrastructure requirement
AS-IS: clinic stores on local disk (default) or a per-tenant SMB network share (sub-project 1);
       the only BYO path needs the clinic to run/expose an SMB share (on-prem, LAN-oriented) — no
       option for a clinic without a NAS/file server.
Gap:   clinics without on-prem file infrastructure have no way to keep EMR attachments + pet photos
       on storage they own/control.
TO-BE: Clinic Admin connects their own Google Drive via OAuth (drive.file scope); attachments + pet
       photos land in an auto-created Anemal/emr + Anemal/photo tree in that admin's Drive.
Priority: Should (pre-production BYO requirement)     Owner-agent: dev (driver) / uiux (connect UI)
Acceptance: a connected tenant's EMR upload + pet-photo save/read resolve to their own Drive; a
            config-less tenant is unchanged (LocalDiskDriver); no cross-tenant/plane path exists.
```

Scope is coherent and traceable — no creep. **One AS-IS→TO-BE gap the design underspecifies (G-3):** unlike SMB (bound to clinic *infrastructure*), Google Drive binds the tenant's entire file store to *one individual admin's personal account*. Admin-offboarding / account-loss is a sharper data-custody case than sub-project 1's — and sub-project 1 *did* fold a data-custody note into its switch-confirmation. Parity requires the same here.

---

## 3. Authorization design review

### 3.1 Plane & deny-by-default
All authenticated surfaces are clinic-plane behind `authMiddleware` + `requirePlane('clinic')` + explicit `requirePermission`. No platform-plane involvement; `TenantStorageConfig` holds no PII (tokens + folder IDs only). Plane separation intact. The **one** deny-by-default exception is the unauthenticated `/callback` — inherent to OAuth (a third-party redirect cannot carry a Bearer). That exception is *acceptable in principle* but must be specified concretely (G-1/G-2), because an ad-hoc "no middleware" is exactly the anti-pattern this project rejects.

### 3.2 🔴 G-1 (blocking) — the "no auth middleware" callback is not mountable as drawn

**Finding.** `src/backend/routes/settings.routes.ts` applies a **router-global** `router.use(authMiddleware)` (line 11) to *every* route on the router. `authMiddleware` hard-401s any request without a valid `Bearer` header (auth.middleware.ts lines 21–22). The callback's own registered redirect URI is `…/api/settings/clinic/storage-config/google/callback` — i.e. **under this router**. Google redirects the browser there with **no `Authorization` header**, so the router-global `authMiddleware` returns 401 *before the handler runs*. The design's "no auth middleware by design" is therefore not achievable where the design itself places the route.

**Impact.** As specified, the connect flow is dead-on-arrival (fails closed — 401 — so not an exposure, but non-functional). Worse, a hurried "just exempt it" fix risks either (a) reordering that silently drops auth off adjacent routes, or (b) a new public mount whose trust boundary is left implicit — both regressions against deny-by-default.

**Required (design must name the mechanism, not hand-wave):**
1. Specify *how* the callback is exempted from the router-global `authMiddleware` — either register the callback handler **above** `router.use(authMiddleware)` in `settings.routes.ts` (order-dependent; must carry a loud comment), **or** mount a dedicated public sub-router at the exact registered path. Pick one in the design.
2. Make the callback's trust boundary an explicit **AC**: the signed `state` is verified for **signature + expiry (≤10 min) + embedded tenant/user match**, and **nothing is read or persisted before that verification passes**. Consent-denied / invalid / expired / tampered state → reject, persist nothing, redirect with a distinct `?error=` code.

### 3.3 🔴 G-2 (blocking-a / grill-b) — signed `state` as a redirect target and as a replayable nonce

**G-2a (blocking) — server-derived origin, not client-supplied.** The callback redirects the browser to `<origin-from-state>/settings/storage/connecting`. A state-controlled redirect target is a known attack class. The signature only prevents *tampering by an outside party* — it does **not** sanitize the value `/authorize` put in. If `/authorize` takes the origin from a request header/param (as "the origin the admin is currently on" implies), a malicious page can drive an authenticated admin's browser through `/authorize` with an attacker-chosen origin, get it **signed**, and the callback becomes a signature-blessed open redirect. **Required:** `/authorize` must derive the redirect origin **server-side from the authenticated tenant's canonical host** (tenantId → known subdomain), never trust a client-supplied Origin/Referer/param — even signed. (Blast radius is a phishing/redirect surface, not token exfiltration — the token exchange is server-side and the redirect carries only success/error params — so **High-likelihood-fix, Medium-severity**, but it is a real authorization gap and must be closed before grill.)

**G-2b (must be consciously decided; grill may accept).** State `{tenantId,userId,origin,iat}` with a 10-min expiry is a **replayable bearer** within that window and carries no single-use nonce binding it to the browser that started `/authorize`. This leaves a connect-CSRF / replay surface (attacker completes/replays a captured state to bind a tenant's storage to an attacker-controlled connection). Because `/authorize` is authenticated and `state` binds `tenantId`, the cross-tenant version is limited — but the replay window is real. **Required outcome:** either add a **single-use nonce** bound to the initiating session (signed cookie or server-side one-shot store), compared on callback; **or** explicitly risk-accept the 10-minute replay window with written rationale in the grill. Do not leave it undecided.

### 3.4 Token storage bar vs the SMB password — meets bar, with two explicit ACs (G-4)

Access + refresh tokens are AES-256-GCM via `SETTINGS_ENCRYPTION_KEY` (helper verified at `utils/encryption.ts`; key required at `config/env.ts`), never returned by `GET` (`configured`/`connected` boolean stands in). **This meets the SMB-password bar** — same encryption, same non-return rule. ✔

Two elevations the design must state (a refresh token is *more* sensitive than the SMB password — long-lived, silent, re-mintable; `drive.file` scope is the correct blast-radius mitigation):
- **G-4a — refreshed-token write-back:** the silent access-token refresh writes back to `TenantStorageConfig` on operations where the token expired. State explicitly that this write goes through the **same encryption helper** and the **tenant-scoped repo** (tenantId never from body/param), **and is EXEMPT from the R-4 `settings_audit_log`-on-write rule** — it is a system token refresh, not an admin config change; auditing it would flood the log. One line, but it must be explicit or a dev will either skip encryption or spam the audit trail.
- **G-4b — disconnect nulls tokens at rest:** decision 7 revokes the token at Google; the switch-away must **also null `googleAccessTokenEncrypted` / `googleRefreshTokenEncrypted` (and the folder IDs)** in the row, so a stale encrypted refresh token isn't left at rest after a confirmed disconnect. Make it an AC.

### 3.5 Permission split — correct and FR-14-consistent ✔

| Surface | Code | BA verdict |
|---|---|---|
| `GET /…/google/authorize` (connect) | `clinic.integrations.edit` | ✔ Connecting a provider is a write/infrastructure action — same class as SMB config (ADR-0023 §4) and LINE/SMS/Lab keys (`integrations.edit`, admin-only E/-/-). |
| Disconnect (via `PUT /clinic/storage-config`) | `clinic.integrations.edit` | ✔ Reuses the existing write endpoint/code; no separate disconnect route (good — matches ADR-0023). |
| `GET /clinic/storage-config` (+ live `connected`) | `clinic.profile.view` | ✔ Read code for a read; matches sub-project 1 and the "path/status is not a secret" acceptance. |
| `GET /…/google/callback` | none (signed state) | ✔ in principle — the inherent OAuth exception; conditional on G-1/G-2 being specified. |

**FR-14 view/edit separation is respected** — reads use `.view`, writes (connect/disconnect) use `.edit`. Consistent with the whole `settings.routes` map. No default-matrix regression: both `integrations.edit` and `profile.view` keep their existing role assignments; no role gains or loses access. ✔

Consistency note (non-blocking, accepted per sub-project 1 precedent): doctor/staff hold `clinic.profile.view`, so `GET /clinic/storage-config` — now firing a live Drive API call on every load — is reachable by a non-admin server-side. Response exposes only `provider`/`configured`/`connected` booleans (no tokens, no account email). Blast radius = a non-admin can trigger one throttled Drive `list` call per page load using the tenant's tokens. Negligible; accept with note, consistent with §2.2 of the sub-project 1 sign-off.

---

## 4. NFR impact

- **Security:** net acceptable **after G-1/G-2 land**. Token-at-rest meets the SMB bar (G-4 tightens write-back + disconnect); `drive.file` scope bounds blast radius; callback is fail-closed today (G-1 makes it *function* correctly and *stay* deny-by-default). Until G-1/G-2 are folded, the callback trust boundary is under-specified.
- **Performance:** Drive round-trips slower than local disk (accepted, documented); +1 live status Drive call per Storage-page load (cheap `list`, no polling). Folder-ID caching is structural, not a perf cache. No new concern.
- **Availability:** a dead/again-un-consented Drive degrades *that tenant only* — surfaces as the existing retryable upload/read errors; status-check "don't read a blip as data loss" is correct. Right blast radius, no cross-tenant impact.
- **Maintainability:** slots into the existing `getStorageDriver` switch point with zero call-site churn. ✔
- **Data custody (G-3):** storage bound to one admin's personal Google account — an operational NFR the design must acknowledge in copy.

---

## 5. Risk register

| ID | Risk | Sev | Mitigation | Owner |
|---|---|---|---|---|
| G-1 | Callback route un-mountable as drawn (router-global `authMiddleware` 401s the Google redirect); ad-hoc fix risks a broader unauthenticated surface | **High (blocking)** | Design names the exemption mechanism (route ordering **or** dedicated public sub-router) + signed-state verification (sig+expiry+tenant match, before any read/write) as an explicit AC | dev — **must be in design + plan** |
| G-2a | `state`-carried, client-influenced redirect origin = signature-blessed **open redirect** | **Med (blocking)** | `/authorize` derives redirect origin **server-side** from the authenticated tenant's canonical host; never trust a client-supplied header/param even when signed | dev |
| G-2b | `state` replayable within its 10-min window (no single-use nonce) — connect-CSRF/replay surface | Med | Add single-use nonce bound to the initiating session **or** explicitly risk-accept in grill with rationale | dev / grill |
| G-3 | File store bound to one admin's personal Google account; admin-offboarding/account-loss strands tenant files | Med | Data-custody note in the connect + switch-confirmation copy (parity with sub-project 1's folded-in note); surfacing the connected account email is deferred (needs a scope beyond `drive.file` — a separate decision) | uiux / ba |
| G-4a | Refreshed-token write-back skips encryption, or floods `settings_audit_log` | Med | State: same encryption helper + tenant-scoped repo, **exempt** from the R-4 audit-on-write rule | dev |
| G-4b | Stale encrypted refresh token left at rest after a confirmed disconnect | Low | Disconnect nulls token + folder-ID columns (AC), in addition to the Google-side revoke | dev |
| G-5 | Authorization `code` in the callback URL query lands in server/access logs | Low | Don't log full callback URLs; codes are single-use/short-lived — hygiene note | dev |
| G-6 | Admin renames (not deletes) the `Anemal` folder → self-heal creates a second one, older files split away | Low | Accepted, consistent with the not-fatal self-heal posture; note in ADR | operator |

---

## 6. Definition-of-Ready check

| Criterion | Status |
|---|---|
| Objective stated | ✔ (§2 AS-IS/TO-BE) |
| Actors/roles named | ✔ (clinic_admin write; all three read) |
| Permission codes assigned & correct | ✔ (§3.5 — `integrations.edit` write / `profile.view` read; FR-14-consistent) |
| Business rules / isolation listed | ⚠ — callback trust boundary (G-1) + server-derived redirect origin (G-2a) not specified |
| Exceptions covered | ⚠ — state replay (G-2b) undecided; disconnect-nulls-tokens (G-4b) unstated |
| NFR impact noted | ✔ (§4) incl. data-custody gap (G-3) |
| Acceptance criteria testable | ⚠ — add ACs: callback exemption + signed-state verify, server-derived origin, token write-back encrypted+audit-exempt, disconnect nulls tokens, data-custody copy |
| Risks & dependencies recorded | ✔ (§5) |

---

## 7. Verdict

The architecture is right and pleasingly small — one more `StorageDriver` implementation behind the existing `getStorageDriver(tenantId)` switch point, encrypted tokens on the existing `TenantStorageConfig` table, disconnect folded into the existing `updateStorageConfig`, connect UI reusing sub-project 1's radio + switch-confirmation. The `drive.file` least-privilege scope, `prompt=consent` justification (flag 4), folder self-heal (flag 5), one-branch sequencing (flag 3), and quota/race deferrals (flag 6) are all correctly resolved. The `/authorize` split-hop (flag 1) is coherent. **It is not yet ready** because the *callback* half of the OAuth flow — the one deny-by-default exception in the whole feature — is under-specified against Anemal's own posture: the callback cannot be mounted with "no middleware" where the design puts it (G-1), and its signed-`state` trust boundary still trusts a client-influenced redirect origin (G-2a) and carries no replay protection (G-2b). Token-at-rest meets the SMB bar but needs two explicit write-back/disconnect ACs (G-4), and the personal-account data-custody gap (G-3) needs the same note sub-project 1 folded in.

**Required changes before `/grill-with-docs` closes (fold into design + carry into grill):**
1. **(G-1)** Name the mechanism that exempts `GET /…/google/callback` from the router-global `authMiddleware` (route ordering **or** dedicated public sub-router), and make signed-`state` verification (signature + ≤10-min expiry + tenant/user match, **before any read or write**) an explicit AC.
2. **(G-2a)** `/authorize` derives the redirect origin **server-side from the authenticated tenant's canonical host** — never a client-supplied header/param, even when signed.
3. **(G-2b)** Add a single-use nonce binding `state` to the initiating session, **or** explicitly risk-accept the 10-minute replay window in the grill with written rationale.
4. **(G-4)** State that the refreshed-token write-back uses the same encryption helper + tenant-scoped repo and is **exempt** from the R-4 audit-on-write rule; disconnect **nulls** the stored token + folder-ID columns (not just the Google-side revoke).
5. **(G-3)** Add a data-custody note to the connect + switch-confirmation copy (files live in the admin's personal Drive; loss of that account = loss of access) — parity with sub-project 1's folded-in note. Surfacing the connected account email is deferred (would need a scope beyond `drive.file` — a separate decision, not assumed here).

**Non-blocking (write-plan items):** name the state-signing key/algorithm (HMAC over an existing server secret); don't log full callback URLs (G-5); live status check reachable by any `profile.view` holder — accepted, note; renamed-folder split (G-6) — ADR note.

---

**BA SIGN-OFF: REQUEST CHANGES — approve the architecture (one more driver behind `getStorageDriver(tenantId)`, encrypted tokens on the existing `TenantStorageConfig`, disconnect folded into `updateStorageConfig`, connect UI reusing sub-project 1's controls; `drive.file` least-privilege scope; `prompt=consent`, folder self-heal, one-branch sequencing, and quota/race deferrals all correctly resolved; the `/authorize` split-hop is coherent and the permission split — `clinic.integrations.edit` write / `clinic.profile.view` read — is correct and FR-14-consistent). Five changes are required first, all on the OAuth callback (the feature's single deny-by-default exception): (1) the callback cannot be mounted with "no auth middleware" where the design puts it — `settings.routes.ts` applies a router-global `authMiddleware` that 401s the Google redirect — so the design must name the exemption mechanism and make signed-state verification a hard AC; (2) `/authorize` must derive the redirect origin server-side from the tenant's canonical host, because a signed client-supplied origin is still an open redirect; (3) decide the state-replay window — nonce or written risk-acceptance; (4) two token ACs — encrypted+audit-exempt refresh write-back, and null-tokens-on-disconnect; (5) a personal-account data-custody note, at parity with sub-project 1. Fold these in, then proceed to /grill-with-docs.**
