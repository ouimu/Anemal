# Design — EMR Attachment Local-Disk Storage Driver

**Date:** 2026-07-22
**Status:** Approved (brainstorm) — pending pm → ba → grill → write-plan
**Supersedes upload mechanism from:** ADR-0021 / PR #41 (S3 presign flow), for EMR attachments only
**Related ADR:** to be authored at grill/domain-modeling step

---

## 1. Problem

EMR file-attachment upload (PR #41) was built against S3 using a presign → direct-PUT → confirm flow. S3 was never configured (`AWS_*` env vars blank), so `isStorageConfigured()` returns false and every presign call returns **503 STORAGE_NOT_CONFIGURED**. Result: clicking Upload in `ClinicEMR.tsx` fails with "Request failed with status code 503" and no file is stored.

The user does not want to provision AWS to test. They want upload to work now with zero external setup, and — before production — each clinic tenant to store attachments in **their own cloud** (BYO Google Drive) for customer-data privacy.

## 2. Decision

Ship a **pluggable storage-driver abstraction** with a **local-disk driver** now (testing), designed so the eventual **BYO-cloud driver** reuses the entire abstraction, both backend routes, and the entire frontend — the only local-only code is the ~40-line `LocalDiskDriver` itself.

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

- `storageKey` semantics are UNCHANGED from PR #41: `tenants/{tenantId}/emr/{recordId}/{uuid}-{safeName}`. The `Attachment` DB row (`storageKey`, `mimeType`, `fileSizeBytes`, `fileName`, `fileType`, `uploadedByUserId`) is unchanged — **no migration**.
- The existing S3 helpers in `src/backend/config/storage.ts` (used by the separate pet-photo upload path) are **left untouched** — no collateral risk. The future cloud driver lives beside `LocalDiskDriver` in the new file.

### 4.2 LocalDiskDriver (new, in `storage-driver.ts`)

- Base dir from `ATTACHMENT_DIR` env, default `./attachments` (repo root).
- `save`: `mkdir -p` the key's parent, `fs.writeFile`.
- `read`/`delete`/`exists`: `fs.readFile` / `fs.unlink` / `fs.access`.
- **Path-traversal guard (security-critical):** resolve `path.join(baseDir, key)`, assert the resolved absolute path is still inside the resolved baseDir; reject otherwise. Covers `..` and absolute-path keys. This guard is a trust-boundary check — do NOT simplify it away.
- `attachments/` added to `.gitignore`.

### 4.3 Backend routes (`medical-record.routes.ts` + emr-attachment controller/service)

| Method | Route | Guard | Behavior |
|---|---|---|---|
| POST | `/:id/attachments` | `emr.attach` | **multipart** (multer memory storage). Enforce MIME allow-list + 25 MB cap server-side (reuse PR #41 constants). Verify record belongs to tenant/branch. `driver.save(key, buffer, mime)` then create `Attachment` row. Returns the row. |
| GET | `/:id/attachments/:attachmentId/download` | `emr.view` | Verify tenant/record scope + storageKey-prefix guard (reuse PR #41 guard). `driver.read(key)` → respond with `Content-Type: mimeType`, `Content-Disposition: attachment; filename="fileName"`, body = buffer. |
| DELETE | `/:id/attachments/:attachmentId` | `emr.attach` | Existing billed-record block stays. Additionally `driver.delete(key)` the file, then delete the row. Missing-file on disk must not block row deletion (best-effort unlink, log). |

- **Retire** `POST /:id/attachments/presign`, `emrPresignSchema`, `handlePresignAttachment`.
- MIME allow-list unchanged: PDF, JPEG, PNG, DOCX (+ existing PR #41 set).

### 4.4 Frontend (`useEmrAttachmentUpload.ts` + `ClinicEMR.tsx`)

- **Upload:** collapse presign→PUT→confirm (3 calls) into one `api.post('/api/medical-records/:id/attachments', formData)` with `Content-Type: multipart/form-data`. Field name `file`.
- **Download:** replace `window.open(downloadUrl)` with `api.get(url, { responseType: 'blob' })` → `URL.createObjectURL(blob)` → trigger download / open in new tab, then `URL.revokeObjectURL`. Necessary because auth is a Bearer header injected by the axios interceptor (`api.ts`), which a bare `window.open` navigation would not carry.
- The "save the record before attaching" UI guard added earlier (unsaved new record → `selectedRecordId` null) stays.

### 4.5 Dependency

Add `multer` + `@types/multer` (dev). One production dep — the standard Express multipart parser; no stdlib equivalent. Ponytail-acceptable.

## 5. Reuse analysis (survives the cloud swap)

| Component | Fate when cloud driver lands |
|---|---|
| `StorageDriver` interface + `getStorageDriver()` factory | **Reused** — cloud driver implements same interface; factory later switches on tenant provider |
| POST upload / GET download / DELETE routes + controller/service | **Reused verbatim** — provider-agnostic, call `driver.*` only |
| Entire frontend (single multipart upload, blob download) | **Reused verbatim** — cloud also uploads-through-backend (OAuth APIs can't do browser-direct-PUT); backend-proxied download is the correct privacy model (fetch with clinic's token, never expose raw cloud URL) |
| `LocalDiskDriver` + `ATTACHMENT_DIR` | **Only local-only code** (~40 lines), correctly isolated |

Download is intentionally streaming/proxy (no signed-URL return) because that is the permanent cloud-privacy target, not a local stopgap. No signed-URL branch is built now (YAGNI); add `getDownloadUrl()` to the interface only if a future driver needs offload.

## 6. Error handling

- Upload: oversize → 413/400 with message; disallowed MIME → 400; record not found / wrong tenant → 404 (existence-leak precedent, ADR-0014); disk write failure → 500, no orphan DB row (write file first, then row; if row insert fails, best-effort unlink).
- Download: file missing on disk but row exists → 404 with clear message (data drift), logged.
- Delete: billed-record → existing 4xx; file-missing → still delete row (best-effort), log.
- Path-traversal reject → 400, logged as a security event.

## 7. Testing

- `emr-attachments.test.ts`: DROP presign + 503 cases. ADD: multipart upload happy path (file lands on disk + row created), MIME rejection, oversize rejection, streaming download returns bytes + correct headers, cross-tenant/cross-record scope 404, **path-traversal key rejection**, delete removes file + row, delete tolerates already-missing file.
- `useEmrAttachmentUpload.test.ts`: update for single-call multipart upload + blob download.
- Tenant-isolation + RBAC (`emr.attach`/`emr.view`) assertions per qa-protocols.
- Local driver unit test: save→read round-trip, traversal guard rejects `../` and absolute keys.

## 8. Out of scope (this pass)

- Pet-photo upload path (still S3 presign in `config/storage.ts`) — untouched.
- Cloud driver, OAuth, admin config UI — deferred (§2).
- Per-tenant provider selection / `TenantProvisioning` S3 columns — untouched.

## 9. Pre-production gate (MUST NOT ship to prod without)

Before go-live, build the BYO-cloud driver + admin connect-UI. Local disk puts every tenant's files on the operator's server — the opposite of the per-tenant privacy story. Recorded in cross-session operator memory (`emr-storage-local-then-cloud`).
