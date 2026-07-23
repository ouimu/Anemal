# Design: Per-Tenant Storage Provider — Google Drive Driver (Sub-project 2 of 3)

**Date:** 2026-07-23
**Status:** Draft — pending BA sign-off + grill (CLAUDE.md Step 3/3.5)
**Parent goal:** Each clinic picks where its EMR attachments + pet photos live. Sub-project 1 (custom network-share/SMB driver): driver core merged to `main` as PR #46; API + UI (`updateStorageConfig`, `GET/PUT /clinic/storage-config`, the Storage settings page + switch-confirmation dialog) is committed on the shared `feature/tenant-storage-provider` branch as PR #47, **not yet merged to `main`**. This sub-project continues on that same branch (locked single-branch decision) and builds directly on top of that already-committed surface — safe to do locally since the code exists on the branch, but `main`/the roadmap should not describe Sub-PR B as shipped until #47 actually merges, and this sub-project's own PR should not be openable/mergeable ahead of #47. This sub-project = Google Drive, using the clinic admin's own Google account, OAuth-based. Sub-project 3 (OneDrive) follows the same pattern.
**Builds on:** ADR-0022 (`StorageDriver` interface), ADR-0023 (`TenantStorageConfig` table, `getStorageDriver(tenantId)`, switch-confirmation UI pattern — all from sub-project 1).

## User decisions (locked — confirmed live with the user 2026-07-23, do not re-litigate)

1. Build order: custom-path → Google Drive → OneDrive, all on one branch (`feature/tenant-storage-provider`), same locked decision from sub-project 1.
2. OAuth scope: `drive.file` (app only sees files it creates — narrower than full `drive` scope, no reason surfaced to need broader access).
3. Google Cloud OAuth client already created by the user (project "Anemal Access GDrive") — Client ID/Secret stored in `src/backend/.env` as `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`. Redirect URI registered: `http://localhost:4000/api/settings/clinic/storage-config/google/callback` (dev; production URI to be added as a second authorized URI at deploy time — not part of this sub-project's scope).
4. Callback UX: **interstitial page** ("Connecting..." shown briefly) before redirecting back to `/settings/storage` — not an instant silent redirect. Rationale (user): visible feedback that something is happening.
5. Folder structure: one root **"Anemal"** folder auto-created in the admin's Drive on first connect, with `emr/` and `photo/` subfolders mirroring the existing key structure minus the `tenants/{id}/` prefix (a Drive account is already a single tenant's own account — no cross-tenant collision risk the prefix was protecting against for local/SMB).
6. Connection status: checked **live, on every page-load** of Clinic Settings → Storage (a cheap Drive API call), shown as a green/red indicator. No background polling/scheduled health checks.
7. Disconnect/switch-away: reuses the **existing switch-confirmation dialog** from sub-project 1 (no new confirmation UI) — additionally revokes the Google token server-side as part of that same save. No auto-reconnect after a confirmed disconnect (Google's own security model requires the admin to re-consent through Google's screen; this cannot be bypassed or automated).
8. Error handling: same locked parent decision as sub-project 1 — Drive unreachable/quota/auth failure at upload/read time surfaces as an error, never silently falls back to local.

## Architecture

**New driver: `GoogleDriveDriver`** (implements the existing `StorageDriver` interface, alongside `LocalDiskDriver` and `SmbShareDriver`):
- Uses Google's official `googleapis` Node client (OAuth2 + Drive v3), wrapped behind a thin `google-drive-client.ts` seam — mirrors the `smb-client.ts` pattern from sub-project 1 so `GoogleDriveDriver`'s own tests run against a fake client, zero real network dependency.
- Constructed per-operation from the tenant's stored (decrypted) `{accessToken, refreshToken}` — the underlying `google-auth-library` OAuth2Client handles silent access-token refresh using the refresh token when the access token has expired; a refreshed access token is written back to `TenantStorageConfig` after use (single point of persistence, not a shared in-memory cache — consistent with "no caching of TenantStorageConfig" from sub-project 1, this is a token refresh not a config cache).
- `save(key, body, contentType)`: resolves `key` (e.g. `emr/42/uuid-name.pdf`) to a Drive parent-folder ID + filename by walking/creating the `Anemal/emr/42/` path via `files.list`+`files.create` (folders are `mimeType: 'application/vnd.google-apps.folder'`), then `files.create` with the file content. Folder IDs for `Anemal`, `Anemal/emr`, `Anemal/photo` are cached in `TenantStorageConfig` (looked up once, reused) — deeper per-record subfolders (e.g. `emr/42/`) are resolved per-operation (not worth caching, low call volume per record).
- `read(key)`: `files.get` with `alt=media`.
- `delete(key)`: `files.delete`. Idempotent — a 404 from Drive is treated as already-deleted, not an error (same contract as `LocalDiskDriver`/`SmbShareDriver`).
- `exists(key)`: `files.list` filtered by parent + name.
- Every method maps Drive's error shapes onto the existing `StorageNotFoundError`/`StorageUnavailableError` pair (same contract sub-project 1 established) so `pet.service.ts`/`emr-attachment.service.ts` need zero changes — they already only know about `StorageDriver`, not which concrete driver is active.
- `getStorageDriver(tenantId)` (existing function, sub-project 1) gets one more branch: `provider === 'google_drive'` → `new GoogleDriveDriver(...)`.

**OAuth connect flow (2 new routes — everything else reuses sub-project 1's `/clinic/storage-config` infrastructure):**
- **Corrected during Step 2 review (2026-07-23):** the frontend cannot do a plain browser navigation straight to a `requirePermission`-guarded backend route — Anemal's auth model is a Bearer JWT held in frontend state, which a bare GET navigation carries no header for. Fixed by splitting the hop: `GET /clinic/storage-config/google/authorize` (permission: `clinic.integrations.edit`, called as a normal authenticated `fetch`/XHR from the frontend, same as every other protected read) returns **JSON** `{ url: string }` — the Google consent URL — instead of issuing a redirect. The frontend then does the actual browser navigation itself (`window.location.href = url`) directly to Google, never to our own backend route. This keeps every protected call inside the normal Bearer-auth path; only the truly unauthenticated hop (Google → our callback) has no `Authorization` header, and that hop is already covered by the signed `state` param below.
  - Consent URL built with: client ID, `drive.file` scope, `access_type=offline` **and `prompt=consent`** (offline alone does not reliably re-issue a refresh token on a *second* consent after a prior disconnect/revoke — forcing the consent prompt guarantees a fresh refresh token every connect, not just the first ever).
  - `state` param: signed, embeds `tenantId`, `userId`, **the frontend origin/subdomain the admin is currently on** (multi-tenant-by-subdomain — the callback has no other way to know which subdomain to redirect back to), and an issued-at timestamp with a 10-minute expiry.
- `GET /clinic/storage-config/google/callback` (no auth middleware by design — Google redirects the browser here directly; the signed `state` param is the trust boundary, verified for signature, expiry, and that its embedded tenant/user matches before anything is read or written) — exchanges the returned `code` for `{accessToken, refreshToken}`, encrypts both (`SETTINGS_ENCRYPTION_KEY`, same helper as the SMB password), creates the `Anemal` root folder + `emr`/`photo` subfolders, persists `TenantStorageConfig` (`provider: 'google_drive'`, encrypted tokens, folder IDs), writes the same `settings_audit_log` entry pattern as every other config write, then redirects to `<subdomain-from-state>/settings/storage/connecting`, which auto-redirects to `/settings/storage` after ~1.5s.
  - Consent-denied and expired/invalid/tampered `state` are both rejected with nothing persisted, redirecting with a distinct `?error=` code the frontend maps to specific copy (see Error Handling).
- **Disconnect** (switching `google_drive` → anything else) does not get its own endpoint — it's handled inside the existing `updateStorageConfig` service function (sub-project 1): when the *current* row is `provider: 'google_drive'` and the new provider differs, call Google's token-revoke endpoint (`https://oauth2.googleapis.com/revoke`) with the decrypted refresh token, best-effort (logged on failure, never blocks the switch — the local config change is the source of truth, matching the existing "best-effort, logged" pattern for storage-layer failures elsewhere in ADR-0023).
- **Status check**: `GET /clinic/storage-config` (existing endpoint) gets one more field, populated only when `provider === 'google_drive'`: a live `files.list` no-op call (cheapest possible authenticated call) — success → `connected: true`, `invalid_grant`/401 → `connected: false`, anything else (network blip) → `connected: true` with the check simply skipped/logged (a transient check failure must not falsely tell the admin to reconnect — same "don't read a blip as data loss" principle from sub-project 1's driver-level error handling, applied here at the status-check level).

## Data model

Extends the existing `TenantStorageConfig` table (sub-project 1) — no new table, per that table's own design note ("kept out of `TenantSettings` specifically so future OAuth-token columns land here"):

| column | type | notes |
|---|---|---|
| `googleAccessTokenEncrypted` | text, nullable | AES-256-GCM via `SETTINGS_ENCRYPTION_KEY`; refreshed in place when the OAuth client silently renews it |
| `googleRefreshTokenEncrypted` | text, nullable | AES-256-GCM; long-lived, used to mint new access tokens |
| `googleRootFolderId` | text, nullable | Drive file ID of the `Anemal` folder |
| `googleEmrFolderId` | text, nullable | Drive file ID of `Anemal/emr` |
| `googlePhotoFolderId` | text, nullable | Drive file ID of `Anemal/photo` |

`provider` column's value set extends from `local | custom_path` to `local | custom_path | google_drive` (already anticipated in sub-project 1's comment on that column).

## API / permission

- `GET /clinic/storage-config/google/authorize`: `clinic.integrations.edit` (same as the existing `PUT /clinic/storage-config` — connecting a new provider is a write action). Called via a normal authenticated `fetch`, not a browser navigation — returns `{ url }` JSON, frontend performs the actual navigation to Google.
- `GET /clinic/storage-config/google/callback`: no permission middleware (can't carry a Bearer token through a third-party redirect) — instead validated via the signed `state` param, which embeds the tenant/user/subdomain context created at `/authorize` time and is verified (signature + short expiry, e.g. 10 minutes, tenant match) before anything is persisted.
- `GET /clinic/storage-config` (existing): response shape gains `connected?: boolean` (only present when `provider === 'google_drive'`).
- No new database read permission — reuses `clinic.profile.view` from sub-project 1.
- Access/refresh tokens: same rule as the SMB password — never returned by `GET`, `configured: boolean` stands in for them.

## UI

- Clinic Settings → Storage page: radio group gains a third option, **"Google Drive"**, alongside Local and Network share (sub-project 1's existing radio group, one more `<label>`).
- Selecting "Google Drive" (when not yet connected) shows a **"Connect with Google"** button instead of text fields — clicking it calls `GET /clinic/storage-config/google/authorize` (authenticated `fetch`, gets back `{ url }`), then the frontend sets `window.location.href = url` to leave the app for Google's consent screen (full-page navigation, not a popup — simpler, no popup-blocker edge cases).
- New standalone interstitial route/page (e.g. `/settings/storage/connecting`) — shows a centered "Connecting to Google Drive..." message with a spinner, auto-navigates to `/settings/storage` after a short fixed delay (~1.5s, just long enough to read).
- Once connected: same "connected" pill pattern as the SMB password field (sub-project 1) — shows the green/red status dot (from the live check) plus a **"Disconnect"** button. Clicking Disconnect reuses the exact same switch-confirmation dialog already built (provider effectively becomes `local` unless the admin picks another provider first) — no new confirmation UI to build.
- No raw hex colors, no emoji — reuses existing Compassionate Care tokens (green/red status dot uses existing `secondary`/`error` color tokens, not new ones).

## Error handling

- OAuth callback failures (user denies consent, `state` invalid/expired, code exchange fails) → redirect to `/settings/storage` with a query-param error the frontend reads and displays inline (e.g. "Google sign-in was cancelled or failed — try again"), nothing persisted.
- Runtime Drive failures (quota exceeded, network blip, revoked mid-session) during an actual upload/read/delete → surfaces as `StorageUnavailableError`/`StorageNotFoundError` exactly like sub-project 1's drivers, same retryable Thai message ("เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง") — no separate Google-specific error copy needed at the storage-operation layer, only at the connect/status-check layer (which does need Google-specific copy, since "reconnect via Google" is a different remediation than "check the network share").
- Token-refresh failure (refresh token itself invalid/revoked) during a storage operation → same `StorageUnavailableError` path, since from the caller's perspective it's still "storage unreachable, retry" — the *specific* "you need to reconnect" messaging only shows up via the status-check on the Storage settings page, not buried in an EMR upload error toast.
- Revoke-on-disconnect failure (Google's revoke call itself fails) → logged, does not block the switch (see Architecture section — best-effort, matches existing pattern).
- **Orphaned folder-ID cache** (admin manually renames/deletes the `Anemal` folder or its children directly in their own Drive UI): a cached folder ID that Drive no longer recognizes is treated as "not found, not fatal" — same posture as file-level not-found — the driver re-creates the missing folder(s) on the next `save()` and updates the cached ID, rather than surfacing a hard error. Read/delete/exists against a now-missing folder still 404s normally (nothing to find).
- **Quota-exceeded** is deliberately *not* special-cased in this sub-project — it surfaces through the same generic `StorageUnavailableError` path as any other Drive failure, consistent with the precedent already accepted for SMB in sub-project 1 (a specific "your Drive is full" message would be a nice-to-have, not treated as a gap here).
- **Concurrent connect attempts** (e.g. an admin double-clicking "Connect with Google," or two admins racing): each produces its own signed `state` and its own callback; `TenantStorageConfig`'s `upsert` on `tenantId` (the PK) makes the last callback to complete the winner at the DB level — not treated as a risk given the actor pool is Clinic Admin only, and the outcome (one working connection, whichever completed last) is benign either way.

## Performance (accepted, documented)

Same acceptance as sub-project 1: Drive API round-trips are slower than local disk; no caching layer beyond the folder-ID caching already described (which is structural, not a performance cache). Revisit only if measured to matter.

## Testing (high level — exact test list belongs in the write-plan)

- `GoogleDriveDriver` unit tests against a fake Drive client (mirrors `FakeSmbClient`): save/read/delete/exists happy path, folder auto-creation on first use, not-found vs. unavailable classification.
- `getStorageDriver(tenantId)`: one more branch test, `provider = google_drive` → `GoogleDriveDriver`.
- OAuth callback integration tests: valid code exchange happy path (mocked token endpoint), invalid/expired `state` rejected, consent-denied redirect carries the right error param, folders created + config persisted + audit row written on success.
- Status-check tests: `connected: true` on a valid token, `connected: false` on a revoked/invalid one, transient failure does not flip to `false`.
- Disconnect/switch-away test: revoke call attempted, config still switches even if revoke fails (logged).
- No changes to existing local-disk/SMB driver tests or their call sites.

## Explicitly out of scope for this doc

- OneDrive driver (sub-project 3, same branch, next).
- Migrating existing files when switching providers (still deferred, same as sub-project 1 — the switch-confirmation warns, doesn't migrate).
- Production redirect URI registration (deploy-time task, not part of this sub-project's implementation).
- Any change to the `drive.file` scope decision — if broader Drive access is ever needed, that's a new decision, not assumed here.
