# Grill Findings — Unified Local-Disk Storage Driver (Step 3.5)

**Date:** 2026-07-22
**Gate:** MANDATORY grill-with-docs, run after @ba-agent sign-off, before /write-plan.
**Design:** docs/superpowers/specs/2026-07-22-emr-attachment-local-storage-design.md
**Outcome:** All findings RESOLVED. Cleared for /write-plan. ADR: docs/adr/0022-unified-local-disk-storage-driver.md

## Resolved findings (interview)

### G1 — Enforce testing-only boundary with a startup guard (RESOLVED → build it)
**Risk:** "Local disk is testing-only, cloud before prod" was doc/memory-only — passive. Nothing stops deploying the local driver to production, where files vanish on every redeploy and all tenants' files sit on the operator's server (the opposite of the intended per-tenant privacy).
**Decision:** Add a boot guard (reusing the `config/env.ts` throw-on-boot pattern): if `NODE_ENV === 'production'` AND active storage driver is `local`, **refuse to start** unless `ALLOW_LOCAL_STORAGE_IN_PROD=true` is set (explicit escape hatch). ~5 lines. Turns the reminder into an enforced gate.

### G2 — Orphaned pet-photo files on replace (RESOLVED → stable-key overwrite)
**Risk:** UUID-per-upload keys accumulate orphaned files on every photo replace. (Note: the S3 path being replaced ALSO orphaned on replace — never deleted old objects. So this is a net improvement, not a new problem.)
**Decision (user):** "overwrite the old photo in place." Use a **stable per-pet key** `tenants/{tenantId}/photo/pet-{petId}.{ext}` (no random UUID). Re-upload of the same format overwrites the same path → zero orphan, zero delete code. Only when the format changes (e.g. jpg→png → different path) does a **best-effort delete** of the previous `pet.photoUrl` file run (~2 lines). Serve `Content-Type` derived from the key extension.
**Contrast with EMR:** EMR attachments keep the UUID key (multiple distinct attachments per record — no overwrite semantics) and delete the file on explicit attachment delete (already in design).

### G3 — Partial failure on create-then-upload (RESOLVED → no rollback)
**Risk:** Pet-photo key needs `petId`, so new-pet flow must create the pet first, then upload the photo. If the pet is created but the photo upload fails, the pet exists without a photo.
**Decision (user):** No rollback. The pet is created; show an inline error ("photo upload failed, edit later"); close the modal. Photo is optional/nullable — a photoless pet is a valid state, not an error. User re-adds the photo via Edit.

## Non-blocking items — defaulted and recorded (no interview needed)

- **Pet-photo size cap / formats:** 5 MB, `image/jpeg|png|webp` (matches the retired `presignSchema` content-type set). NOTE: the old S3 presign enforced NO server-side size cap (browser PUT was unbounded) — the new multipart route TIGHTENS this by enforcing 5 MB server-side. Improvement.
- **Grid N-fetch performance:** the pet grid renders many photos, each an authenticated blob fetch. Acceptable for testing. Mitigation: set an HTTP cache header (e.g. `Cache-Control: private, max-age=...`) on the photo-serve response so the browser caches per session. `<AuthedPetImage>` revokes object URLs on unmount.
- **Large-file memory:** multer memory storage + full-buffer `driver.read` holds whole files in memory (up to 25 MB EMR PDF). Acceptable for testing; streaming (`read` returning a Readable) is the documented future optimization — do not build now (YAGNI).
- **Content-Type on serve:** EMR uses the stored `mimeType` column; pet photo derives it from the key extension (no new column, avoids a migration).

## Carried from BA sign-off (already folded into design, re-affirmed here)
- **photoUrl is server-managed** — removed from `createPetSchema`/`updatePetSchema` + modals; `tenants/{tenantId}/photo/` serve-time prefix guard. Closes the cross-tenant/cross-module arbitrary-file-read hole.
- **Display-audit list:** switch `{ClinicPets grid + ClinicEMR avatar}`; do NOT touch ClinicBilling/Appointments/Inpatient; exempt modal object-URL previews.
- **`sanitizeFilename` relocated** to a shared util before deleting `upload.service.ts`; applied in both key-builders.
- **photoUrl data integrity:** 5 pets, 0 non-null photoUrl in this env — no migration; ADR records a pre-deploy count check for future pilots.
