# Design: Per-Tenant Storage Provider — Microsoft OneDrive Driver (Sub-project 3 of 3)

**Date:** 2026-07-23
**Status:** Draft — **Q1–Q4 answered 2026-07-24 (see §0)**. BA sign-off 2026-07-24: APPROVE-WITH-FINDINGS (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`) — F-OD-1/F-OD-2/F-OD-3 folded in (§2 M-10, §3, §4, §7, §9, risk register, §6, DoR check). Mandatory grill (Step 3.5) run 2026-07-24 with the product owner — G1/G2/G3/G4 resolved (M-11/M-12/M-13) — see `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`. **Independent second-pass review (Fable, 2026-07-24)** caught 8 more findings on the interaction surface between M-10/M-11 and shipped code — all folded in, including F-OD-4 (product owner accepted as documented residual risk, option ก). See `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill-round2.md`. **One item remains before `/write-plan`: OD-13, a technical (non-business) verification spike confirming `Files.ReadWrite.AppFolder`/`drive.file` actually authorize the account-lookup calls M-11/I-16 depend on** (§2 M-11).
**Author:** @ba-agent (Step 1–3 BA work: requirements + design + gap analysis)
**Parent goal:** Each clinic picks where its EMR attachments + pet photos live. Sub-project 1 (custom network-share/SMB): driver core merged as PR #46, API + UI committed as PR #47 on `feature/tenant-storage-provider`. Sub-project 2 (Google Drive): Sub-PR A (driver + crypto core, incl. `oauth-state.ts`, `OAuthConnectNonce`) merged to the branch; Sub-PR B (OAuth endpoints + UI) in progress. This sub-project = OneDrive, same branch (locked single-branch decision), **implementation sequenced after Google Sub-PR B lands** — it reuses Sub-PR B's `/oauth/<provider>/callback` router shape, `/authorize` split-hop pattern, and Storage-page connect UI, not just Sub-PR A's primitives.
**Builds on:** ADR-0022 (`StorageDriver` interface), ADR-0023 + its 2026-07-23 Google Drive amendment (`TenantStorageConfig`, `getStorageDriver(tenantId)`, `oauth-state.ts` HKDF state signing, `OAuthConnectNonce` atomic single-use consume, disconnect-nulls-tokens, switch-confirmation UI).

**External references (verified 2026-07-23):**
- App folder / `Files.ReadWrite.AppFolder` works for both work/school and personal accounts: https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder ("App folder works across OneDrive for work or school and OneDrive for home")
- Simple upload (`PUT .../content`) size limit ~4 MB on OneDrive; larger files need `createUploadSession`: https://learn.microsoft.com/en-us/graph/api/driveitem-put-content , https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession

---

## 0. Product-owner decisions (resolved 2026-07-24)

These were genuine business/product decisions, not technical details — answered directly by the product owner, not assumed.

**Q1 — Which kinds of Microsoft accounts should clinics be able to connect?**
**Decision: (c) both** personal and work/school accounts. `{audience}` in the v2.0 endpoint resolves to `common` (M-1).

**Q2 — Where in their OneDrive should the clinic's files live?**
**Decision: (a) private app folder** (`Files.ReadWrite.AppFolder` / approot) — matches the least-privilege choice already made for Google Drive. Files live at `Apps/Anemal/tenant-{id}/...`, invisible outside the app's own folder.

**Q3 — Microsoft app registration ownership and display name.**
**Decision: the dev team owns creating and maintaining the Entra app registration**, including the recurring Client Secret rotation (Microsoft caps it at 24 months) — a calendar reminder is the accepted mitigation (risk OD-3). **Display name: "Anemal"** (same as the existing Google Cloud project's naming, consistent branding on both consent screens and the OneDrive app folder name).

**Q4 — Accept "Need admin approval" consent friction for work/school accounts in v1?**
**Decision: (a) accept for v1.** Affected clinics' IT admin approves once; the connect helper copy carries one sentence about this (§6). Microsoft publisher verification is not pursued now — can be added later without any code change.

**FYI — no decision needed, but you should know:** unlike Google, **Microsoft provides no way for our software to cancel its own access** when a clinic clicks Disconnect. Disconnect will still work exactly as designed (we delete our stored keys immediately, so Anemal genuinely can no longer touch the account) — but the entry for Anemal remains *listed* in the clinic's Microsoft account settings until someone removes it there manually. The disconnect confirmation copy will say this plainly and link the right Microsoft page. There is no alternative to offer, so this is informational only.

---

## 1. Inherited decisions (locked by sub-projects 1–2 — reused, not re-derived)

Every row below is settled precedent. The grill should not re-litigate these; it should verify the OneDrive design *applies* them correctly.

| # | Inherited decision | Source | OneDrive application |
|---|---|---|---|
| I-1 | Build order custom-path → Google Drive → OneDrive, one branch | Locked user decision (memory + GDrive design §decision 1) | This is the final sub-project; starts after GDrive Sub-PR B |
| I-2 | Least-privilege OAuth scope (app sees only its own files) | GDrive decision 2 (`drive.file`) | `Files.ReadWrite.AppFolder` (approot) — confirmed, Q2 |
| I-3 | `StorageDriver` interface + `getStorageDriver(tenantId)` single switch point; zero call-site churn | ADR-0022/0023 | One more branch: `provider === 'onedrive'` → `OneDriveDriver` |
| I-4 | Tenant-scoped folder prefix inside the cloud store even though each tenant has its own OAuth connection | Grill N-2 | `.../tenant-{id}/emr/{recordId}/`, `.../tenant-{id}/photo/` under approot — the approot folder is **per app + per Microsoft account**, so two Anemal tenants connected to the same Microsoft account share one approot; the prefix is required for exactly the N-2 reason |
| I-5 | Error, never silent fallback to local, on runtime storage failure | Parent locked decision | `StorageNotFoundError` / `StorageUnavailableError` mapping, identical contract |
| I-6 | Connect = `clinic.integrations.edit`; read = `clinic.profile.view`; deny-by-default; server is the boundary | ADR-0023 §4, BA sign-offs | Same codes, no new permission |
| I-7 | Tokens encrypted (AES-256-GCM, `SETTINGS_ENCRYPTION_KEY`, same `encryptField` helper); never returned by any `GET` — `configured`/`connected` booleans stand in | ADR-0023 §11, BA G-4 | Same helper, same non-return rule |
| I-8 | `/authorize` split-hop: authenticated `fetch` returns `{ url }` JSON; frontend does the navigation; redirect origin derived server-side from the tenant, never client-supplied | GDrive Step-2 fix + BA G-2a | `GET /clinic/storage-config/onedrive/authorize`, same shape |
| I-9 | Callback on its own top-level provider-generic public path, order-independent of all other mounts; signed `state` is the entire trust boundary | Grill (live finding) — path shape `/oauth/<provider>/callback` was chosen *specifically because* this sub-project would need it | `GET /oauth/onedrive/callback`, registered beside the Google one in `app.ts` |
| I-10 | `state` = HMAC-SHA256 over HKDF-derived key (`oauth-state.ts`), 10-min expiry, single-use nonce consumed atomically via `OAuthConnectNonce` before the code exchange | Grill N-3/N-5, BA G-2b | Reused **verbatim** — both `oauth-state.ts` and the nonce table/repo were written provider-generic for this purpose. One hardening added: M-7 below |
| I-11 | Invalid/expired `state` → redirect to fixed server-configured default origin, never a value from the untrusted state | Grill N-7 | Same branch, same fixed origin |
| I-12 | Re-verify user active + still holds `clinic.integrations.edit` + tenant active at callback time, before persisting | Grill N-9 | Same AC |
| I-13 | OAuth env vars checked lazily at request time, never boot-required | Grill N-6 | `ONEDRIVE_OAUTH_CLIENT_ID` / `ONEDRIVE_OAUTH_CLIENT_SECRET`, `503 ONEDRIVE_OAUTH_NOT_CONFIGURED` |
| I-14 | Disconnect nulls all provider token/metadata columns in the same write as the provider switch | BA G-4b | Nulls the three `oneDrive*` columns (see §4). The Google-side *revoke* half has **no OneDrive analog** — see M-3 |
| I-15 | Token-refresh write-back: same encryption helper, tenant-scoped repo, **exempt** from audit-on-write, race-safe conditional update dropped silently post-disconnect | BA G-4a + grill N-4 | Extended to two columns + expiry (M-2) because Microsoft rotates refresh tokens |
| I-16 | Live green/red status check on Storage-page load only (no polling); transient failure never flips `connected` to false | GDrive decision 6 + status-check design | Ping = `GET /me/drive`; auth-invalid classification per M-9 |
| I-17 | Switch-confirmation dialog reused; no new confirmation UI; data-custody note in connect + switch copy | GDrive decision 7 + BA G-3 | Copy adapted (§6): custody note distinguishes personal vs work accounts |
| I-18 | Don't log full callback URLs (auth `code` in query) | BA G-5 | Same hygiene rule |
| I-19 | No migration of existing files on switch; warn-only | Parent locked decision | Unchanged |
| I-20 | Accepted risks carried forward: per-record folder creation race (N-8-class), concurrent connect last-writer-wins, quota-exceeded not special-cased, shared-account-two-tenants hazard | Grill N-8 + GDrive error-handling §, N-2 | All apply identically. The N-2 *revoke-cross-break* half actually **shrinks** on OneDrive (no app-side revoke exists — only a manual revocation at Microsoft breaks a shared account's other tenant) |

---

## 2. New decisions specific to OneDrive (BA-decided; grill should stress these)

**M-1 — OAuth flow: Microsoft identity platform v2.0 authorization-code flow.**
- Authorize/token endpoints: `https://login.microsoftonline.com/{audience}/oauth2/v2.0/{authorize|token}` where `{audience}` follows Q1: `common` (both), `organizations` (work/school only), or `consumers` (personal only). Written as a single constant resolved from the Q1 answer — not configurable per tenant.
- Scopes requested: `offline_access Files.ReadWrite.AppFolder` (Q2 = a) — `offline_access` is Microsoft's analog of Google's `access_type=offline` and is what yields a refresh token.
- **No `prompt=consent` needed** (difference from GDrive decision on reconnect): Microsoft re-issues a refresh token on every authorization where `offline_access` is consented — the Google-specific "no refresh token on second consent" problem does not exist. Use `prompt=select_account` instead, so an admin with multiple Microsoft accounts (work + personal) explicitly picks which one — directly relevant given Q1 = both.
- `state` param, nonce, expiry, origin derivation: inherited unchanged (I-8..I-11).

**M-2 — Refresh-token rotation changes the write-back contract (extends I-15/N-4).**
Google's refresh token is stable — only the access token is ever written back. Microsoft **rotates**: every token-endpoint response (initial and refresh) includes a *new* refresh token that must replace the stored one. Therefore:
- The write-back persists **both** `oneDriveAccessTokenEncrypted` and `oneDriveRefreshTokenEncrypted` plus `oneDriveTokenExpiresAt`, in one conditional update: `WHERE tenantId = ? AND provider = 'onedrive' AND oneDriveRefreshTokenEncrypted IS NOT NULL` — silently dropped on no-match (N-4's disconnect-race guard, unchanged in spirit).
- Because no Google-style client library performs silent refresh for us (M-6), the client seam owns refresh: **proactive** when `oneDriveTokenExpiresAt` is past or within a 5-minute skew window (one cheap column read per operation — the config row is already read per operation by `resolveStorageConfig`), plus **reactive** retry-once on a 401 mid-operation. A failed refresh (`invalid_grant`, expired/revoked) surfaces as `StorageUnavailableError` at the operation layer and `connected: false` at the status layer — identical posture to GDrive.
- Note for grill: Microsoft refresh tokens for web apps have a ~90-day sliding inactivity window. An active clinic never hits it; a clinic that stops uploading for 3 months degrades to the normal reconnect-needed status. No new handling — this is exactly the reconnect path that already exists.

**M-3 — Disconnect: null-tokens-only, because Microsoft has no token-revocation endpoint.**
The Microsoft identity platform provides no API for an app to revoke its own delegated grant (the only Graph call that invalidates refresh tokens, `revokeSignInSessions`, kills *all* the user's sessions everywhere — unacceptable side effect). Consequences:
- Disconnect = the existing `updateStorageConfig` switch path + I-14 nulling. The nulling, already required by G-4b, becomes the **sole** disconnect mechanism — which is fine, because it is also the effective one: without the stored refresh token Anemal genuinely cannot access the account again.
- GDrive's N-10 (best-effort revoke of the previous token on reconnect-over-existing) is **moot** — there is nothing to revoke. Superseded refresh tokens simply age out at Microsoft.
- The disconnect/switch confirmation copy states that the Anemal entry remains listed in the clinic's Microsoft account until removed there manually, with the location named (personal: account.live.com/consent/Manage; work/school: myaccount.microsoft.com → App permissions). See §0 FYI.

**M-4 — Path-based addressing under approot: no folder-ID cache columns, and Drive's N-1 problem does not exist here.**
Microsoft Graph addresses driveItems by **path**: `/me/drive/special/approot:/tenant-{id}/photo/pet-{id}.jpg:/content`. This is a fundamentally better fit for our server-built `tenants/{tenantId}/{emr|photo}/...` keys than Drive's id-based model:
- **No `googleRootFolderId`-style columns.** The approot folder is auto-created by Microsoft on first access; deeper paths are addressed literally. The whole folder-ID caching + orphaned-ID self-heal machinery from GDrive (and its N-8/G-6 renamed-folder edge cases) largely disappears.
- **`save()` is inherently overwrite-in-place**
: a `PUT` to a path (or an upload session with `@microsoft.graph.conflictBehavior: "replace"`) creates-or-replaces atomically on Microsoft's side. Grill N-1's list-then-update dance is not needed — but the design states this explicitly (as N-1 taught us to) rather than assuming it, and the N-1-class regression test (photo replace produces one file, not two) is still the most important driver test (§9).
- **Parent folders**: the driver must not *assume* `PUT`-by-path auto-creates missing intermediate folders (Graph behavior differs by service/version). `save()` ensures the parent chain exists first — `POST .../children` with `conflictBehavior: "fail"`, treating a `409 nameAlreadyExists` as success (idempotent ensure, race-safe by construction — the M-4 analog of N-8 is thereby *smaller* than on Drive: two racers converge on one folder instead of creating duplicates). If implementation testing proves auto-create reliable, the ensure step may be skipped on the happy path — an optimization, not a design change.
- Admin renames/moves the tenant folder inside their own OneDrive: the path no longer resolves → next `save()` recreates the chain (files split across old/new location — same accepted posture as GDrive's self-heal), reads/deletes 404 normally. No cached-ID staleness dimension at all.

**M-5 — Upload strategy: 4 MB threshold.**
Simple `PUT .../content` is limited to ~4 MB on OneDrive. EMR attachments are capped at 25 MB (ADR-0021/0022 precedent), so:
- Body ≤ 4 MB (covers every pet photo and most attachments): single `PUT` by path.
- Body > 4 MB: `createUploadSession` (with `conflictBehavior: "replace"`) + sequential chunk `PUT`s (chunk size a multiple of 320 KiB; one 10 MiB chunk covers our max in ≤3 requests). The session upload is not temp-then-rename, but Microsoft only materializes the driveItem when the final chunk commits — a dropped connection mid-session leaves the previous file intact, which satisfies ADR-0023 §7's atomicity intent.
- The 4 MB threshold is applied uniformly (SharePoint-backed business accounts allow larger simple PUTs, but one code path that works on both account types beats two).

**M-6 — No SDK: plain Microsoft Graph REST behind an `onedrive-client.ts` seam. Zero new runtime dependencies.**
- MSAL (`@azure/msal-node`) is rejected: its serialized-token-cache model deliberately hides refresh tokens from the caller, which is incompatible with our per-tenant encrypted-columns-in-Postgres storage (the entire I-7/I-15 pattern). The Graph JS SDK (`@microsoft/microsoft-graph-client`) adds little over `fetch` for our 6 calls.
- The token endpoint and Graph API are called with Node's built-in `fetch`, wrapped in `onedrive-client.ts` exposing the same seam shape as `google-drive-client.ts` (`findByPath`/`putSmall`/`createUploadSession`+`uploadChunk`/`readFile`/`deleteByPath`/`ensureFolder`/`ping`, plus `exchangeCodeForTokens`/`refreshTokens`), with a `FakeOneDriveClient` for every driver test. This also answers the Ponytail note on GDrive's heavyweight `googleapis` dependency — OneDrive ships lighter, not heavier.

**M-7 — `OAuthConnectNonce` reuse with one hardening: provider-matched consume.**
The table and `oauth-state.ts` are reused verbatim (they were designed provider-generic — I-10). One gap found while reviewing them for reuse: `consumeNonce(rawNonce)` currently matches on `nonceHash + consumedAt IS NULL` only, **not on `provider`**. Once two providers share the table, a state minted for the Google flow verifies and consumes successfully at the OneDrive callback (same HKDF signing key, same table) and vice versa. Exploitability is low (the attacker still needs the victim's state *and* a valid auth code), but the fix is one line and closes a cross-flow replay class: `consumeNonce(rawNonce, provider)` adds `AND provider = ?` to the atomic UPDATE. Applied as part of this sub-project; the Google callback (Sub-PR B) passes `'google'`, the OneDrive callback passes `'onedrive'`. (The signed `state` itself needs no provider field — the callback route *is* the provider context, and the nonce row already stores it.)

**M-8 — Env vars:** `ONEDRIVE_OAUTH_CLIENT_ID`, `ONEDRIVE_OAUTH_CLIENT_SECRET` in `src/backend/.env`, mirroring `GOOGLE_OAUTH_*`. Lazy-checked per I-13. Operational note (Q3): the secret expires (≤24 months) — a rotation reminder is the operator's task; an expired secret surfaces exactly like N-6's misconfiguration case (`503 ONEDRIVE_OAUTH_NOT_CONFIGURED` is wrong here — the vars are *present* — it surfaces as failed token refreshes → `connected: false` → reconnect attempts that error at the token exchange; the connect-flow error copy covers "contact support" for this case).

**M-10 — Connect must null the *other* providers' secret columns, and best-effort-revoke a previous Google token (BA F-OD-1, extends I-14 to the connect direction; both directions, per round-2 grill finding 1).**
I-14 nulls `oneDrive*` on disconnect (switch *away*). The symmetric case — connect *to* a provider while a prior provider's secrets are still stored on the row — was missing from the original draft, and the first grill pass only fixed *one* of the two connect directions. Live precedent (already shipped): the Google callback nulls `smb*` on connect (`oauth-google.controller.ts:104`, added as a QA round-2 fix — "connecting Drive left a stale SMB credential at rest").
- **`onedrive`-connect direction:** the OneDrive callback's persist-tokens `upsert` nulls **`smb*`, `google*`, and `googleAccountIdHash`** (`smbHost`, `smbShare`, `smbUsername`, `smbPasswordEncrypted`, `googleAccessTokenEncrypted`, `googleRefreshTokenEncrypted`, `googleRootFolderId`, `googleEmrFolderId`, `googlePhotoFolderId`, `googleAccountIdHash`) in the same write that sets the four `oneDrive*` columns (three tokens/expiry + `oneDriveAccountIdHash`) — no stale encrypted secret or stale hash survives at rest on a row whose `provider` is now `onedrive`.
- **`google_drive`-connect-over-`onedrive` direction (round-2 grill finding 1 — the reverse case the first pass missed):** the *already-shipped* Google callback's `upsert` currently nulls only `smb*` (`oauth-google.controller.ts:104`) — it predates OneDrive and does not know about it. This sub-project's write-plan must extend that same upsert to also null **all four `oneDrive*` columns** (`oneDriveAccessTokenEncrypted`, `oneDriveRefreshTokenEncrypted`, `oneDriveTokenExpiresAt`, `oneDriveAccountIdHash`) when the row being overwritten had `provider === 'onedrive'`. This is not optional polish: per M-3, Microsoft has no revoke endpoint, so **nulling is the *only* mechanism that ends Anemal's OneDrive access** — miss this direction and a live, silently-rotating OneDrive refresh token sits encrypted on a `provider='google_drive'` row indefinitely. No revoke call exists to make on the OneDrive side (M-3 unchanged).
- If the row being overwritten had `provider === 'google_drive'` with a stored Google refresh token (i.e. the `onedrive`-connect direction), best-effort-revoke that token at Google before nulling it (mirrors the shipped Google-side N-10 "revoke a previous Google token on reconnect" — logged on failure, never blocks the connect). There is no symmetric revoke for the reverse direction — OneDrive has nothing to revoke (M-3).
- This closes the same class of bug QA caught and fixed on the immediately preceding (Google) sub-project — repeating it here, in either direction, would be a regression of an already-paid-for lesson.

**M-11 — Cross-tenant duplicate cloud-account detection: warn, don't block (grill G3, 2026-07-24; refined by round-2 grill findings 2/3/5/7).**
Grill finding: two *different* Anemal tenants (different clinics) connecting the same personal Microsoft or Google account is undesirable and should surface a warning; two *branches of the same tenant* sharing one account is fine (they already share the `tenant-{id}` prefix by design, I-4). Product-owner decision: check for duplicates and warn — do not block the connect.
- **New nullable column, both cloud providers:** `googleAccountIdHash` (retrofit to the already-shipped Google Drive path) and `oneDriveAccountIdHash` (new).
- **⚠️ Verification spike required before write-plan (round-2 grill finding 3):** the design assumed `Files.ReadWrite.AppFolder` authorizes `GET /me/drive` and that Drive's `drive.file` scope authorizes `about.get?fields=user` — **neither claim carries the citation discipline the rest of this doc applies** (contrast the header's cited Microsoft Learn URLs), and the `GET /me/drive` claim additionally conflated two different endpoints: the M-10 approot probe calls `GET /me/drive/special/approot` (a driveItem), not `GET /me/drive` (a drive resource with an `owner.user` facet) — they are not the same call. **Before write-plan, spike-verify both claims against a real AppFolder-scoped token.** If `GET /me/drive` turns out to need a broader scope than `Files.ReadWrite.AppFolder`, use the fallback instead: ping via `GET /me/drive/special/approot` (already in scope, already called) and derive the account identifier from that response's `parentReference.driveId` (stable per account, in-scope, arguably a better dedup key than a user ID). Whichever identifier is confirmed live, it flows into the hash below unchanged.
- Populated at OAuth callback time from the confirmed identifier, hashed with HMAC-SHA256 using an HKDF-derived key from `SETTINGS_ENCRYPTION_KEY` — **using a distinct `info` string from `oauth-state.ts`'s (round-2 grill finding 7)**, e.g. `'account-id-hash-v1'` vs. the state-signing key's own info string, so the two HKDF-derived keys stay purpose-separated per the reasoning that originally motivated HKDF here (grill N-5) — never the raw account ID or email at rest, so nothing PII-shaped is stored (this project's tenant-config table has never held PII, per §5).
- **Column hygiene follows M-10 (round-2 grill finding 2):** both hash columns are nulled everywhere their sibling secret columns are nulled — I-14 disconnect nulls `oneDriveAccountIdHash` alongside the three token/expiry columns (four total, not three — §4/§9 corrected); M-10's OneDrive-connect direction nulls `googleAccountIdHash` alongside `google*`; M-10's Google-connect-over-OneDrive direction nulls `oneDriveAccountIdHash` alongside `oneDrive*`. A disconnected/switched-away row never keeps a stale hash, which would otherwise produce false-positive collision warnings against unrelated tenants.
- **Collision check, predicate and lifecycle pinned down (round-2 grill finding 5):** the query is `provider = <same provider> AND <hash column> = ? AND tenantId != ?` (explicit provider + tenant predicates, not hash-alone — doubly guards against the column-hygiene case above). **Recomputed on every `GET /clinic/storage-config`** (not cached at connect time only) so the warning doesn't go stale when the other tenant disconnects, and so the *first* connector eventually sees it too once a second tenant connects the same account. Because recomputing on every status read means a non-admin viewer of tenant A could otherwise infer tenant B's connect/disconnect timing over repeated page loads, **the `duplicateAccountWarning` field in the `GET` response is gated to `clinic.integrations.edit` holders** (a narrower cut of the existing `clinic.profile.view` response — doctor/staff still get `configured`/`connected`, just not this field) — the warning is only actionable by whoever can act on it anyway.
- A match → the connect still succeeds (never blocked); the Storage page shows a non-blocking banner: "บัญชีนี้เชื่อมต่อกับคลินิกอื่นในระบบ Anemal อยู่แล้ว — แนะนำให้แต่ละคลินิกใช้บัญชีแยกกัน (ยกเว้นสาขาในคลินิกเดียวกัน)". No tenant name or identifying detail from the other match is ever surfaced (existence-only signal, same discipline as the ADR-0019/0014 404-not-403 precedent — don't leak details about another tenant).
- **Scope, explicitly bounded (grill: "shouldn't be much work" — confirmed):** one hash column per provider, one query (now with an explicit predicate), one banner, one permission gate on an existing response. No blocking, no admin notification, no cross-tenant enumeration UI. Retrofitting Google Drive is a small patch to the already-merged callback (add the hash-populate + collision-check calls it's missing, plus the M-10 reverse-direction nulling) — flagged for write-plan as a small scoped change to shipped code, bundled in this sub-project's PR since the detection helper is shared.

**M-12 — Switch-confirmation dialog states plainly: no auto-migration, nothing is deleted, reversible (grill G2, 2026-07-24).**
Grill question: does switching providers move old files, or does the clinic just lose access? Answer, confirmed against I-19 (locked parent decision, no migration on switch): **neither files nor access are destroyed.** Every driver addresses files by a deterministic, tenant/record-derived key (I-4/M-4) — nothing is deleted on switch, the active driver just stops pointing at the old provider. Switching back makes the old files visible again with zero data loss. The existing switch-confirmation dialog (I-17, reused, not a new popup) copy is extended to say this outright: *"เปลี่ยนผู้ให้บริการจะไม่โยกย้ายไฟล์เดิมให้อัตโนมัติ ระบบจะมองไม่เห็นไฟล์เก่าจนกว่าจะสลับกลับ — ไฟล์เดิมไม่ได้ถูกลบ สลับกลับมาดูได้ทุกเมื่อ"* (files aren't migrated automatically; they become invisible to the app until you switch back; nothing is deleted; switching back restores visibility). Applies to every provider pair, not just Google↔OneDrive — the existing dialog gains this one paragraph once, reused everywhere (no per-pair copy variants needed).
**F-OD-4 resolved 2026-07-24 (product owner: accept as documented risk, option (ก)):** this "nothing is deleted" framing is accurate for reads but not for *deletes* — a delete issued while a different provider is active only targets the currently-active provider (404 = idempotent success, unchanged — the idempotent-delete contract stays as-is, needed for legitimate cleanup of already-drifted rows) and does not touch the file physically sitting at the old, inactive provider, which is then orphaned there permanently with no cleanup path. No code change. The switch-confirmation dialog copy gains one more sentence, alongside the M-12 paragraph: *"หากมีการลบไฟล์ขณะใช้ผู้ให้บริการอื่นที่ไม่ใช่ผู้ให้บริการเดิมที่เก็บไฟล์นั้น ไฟล์จริงที่ผู้ให้บริการเดิมจะไม่ถูกลบและไม่สามารถเข้าถึงผ่านระบบได้อีก"* (deleting a file while a different provider than the one storing it is active does not remove the physical file at the old provider, and it becomes permanently unreachable through the app). Accepted, documented residual risk — same posture as OD-6/I-20's other accepted-risk rows.

**M-13 — Failed/interrupted upload must surface a clear error to the user, never fail silently (grill G4, 2026-07-24).**
Grill question: if an upload drops mid-transfer (relevant to M-5's >4 MB chunked path), does the clinic get told? Answer: yes, already covered by the existing contract — the upload endpoint call is synchronous from the frontend's perspective (`useEmrAttachmentUpload` / pet-photo upload hooks, ADR-0021/0022), so a network drop or provider error surfaces as a rejected request the existing upload UI already renders as an error toast/banner (same path as any other `StorageUnavailableError`). **No code change required** — this M is a write-plan/QA callout, not a new mechanism: add an explicit AC (§9) that a simulated mid-chunk failure on the >4 MB path renders the same user-visible error as any other failed upload, so it's asserted rather than assumed. The previously-uploaded file (if any) is untouched (M-5); the user must retry manually (accepted, unchanged from the original OD-5 posture) — this M only closes the "does the user actually find out" gap, not the retry-automation gap (still out of scope, §10).
- **Two residual hygiene items (round-2 grill finding 6, non-blocking, write-plan bullets):** (a) a failed upload-session leaves an abandoned session at Microsoft (self-expires after some days per Graph, but a best-effort `DELETE {uploadUrl}` on the failure path is one cheap line, worth adding); (b) confirm the frontend/proxy request timeout comfortably exceeds a worst-case slow-network multi-chunk upload (up to ~3 sequential Graph `PUT`s inside one HTTP request for a 25 MB body) — otherwise a *successful-but-slow* upload could be reported to the user as a timeout failure.

**M-9 — Error classification (the `classify()` analog):**
- HTTP 404 / `itemNotFound` → not-found (ENOENT-convention, → `StorageNotFoundError` / `exists() === false` / idempotent delete).
- HTTP 401, or token-endpoint `error: "invalid_grant"` (incl. AADSTS 70000/70008/700082 expired-or-revoked codes), or `InvalidAuthenticationToken` → auth-invalid (`OneDriveAuthInvalidError`) — flips `connected: false` at the status layer; `StorageUnavailableError` at the operation layer.
- HTTP 429 (throttling, `Retry-After`) and everything else → `StorageUnavailableError`; never flips `connected` (I-16 "don't read a blip as data loss").
- **HTTP 403 (round-2 grill finding 3, added explicitly):** insufficient-scope is neither 404 nor 401/`invalid_grant` — without an explicit branch it would fall into the generic "everything else → unavailable, never flips connected" bucket, which would **mask a broken status ping or M-11 collision check as permanently green**. 403 is classified the same as 401 for the status/ping calls specifically (`GET /me/drive` or its approot fallback) — treat as auth/config-invalid, surface a distinct "insufficient permission — reconnect" reconnect-guidance copy rather than the generic transient-error posture, so a scope mistake is visible immediately during the pre-write-plan spike (finding 3) or in production, rather than silently green forever.

---

## 3. Architecture

**New driver: `OneDriveDriver`** (implements `StorageDriver`, alongside `LocalDiskDriver`/`SmbShareDriver`/`GoogleDriveDriver`):
- Constructed per-operation by `getStorageDriver(tenantId)`'s new `provider === 'onedrive'` branch from the tenant's decrypted `{accessToken, refreshToken, tokenExpiresAt}` + lazy env-read client credentials — same construction pattern as the GDrive branch, minus the folder-ID bundle (M-4).
- Reuses `parseKey(tenantId, key)`'s validation contract from `google-drive-driver.ts` (same server-built `tenants/{tenantId}/{emr|photo}/...` shape, foreign-tenant/malformed key → `StorageKeyError`) — extracted to a shared helper or duplicated verbatim, dev-agent's call at write-plan time. The parsed key maps 1:1 onto the approot-relative path `tenant-{id}/{emr/{recordId}|photo}/{fileName}`.
- `save`: ensure parent chain (M-4) → ≤4 MB simple `PUT` / >4 MB upload session with `conflictBehavior: replace` (M-5); on a session failure, best-effort `DELETE` the abandoned upload session before surfacing the error (round-2 grill finding 6).
- `read`: `GET .../content` by path (follows Graph's 302 to the pre-authenticated download URL).
- `delete`: `DELETE` by path; 404 → already-deleted, idempotent (same contract as all drivers).
- `exists`: `GET` item metadata by path; 404 → false; anything else non-2xx → `StorageUnavailableError`.
- Token refresh per M-2, inside `onedrive-client.ts` (proactive-by-expiry + retry-once-on-401), write-back via the conditional-update repo function.

**OAuth connect flow (2 new routes, both pure pattern-copies of GDrive Sub-PR B):**
- `GET /clinic/storage-config/onedrive/authorize` — `clinic.integrations.edit`, authenticated `fetch`, returns `{ url }` (I-8). URL = v2.0 authorize endpoint with client ID, scopes `offline_access Files.ReadWrite.AppFolder`, `response_type=code`, `prompt=select_account`, `redirect_uri=<server-base>/oauth/onedrive/callback`, and the signed `state` (server-derived origin, nonce with `provider: 'onedrive'`, 10-min expiry). Lazy env check → `503 ONEDRIVE_OAUTH_NOT_CONFIGURED` (I-13).
- `GET /oauth/onedrive/callback` — public top-level route beside the Google one (I-9). Verifies state (signature → expiry → **atomic provider-matched nonce consume, M-7** → embedded tenant/user match → N-9 active re-checks) before anything is read or persisted; exchanges `code` at the v2.0 token endpoint; **the persist `upsert` nulls `smb*` and `google*` columns and, if the overwritten row was `provider === 'google_drive'` with a stored refresh token, best-effort-revokes it at Google (M-10, BA F-OD-1)**, then encrypts and persists both tokens + expiry with `provider: 'onedrive'`; **probes `GET /me/drive/special/approot` once** (creates the app folder server-side on first access and proves the grant actually works before we commit to it) and ensures `tenant-{id}/emr` + `tenant-{id}/photo`; populates `oneDriveAccountIdHash` and runs the M-11 collision check; writes the standard `settings_audit_log` entry; redirects to the interstitial then `/settings/storage` (I-17 UX reuse). Failure branches: **unlike Google (which omits `state` on a denial), Microsoft includes `state` on its `error=access_denied`/`consent_required` redirects (round-2 grill finding 8)** — the callback verifies the returned state and redirects to the *correct tenant origin* with the right error copy on these branches, rather than blindly falling back to the fixed default origin the way a naive Google-mirror would; a truly invalid/unparseable/expired state still falls back to the fixed default origin per I-11. Nothing persisted on any failure branch.
- **Disconnect**: existing `updateStorageConfig` path — switch-confirmation, audit write, null the four `oneDrive*` columns (I-14, corrected count — includes `oneDriveAccountIdHash`, round-2 grill finding 2). No revoke call exists to make (M-3).
- **Reverse switch (round-2 grill finding 1):** the shipped Google callback's connect `upsert` is extended (write-plan task, this sub-project) to also null all four `oneDrive*` columns when overwriting a `provider === 'onedrive'` row — mirrors M-10's OneDrive-connect direction, no revoke available either way (M-3).
- **Status check**: `GET /clinic/storage-config` `connected` field now also populated when `provider === 'onedrive'` — live ping (`GET /me/drive` or the approot fallback per the finding-3 spike) with a 403 branch (M-9), auth-invalid → `false`, transient → skip/log (I-16). `duplicateAccountWarning` recomputed per read, gated to `clinic.integrations.edit` (M-11).

---

## 4. Data model

Extends `TenantStorageConfig` (same table, per its own design note). Four new nullable columns — no folder-ID columns (M-4):

| column | type | notes |
|---|---|---|
| `oneDriveAccessTokenEncrypted` | text, nullable | AES-256-GCM via `SETTINGS_ENCRYPTION_KEY` (I-7); replaced on every refresh |
| `oneDriveRefreshTokenEncrypted` | text, nullable | AES-256-GCM; **rotates** — replaced on every refresh too (M-2), not only at connect |
| `oneDriveTokenExpiresAt` | timestamp, nullable | access-token expiry (from `expires_in`); drives proactive refresh (M-2). Not a secret |
| `oneDriveAccountIdHash` | text, nullable | HMAC-SHA256 (HKDF-derived key) of Microsoft `owner.user.id` from `GET /me/drive`; not reversible, not PII at rest; drives M-11 duplicate-account warning |

**Retrofit to the already-shipped Google Drive columns (M-11, grill G3):** `googleAccountIdHash` (text, nullable) — same hashing scheme, populated from Drive `about.get` `user.permissionId`. Small patch to the merged Google callback, bundled in this sub-project's PR (shared detection helper).

**Connect-side column hygiene (M-10, BA F-OD-1; both directions per round-2 grill finding 1; hash columns included per round-2 grill finding 2):** the OneDrive-connect upsert nulls `smb*`, `google*`, and `googleAccountIdHash` if any were set on the row being overwritten; the (write-plan-extended) Google-connect upsert nulls all four `oneDrive*` columns including `oneDriveAccountIdHash` if the row being overwritten was `provider === 'onedrive'`. No encrypted secret or account-hash from a prior provider survives at rest past a switch, in either direction (I-14 disconnect, M-10 connect — both directions).

`provider` value set extends to `local | custom_path | google_drive | onedrive` (the exact value ADR-0023 §3 and the schema comment reserved).

`OAuthConnectNonce`: **no schema change** — rows carry `provider: 'onedrive'`. `consumeNonce` gains the provider predicate (M-7).

---

## 5. API / permission

| Surface | Method/path | Permission | Notes |
|---|---|---|---|
| Connect-initiate | `GET /clinic/storage-config/onedrive/authorize` | `clinic.integrations.edit` | Returns `{ url }` JSON (I-8) |
| OAuth callback | `GET /oauth/onedrive/callback` | none — signed single-use `state` is the trust boundary (I-9/I-10/I-12, M-7) | Own top-level public route |
| Config read + live status | `GET /clinic/storage-config` (existing) | `clinic.profile.view` | `connected?` now also for `onedrive`; tokens never returned (I-7). `duplicateAccountWarning` field is present in the response only for `clinic.integrations.edit` holders (round-2 grill finding 5) — doctor/staff still get `configured`/`connected` |
| Disconnect / switch | `PUT /clinic/storage-config` (existing) | `clinic.integrations.edit` | Nulls the four `oneDrive*` columns, incl. `oneDriveAccountIdHash` (I-14/M-3, corrected count) |

No new permission codes; no default-matrix change; no platform-plane involvement; `TenantStorageConfig` still holds no PII. Deny-by-default preserved — the callback remains the feature's single, precedent-blessed exception, now with the M-7 provider-match hardening.

**Write-plan note (BA §3, non-blocking):** the `PUT /clinic/storage-config` Zod enum stays `['local','custom_path']` — connect to `onedrive` (like `google_drive`) is callback-only, never wired through the PUT path. Disconnect from `onedrive` is `PUT provider=local|custom_path`, with `updateStorageConfig` detecting `current.provider === 'onedrive'` and nulling `oneDrive*` (I-14).

---

## 6. UI

- Storage page radio group gains a fourth option, **"Microsoft OneDrive"**, alongside Local / Network share / Google Drive.
- Not-yet-connected: **"Connect with Microsoft"** button — same authenticated-fetch-then-navigate flow as the Google button (I-8), full-page navigation, no popup.
- Interstitial `/settings/storage/connecting` page **reused as-is**; its copy generalizes to "Connecting your storage..." (or a provider param) rather than a second page — dev/uiux call at write-plan, but no new route.
- Connected: same green/red status dot + **Disconnect** via the existing switch-confirmation dialog (I-17).
- **Data-custody note (I-17 / BA G-3 parity), adapted:** connect and switch-confirmation copy states files are stored in *the connected Microsoft account's* OneDrive; if that account is lost or its access removed, the clinic loses access until reconnected. For work/school accounts custody sits with the clinic's own organization (mildly *better* than the Google-personal case); the copy stays account-neutral: "Files are stored in this Microsoft account's OneDrive...".
- **Disconnect copy addition (M-3):** one sentence — disconnecting removes Anemal's access keys immediately, but the Anemal entry stays listed in the Microsoft account's app permissions until removed there.
- **Q4 note in connect helper copy:** one sentence that work/school accounts may require the clinic's Microsoft administrator to approve access once (Q4 = a, unconditional — BA F-OD-3).
- **No-migration/reversibility paragraph (M-12, grill G2):** the existing switch-confirmation dialog (I-17) gains one paragraph, reused for every provider pair: switching does not auto-migrate files, old files become invisible to the app (not deleted), switching back restores visibility. Applies uniformly — not a Google/OneDrive-specific variant.
- **Duplicate-account banner (M-11, grill G3):** non-blocking banner on the Storage page when `duplicateAccountWarning: true` — shown for Google Drive and OneDrive alike, existence-only ("connected to another clinic"), never names the other tenant.
- Existing Compassionate Care tokens only; no raw hex, no emoji.

## 7. Error handling

- Callback failures (consent denied, admin-approval-required — Microsoft returns these as `error=access_denied`/`consent_required` on the redirect — state invalid/expired, code-exchange failure): nothing persisted, `?error=` code → inline copy on `/settings/storage`; invalid-state branch → fixed default origin (I-11). The admin-approval case gets its own copy variant ("your Microsoft administrator needs to approve Anemal first") since its remediation differs from "try again".
- Runtime failures during upload/read/delete: M-9 classification → the existing `StorageNotFoundError`/`StorageUnavailableError` contract; same Thai retryable message; zero changes to `pet.service.ts`/`emr-attachment.service.ts`.
- Refresh failure (rotated-token loss, 90-day inactivity expiry, org admin revokes, password-reset invalidation — all surface as `invalid_grant`): operation layer → `StorageUnavailableError`; status layer → `connected: false` with reconnect guidance. Identical shape to GDrive's revoked-grant path.
- Expired *client secret* (operator-side, M-8): token refreshes start failing tenant-wide → red status dots + reconnect attempts that also fail at the exchange. Distinct copy is not built for this (the operator's rotation reminder is the mitigation); noted as accepted.
- Throttling (429): generic `StorageUnavailableError`, no retry loop this round — consistent with quota-exceeded's accepted posture (I-20).
- Admin renames/deletes folders in their own OneDrive: path-miss behavior per M-4 — recreate-on-save, 404 on read/delete, no ID-staleness class.
- Shared-Microsoft-account-two-tenants (I-20/N-2 analog): file visibility is already isolated by the `tenant-{id}` prefix; no app-side disconnect cross-break exists (M-3 upside); a *manual* revocation at Microsoft breaks all tenants on that account → each degrades to the normal reconnect-needed status. Documented, accepted.
- **Connect over a prior provider, both directions (M-10, BA F-OD-1; round-2 grill finding 1):** connecting OneDrive while the tenant's row currently holds `smb*` or `google*` secrets — the connect `upsert` nulls the foreign-provider columns (incl. `googleAccountIdHash`) in the same write; if the prior provider was `google_drive`, its refresh token is best-effort-revoked at Google first (failure logged, never blocks the OneDrive connect from completing). Symmetrically, connecting Google Drive while the row holds `oneDrive*` secrets nulls all four `oneDrive*` columns (no revoke available, M-3) — this direction requires a small write-plan patch to the already-shipped Google callback.

## 8. Performance (accepted, documented)

Graph round-trips are slower than local disk — same acceptance as sub-projects 1–2. Path-based addressing makes reads/existence checks a single call (vs GDrive's folder-resolve + list chain) — OneDrive is expected to be the *cheapest* cloud driver per operation. Proactive token refresh adds at most one token-endpoint call per ~hour per tenant. +1 `GET /me/drive` ping per Storage-page load (I-16). No caching added.

## 9. Testing (high level — exact list belongs in the write-plan)

- `OneDriveDriver` unit tests against `FakeOneDriveClient` (mirrors `FakeGoogleDriveClient`): save/read/delete/exists round-trips; **photo replace on the same key yields exactly one file** (the N-1-class regression test, kept even though path-PUT makes it structurally hard to fail — it is the load-bearing guarantee); ≤4 MB vs >4 MB routes through simple-PUT vs upload-session respectively; parent-folder ensure treats 409 as success; foreign-tenant/malformed key → `StorageKeyError`; not-found vs unavailable vs auth-invalid classification (M-9); proactive refresh fires when `tokenExpiresAt` is past, reactive retry-once fires on 401, and both write back **both** rotated tokens (M-2).
- `getStorageDriver`: `provider = 'onedrive'` → `OneDriveDriver` branch test.
- Token write-back race (N-4 analog): refresh completing after disconnect writes nothing (conditional update, zero rows).
- Callback integration tests: happy path (mocked token endpoint + approot probe) persists encrypted tokens + expiry + audit row; replayed nonce rejected; **Google-provider nonce presented at the OneDrive callback rejected (M-7 — the one genuinely new security test in this sub-project)**; invalid/expired state → fixed origin; consent-denied and consent_required carry distinct error params; inactive user/tenant rejected (N-9/I-12); missing env vars → clean 503 (I-13).
- Disconnect test: switch succeeds, all four `oneDrive*` columns nulled (incl. `oneDriveAccountIdHash`, round-2 grill finding 2), audit written, **no revoke call attempted** (M-3 — assert the absence).
- Status-check tests: `connected: true` valid, `false` on auth-invalid, transient failure does not flip.
- No changes to existing local/SMB/GDrive driver tests or call sites.
- **Connect-side column hygiene (M-10, BA F-OD-1):** connecting OneDrive from a `custom_path` tenant leaves `smb*` NULL after the callback commits; connecting from a `google_drive` tenant leaves all `google*` columns (incl. `googleAccountIdHash`) NULL and asserts the Google-revoke call was attempted (success and failure-logged-but-non-blocking both covered); no encrypted foreign-provider secret or hash is readable on the row after connect.
- **Reverse-direction column hygiene (round-2 grill finding 1):** connecting Google Drive from a tenant whose row is currently `provider === 'onedrive'` leaves all four `oneDrive*` columns NULL after the (patched) Google callback commits; no revoke call is attempted (M-3 — assert the absence, mirroring the OneDrive-disconnect assertion).
- **Google-flow non-regression (BA F-OD-2):** after the `consumeNonce(rawNonce, provider)` signature change, a `'google'`-minted nonce still consumes successfully at the existing Google callback (`oauth-google.controller.ts`) — asserted alongside the new cross-provider-rejection test (a `'google'` nonce presented at the OneDrive callback, and vice versa, both rejected).
- **Duplicate-account detection (M-11, grill G3; predicate/lifecycle per round-2 grill findings 2/5):** two different tenants connecting the same Microsoft account both persist successfully; the second connect's response/status carries `duplicateAccountWarning: true`, gated to `clinic.integrations.edit` callers only (a `clinic.profile.view`-only caller does not see the field); two branches under the *same* tenant connecting the same account do NOT warn (only cross-tenant matches, `tenantId != ?` predicate); a disconnected tenant's hash is NULL and no longer triggers warnings for other tenants; the warning recomputes (doesn't go stale) across a later disconnect on either side; same coverage retrofitted for Google Drive (`googleAccountIdHash`); no tenant-identifying detail leaks in the warning payload.
- **No-migration/reversibility (M-12, grill G2):** switching provider A → B → A round-trips with the original files intact and re-readable through the driver once switched back (deterministic key derivation, I-4/M-4 — nothing physically deleted by a switch).
- **Upload-failure visibility (M-13, grill G4):** a simulated failure mid-chunk on the >4 MB upload-session path surfaces the same user-facing error the existing attachment-upload UI already renders for any other failed upload (no silent failure); the abandoned upload session is best-effort cleaned up (round-2 grill finding 6).
- **403 classification (round-2 grill finding 3, M-9):** a simulated insufficient-scope response on the status ping is classified as auth-invalid (not transient) and flips `connected: false` with distinct reconnect-guidance copy — never silently stays green.

## 10. Explicitly out of scope

- Migrating existing files when switching providers (still warn-only, all sub-projects).
- Production redirect-URI registration and publisher verification (deploy-time / Q4-dependent operator tasks).
- SharePoint document libraries as a target (approot on `/me/drive` only — a clinic wanting a shared SharePoint library is a new requirement, not assumed).
- Surfacing *which* Microsoft account is connected (email display) — would require the `User.Read` scope; same deferral as GDrive's account-email display (a separate decision, not assumed).
- Any retry/backoff machinery for 429 throttling.

---

## Gap analysis (AS-IS / TO-BE)

```
ID: STORAGE-OD-1     Objective: complete the BYO-storage triad with the provider most B2B
                     clinics already pay for (Microsoft 365), no on-prem infrastructure needed
AS-IS: clinic chooses local disk (default), own SMB share (sub-project 1), or own Google Drive
       (sub-project 2, in flight). Clinics standardized on Microsoft 365 must either run a NAS
       or adopt a Google account foreign to their org's IT policy.
Gap:   no storage option matching the Microsoft-centric clinic's existing account/custody model.
TO-BE: Clinic Admin connects a Microsoft account via OAuth (app-folder scope); attachments +
       pet photos live under Apps/<app>/tenant-{id}/... in that account's OneDrive.
Priority: Should (completes the locked 3-provider build order)   Owner-agent: dev / uiux
Acceptance: a connected tenant's EMR upload + pet-photo save/read/delete resolve to their own
            OneDrive; config-less tenants unchanged; no cross-tenant/plane path exists; all
            §1 inherited invariants hold under the OneDrive driver.
```

## Risk register (new/changed vs GDrive only — inherited risks tracked there)

| ID | Risk | Sev | Mitigation | Owner |
|---|---|---|---|---|
| OD-1 | Refresh-token rotation mishandled (old token persisted after rotation) → tenant silently loses access at next refresh | Med | M-2 contract: both tokens written back atomically per refresh; driver test asserts both columns change | dev |
| OD-2 | Cross-provider nonce replay via shared `OAuthConnectNonce` | Low-Med | M-7 provider-matched consume; regression test both directions | dev |
| OD-3 | Client secret expiry (≤24 months) bricks all OneDrive tenants at once | Med | Operator rotation reminder (Q3); failure mode documented (§7); no code mitigation this round | operator |
| OD-4 | "Need admin approval" consent wall surprises work/school clinics | Med | Q4 decision; helper-copy sentence; distinct `consent_required` error copy | ba / uiux |
| OD-5 | Upload-session path (>4 MB) under-tested vs simple PUT | Low | Explicit both-routes driver tests (§9); 25 MB cap bounds chunk count | qa |
| OD-6 | No app-side revoke → stale grant listed at Microsoft after disconnect confuses an admin | Low | M-3 disconnect copy names the manual removal location; tokens nulled so access is genuinely dead | ba |
| OD-7 | Connect-to-OneDrive leaves a prior provider's encrypted secret (Google refresh token / SMB password) at rest; a prior Google grant left live at Google | Med | M-10: connect `upsert` nulls `smb*`+`google*`; best-effort-revoke a previous Google token; regression tests (§9) mirroring the shipped Google-side fix | dev |
| OD-8 | M-7's `consumeNonce` signature change silently bricks the shipped Google connect flow (wrong/omitted provider string) | Low-Med | §9 Google-flow non-regression test asserts a `'google'` nonce still consumes at the Google callback | dev / qa |
| OD-9 | Same personal Microsoft/Google account connected to two different clinics goes undetected | Low | M-11: hashed account-ID collision check, non-blocking warning banner, both providers | dev |
| OD-10 | Failed upload on the >4 MB chunked path fails silently, clinic doesn't know to retry | Low | M-13: explicit AC that existing generic upload-error UI covers this path too (no new mechanism, just asserted) | dev / qa |
| OD-11 | Connecting Google Drive over a `provider='onedrive'` row leaves the OneDrive tokens live at rest — OneDrive's *only* kill mechanism, since there's no revoke (M-3) | **High (round-2 grill finding 1)** | M-10 extended to both directions; write-plan patches the shipped Google callback to null `oneDrive*`; §9 mirror test | dev |
| OD-12 | Stale account-hash columns survive a disconnect/switch, causing false-positive duplicate-account warnings for unrelated tenants | Med (round-2 grill finding 2) | M-11 hash columns nulled everywhere their sibling secrets are nulled; explicit provider+tenant query predicate; §9 test | dev |
| OD-13 | `Files.ReadWrite.AppFolder`/`drive.file` scope may not actually authorize the account-ID lookup calls M-11/I-16 depend on; a 403 could be misclassified as transient and mask a permanently broken status check | Med (round-2 grill finding 3) | Verification spike before write-plan; documented fallback (approot `driveId`); explicit 403 branch in M-9 | dev — **spike required before write-plan** |
| OD-14 | `GET /clinic/storage-config` recomputing the duplicate-account check per read lets a non-admin staff user infer another tenant's connect/disconnect timing over repeated page loads | Low (round-2 grill finding 5) | `duplicateAccountWarning` field gated to `clinic.integrations.edit` in the response | dev |
| F-OD-4 | Deleting an attachment while a different provider is active than the one holding the file leaves the physical file orphaned at the old provider forever — no cleanup path, may contain clinical/EMR data (round-2 grill finding 4) | Med | **Resolved 2026-07-24 — accepted as documented residual risk (product owner, option ก).** Idempotent-delete contract unchanged; switch-confirmation dialog gains one sentence naming the behavior explicitly | ba |

## Definition-of-Ready check (self-assessment)

| Criterion | Status |
|---|---|
| Objective stated | ✔ (gap analysis) |
| Actors/roles named | ✔ (clinic_admin write, all three roles read — inherited I-6) |
| Permission codes assigned | ✔ (§5 — no new codes) |
| Business rules / isolation listed | ✔ (§1 I-4/I-7/I-9/I-10, §2 M-7, M-10) |
| Exceptions covered | ✔ (§7, incl. connect-over-prior-provider) |
| NFR impact noted | ✔ (§8 + OD-3 availability note) |
| Acceptance criteria testable | ✔ (§9, incl. M-10/F-OD-1 and F-OD-2 regression tests) |
| Risks & dependencies recorded | ✔ (risk register incl. OD-7/OD-8; sequenced after GDrive Sub-PR B) |
| **Product decisions resolved** | ✔ — Q1–Q4 answered 2026-07-24 (§0) |
| **BA sign-off** | ✔ — APPROVE-WITH-FINDINGS 2026-07-24, F-OD-1/F-OD-2/F-OD-3 folded in above (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`) |
| **Mandatory grill** | ✔ — 2026-07-24, G1-G4 resolved with product owner, M-11/M-12/M-13 folded in (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`) |
| **Independent second-pass review** | ✔ — Fable, 2026-07-24, 8 findings (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill-round2.md`), all folded in. F-OD-4 (delete-orphans-file-at-old-provider) resolved same-day — accepted as documented residual risk (product owner, option ก). **⚠️ OD-13 (round-2 finding 3, unverified OAuth-scope claim behind M-11/I-16) still needs a technical verification spike before `/write-plan` — not a product decision, but not yet done either.** |
