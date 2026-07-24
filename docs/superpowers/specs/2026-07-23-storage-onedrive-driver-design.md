# Design: Per-Tenant Storage Provider — Microsoft OneDrive Driver (Sub-project 3 of 3)

**Date:** 2026-07-23
**Status:** Draft — **Q1–Q4 answered 2026-07-24 (see §0)**. BA sign-off 2026-07-24: APPROVE-WITH-FINDINGS (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`) — F-OD-1/F-OD-2/F-OD-3 folded in (§2 M-10, §3, §4, §7, §9, risk register, §6, DoR check). Mandatory grill (Step 3.5) run 2026-07-24 with the product owner — G1 (secret-rotation cadence, confirmed 6-monthly) / G2 (M-12, no-migration reversibility copy) / G3 (M-11, cross-tenant duplicate-account warning) / G4 (M-13, upload-failure visibility) all resolved and folded in — see `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`. **Ready for `/write-plan` (Step 4).**
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

**M-10 — Connect must null the *other* providers' secret columns, and best-effort-revoke a previous Google token (BA F-OD-1, extends I-14 to the connect direction).**
I-14 nulls `oneDrive*` on disconnect (switch *away*). The symmetric case — connect *to* onedrive while a prior provider's secrets are still stored on the row — was missing from the original draft. Live precedent (already shipped): the Google callback nulls `smb*` on connect (`oauth-google.controller.ts:104`, added as a QA round-2 fix — "connecting Drive left a stale SMB credential at rest"). OneDrive inherits the same invariant, broadened because `google_drive` is now itself a live source-provider a tenant can be switching from:
- The OneDrive callback's persist-tokens `upsert` nulls **`smb*` AND `google*`** columns (`smbHost`, `smbShare`, `smbUsername`, `smbPasswordEncrypted`, `googleAccessTokenEncrypted`, `googleRefreshTokenEncrypted`, `googleRootFolderId`, `googleEmrFolderId`, `googlePhotoFolderId`) in the same write that sets the three `oneDrive*` columns — no stale encrypted secret survives at rest on a row whose `provider` is now `onedrive`.
- If the row being overwritten had `provider === 'google_drive'` with a stored Google refresh token, best-effort-revoke that token at Google before nulling it (mirrors the shipped Google-side N-10 "revoke a previous Google token on reconnect" — logged on failure, never blocks the connect). OneDrive itself still has no revoke capability (M-3 unchanged) — this is about cleaning up a *different* provider's live grant, not OneDrive's own.
- This closes the same class of bug QA caught and fixed on the immediately preceding (Google) sub-project — repeating it here would be a regression of an already-paid-for lesson.

**M-11 — Cross-tenant duplicate cloud-account detection: warn, don't block (grill G3, 2026-07-24).**
Grill finding: two *different* Anemal tenants (different clinics) connecting the same personal Microsoft or Google account is undesirable and should surface a warning; two *branches of the same tenant* sharing one account is fine (they already share the `tenant-{id}` prefix by design, I-4). Product-owner decision: check for duplicates and warn — do not block the connect.
- **New nullable column, both cloud providers:** `googleAccountIdHash` (retrofit to the already-shipped Google Drive path) and `oneDriveAccountIdHash` (new). Populated at OAuth callback time from a **stable account identifier already reachable with the existing scopes — no new OAuth scope needed**: Google's Drive `about.get?fields=user` returns `user.permissionId` under `drive.file` (already granted); Microsoft's `GET /me/drive` (already called for I-16's status ping / the M-10 approot probe) returns `owner.user.id`. Hashed with HMAC-SHA256 using an HKDF-derived key from `SETTINGS_ENCRYPTION_KEY` (same pattern as `oauth-state.ts`, I-10) — never the raw account ID or email at rest, so nothing PII-shaped is stored (this project's tenant-config table has never held PII, per §5).
- **Collision check:** after persisting, query other tenants' `TenantStorageConfig` rows with the same provider and matching hash. A match → the connect still succeeds (never blocked) but the response/status includes a `duplicateAccountWarning: true` flag; the Storage page shows a non-blocking banner: "บัญชีนี้เชื่อมต่อกับคลินิกอื่นในระบบ Anemal อยู่แล้ว — แนะนำให้แต่ละคลินิกใช้บัญชีแยกกัน (ยกเว้นสาขาในคลินิกเดียวกัน)". No tenant name or identifying detail from the other match is ever surfaced (existence-only signal, same discipline as the ADR-0019/0014 404-not-403 precedent — don't leak details about another tenant).
- **Scope, explicitly bounded (grill: "shouldn't be much work" — confirmed):** one hash column per provider, one query, one banner. No blocking, no admin notification, no cross-tenant enumeration UI. Retrofitting Google Drive is a small patch to the already-merged callback (add the hash-populate + collision-check calls it's missing) — flagged for write-plan as a small scoped change to shipped code, bundled in this sub-project's PR since the detection helper is shared.

**M-12 — Switch-confirmation dialog states plainly: no auto-migration, nothing is deleted, reversible (grill G2, 2026-07-24).**
Grill question: does switching providers move old files, or does the clinic just lose access? Answer, confirmed against I-19 (locked parent decision, no migration on switch): **neither files nor access are destroyed.** Every driver addresses files by a deterministic, tenant/record-derived key (I-4/M-4) — nothing is deleted on switch, the active driver just stops pointing at the old provider. Switching back makes the old files visible again with zero data loss. The existing switch-confirmation dialog (I-17, reused, not a new popup) copy is extended to say this outright: *"เปลี่ยนผู้ให้บริการจะไม่โยกย้ายไฟล์เดิมให้อัตโนมัติ ระบบจะมองไม่เห็นไฟล์เก่าจนกว่าจะสลับกลับ — ไฟล์เดิมไม่ได้ถูกลบ สลับกลับมาดูได้ทุกเมื่อ"* (files aren't migrated automatically; they become invisible to the app until you switch back; nothing is deleted; switching back restores visibility). Applies to every provider pair, not just Google↔OneDrive — the existing dialog gains this one paragraph once, reused everywhere (no per-pair copy variants needed).

**M-13 — Failed/interrupted upload must surface a clear error to the user, never fail silently (grill G4, 2026-07-24).**
Grill question: if an upload drops mid-transfer (relevant to M-5's >4 MB chunked path), does the clinic get told? Answer: yes, already covered by the existing contract — the upload endpoint call is synchronous from the frontend's perspective (`useEmrAttachmentUpload` / pet-photo upload hooks, ADR-0021/0022), so a network drop or provider error surfaces as a rejected request the existing upload UI already renders as an error toast/banner (same path as any other `StorageUnavailableError`). **No code change required** — this M is a write-plan/QA callout, not a new mechanism: add an explicit AC (§9) that a simulated mid-chunk failure on the >4 MB path renders the same user-visible error as any other failed upload, so it's asserted rather than assumed. The previously-uploaded file (if any) is untouched (M-5); the user must retry manually (accepted, unchanged from the original OD-5 posture) — this M only closes the "does the user actually find out" gap, not the retry-automation gap (still out of scope, §10).

**M-9 — Error classification (the `classify()` analog):**
- HTTP 404 / `itemNotFound` → not-found (ENOENT-convention, → `StorageNotFoundError` / `exists() === false` / idempotent delete).
- HTTP 401, or token-endpoint `error: "invalid_grant"` (incl. AADSTS 70000/70008/700082 expired-or-revoked codes), or `InvalidAuthenticationToken` → auth-invalid (`OneDriveAuthInvalidError`) — flips `connected: false` at the status layer; `StorageUnavailableError` at the operation layer.
- HTTP 429 (throttling, `Retry-After`) and everything else → `StorageUnavailableError`; never flips `connected` (I-16 "don't read a blip as data loss").

---

## 3. Architecture

**New driver: `OneDriveDriver`** (implements `StorageDriver`, alongside `LocalDiskDriver`/`SmbShareDriver`/`GoogleDriveDriver`):
- Constructed per-operation by `getStorageDriver(tenantId)`'s new `provider === 'onedrive'` branch from the tenant's decrypted `{accessToken, refreshToken, tokenExpiresAt}` + lazy env-read client credentials — same construction pattern as the GDrive branch, minus the folder-ID bundle (M-4).
- Reuses `parseKey(tenantId, key)`'s validation contract from `google-drive-driver.ts` (same server-built `tenants/{tenantId}/{emr|photo}/...` shape, foreign-tenant/malformed key → `StorageKeyError`) — extracted to a shared helper or duplicated verbatim, dev-agent's call at write-plan time. The parsed key maps 1:1 onto the approot-relative path `tenant-{id}/{emr/{recordId}|photo}/{fileName}`.
- `save`: ensure parent chain (M-4) → ≤4 MB simple `PUT` / >4 MB upload session with `conflictBehavior: replace` (M-5).
- `read`: `GET .../content` by path (follows Graph's 302 to the pre-authenticated download URL).
- `delete`: `DELETE` by path; 404 → already-deleted, idempotent (same contract as all drivers).
- `exists`: `GET` item metadata by path; 404 → false; anything else non-2xx → `StorageUnavailableError`.
- Token refresh per M-2, inside `onedrive-client.ts` (proactive-by-expiry + retry-once-on-401), write-back via the conditional-update repo function.

**OAuth connect flow (2 new routes, both pure pattern-copies of GDrive Sub-PR B):**
- `GET /clinic/storage-config/onedrive/authorize` — `clinic.integrations.edit`, authenticated `fetch`, returns `{ url }` (I-8). URL = v2.0 authorize endpoint with client ID, scopes `offline_access Files.ReadWrite.AppFolder`, `response_type=code`, `prompt=select_account`, `redirect_uri=<server-base>/oauth/onedrive/callback`, and the signed `state` (server-derived origin, nonce with `provider: 'onedrive'`, 10-min expiry). Lazy env check → `503 ONEDRIVE_OAUTH_NOT_CONFIGURED` (I-13).
- `GET /oauth/onedrive/callback` — public top-level route beside the Google one (I-9). Verifies state (signature → expiry → **atomic provider-matched nonce consume, M-7** → embedded tenant/user match → N-9 active re-checks) before anything is read or persisted; exchanges `code` at the v2.0 token endpoint; **the persist `upsert` nulls `smb*` and `google*` columns and, if the overwritten row was `provider === 'google_drive'` with a stored refresh token, best-effort-revokes it at Google (M-10, BA F-OD-1)**, then encrypts and persists both tokens + expiry with `provider: 'onedrive'`; **probes `GET /me/drive/special/approot` once** (creates the app folder server-side on first access and proves the grant actually works before we commit to it) and ensures `tenant-{id}/emr` + `tenant-{id}/photo`; writes the standard `settings_audit_log` entry; redirects to the interstitial then `/settings/storage` (I-17 UX reuse). All failure branches mirror GDrive's (consent-denied `?error=`, invalid-state → fixed default origin per I-11, nothing persisted on any failure).
- **Disconnect**: existing `updateStorageConfig` path — switch-confirmation, audit write, null the three `oneDrive*` columns (I-14). No revoke call exists to make (M-3).
- **Status check**: `GET /clinic/storage-config` `connected` field now also populated when `provider === 'onedrive'` — live `GET /me/drive` ping, auth-invalid → `false`, transient → skip/log (I-16).

---

## 4. Data model

Extends `TenantStorageConfig` (same table, per its own design note). Three new nullable columns — no folder-ID columns (M-4):

| column | type | notes |
|---|---|---|
| `oneDriveAccessTokenEncrypted` | text, nullable | AES-256-GCM via `SETTINGS_ENCRYPTION_KEY` (I-7); replaced on every refresh |
| `oneDriveRefreshTokenEncrypted` | text, nullable | AES-256-GCM; **rotates** — replaced on every refresh too (M-2), not only at connect |
| `oneDriveTokenExpiresAt` | timestamp, nullable | access-token expiry (from `expires_in`); drives proactive refresh (M-2). Not a secret |
| `oneDriveAccountIdHash` | text, nullable | HMAC-SHA256 (HKDF-derived key) of Microsoft `owner.user.id` from `GET /me/drive`; not reversible, not PII at rest; drives M-11 duplicate-account warning |

**Retrofit to the already-shipped Google Drive columns (M-11, grill G3):** `googleAccountIdHash` (text, nullable) — same hashing scheme, populated from Drive `about.get` `user.permissionId`. Small patch to the merged Google callback, bundled in this sub-project's PR (shared detection helper).

**Connect-side column hygiene (M-10, BA F-OD-1):** the same `upsert` that writes the three `oneDrive*` columns above also nulls `smb*` and `google*` (`googleAccessTokenEncrypted`, `googleRefreshTokenEncrypted`, `googleRootFolderId`, `googleEmrFolderId`, `googlePhotoFolderId`) if either was set on the row being overwritten — no encrypted secret from a prior provider survives at rest past a switch, in either direction (I-14 disconnect, M-10 connect).

`provider` value set extends to `local | custom_path | google_drive | onedrive` (the exact value ADR-0023 §3 and the schema comment reserved).

`OAuthConnectNonce`: **no schema change** — rows carry `provider: 'onedrive'`. `consumeNonce` gains the provider predicate (M-7).

---

## 5. API / permission

| Surface | Method/path | Permission | Notes |
|---|---|---|---|
| Connect-initiate | `GET /clinic/storage-config/onedrive/authorize` | `clinic.integrations.edit` | Returns `{ url }` JSON (I-8) |
| OAuth callback | `GET /oauth/onedrive/callback` | none — signed single-use `state` is the trust boundary (I-9/I-10/I-12, M-7) | Own top-level public route |
| Config read + live status | `GET /clinic/storage-config` (existing) | `clinic.profile.view` | `connected?` now also for `onedrive`; tokens never returned (I-7) |
| Disconnect / switch | `PUT /clinic/storage-config` (existing) | `clinic.integrations.edit` | Nulls `oneDrive*` columns (I-14/M-3) |

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
- **Connect over a prior provider (M-10, BA F-OD-1):** connecting OneDrive while the tenant's row currently holds `smb*` or `google*` secrets — the connect `upsert` nulls the foreign-provider columns in the same write; if the prior provider was `google_drive`, its refresh token is best-effort-revoked at Google first (failure logged, never blocks the OneDrive connect from completing).

## 8. Performance (accepted, documented)

Graph round-trips are slower than local disk — same acceptance as sub-projects 1–2. Path-based addressing makes reads/existence checks a single call (vs GDrive's folder-resolve + list chain) — OneDrive is expected to be the *cheapest* cloud driver per operation. Proactive token refresh adds at most one token-endpoint call per ~hour per tenant. +1 `GET /me/drive` ping per Storage-page load (I-16). No caching added.

## 9. Testing (high level — exact list belongs in the write-plan)

- `OneDriveDriver` unit tests against `FakeOneDriveClient` (mirrors `FakeGoogleDriveClient`): save/read/delete/exists round-trips; **photo replace on the same key yields exactly one file** (the N-1-class regression test, kept even though path-PUT makes it structurally hard to fail — it is the load-bearing guarantee); ≤4 MB vs >4 MB routes through simple-PUT vs upload-session respectively; parent-folder ensure treats 409 as success; foreign-tenant/malformed key → `StorageKeyError`; not-found vs unavailable vs auth-invalid classification (M-9); proactive refresh fires when `tokenExpiresAt` is past, reactive retry-once fires on 401, and both write back **both** rotated tokens (M-2).
- `getStorageDriver`: `provider = 'onedrive'` → `OneDriveDriver` branch test.
- Token write-back race (N-4 analog): refresh completing after disconnect writes nothing (conditional update, zero rows).
- Callback integration tests: happy path (mocked token endpoint + approot probe) persists encrypted tokens + expiry + audit row; replayed nonce rejected; **Google-provider nonce presented at the OneDrive callback rejected (M-7 — the one genuinely new security test in this sub-project)**; invalid/expired state → fixed origin; consent-denied and consent_required carry distinct error params; inactive user/tenant rejected (N-9/I-12); missing env vars → clean 503 (I-13).
- Disconnect test: switch succeeds, all three `oneDrive*` columns nulled, audit written, **no revoke call attempted** (M-3 — assert the absence).
- Status-check tests: `connected: true` valid, `false` on auth-invalid, transient failure does not flip.
- No changes to existing local/SMB/GDrive driver tests or call sites.
- **Connect-side column hygiene (M-10, BA F-OD-1):** connecting OneDrive from a `custom_path` tenant leaves `smb*` NULL after the callback commits; connecting from a `google_drive` tenant leaves all `google*` columns NULL and asserts the Google-revoke call was attempted (success and failure-logged-but-non-blocking both covered); no encrypted foreign-provider secret is readable on the row after connect.
- **Google-flow non-regression (BA F-OD-2):** after the `consumeNonce(rawNonce, provider)` signature change, a `'google'`-minted nonce still consumes successfully at the existing Google callback (`oauth-google.controller.ts`) — asserted alongside the new cross-provider-rejection test (a `'google'` nonce presented at the OneDrive callback, and vice versa, both rejected).
- **Duplicate-account detection (M-11, grill G3):** two different tenants connecting the same Microsoft account both persist successfully; the second connect's response/status carries `duplicateAccountWarning: true`; two branches under the *same* tenant connecting the same account do NOT warn (only cross-tenant matches); same coverage retrofitted for Google Drive (`googleAccountIdHash`); no tenant-identifying detail leaks in the warning payload.
- **No-migration/reversibility (M-12, grill G2):** switching provider A → B → A round-trips with the original files intact and re-readable through the driver once switched back (deterministic key derivation, I-4/M-4 — nothing physically deleted by a switch).
- **Upload-failure visibility (M-13, grill G4):** a simulated failure mid-chunk on the >4 MB upload-session path surfaces the same user-facing error the existing attachment-upload UI already renders for any other failed upload (no silent failure).

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
| **Mandatory grill** | ✔ — 2026-07-24, G1-G4 resolved with product owner, M-11/M-12/M-13 folded in (`docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`). Ready for `/write-plan` |
