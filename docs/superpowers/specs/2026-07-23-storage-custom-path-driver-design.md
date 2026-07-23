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

## Architecture

`LocalDiskDriver` already takes an arbitrary `baseDir` — a mapped drive/UNC path is just another `baseDir`. No new driver class.

- `getStorageDriver()` → `getStorageDriver(tenantId: number)` (BA R: tenantId is `Int` in Prisma, not string). **Async** — does a DB lookup. Returns `new LocalDiskDriver(customBasePath)` if the tenant has `provider = custom_path` configured, else today's default (`process.env.ATTACHMENT_DIR`).
- Call sites to update: `pet.service.ts` (2 call sites), `emr-attachment.service.ts` (3 call sites) — all `await` it. **Resolve the driver once per service operation** and reuse the same instance across multi-step operations (e.g. delete-old-then-save-new in photo replace) — never re-resolve mid-operation.
- Production safety: extend ADR-0022's G1 boot guard — `custom_path` is a filesystem-class provider like local disk, so enabling it in `NODE_ENV=production` is refused unless `ALLOW_LOCAL_STORAGE_IN_PROD=true`, same as the existing local-disk gate.

## Path format restriction (replaces an operator allowlist — decided with user 2026-07-23)

Rather than an ops-maintained `STORAGE_ALLOWED_ROOTS` config, `customBasePath` is restricted **by format**: it must be a UNC network-share path (`\\<host-or-ip>\<share>\...`). Bare local paths/drive letters (`C:\...`, `D:\...`, relative paths) are rejected outright before the test-write even runs. Rationale (from the user, in plain terms): the clinic must already have a share address prepared and reachable — if they mistype it, it simply won't connect. This closes off "point at the app server's own local folder" as an attack path without needing an operator-side allowlist.

- Validation order: (1) format check — must match `^\\\\[^\\]+\\[^\\]+` and be absolute — reject with a clear format-error message if not; (2) test-write — attempt a real write+delete of a small marker file at the resolved path; reject with the specific I/O reason if that fails.
- UI must show the required format up front (placeholder/hint text: `\\192.168.1.10\VetFiles\...` or `\\nas-server\VetFiles\...`), not just as an error after the fact.
- **Accepted residual risk (documented, not solved by more code):** nothing stops an admin from pointing the UNC path at a share hosted on the app server's own machine (e.g. `\\<server-ip>\some-share`) if such a share happens to exist and be writable by the service account. This is a narrower and much less likely misconfiguration than a raw local path, and is judged acceptable without adding server-IP/hostname detection — revisit only if it's ever actually hit.

## Data model

New table `TenantStorageConfig` (clinic-plane, one row per tenant, FK `tenantId` → `tenants`, `onDelete: Cascade` like `TenantSettings`):

| column | type | notes |
|---|---|---|
| `tenantId` | FK, PK | one config row per tenant |
| `provider` | enum: `local`, `custom_path` (future: `google_drive`, `onedrive`) | default `local` |
| `customBasePath` | text, nullable | required when `provider = custom_path`; must be an absolute UNC path (see format restriction above) |
| `updatedAt` | timestamp | |

Not reusing `TenantProvisioning.s3Bucket/s3Prefix/s3Region` (orphaned S3 columns, platform-plane, wrong shape) per handoff §4.3. Dedicated table (vs. adding columns to `TenantSettings`) is justified specifically because sub-projects 2/3 (Google Drive/OneDrive) will need encrypted OAuth-token columns here next — kept out of `TenantSettings` to avoid bloating it.

Zero-config tenants (no row) resolve to today's default `LocalDiskDriver(ATTACHMENT_DIR)` — no backfill needed, no change to tenant provisioning.

## API / permission

- Write: `clinic.integrations.edit` (not `clinic.profile.edit` — a server-filesystem/infrastructure pointer is the same risk class as LINE/SMS/Lab-key config, not clinic identity data like name/logo/address; also where Google Drive/OneDrive OAuth connect will live next, avoiding a mid-branch permission change).
- Read: `clinic.profile.view` (existing pattern — integration-adjacent fields are already readable via `GET /clinic` under profile.view).
- New endpoints: `GET /clinic/storage-config`, `PUT /clinic/storage-config` (body: `{provider, customBasePath?}`).
- `PUT` validates in order: (1) format check on `customBasePath` (see above), (2) real test-write (write + delete a small marker file at the resolved path). Either failure → 400 with a plain-language reason, nothing persisted.
- Every accepted `PUT` writes a `settings_audit_log` entry (`tableName: 'tenant_storage_config'`, old/new provider + path, `changedBy`) — same pattern as every other clinic-config write (`PUT /clinic`, VAT, integrations). This was the single most security-sensitive clinic setting shipped without an audit trail before this fix.

## UI

- Clinic Settings gets a new "Storage" section: radio `provider` (Local (default) / Custom network path), text input for path when Custom is selected — with format hint shown up front (`\\192.168.1.10\VetFiles\...`), Save button. Save shows the format-check or test-write result inline (success or the specific failure reason).
- **Switch-time confirmation (closes BA R-2):** if changing `provider`/`customBasePath` would change the *effective storage base* (e.g. `local → custom_path`, or one custom path to another), the Save action first shows an explicit confirmation: "Files already uploaded will stay at `<old base>` and won't be visible at the new location until moved there manually." Admin must acknowledge before the change is saved. No automatic migration in this sub-project (tooling stays deferred per the parent decision) — but the *choice is made knowingly*, not silently.

## Error handling

- Format/test-write failure at save time → 400, specific reason, nothing persisted (existing behavior stands).
- Runtime failure at actual upload time (drive unmounted after being fine at save time) → existing upload error path surfaces to the user as a retryable error; no fallback to local, no silent write elsewhere (decision 3).
- Stranded files after a switch (existing rows pointing at the old base) surface as the existing "file is missing" 404 on read — expected given the informed switch-time warning above, not a new error class.

## Testing

- `getStorageDriver(tenantId)` unit tests: default when no config row, resolves `custom_path` correctly, async call sites awaited correctly.
- Controller tests for `PUT /clinic/storage-config`: happy path, format-rejection (non-UNC path), test-write failure (unreachable UNC path), permission-denied (non-`clinic.integrations.edit` role), production-guard rejection (`custom_path` blocked when `NODE_ENV=production` and `ALLOW_LOCAL_STORAGE_IN_PROD` unset), audit-log row written on accepted change.
- Switch-time confirmation: test that changing the effective base without acknowledgement is rejected/blocked at the API or requires an explicit confirm flag; test that acknowledging proceeds and old files 404 as expected (no auto-migration).
- No changes to existing local-disk driver tests — default behavior is unchanged when no tenant config exists.

## Explicitly out of scope for this doc

- Google Drive / OneDrive drivers, OAuth, token storage (next tasks, same branch).
- Migrating existing files when switching providers (next tasks — decision 2 applies once more than one real provider exists to switch between).
