# Design — Unified Local-Disk Storage Driver (EMR Attachments + Pet Photos)

**Date:** 2026-07-22
**Status:** Approved (brainstorm, scope expanded to all uploads — Option A) — pending pm → ba → grill → write-plan
**Supersedes upload mechanism from:** ADR-0021 / PR #41 (EMR S3 presign) AND the pet-photo S3 presign path (`upload.service.ts`)
**Related ADR:** to be authored at grill/domain-modeling step

**Scope note:** Covers ALL real file-to-storage uploads in the codebase — there are exactly two: EMR attachments and pet photos. Both move onto one shared `StorageDriver`. Clinic logo is NOT a storage upload (base64 data-URI inlined in `logoUrl`, ≤500 KB) and is untouched.

---

## 1. Problem

EMR file-attachment upload (PR #41) was built against S3 using a presign → direct-PUT → confirm flow. S3 was never configured (`AWS_*` env vars blank), so `isStorageConfigured()` returns false and every presign call returns **503 STORAGE_NOT_CONFIGURED**. Result: clicking Upload in `ClinicEMR.tsx` fails with "Request failed with status code 503" and no file is stored.

The user does not want to provision AWS to test. They want upload to work now with zero external setup, and — before production — each clinic tenant to store attachments in **their own cloud** (BYO Google Drive) for customer-data privacy.

## 2. Decision

Ship a **pluggable storage-driver abstraction** with a **local-disk driver** now (testing), used by **both** upload categories (EMR attachments + pet photos), designed so the eventual **BYO-cloud driver** reuses the entire abstraction, all backend serving routes, and the entire frontend — the only local-only code is the ~40-line `LocalDiskDriver` itself.

Files are stored under a single base dir with a category subfolder in the key (`attachments/tenants/{id}/emr/...`, `attachments/tenants/{id}/photo/...`). All stored files are **private** (no public URL) and served through authenticated backend routes — which is also the correct end-state for the cloud-privacy model.

**Explicitly deferred to pre-production (documented, NOT built this pass):**
- BYO Google Drive per-tenant driver (OAuth2 per tenant, encrypted refresh-token storage)
- Platform/Clinic Admin UI to connect the Drive (this UI ships *with* the cloud driver, because that is the driver with configurable fields — local disk has none)
- Per-tenant `storageProvider` selector

Local disk is **testing-only**. A pre-prod reminder is recorded in the operator's cross-session memory and MUST be surfaced before go-live. (See §9.)

## 3. Why local disk needs no admin UI

Local disk has no credentials, no bucket, no OAuth — nothing per-tenant to configure. Its only setting is the base directory, which is an operator/infra concern (must be a persistent, backed-up volume) and a security foot-gun if user-editable (path traversal / arbitrary server write). The `.env` pain the user wanted to escape was the S3 *credentials*; local disk has none, so it "just works" with a default dir. The config UI is genuinely needed only by the cloud driver and ships with it.

## 4. Architecture

### 4.1 Storage-driver interface (new file `src/backend/config/storage-driver.ts`)

```ts
export interface StorageDriver {
  save(key: string, body: Buffer, contentType: string): Promise<void>
  read(key: string): Promise<Buffer>          // full-buffer read; streaming optimization deferred
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

export function getStorageDriver(): StorageDriver   // now: always LocalDiskDriver
```

- `storageKey` for EMR is UNCHANGED from PR #41: `tenants/{tenantId}/emr/{recordId}/{uuid}-{safeName}`. Pet-photo key becomes `tenants/{tenantId}/photo/{uuid}-{safeName}` (was `pets/`; renamed to the user-requested `photo` category segment).
- The EMR `Attachment` DB row is unchanged — **no migration** there.
- `config/storage.ts` (S3 helpers) is currently imported by BOTH the pet-photo presign path AND `emr-attachment.service.ts` (the `isStorageConfigured` 503 guard). This feature retires all S3 usage, so `config/storage.ts`, `services/upload.service.ts`, `controllers/upload.controller.ts`, `routes/upload.routes.ts` and `POST /api/upload/presign` are **removed** — but only AFTER the EMR service is rewritten off them and `sanitizeFilename` is relocated (see §4.3b). Removing them is deletion, not throwaway. Confirm `@aws-sdk/*` imports remain only in these deleted/rewritten files before dropping the deps (BA grep-confirmed). The future cloud driver lives beside `LocalDiskDriver` in the new file.

### 4.2 LocalDiskDriver (new, in `storage-driver.ts`)

- Base dir from `ATTACHMENT_DIR` env, default `./attachments` (repo root).
- `save`: `mkdir -p` the key's parent, `fs.writeFile`.
- `read`/`delete`/`exists`: `fs.readFile` / `fs.unlink` / `fs.access`.
- **Path-traversal guard (security-critical):** resolve `path.join(baseDir, key)`, assert the resolved absolute path is still inside the resolved baseDir; reject otherwise. Covers `..` and absolute-path keys. This guard is a trust-boundary check — do NOT simplify it away.
- `attachments/` added to `.gitignore`.

### 4.2b Production boot guard (grill G1 — required)

At startup (extend the `config/env.ts` throw-on-boot pattern), if `NODE_ENV === 'production'` AND the active storage driver is `local`, **throw and refuse to start**, unless `ALLOW_LOCAL_STORAGE_IN_PROD=true` is set (explicit escape hatch). ~5 lines. Enforces the testing-only boundary so the local driver cannot silently reach production (where files vanish on redeploy and all tenants pool on the operator's disk).

### 4.3 Backend routes (`medical-record.routes.ts` + emr-attachment controller/service)

| Method | Route | Guard | Behavior |
|---|---|---|---|
| POST | `/:id/attachments` | `emr.attach` | **multipart** (multer memory storage). Enforce MIME allow-list + 25 MB cap server-side (reuse PR #41 constants). Verify record belongs to tenant/branch. `driver.save(key, buffer, mime)` then create `Attachment` row. Returns the row. |
| GET | `/:id/attachments/:attachmentId/download` | `emr.view` | Verify tenant/record scope + storageKey-prefix guard (reuse PR #41 guard). `driver.read(key)` → respond with `Content-Type: mimeType`, `Content-Disposition: attachment; filename="fileName"`, body = buffer. |
| DELETE | `/:id/attachments/:attachmentId` | `emr.attach` | Existing billed-record block stays. Additionally `driver.delete(key)` the file, then delete the row. Missing-file on disk must not block row deletion (best-effort unlink, log). |

- **Retire** `POST /:id/attachments/presign`, `emrPresignSchema`, `handlePresignAttachment`.
- MIME allow-list unchanged: PDF, JPEG, PNG, DOCX (+ existing PR #41 set).

### 4.3b Pet-photo routes (`pet.routes.ts` + pet controller/service)

Pet photos move onto the same driver. Because they render inline in `<img>` (not a click-to-download), serving differs slightly but reuses `driver.read`.

| Method | Route | Guard | Behavior |
|---|---|---|---|
| POST | `/api/pets/:id/photo` | `crm.edit` | **multipart** (multer). Image MIME allow-list (jpeg/png/webp) + 5 MB cap. Verify pet belongs to tenant. **Stable key (grill G2):** `tenants/{tid}/photo/pet-{petId}.{ext}` — overwrites in place (no UUID, no orphan on same-format replace). If the prior `pet.photoUrl` key differs (format changed), best-effort `driver.delete` the old file. `driver.save(...)`, store the **server-built storageKey** in `pet.photoUrl`. Returns updated pet. |
| GET | `/api/pets/:id/photo` | `crm.view` | Verify pet→tenant scope. **Prefix guard:** assert `pet.photoUrl` starts with `tenants/{tenantId}/photo/` before `driver.read` — reject otherwise (defense-in-depth even though the field is now server-managed). Stream with `Content-Type` derived from the key extension, inline disposition, `Cache-Control: private, max-age=...` (grill: reduce grid N-fetch). 404 if pet has no photo / file missing. |

- **SECURITY (BA finding #1 — required):** `photoUrl` MUST be **server-managed only**. Remove `photoUrl` from `createPetSchema` AND `updatePetSchema` (currently `z.string().optional().nullable()`, client-writable) and from the AddPet/EditPet modal payloads. The only way to set it is the `POST /:id/photo` route. Rationale: with `driver.read(pet.photoUrl)`, a client-writable key lets an in-tenant `crm.edit` holder set `photoUrl` to another tenant's key or an EMR-attachment key and read it via `GET /:id/photo` — cross-tenant / cross-module arbitrary file read, bypassing `emr.view`. The path-traversal guard does NOT stop a well-formed in-baseDir key; the `tenants/{tenantId}/photo/` serve-time prefix guard above is the equivalent of EMR's `assertStorageKeyPrefix`.
- `pet.photoUrl` now holds the **storageKey** (private), not a public URL. No DB migration in this env — BA ran a read-only count: **5 pets, 0 non-null `photoUrl`**. ADR must record a pre-deploy count check for any future pilot holding real `http(s)` values.
- Pet-create flow: create the pet first, then POST the photo to `/:id/photo` (needs the pet id for the key/scope). Adjust the AddPet modal submit order (create → upload) accordingly; on upload failure after create, surface an inline error (pet exists without photo — non-fatal).
- **`sanitizeFilename` relocation (BA finding #3 — required):** `sanitizeFilename` currently lives in `upload.service.ts` (slated for deletion) but is imported by `emr-attachment.service.ts`. Move it to a shared util (e.g. `src/backend/utils/`) BEFORE deleting `upload.service.ts`, and apply it in BOTH key-builders (EMR + pet photo). It is a filename-safety control, not incidental.

### 4.4 Frontend

**EMR (`useEmrAttachmentUpload.ts` + `ClinicEMR.tsx`):**
- **Upload:** collapse presign→PUT→confirm (3 calls) into one `api.post('/api/medical-records/:id/attachments', formData)` with `Content-Type: multipart/form-data`. Field name `file`.
- **Download:** replace `window.open(downloadUrl)` with `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL(blob)` → trigger download / open in new tab, then `URL.revokeObjectURL`. Necessary because auth is a Bearer header injected by the axios interceptor (`api.ts`), which a bare `window.open` navigation would not carry.
- The "save the record before attaching" UI guard added earlier (unsaved new record → `selectedRecordId` null) stays.

**Pet photo (`usePhotoUpload.ts` + `ClinicPets.tsx` / AddPet+EditPet modals):**
- **Upload:** `usePhotoUpload` changes from presign→PUT (returns public URL) to a single `api.post('/api/pets/:id/photo', formData)`; returns the updated pet. Requires the pet id (create-then-upload for new pets).
- **Display:** `<img src={publicUrl}>` no longer works (private storage, no public URL, and `<img>` can't send the Bearer header). Add a small **`useAuthedImage(petId)`** hook / `<AuthedPetImage>` component: `api.get('/api/pets/:id/photo', {responseType:'blob'})` → object URL → `<img src=objectURL>`, revoke on unmount. This is the same private-serve pattern the cloud driver will use — not throwaway.
- **Audit photo-display sites (BA finding #2 — corrected by grep, use this exact list):**
  - **Switch to `<AuthedPetImage>`** (render `pet.photoUrl`, which is now a key): `ClinicPets.tsx` (grid ~L779 and ~L528) and `ClinicEMR.tsx` (~L528, pet avatar — was missed by the PM list; would silently break).
  - **Do NOT touch** (no pet photo rendered): `ClinicBilling.tsx` (PromptPay QR only), `ClinicAppointments.tsx` and `ClinicInpatient.tsx` (interface type-decl only, no `<img>`). Removing these from scope avoids needless edits.
  - **Explicitly exempt** (already correct — local object URLs from a just-picked file, NOT storageKeys): the `photoPreview` `<img>` in the AddPet/EditPet modals (`ClinicPets.tsx` ~L271/L398). Do not route these through the authed component.

### 4.5 Dependency

Add `multer` + `@types/multer` (dev). One production dep — the standard Express multipart parser; no stdlib equivalent. Ponytail-acceptable. Removes the two `@aws-sdk/*` deps if nothing else uses them (verify before removing).

## 5. Reuse analysis (survives the cloud swap)

| Component | Fate when cloud driver lands |
|---|---|
| `StorageDriver` interface + `getStorageDriver()` factory | **Reused** — cloud driver implements same interface; factory later switches on tenant provider |
| EMR + pet-photo serving routes + controllers/services | **Reused verbatim** — provider-agnostic, call `driver.*` only |
| Entire frontend (multipart upload, blob download, authed-image hook) | **Reused verbatim** — cloud also uploads-through-backend (OAuth APIs can't do browser-direct-PUT); backend-proxied serving is the correct privacy model (fetch with clinic's token, never expose raw cloud URL) |
| `LocalDiskDriver` + `ATTACHMENT_DIR` | **Only local-only code** (~40 lines), correctly isolated |

Download is intentionally streaming/proxy (no signed-URL return) because that is the permanent cloud-privacy target, not a local stopgap. No signed-URL branch is built now (YAGNI); add `getDownloadUrl()` to the interface only if a future driver needs offload.

## 6. Error handling

- Upload: oversize → 413/400 with message; disallowed MIME → 400; record not found / wrong tenant → 404 (existence-leak precedent, ADR-0014); disk write failure → 500, no orphan DB row (write file first, then row; if row insert fails, best-effort unlink).
- Download: file missing on disk but row exists → 404 with clear message (data drift), logged.
- Delete: billed-record → existing 4xx; file-missing → still delete row (best-effort), log.
- Path-traversal reject → 400, logged as a security event.

## 7. Testing

- `emr-attachments.test.ts`: DROP presign + 503 cases. ADD: multipart upload happy path (file lands on disk + row created), MIME rejection, oversize rejection, streaming download returns bytes + correct headers, cross-tenant/cross-record scope 404, **path-traversal key rejection**, delete removes file + row, delete tolerates already-missing file.
- Pet-photo tests (new/updated): multipart upload stores key + writes file, image MIME/size rejection, `GET /pets/:id/photo` streams bytes with correct headers + `crm.view` gate, cross-tenant pet 404, no-photo 404.
- `useEmrAttachmentUpload.test.ts` + `usePhotoUpload` test: update for single-call multipart flow; add authed-image hook test.
- Tenant-isolation + RBAC assertions per qa-protocols (`emr.attach`/`emr.view`, `crm.edit`/`crm.view`).
- Local driver unit test: save→read round-trip, traversal guard rejects `../` and absolute keys.
- Retire old `upload.test.ts` (presign/503 for the removed generic endpoint).

## 8. Out of scope (this pass)

- Clinic logo (base64 data-URI inline in `logoUrl`) — not a storage upload, untouched.
- Cloud driver, OAuth, admin config UI — deferred (§2).
- Per-tenant provider selection / `TenantProvisioning` S3 columns — untouched.

## 9. Pre-production gate (MUST NOT ship to prod without)

Before go-live, build the BYO-cloud driver + admin connect-UI. Local disk puts every tenant's files on the operator's server — the opposite of the per-tenant privacy story. Recorded in cross-session operator memory (`emr-storage-local-then-cloud`).
