# ADR-0023: Per-Tenant Network-Share Storage Driver (App-Layer SMB, Not Native UNC)

**Date:** 2026-07-23
**Status:** Accepted
**Context PRs:** (pending) — sub-project 1 of 3 on `feature/tenant-storage-provider`

## Context

ADR-0022 shipped a pluggable `StorageDriver` interface with `LocalDiskDriver` as the only implementation, explicitly deferring a BYO-storage option per clinic. This ADR covers the first BYO option: a clinic points its EMR attachments + pet photos at its own network share instead of the shared server's local disk. Google Drive and OneDrive (OAuth-based) are separate follow-on sub-projects on the same branch.

## Decision

1. **New `SmbShareDriver`** implements `StorageDriver` using an application-layer SMB2 client library (exact package chosen by `@dev-agent` at implementation time), authenticating with **per-tenant stored credentials** (host, share, username, password — password encrypted with the existing `SETTINGS_ENCRYPTION_KEY`).
2. **Rejected: native UNC access via Node's `fs`.** The app server is the SaaS operator's shared central machine, not clinic-owned hardware. Windows (or any OS) remembers only one credential per remote host per machine at a time — two clinics whose share addresses collide (common with default private-IP ranges) would fight over the same OS-level session, a real cross-tenant risk. Moving authentication into the application layer removes this entirely and, as a side effect, removes any single-OS/single-instance dependency.
3. **`TenantStorageConfig`** (new table, one row per tenant): `provider` (`local` | `custom_path`, future `google_drive`/`onedrive`), `smbHost`, `smbShare`, `smbUsername`, `smbPasswordEncrypted`. Zero-config tenants default cleanly to today's `LocalDiskDriver`.
4. **Write permission:** `clinic.integrations.edit` (infrastructure-config class — same as LINE/SMS/Lab keys — not `clinic.profile.edit`, which is identity data). Read: `clinic.profile.view`.
5. **Credential capture happens in-app** at Clinic Settings (host/share/username/password fields), verified with a real authenticated connect-and-test-write at save time — not a pre-configured, out-of-band OS credential step.
6. **Switch-time informed confirmation:** changing the effective storage base warns that existing files stay at the old location and must be moved manually; no automatic migration in this sub-project.
7. **Atomic writes:** both `LocalDiskDriver` and `SmbShareDriver` write to a temp name then rename over the final key, so a connection drop mid-write cannot destroy the previous good file.
8. **Outage vs. missing-file distinction:** only a true not-found result is treated as "file is missing" (404); any other error (unreachable, timeout, auth) surfaces a distinct retryable "storage unreachable" message.
9. **Audit:** every accepted config change writes a `settings_audit_log` entry.
10. **G1 boot guard (ADR-0022) applies only to filesystem-class local storage** (`ATTACHMENT_DIR`); `custom_path` (tenant-owned, tenant-credentialed network share) is not the case G1 protects against and is not gated by it.

## Consequences

- Adds one new runtime dependency (an SMB2 client library) — justified because native `fs` cannot express per-tenant authenticated network access safely in a shared multi-tenant server process.
- No connection pooling — each storage operation opens and closes its own authenticated connection. Simpler, accepted latency cost; revisit only if measured.
- Backing up a custom-share tenant's files becomes that clinic's own responsibility; the operator's backup regime no longer covers it. Deprovisioning intentionally never deletes a custom share's files.
- Photo/attachment grids over a network share are slower than local disk (no caching added this round) — accepted.
- Symlink-escape and "admin points the share at something hosted on the app server itself" are accepted residual risks (require a real SMB share + valid credential; not solved with extra detection code).

## Alternatives considered

- **Operator-maintained `STORAGE_ALLOWED_ROOTS` allowlist + native UNC path** (BA's original recommendation): rejected after the user identified the actual deployment topology (shared central server, not clinic-owned) — an allowlist doesn't solve the OS-credential-collision problem; the credential has to move into the app layer regardless.
- **Free-typed local/UNC path with no credential fields**: rejected — cannot express per-tenant authenticated access in a shared process without relying on fragile, collision-prone OS session state.
- **Columns on `TenantSettings` instead of a dedicated table**: rejected — sub-projects 2/3 need encrypted OAuth-token columns; keeping them out of `TenantSettings` avoids bloating a table that already carries VAT/profile/integration config.

---

## Amendment (2026-07-23) — Sub-project 2: Google Drive Driver

Design: `docs/superpowers/specs/2026-07-23-storage-google-drive-driver-design.md`. BA sign-off: `...-ba-signoff.md` (REQUEST CHANGES → resolved). Grill: `...-grill.md`.

11. **New `GoogleDriveDriver`** implements `StorageDriver` against Google's `googleapis` client, per-tenant OAuth (`drive.file` scope — least-privilege, app only sees files it creates). Tokens (access + refresh) encrypted with the same `SETTINGS_ENCRYPTION_KEY` as the SMB password; `provider` extends to `google_drive`.
12. **`save()` uses list-then-`files.update`, not bare `files.create`** — Drive allows duplicate same-named files and never replaces on create; this is Drive's atomicity story in place of temp-then-rename (which Drive has no analog for). A design bug caught at grill (finding N-1) — critical because pet photos rely on stable overwrite-in-place keys.
13. **Tenant-scoped folder prefix restored inside Drive too** (`Anemal/tenant-{id}/emr`, `.../photo`) — the original assumption "one Drive account = one tenant, no prefix needed" does not hold (nothing stops the same Google account being connected to two tenants); grill finding N-2.
14. **OAuth callback (`GET /oauth/google/callback`) lives on its own top-level, provider-generic public route** — not nested under `/api/settings`, and not a same-prefix sub-router either. `settings.routes.ts`'s router-global `authMiddleware` would 401 any same-prefix route regardless of registration order tricks; a distinct top-level path removes the dependency entirely rather than managing it. Trust boundary is a signed, HKDF-derived-key HMAC `state` param carrying a **single-use nonce consumed atomically** (new small `OAuthConnectNonce` table, mirrors the existing `RefreshToken` rotation pattern) and a **server-derived** (never client-supplied) tenant subdomain for the post-connect redirect.
15. **Disconnect nulls the stored tokens + folder IDs**, not just revoke-at-Google — a stale encrypted refresh token must not survive a confirmed disconnect. Token refresh write-back is exempt from the audit-on-write rule (system refresh, not an admin change) and is a conditional update guarded against a disconnect race.
16. **Data-custody note**, parity with sub-project 1: Drive storage is bound to one admin's *personal* Google account — sharper custody risk than clinic-owned SMB infrastructure; stated in the connect + switch-confirmation copy.
17. **Accepted residual risk:** if one Google account is connected to two different Anemal tenants, one tenant's disconnect revokes the shared grant at Google and silently breaks the other's connection too (degrades to the normal reconnect-needed status). Google's grant model is per account+client, not per Anemal-tenant — not preventable app-side.
