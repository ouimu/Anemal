# ADR-0022: Unified Local-Disk Storage Driver (EMR attachments + pet photos)

**Date:** 2026-07-22
**Status:** Accepted
**Supersedes storage mechanism from:** ADR-0021 (EMR S3 presign) and the pet-photo S3 presign path (`upload.service.ts`).
**Design:** `docs/superpowers/specs/2026-07-22-emr-attachment-local-storage-design.md`
**Task breakdown:** `...-tasks.md` · **BA sign-off:** `...-ba-signoff.md` · **Grill:** `...-grill.md`

## Context

EMR file attachments (ADR-0021, PR #41) and pet photos both used S3 via a
presign → direct-PUT → confirm flow. S3 was never configured in this
environment (`AWS_*` env blank), so `isStorageConfigured()` returns false and
every upload returns **503 STORAGE_NOT_CONFIGURED**. The operator wants uploads
to work with zero external setup for testing, and — before production — each
clinic tenant to store files in **their own cloud** (BYO Google Drive) for
customer-data privacy.

## Decision

Introduce a pluggable `StorageDriver` abstraction (`save`/`read`/`delete`/`exists`)
with a **local-disk driver** for testing, used by **both** upload paths (EMR
attachments + pet photos). Files are **private** (no public URL) and served
through authenticated backend-streaming routes — which is also the correct
end-state for the deferred BYO-cloud driver, so the interface, all serving
routes, and the entire frontend are reused; only `LocalDiskDriver` is
local-only. The S3 presign stacks are removed.

**Deferred to pre-production (NOT built now):** BYO Google Drive per-tenant
driver (OAuth2, encrypted tokens), the Platform/Clinic Admin connect-UI, and
the per-tenant `storageProvider` selector. Local disk is **testing-only**.

## Grill findings & resolutions

**G1 — Enforce the testing-only boundary (not just docs).**
Local disk in production loses files on every redeploy and pools all tenants'
files on the operator's server. Resolution: **boot guard** — if
`NODE_ENV === 'production'` and the active driver is `local`, refuse to start
unless `ALLOW_LOCAL_STORAGE_IN_PROD=true`. Reuses the `config/env.ts`
throw-on-boot pattern (~5 lines). Converts the "cloud before prod" reminder
into an enforced gate.

**G2 — Orphaned pet-photo files on replace → stable-key overwrite.**
Decision: pet photos use a **stable per-pet key** `tenants/{tenantId}/photo/pet-{petId}.{ext}`
(no UUID). Same-format re-upload overwrites in place (zero orphan, zero delete
code); a format change triggers a best-effort delete of the prior file.
`Content-Type` on serve is derived from the key extension. (The retired S3 path
never deleted old objects either — this is a net improvement.) EMR attachments
keep the UUID key + explicit delete-on-remove (multiple attachments per record,
no overwrite semantics).

**G3 — Partial failure on create-then-upload → no rollback.**
The pet-photo key needs `petId`, so new pets are created first, then the photo
is uploaded. If the upload fails, the pet remains (photo is optional/nullable);
the UI shows an inline error and the user retries via Edit. No pet rollback.

## Security (from BA sign-off, folded into the design)

- **`photoUrl` is server-managed only** — removed from `createPetSchema`/`updatePetSchema`
  and the AddPet/EditPet modal payloads; the sole writer is `POST /pets/:id/photo`.
  A `tenants/{tenantId}/photo/` serve-time prefix guard is added. This closes a
  cross-tenant / cross-module arbitrary-file-read hole: a client-writable
  `photoUrl` fed to `driver.read` let an in-tenant `crm.edit` holder read another
  tenant's files or EMR attachments (bypassing `emr.view`). The path-traversal
  guard does not stop a well-formed in-baseDir key — the prefix guard does
  (mirrors EMR's `assertStorageKeyPrefix`).
- **`sanitizeFilename`** (filename-safety control) is relocated to a shared util
  before `upload.service.ts` is deleted, and applied in both key-builders.
- **Data integrity:** 5 pets, 0 non-null `photoUrl` in this env → no migration.
  Any future pilot with real `http(s)` `photoUrl` values requires a pre-deploy
  count/backfill check.

## RBAC & isolation

- EMR: `POST/DELETE` gated `emr.attach`, `GET download` gated `emr.view`; tenant/
  record scope + storageKey-prefix guard retained from PR #41.
- Pet photo: `POST` gated `crm.edit`, `GET` gated `crm.view`; pet→tenant scope +
  `photo/` prefix guard.
- Path-traversal guard in `LocalDiskDriver` is a trust-boundary control (rejects
  `..`/absolute keys) — do not simplify away.

## Non-blocking (defaulted)

- Pet photo: 5 MB cap, `image/jpeg|png|webp` (server-side cap now enforced;
  the old presign had none).
- Grid photos: authed blob fetch per image; `Cache-Control: private` on serve +
  object-URL revoke on unmount. Full-buffer read/write in memory acceptable for
  testing; streaming is the documented future optimization (YAGNI now).

## Consequences

- Uploads work with zero external setup; one storage seam for all file types.
- The only code discarded when the cloud driver lands is `LocalDiskDriver`.
- **Pre-production gate:** the BYO-cloud driver + admin connect-UI MUST ship
  before go-live. Recorded in operator cross-session memory
  (`emr-storage-local-then-cloud`) and enforced at boot by G1.

## Glossary

- **StorageDriver** — interface (`save`/`read`/`delete`/`exists`) abstracting the
  physical storage backend from routes/services. Implementations: `LocalDiskDriver`
  (now), future `CloudDriver` (BYO Google Drive, deferred).
- **storageKey** — tenant-scoped logical path identifying a stored file
  (`tenants/{tenantId}/emr/{recordId}/{uuid}-{name}` for EMR;
  `tenants/{tenantId}/photo/pet-{petId}.{ext}` for pet photos). Stored in
  `Attachment.storageKey` / `Pet.photoUrl`; never a public URL.
- **Private serving** — files are streamed through an authenticated, permission-
  gated backend route; no publicly reachable file URL is ever issued. The correct
  model for both local disk and the future per-tenant cloud.
- **AuthedPetImage** — frontend component that fetches a private pet photo as a blob
  (carrying the Bearer header) and renders it via an object URL, because `<img src>`
  cannot send auth headers.
