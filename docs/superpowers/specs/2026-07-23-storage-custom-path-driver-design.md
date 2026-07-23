# Design: Per-Tenant Storage Provider — Custom Path Driver (Sub-project 1 of 3)

**Date:** 2026-07-23
**Status:** Draft — pending BA sign-off + grill (CLAUDE.md Step 3/3.5)
**Parent goal:** Each clinic picks where its EMR attachments + pet photos live: this sub-project = "custom path" (mapped network drive or local server folder). Later sub-projects (same branch, sequential): Google Drive, OneDrive.
**Builds on:** ADR-0022 (`StorageDriver` interface, `LocalDiskDriver`, PR #42/#43). See handoff `handoff-emr-cloud-storage-2026-07-23.md` and memory `project-cloud-storage-design-decisions.md`.

## User decisions (locked, 2026-07-23 — do not re-litigate)

1. Build order: custom-path first, then Google Drive, then OneDrive — all as sequential tasks in **one branch**, not split across branches.
2. On provider switch, admin is asked whether to leave old files in place or migrate them (per-switch choice, not hardcoded).
3. Upload-time cloud/path failure → show error, user retries manually. No silent fallback to local.
4. Only Clinic Admin configures this, per-tenant, in Clinic Settings.
5. Saving a custom path performs a real test-write before accepting it.

This doc covers decision area 1's first task only (custom path). Migration behavior (decision 2) and Google/OneDrive apply to later tasks in this same design lineage.

## Architecture (revised in grill — see "Why not native UNC" below)

**Deployment reality that changes the architecture:** the app server is the SaaS operator's own shared central server, not a machine the clinic controls. So a plain OS-level UNC path (`\\host\share\...` opened via Node's `fs`) would depend on Windows itself having a remembered credential for that remote host — but Windows only remembers **one credential per remote address per machine at a time**. Two different clinics whose share addresses happen to collide (very common with default-router ranges like `192.168.1.x`) would fight over the same OS-level session — a real cross-tenant risk, not a theoretical one. Confirmed with the user 2026-07-23: fix by moving auth into the app layer instead of relying on the OS.

**New driver: `SmbShareDriver`** (alongside `LocalDiskDriver`, both implement `StorageDriver`):
- Connects using an SMB2 client library at the Node/application layer (not native `fs`, not OS `net use`) — each tenant's connection is authenticated with *that tenant's own stored credentials*, independent of any other tenant's session. This removes the single-shared-OS-session collision entirely, and as a side benefit removes the Windows-only constraint (a pure-JS SMB2 client works regardless of the host OS the Node process runs on).
- Exact npm package to be selected by `@dev-agent` at implementation time (must be an actively maintained SMB2 client) — a build detail, not a design decision.
- `save`/`read`/`delete`/`exists` on `SmbShareDriver` open a connection using the tenant's stored `{host, share, username, password}`, perform the operation, and close it. No persistent pooled connection is kept open between requests (simplicity over performance; revisit only if connection-open latency is measured to matter).

- `getStorageDriver()` → `getStorageDriver(tenantId: number)` (BA R: tenantId is `Int`, not string). **Async** — does a DB lookup, and for `provider = custom_path` decrypts the stored credential. Returns `new SmbShareDriver({...})` for `custom_path`, else today's default `LocalDiskDriver(ATTACHMENT_DIR)`.
- Call sites to update: `pet.service.ts` (2 call sites), `emr-attachment.service.ts` (3 call sites) — all `await` it. **Resolve the driver once per service operation** and reuse the same instance across multi-step operations (e.g. delete-old-then-save-new in photo replace) — never re-resolve mid-operation.
- Production safety: extend ADR-0022's G1 boot guard — filesystem-class local storage still requires `ALLOW_LOCAL_STORAGE_IN_PROD=true` in production; `custom_path` (SMB, tenant-owned, tenant-credentialed) is **not** gated by G1 — it was never the "unsafe shared local disk" case G1 protects against.

## Address format + credential capture (revised — replaces the earlier "no credential field" answer)

`customBasePath`-style free text is replaced with three separate fields: **host/IP**, **share name + subpath**, **username**, **password**. UI validates format (host must look like an IP or hostname, share must be a valid share-name pattern) before attempting to connect.

- **Connect happens from the Clinic Settings UI itself, at save time** — same "test-write" idea as before, but now it's a real authenticated SMB connect-and-write-test using the credentials just entered, not a bare filesystem write.
- On success: the credential is encrypted (reusing the existing `SETTINGS_ENCRYPTION_KEY` AES-256-GCM key already used elsewhere in Anemal — see `config/env.ts`) and stored per-tenant. Never returned in plaintext by `GET /clinic/storage-config` (password field omitted from read responses entirely; a "configured" boolean is enough for the UI to show "connected" vs. "not set").
- On failure: the specific error surfaces under the address field — distinguish (a) format-invalid address, (b) host unreachable, (c) share not found, (d) credential rejected — the SMB2 client library distinguishes these natively; surface them rather than a single generic "failed."
- **Accepted residual risk:** nothing stops an admin from pointing the address at a share hosted on the app server's own machine if such a share happens to exist and grants that tenant's supplied credential access. Narrower than the earlier raw-local-path concern (still requires a real SMB share + valid credential) and judged acceptable without extra server-IP detection.

## Data model

New table `TenantStorageConfig` (clinic-plane, one row per tenant, FK `tenantId` → `tenants`, `onDelete: Cascade` like `TenantSettings`):

| column | type | notes |
|---|---|---|
| `tenantId` | FK, PK | one config row per tenant |
| `provider` | enum: `local`, `custom_path` (future: `google_drive`, `onedrive`) | default `local` |
| `smbHost` | text, nullable | IP or hostname; required when `provider = custom_path` |
| `smbShare` | text, nullable | share name + subpath; required when `provider = custom_path` |
| `smbUsername` | text, nullable | required when `provider = custom_path` |
| `smbPasswordEncrypted` | text, nullable | AES-256-GCM via `SETTINGS_ENCRYPTION_KEY` (existing key, reused — not a new secret to manage) |
| `updatedAt` | timestamp | |

Not reusing `TenantProvisioning.s3Bucket/s3Prefix/s3Region` (orphaned S3 columns, platform-plane, wrong shape) per handoff §4.3. Dedicated table (vs. adding columns to `TenantSettings`) is justified specifically because sub-projects 2/3 (Google Drive/OneDrive) will need encrypted OAuth-token columns here next — kept out of `TenantSettings` to avoid bloating it.

Zero-config tenants (no row) resolve to today's default `LocalDiskDriver(ATTACHMENT_DIR)` — no backfill needed, no change to tenant provisioning.

## API / permission

- Write: `clinic.integrations.edit` (not `clinic.profile.edit` — a server-filesystem/infrastructure pointer is the same risk class as LINE/SMS/Lab-key config, not clinic identity data like name/logo/address; also where Google Drive/OneDrive OAuth connect will live next, avoiding a mid-branch permission change).
- Read: `clinic.profile.view` (existing pattern — integration-adjacent fields are already readable via `GET /clinic` under profile.view).
- New endpoints: `GET /clinic/storage-config` (never returns the password; returns a `configured: boolean` instead), `PUT /clinic/storage-config` (body: `{provider, smbHost?, smbShare?, smbUsername?, smbPassword?}`).
- `PUT` validates in order: (1) format check on host/share, (2) real authenticated connect-and-test-write via `SmbShareDriver` using the submitted credentials. Either failure → 400 with a plain-language, failure-specific reason (bad format / host unreachable / share not found / credential rejected), nothing persisted.
- Every accepted `PUT` writes a `settings_audit_log` entry (`tableName: 'tenant_storage_config'`, old/new provider + path, `changedBy`) — same pattern as every other clinic-config write (`PUT /clinic`, VAT, integrations). This was the single most security-sensitive clinic setting shipped without an audit trail before this fix.

## UI

- Clinic Settings gets a new "Storage" section: radio `provider` (Local (default) / Network share), and when Network share is selected: host/IP, share name, username, password fields. Save button attempts the authenticated connect-and-test-write and shows the result inline (success, or the specific failure reason under the relevant field). Password is never re-displayed after saving — a "connected" indicator replaces the field until the admin chooses to change it.
- **Switch-time confirmation (closes BA R-2):** if changing `provider`/`customBasePath` would change the *effective storage base* (e.g. `local → custom_path`, or one custom path to another), the Save action first shows an explicit confirmation: "Files already uploaded will stay at `<old base>` and won't be visible at the new location until moved there manually." Admin must acknowledge before the change is saved. No automatic migration in this sub-project (tooling stays deferred per the parent decision) — but the *choice is made knowingly*, not silently.

## Error handling

- Format/connect-test failure at save time → 400, specific reason (bad format / host unreachable / share not found / credential rejected), nothing persisted.
- **Atomic writes (grill finding, both drivers):** `save()` writes to a temp name in the same directory/share, then renames over the final key, so a connection drop mid-write never destroys the previous good file (critical for pet-photo overwrite-in-place). Applies to `LocalDiskDriver` too — small change, benefits both.
- **Outage vs. missing-file distinction (grill finding):** today `exists()` swallows every error as `false`, so a temporarily unreachable share reads identically to "file was deleted." Fix: only a true not-found result means "missing" (404, existing copy: "file is missing"); any other error (unreachable, timeout, auth) surfaces as a distinct retryable message: **"เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"** ("can't reach storage right now, try again") — this must not read the same as data loss.
- Stranded files after a provider switch (existing rows pointing at the old base) still surface as the "file is missing" 404 — expected given the informed switch-time warning, not the same case as a live outage above.
- Delete-after-DB-commit failures (e.g. removing an attachment's file after its row is already deleted) are best-effort: logged, not surfaced as a user-facing error — the DB row is the source of truth; an orphaned file on the clinic's own share is a logged nuisance, not a failed operation.

## Performance (accepted, documented)

Network-share reads/writes are slower than local disk (round-trip over the network). Accepted as-is for this sub-project — no caching layer added. Revisit only if it's measured to actually matter for a real clinic.

## Data custody note

Once a clinic points storage at their own network share, backing it up becomes their responsibility, not the operator's — add one line to the switch-time confirmation making this explicit. Tenant deprovisioning never touches a custom share's files (leave-in-place is intentional — the clinic keeps its own data).

- `getStorageDriver(tenantId)` unit tests: default when no config row, resolves `custom_path` → `SmbShareDriver` correctly, async call sites awaited correctly, credential decrypted correctly.
- `SmbShareDriver` unit tests (against a mocked/fake SMB server or the library's own test doubles): save/read/delete/exists happy path; connection failure surfaces the specific reason (unreachable / share-not-found / auth-rejected) distinctly.
- Controller tests for `PUT /clinic/storage-config`: happy path, format-rejection (bad host/share), connect-test failure (each of the 3 failure kinds), permission-denied (non-`clinic.integrations.edit` role), audit-log row written on accepted change, password never present in any `GET` response.
- Switch-time confirmation: test that changing the effective base without acknowledgement is rejected/blocked at the API or requires an explicit confirm flag; test that acknowledging proceeds and old files 404 as expected (no auto-migration).
- No changes to existing local-disk driver tests — default behavior is unchanged when no tenant config exists.

## Deployment topology note

Because `SmbShareDriver` authenticates at the application layer (not via the OS), it does not require the app server to be Windows, nor a single instance sharing one OS credential store — each request carries its own tenant credential. This was a real constraint of the earlier (rejected) native-UNC approach; the app-layer SMB client removes it as a side effect.

## Explicitly out of scope for this doc

- Google Drive / OneDrive drivers, OAuth, token storage (next tasks, same branch).
- Migrating existing files when switching providers (next tasks — decision 2 applies once more than one real provider exists to switch between).
