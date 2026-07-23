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

`LocalDiskDriver` already takes an arbitrary `baseDir` — a mapped drive letter or UNC path is just another `baseDir`. No new driver class.

- `getStorageDriver()` → `getStorageDriver(tenantId: string)`. Looks up that tenant's storage config; returns `new LocalDiskDriver(customBasePath)` if configured, else today's default (`process.env.ATTACHMENT_DIR`).
- Call sites to update: `src/backend/services/pet.service.ts`, `src/backend/services/emr-attachment.service.ts` (pass `tenantId` through, already available in both).

## Data model

New table `TenantStorageConfig` (clinic-plane, one row per tenant):

| column | type | notes |
|---|---|---|
| `tenantId` | FK, PK | one config row per tenant |
| `provider` | enum: `local`, `custom_path` (future: `google_drive`, `onedrive`) | default `local` |
| `customBasePath` | text, nullable | required when `provider = custom_path` |
| `updatedAt` | timestamp | |

Not reusing `TenantProvisioning.s3Bucket/s3Prefix/s3Region` (orphaned S3 columns, platform-plane, wrong shape for a filesystem path) per handoff §4.3 note.

## API / permission

- Reuses existing `clinic.profile.edit` (write) / `clinic.profile.view` (read) permissions — no new permission code.
- New endpoints: `GET /clinic/storage-config`, `PUT /clinic/storage-config` (body: `{provider, customBasePath?}`).
- `PUT` performs the test-write (write + delete a small marker file at the target path) before persisting; on failure, returns 400 with a plain-language reason (path not found / access denied / not a directory) and does not save.

## UI

- Clinic Settings gets a new "Storage" section: radio `provider` (Local (default) / Custom path), text input for path when Custom path is selected, Save button. Save shows the test-write result inline (success or the specific failure reason).

## Error handling

- Test-write failure at save time → 400, specific reason, nothing persisted (existing behavior stands).
- Runtime failure at actual upload time (drive unmounted after being fine at save time) → existing upload error path surfaces to the user as a retryable error; no fallback to local, no silent write elsewhere (decision 3).

## Testing

- `getStorageDriver(tenantId)` unit tests: default when no config row, resolves `custom_path` correctly.
- Controller tests for `PUT /clinic/storage-config`: happy path, test-write failure (bad path), permission-denied (non-admin).
- No changes to existing local-disk driver tests — default behavior is unchanged when no tenant config exists.

## Explicitly out of scope for this doc

- Google Drive / OneDrive drivers, OAuth, token storage (next tasks, same branch).
- Migrating existing files when switching providers (next tasks — decision 2 applies once more than one real provider exists to switch between).
