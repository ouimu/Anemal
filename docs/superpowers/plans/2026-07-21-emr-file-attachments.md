# EMR File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the EMR "Attachments" panel from a URL-reference-only stub into a real, permissioned, tenant-isolated file-upload feature. A doctor or vet-tech picks a PDF/image/office-doc file in `ClinicEMR.tsx`, it is presigned → PUT'd directly to the clinic's S3 bucket → confirmed against the medical record with full metadata (mime type, size, uploader, storage key). Download goes through a gated presigned GET (never a public URL); delete is blocked once the parent record is billed and is audit-logged (for free, via the existing global audit middleware).

**Architecture:** A dedicated `emr.attach`-gated presign route (`POST /:id/attachments/presign`) — NOT a reuse of the generic `/api/upload/presign`, which is gated `crm.edit` (doctors don't hold it), lacks PDF/DOCX support, and has no size cap. The existing confirm route (`POST /:id/attachments`) is extended to accept a `storageKey`-based payload alongside the legacy `fileUrl`-only payload via a Zod XOR refine — additive, no breaking change (ADR-0021 F3). A new gated download route (`GET /:id/attachments/:attId/download`) issues a short-TTL presigned GET with `Content-Disposition: attachment`, so the app never discloses a public URL for EMR objects (ADR-0021 F2). A new gated delete route (`DELETE /:id/attachments/:attId`) mirrors the existing billed-record guard pattern from `updateMedicalRecord`. All four operations reuse the existing `emr.attach` / `emr.view` permission codes — **no new permission code is introduced.**

**Tech Stack:** Node/Express/Prisma/Zod (backend), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (already a dependency — no new packages), React/TanStack Query/Tailwind (frontend), Jest + supertest (backend tests), Vitest + Testing Library (frontend tests).

## Global Constraints

- **25 MB max file size** (`EMR_ATTACHMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024`), enforced server-side via a signed `Content-Length` on the `PutObjectCommand` (ADR-0021 F1 — verified correct AWS SDK v3 technique, no presigned-POST/`content-length-range` needed).
- **MIME allow-list** (single source of truth, `emr-attachment.constants.ts`): `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx), `application/msword` (doc), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (xlsx), `application/vnd.ms-excel` (xls). Rejected everywhere: SVG, HTML, executables, zip, DICOM, video, HEIC, TIFF.
- **S3 key prefix:** `tenants/{tenantId}/emr/{recordId}/{uuid}-{safeFileName}` — `tenantId`/`recordId` always derived from server-side context (JWT + route param), never client-supplied. The confirm route rejects any `storageKey` whose prefix doesn't match (BR-3, IDOR guard).
- **No new permission codes.** All four operations (presign, confirm, download, delete) map onto the existing `emr.attach` (write) / `emr.view` (read) codes already in the RBAC catalogue.
- **HTTP status deviation from the design doc (found during grounding, documented here so it isn't re-litigated mid-implementation):** the design doc's acceptance criteria (§6, EMR-ATTACH-3/4) illustrate MIME/size validation failures as `422`. The actual codebase convention (`validate.middleware.ts` → `ValidationError extends AppError(400, ...)`) returns **400 `VALIDATION_ERROR`** for every Zod-validated route in this app, with no exception anywhere. This plan follows the real codebase convention (400), not the design doc's illustrative 422 — tests assert 400. This is a plan-level correction, not an open question.
- **Audit logging is already covered — no new code needed.** `auditMiddleware` (`src/backend/middlewares/audit.middleware.ts`) is mounted globally (`app.ts:56`) and fire-and-forget logs every successful mutating request (POST/PUT/PATCH/DELETE) to `AuditLog`, tenant-scoped, keyed by `action = "${method} ${path}"`. The presign, confirm, and delete routes are automatically audited by this existing middleware — BR-6/G-11's audit requirement is satisfied without writing a new `auditRepo.create()` call anywhere in this feature. Do not add a duplicate manual audit write.
- **Pet-photo upload flow (`usePhotoUpload.ts`, `/api/upload/presign`, `upload.routes.ts`, `upload.controller.ts`) is untouched** except one additive one-line export (Task 3) — no behavior change to that flow.
- **Download response shape (dev-agent judgment call, unspecified in the design doc):** the download route returns `{ downloadUrl, fileName }` as JSON (same shape family as the existing presign response), not an HTTP redirect. The frontend opens `downloadUrl` in a new tab. This keeps the route trivially testable via `supertest` (assert JSON body) and mirrors the existing presign-response pattern instead of inventing a second style.
- **`fileUrl` becomes nullable** on `Attachment` (was `String`, becomes `String?`) to support the storageKey-only path. This is non-breaking: every existing row already has a populated `fileUrl`.
- Prisma relation-naming convention mirrored from the existing `DailyInpatientCare.performedBy` precedent (ADR-0013 D4): named relation string (`"AttachmentUploadedBy"`), `onDelete: SetNull` (attachment metadata survives staff deletion — the row stays, only the uploader link degrades to `null`), FK + supporting index added in the same migration (learned from the RETEST-2026-07-13 P1 that added the index in a *separate* migration — this plan adds both together, first-time-right).

## File Structure

| File | Change |
|---|---|
| `src/backend/prisma/schema.prisma` | Modify — `Attachment` model gains `storageKey`/`mimeType`/`fileSize`/`uploadedByUserId`, `fileUrl` becomes optional; `User` gains the back-relation |
| `src/backend/prisma/migrations/20260721160000_add_attachment_upload_metadata/migration.sql` | **Create** |
| `src/backend/services/emr-attachment.constants.ts` | **Create** — MIME allow-list, size cap, storage-key-prefix helpers (shared by presign + confirm) |
| `src/backend/services/upload.service.ts` | Modify — export `sanitizeFilename` (1-line, reused by the new EMR service; pet-photo behavior unchanged) |
| `src/backend/services/emr-attachment.service.ts` | **Create** — presign, download-URL, delete logic |
| `src/backend/controllers/emr-attachment.controller.ts` | **Create** — presign/download/delete handlers |
| `src/backend/models/medical-record.repository.ts` | Modify — `createAttachment` persists new fields; add `findAttachmentById`/`deleteAttachmentById`; `findById` joins `uploadedByUser` |
| `src/backend/services/medical-record.service.ts` | Modify — `addAttachmentSchema` XOR (`fileUrl` ⊕ `storageKey`), `addAttachment()` takes `uploadedByUserId` + validates storageKey prefix |
| `src/backend/controllers/medical-record.controller.ts` | Modify — `handleAddAttachment` passes `req.context!.userId` |
| `src/backend/routes/medical-record.routes.ts` | Modify — 3 new routes (presign, download, delete) |
| `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md` | Modify — document the 3 new routes' permissions |
| `src/frontend/src/hooks/useEmrAttachmentUpload.ts` | **Create** — presign → PUT → confirm in one call, mirrors `usePhotoUpload.ts`'s shape |
| `src/frontend/src/views/clinic/ClinicEMR.tsx` | Modify — `Attachment` interface gains new fields; Attachments panel gets an upload control, per-row size/uploader/date + download/delete buttons |
| `src/backend/__tests__/emr-attachments.test.ts` | **Create** — 21 integration tests (presign/confirm/download/delete × RBAC/tenant/validation) |
| `src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts` | **Create** |
| `src/frontend/src/__tests__/ClinicEMR.attachments.test.tsx` | **Create** |

**Ponytail-gate self-check:** 8 new files, 8 modified files (16 total, ≤15 new — passes). 3 new API endpoints (presign/download/delete; confirm is extended, not new) — exactly at the ≤3 boundary. 0 new dependencies (both `@aws-sdk` packages already installed). 1 subsystem (EMR attachments) + 1 doc update. No new permission codes, no duplicate work (reuses `emr.attach`/`emr.view`, reuses the presign *pattern*, reuses the existing audit middleware, reuses `sanitizeFilename`).

---

### Task 1: Prisma schema — `Attachment` upload metadata + `User` back-relation

**Files:**
- Modify: `src/backend/prisma/schema.prisma:526-540` (`model Attachment`)
- Modify: `src/backend/prisma/schema.prisma:174-176` (inside `model User`, after `careLogsPerformed`)
- Create: `src/backend/prisma/migrations/20260721160000_add_attachment_upload_metadata/migration.sql`

**Interfaces:**
- Produces: `Attachment.storageKey/mimeType/fileSize/uploadedByUserId: nullable`, `Attachment.fileUrl: String?` — consumed by Task 6 (repository), Task 7 (service).

- [ ] **Step 1: Edit the `Attachment` model**

Replace lines 526–540 with:

```prisma
model Attachment {
  id              Int      @id @default(autoincrement())
  tenantId        Int
  medicalRecordId Int
  fileName        String   @db.VarChar(255)
  fileUrl         String?
  fileType        String?  @db.VarChar(50)
  \ EMR-ATTACH-9 (ADR-0021): real-upload metadata, additive + nullable for legacy
  \ URL-reference rows. fileUrl is now optional — confirm accepts fileUrl XOR storageKey.
  storageKey       String?
  mimeType         String?  @db.VarChar(255)
  fileSize         Int?
  uploadedByUserId Int?
  createdAt        DateTime @default(now())

  tenant         Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  medicalRecord  MedicalRecord @relation(fields: [medicalRecordId], references: [id], onDelete: Cascade)
  \ ADR-0021: ON DELETE SET NULL — attachment metadata survives staff deletion,
  \ matching the daily_inpatient_care.performedBy precedent (ADR-0013 D4).
  uploadedByUser User?         @relation("AttachmentUploadedBy", fields: [uploadedByUserId], references: [id], onDelete: SetNull)

  @@index([tenantId, medicalRecordId])
  @@index([uploadedByUserId])
  @@map("attachments")
}
```

- [ ] **Step 2: Add the `User` back-relation**

In `model User`, immediately after the `careLogsPerformed` line (schema.prisma:175):

```prisma
  \ ADR-0013 D4: care logs this user recorded (DailyInpatientCare.performedBy)
  careLogsPerformed      DailyInpatientCare[] @relation("CarePerformedBy")
  \ ADR-0021: EMR attachments this user uploaded (Attachment.uploadedByUserId)
  attachmentsUploaded    Attachment[]         @relation("AttachmentUploadedBy")
  userBranches           UserBranch[]
```

- [ ] **Step 3: Write the migration by hand** (mirrors the hand-written `20260711140000_add_care_performed_by_fk` + `20260713090000_add_care_performed_by_index` precedent, combined into one migration since this is a net-new nullable column set with no orphan risk)

Create `src/backend/prisma/migrations/20260721160000_add_attachment_upload_metadata/migration.sql`:

```sql
-- ADR-0021 EMR-ATTACH-9: real-upload metadata on Attachment, additive + nullable.
-- fileUrl becomes optional because the confirm route now accepts fileUrl XOR
-- storageKey (ADR-0021 F3) — every existing row already has fileUrl populated,
-- so relaxing the constraint is a no-op for current data.
ALTER TABLE "attachments" ALTER COLUMN "fileUrl" DROP NOT NULL;
ALTER TABLE "attachments" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "attachments" ADD COLUMN "mimeType" VARCHAR(255);
ALTER TABLE "attachments" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "attachments" ADD COLUMN "uploadedByUserId" INTEGER;

-- AddForeignKey — ON DELETE SET NULL: attachment metadata survives staff
-- deletion, matching daily_inpatient_care.performedBy (20260711140000).
ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supporting index, added in the same migration this time (RETEST-2026-07-13
-- P1 found the FK-without-index gap when it was split into a follow-up).
CREATE INDEX "attachments_uploadedByUserId_idx" ON "attachments"("uploadedByUserId");
```

- [ ] **Step 4: Apply and regenerate the client**

Run: `cd D:\Development\AnimalClinic && npx prisma migrate deploy --schema=src/backend/prisma/schema.prisma && npx prisma generate --schema=src/backend/prisma/schema.prisma`

Verify: no errors; `npx prisma migrate status` reports the new migration as applied.

- [ ] **Step 5: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations
git commit -m "feat(emr): add attachment upload metadata fields (storageKey/mimeType/fileSize/uploadedByUserId)"
```

---

### Task 2: `emr-attachment.constants.ts` — shared allow-list, size cap, prefix guard

**Files:**
- Create: `src/backend/services/emr-attachment.constants.ts`

**Interfaces:**
- Produces: `EMR_ATTACHMENT_MIME_ALLOWLIST`, `EMR_ATTACHMENT_MAX_SIZE_BYTES`, `buildEmrStorageKeyPrefix()`, `assertStorageKeyPrefix()` — consumed by Task 4 (presign service), Task 7 (confirm schema/service). This file has **no** imports from `medical-record.service.ts` or `emr-attachment.service.ts` — it sits at the bottom of the dependency graph so both of those files can import it without a cycle.

- [ ] **Step 1: Write the file**

```typescript
// src/backend/services/emr-attachment.constants.ts
// Single source of truth for EMR attachment MIME allow-list, size cap, and
// S3 key-prefix rules (ADR-0021 / design §5). Imported by both the confirm
// schema (medical-record.service.ts) and the presign service
// (emr-attachment.service.ts) — kept dependency-free to avoid a cycle
// between those two files.
import { AppError } from '../utils/errors'

/** Accepted MIME types for EMR attachments (design §5). Excludes SVG/HTML
 *  (active-content XSS), executables, archives, DICOM, video, HEIC/TIFF. */
export const EMR_ATTACHMENT_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const

export type EmrAttachmentMimeType = typeof EMR_ATTACHMENT_MIME_ALLOWLIST[number]

/** 25 MB per file (brainstorm §3.2). */
export const EMR_ATTACHMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024

/** BR-3: the S3 key prefix an attachment for this tenant/record MUST live under. */
export function buildEmrStorageKeyPrefix(tenantId: number, medicalRecordId: number): string {
  return `tenants/${tenantId}/emr/${medicalRecordId}/`
}

/**
 * BR-3 / EMR-ATTACH-7: reject a storageKey whose prefix doesn't match the
 * caller's tenant + target record. Prevents registering a foreign/arbitrary
 * S3 object as an attachment (IDOR).
 */
export function assertStorageKeyPrefix(tenantId: number, medicalRecordId: number, storageKey: string): void {
  const expectedPrefix = buildEmrStorageKeyPrefix(tenantId, medicalRecordId)
  if (!storageKey.startsWith(expectedPrefix)) {
    throw new AppError(400, 'storageKey does not match this tenant/record', 'INVALID_STORAGE_KEY')
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/services/emr-attachment.constants.ts
git commit -m "feat(emr): add shared MIME allow-list and storage-key-prefix guard"
```

(No standalone unit test file — `assertStorageKeyPrefix` is exercised end-to-end by the integration tests in Task 9/12; a bare pure-function unit test would duplicate that coverage.)

---

### Task 3: `upload.service.ts` — export `sanitizeFilename`

**Files:**
- Modify: `src/backend/services/upload.service.ts:22`

**Interfaces:**
- Produces: `sanitizeFilename(name: string): string` (now exported) — consumed by Task 4.

- [ ] **Step 1: Add the `export` keyword**

```typescript
// Sanitize filename — keep extension, strip path chars.
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}
```

This is the only change to this file — the pet-photo presign flow's behavior is unchanged (same function, now also importable).

- [ ] **Step 2: Commit**

```bash
git add src/backend/services/upload.service.ts
git commit -m "refactor(upload): export sanitizeFilename for reuse by EMR attachment service"
```

---

### Task 4: `emr-attachment.service.ts` — `generateEmrAttachmentPresign()` (TDD)

**Files:**
- Create: `src/backend/services/emr-attachment.service.ts`
- Create (this task's slice): `src/backend/__tests__/emr-attachments.test.ts` (file created here, more tests appended in later tasks)

**Interfaces:**
- Consumes: `getMedicalRecord`/`MedicalRecordError` from `medical-record.service.ts`; `EMR_ATTACHMENT_MIME_ALLOWLIST`/`EMR_ATTACHMENT_MAX_SIZE_BYTES` from `emr-attachment.constants.ts`; `sanitizeFilename` from `upload.service.ts`; `createS3Client`/`getStorageConfig`/`isStorageConfigured` from `config/storage.ts`.
- Produces: `emrPresignSchema` (Zod), `generateEmrAttachmentPresign(tenantId, branchId, medicalRecordId, input): Promise<{uploadUrl, storageKey}>` — consumed by Task 5 (route/controller).

- [ ] **Step 1: Write the failing test** — append to `src/backend/__tests__/emr-attachments.test.ts`:

```typescript
// src/backend/__tests__/emr-attachments.test.ts
/**
 * Test Suite: emr-attachments — EMR file attachment upload/download/delete
 * @qa-agent | ADR-0021 | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * AWS SDK is fully mocked — no real S3 calls required.
 * Run: npx jest --testPathPattern=emr-attachments
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, __cmd: 'Put' })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, __cmd: 'Get' })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ ...params, __cmd: 'Delete' })),
  }
})

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-bucket.s3.mock-region.amazonaws.com/signed?sig=xxx'),
}))

const MOCK_SIGNED_URL = 'https://mock-bucket.s3.mock-region.amazonaws.com/signed?sig=xxx'

import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const mockGetSignedUrl      = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>
const mockPutObjectCommand  = PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>

let server: Server
let tenantId: number
let branchId: number
let doctorToken: string
let staffToken: string
let adminToken: string
let medicalRecordId: number
let doctorUserId: number

const SUBDOMAIN = `emr-attach-test-${Date.now()}`

const ORIGINAL_ENV = {
  AWS_REGION:            process.env.AWS_REGION,
  AWS_BUCKET:            process.env.AWS_BUCKET,
  AWS_ACCESS_KEY_ID:     process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
}

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'EMR Attach Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  branchId = branch.id

  const ts = Date.now() % 100000
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const adminRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

  const doctorUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Dr. Attach', username: `doc_att_${ts}`, email: `doc-att-${ts}@test.local`, passwordHash: hash, roleId: doctorRole.id },
  })
  doctorUserId = doctorUser.id
  const staffUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Staff Attach', username: `staff_att_${ts}`, email: `staff-att-${ts}@test.local`, passwordHash: hash, roleId: staffRole.id },
  })
  const adminUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Admin Attach', username: `admin_att_${ts}`, email: `admin-att-${ts}@test.local`, passwordHash: hash, roleId: adminRole.id },
  })

  await seedUserRoles(prisma, [
    { userId: doctorUser.id, tenantId, roleKey: 'doctor' },
    { userId: staffUser.id,  tenantId, roleKey: 'clinic_staff' },
    { userId: adminUser.id,  tenantId, roleKey: 'clinic_admin' },
  ])

  doctorToken = signToken({ userId: doctorUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'doctor' })
  staffToken  = signToken({ userId: staffUser.id,  tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })
  adminToken  = signToken({ userId: adminUser.id,  tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'admin' })

  const pet = await prisma.pet.create({
    data: { tenantId, name: 'Rex', species: 'canine', owner: { create: { tenantId, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } } },
  })
  const record = await prisma.medicalRecord.create({
    data: { tenantId, branchId, petId: pet.id, doctorId: doctorUser.id, assessment: 'Checkup' },
  })
  medicalRecordId = record.id
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.AWS_REGION            = 'ap-southeast-1'
  process.env.AWS_BUCKET             = 'test-vet-bucket'
  process.env.AWS_ACCESS_KEY_ID      = 'AKIAIOSFODNN7EXAMPLE'
  process.env.AWS_SECRET_ACCESS_KEY  = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  mockGetSignedUrl.mockResolvedValue(MOCK_SIGNED_URL)
})

afterEach(() => {
  Object.assign(process.env, ORIGINAL_ENV)
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.attachment.deleteMany({ where: { tenantId } })
  await prisma.medicalRecord.deleteMany({ where: { tenantId } })
  await prisma.pet.deleteMany({ where: { tenantId } })
  await prisma.owner.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('emr-attachments — POST /:id/attachments/presign', () => {

  test('EA-01: doctor gets 201 with uploadUrl + storageKey scoped to tenant/record', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.uploadUrl).toBe(MOCK_SIGNED_URL)
    expect(res.body.data.storageKey).toMatch(new RegExp(`^tenants/${tenantId}/emr/${medicalRecordId}/.+lab-result\\.pdf$`))
    expect(mockPutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: 'test-vet-bucket', ContentType: 'application/pdf', ContentLength: 1024 }),
    )
  })

  test('EA-02: staff (clinic_staff) also gets 201', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ fileName: 'xray.jpg', contentType: 'image/jpeg', fileSizeBytes: 2048 })
      .expect(201)
  })

  test('EA-03: clinic_admin is denied (403) — admin lacks emr.attach by design (A1)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(403)
    expect(res.body.success).toBe(false)
  })

  test('EA-04: no token → 401', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(401)
  })

  test('EA-05: foreign-tenant record → 404 (existence-leak precedent, ADR-0014)', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other EMR Tenant', subdomain: `${SUBDOMAIN}-other` } })
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTenant.id, name: 'Main' } })
    const otherDoctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, name: 'Other Doc', username: `other_doc_${Date.now() % 100000}`, email: `other-${Date.now()}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: otherDoctorRole.id },
    })
    const otherPet = await prisma.pet.create({
      data: { tenantId: otherTenant.id, name: 'Fido', species: 'canine', owner: { create: { tenantId: otherTenant.id, firstName: 'Bob', lastName: 'Lee', phone: '0811111111' } } },
    })
    const otherRecord = await prisma.medicalRecord.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, petId: otherPet.id, doctorId: otherDoctor.id },
    })

    const res = await request(server)
      .post(`/api/medical-records/${otherRecord.id}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`) // doctorToken belongs to the FIRST tenant
      .send({ fileName: 'x.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(404)
    expect(res.body.success).toBe(false)

    await prisma.medicalRecord.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.branch.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

  test('EA-06: disallowed contentType (SVG) → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'evil.svg', contentType: 'image/svg+xml', fileSizeBytes: 1024 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-07: oversized fileSizeBytes (26 MB) → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'huge.pdf', contentType: 'application/pdf', fileSizeBytes: 26 * 1024 * 1024 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-08: storage not configured → 503 STORAGE_NOT_CONFIGURED', async () => {
    process.env.AWS_REGION = ''
    process.env.AWS_BUCKET = ''
    process.env.AWS_ACCESS_KEY_ID = ''
    process.env.AWS_SECRET_ACCESS_KEY = ''

    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'lab-result.pdf', contentType: 'application/pdf', fileSizeBytes: 1024 })
      .expect(503)
    expect(res.body.code).toBe('STORAGE_NOT_CONFIGURED')
  })

})
```

- [ ] **Step 2: Verify the test fails** — run `cd D:\Development\AnimalClinic && npx jest --testPathPattern=emr-attachments --runInBand` and confirm every test fails (route doesn't exist yet → 404 from Express's default handler, not the app's own 404).

- [ ] **Step 3: Implement `emr-attachment.service.ts`** — minimal code to pass:

```typescript
// src/backend/services/emr-attachment.service.ts
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { AppError } from '../utils/errors'
import { createS3Client, getStorageConfig, isStorageConfigured } from '../config/storage'
import { sanitizeFilename } from './upload.service'
import { getMedicalRecord } from './medical-record.service'
import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES } from './emr-attachment.constants'

export const emrPresignSchema = z.object({
  fileName:      z.string().min(1).max(200),
  contentType:   z.enum(EMR_ATTACHMENT_MIME_ALLOWLIST),
  fileSizeBytes: z.number().int().positive().max(EMR_ATTACHMENT_MAX_SIZE_BYTES),
})

export type EmrPresignInput = z.infer<typeof emrPresignSchema>

export interface EmrPresignResult {
  uploadUrl:  string
  storageKey: string
}

/**
 * Generate a presigned S3 PUT URL for an EMR attachment upload.
 *
 * Verifies the target medical record is within the caller's tenant/branch
 * scope (BR-2 — 404 if not, existence-leak precedent) before signing. The
 * signed `ContentLength` binds the client's PUT to the declared size
 * (ADR-0021 F1) — S3 rejects a PUT that doesn't send exactly that many bytes.
 */
export async function generateEmrAttachmentPresign(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  input: EmrPresignInput,
): Promise<EmrPresignResult> {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)

  if (!isStorageConfigured()) {
    throw new AppError(503, 'Storage not configured', 'STORAGE_NOT_CONFIGURED')
  }

  const cfg  = getStorageConfig()
  const safe = sanitizeFilename(input.fileName)
  const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/${randomUUID()}-${safe}`

  const client  = createS3Client()
  const command = new PutObjectCommand({
    Bucket:        cfg.bucket,
    Key:           storageKey,
    ContentType:   input.contentType,
    ContentLength: input.fileSizeBytes,
  })

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })
  return { uploadUrl, storageKey }
}
```

- [ ] **Step 4: Wire a temporary route so the tests in this task can run** — see Task 5 for the real route registration; this task's tests will stay red until Task 5 lands. (If your workflow requires green-before-commit per task, merge Task 4 + Task 5 into one commit — both are small.)

- [ ] **Step 5: Commit** (after Task 5's route wiring makes EA-01..08 pass)

```bash
git add src/backend/services/emr-attachment.service.ts src/backend/__tests__/emr-attachments.test.ts
git commit -m "feat(emr): add presigned-upload service for EMR attachments"
```

---

### Task 5: Presign controller + route registration

**Files:**
- Create: `src/backend/controllers/emr-attachment.controller.ts`
- Modify: `src/backend/routes/medical-record.routes.ts`

**Interfaces:**
- Consumes: `generateEmrAttachmentPresign`/`emrPresignSchema` from Task 4.
- Produces: `handlePresignAttachment` — wired to `POST /:id/attachments/presign`.

- [ ] **Step 1: Write the controller**

```typescript
// src/backend/controllers/emr-attachment.controller.ts
import { Request, Response, NextFunction } from 'express'
import { generateEmrAttachmentPresign } from '../services/emr-attachment.service'

export async function handlePresignAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await generateEmrAttachmentPresign(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      req.body,
    )
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}
```

- [ ] **Step 2: Register the route** — in `src/backend/routes/medical-record.routes.ts`, add the import and route:

```typescript
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord, handleAddAttachment,
} from '../controllers/medical-record.controller'
import { handlePresignAttachment } from '../controllers/emr-attachment.controller'
import { createMedicalRecordSchema, updateMedicalRecordSchema, addAttachmentSchema } from '../services/medical-record.service'
import { emrPresignSchema } from '../services/emr-attachment.service'

const router = Router()
router.use(authMiddleware)

router.get('/',                          requirePlane('clinic'), requirePermission('emr.view'),   handleListMedicalRecords)
router.get('/:id',                       requirePlane('clinic'), requirePermission('emr.view'),   handleGetMedicalRecord)
router.post('/',                         requirePlane('clinic'), requirePermission('emr.create'), validate(createMedicalRecordSchema), handleCreateMedicalRecord)
router.put('/:id',                       requirePlane('clinic'), requirePermission('emr.edit'),   validate(updateMedicalRecordSchema), handleUpdateMedicalRecord)
router.post('/:id/attachments/presign',  requirePlane('clinic'), requirePermission('emr.attach'), validate(emrPresignSchema),          handlePresignAttachment)
router.post('/:id/attachments',          requirePlane('clinic'), requirePermission('emr.attach'), validate(addAttachmentSchema),       handleAddAttachment)

export default router
```

(Download and delete routes are added in Tasks 10/11.)

- [ ] **Step 3: Run the tests from Task 4** — `npx jest --testPathPattern=emr-attachments --runInBand`. EA-01 through EA-08 should now pass.

- [ ] **Step 4: Commit**

```bash
git add src/backend/controllers/emr-attachment.controller.ts src/backend/routes/medical-record.routes.ts
git commit -m "feat(emr): wire POST /:id/attachments/presign route"
```

---

### Task 6: Repository — extend `createAttachment`, add attachment lookups, join `uploadedByUser`

**Files:**
- Modify: `src/backend/models/medical-record.repository.ts`

**Interfaces:**
- Produces: `createAttachment(tenantId, medicalRecordId, data, uploadedByUserId)`, `findAttachmentById(tenantId, medicalRecordId, attachmentId)`, `deleteAttachmentById(tenantId, medicalRecordId, attachmentId)` — consumed by Task 7 (confirm), Task 10 (download), Task 11 (delete). `findById`'s attachment include now returns `uploadedByUser: { id, name }` — consumed by Task 14 (frontend display).

- [ ] **Step 1: Update `createAttachment`** — replace the existing function:

```typescript
export function createAttachment(
  tenantId: number,
  medicalRecordId: number,
  data: AddAttachmentInput,
  uploadedByUserId: number | null,
) {
  return prisma.attachment.create({
    data: {
      tenantId,
      medicalRecordId,
      fileName:   data.fileName,
      fileUrl:    data.fileUrl ?? null,
      fileType:   data.fileType ?? null,
      storageKey: data.storageKey ?? null,
      mimeType:   data.mimeType ?? null,
      fileSize:   data.fileSizeBytes ?? null,
      uploadedByUserId,
    },
  })
}

export function findAttachmentById(tenantId: number, medicalRecordId: number, attachmentId: number) {
  return prisma.attachment.findFirst({ where: { id: attachmentId, tenantId, medicalRecordId } })
}

export function deleteAttachmentById(tenantId: number, medicalRecordId: number, attachmentId: number) {
  return prisma.attachment.delete({ where: { id: attachmentId, tenantId, medicalRecordId } })
}
```

- [ ] **Step 2: Update `findById`'s attachment include** — change `attachments: true` to:

```typescript
    attachments: {
      include: { uploadedByUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    },
```

(Full context: this is inside the `include` block of `findById()`, alongside `pet`, `doctor`, `prescriptions`, `invoices`.)

- [ ] **Step 3: Commit** (tests exercising this land in Task 7/10/11 — this task alone doesn't compile against the old `AddAttachmentInput` type until Task 7 extends it, so commit Task 6+7 together if your workflow requires green-per-commit)

```bash
git add src/backend/models/medical-record.repository.ts
git commit -m "feat(emr): persist attachment upload metadata, add lookup/delete helpers"
```

---

### Task 7: `medical-record.service.ts` — XOR confirm schema + `addAttachment()` (TDD)

**Files:**
- Modify: `src/backend/services/medical-record.service.ts`
- Modify: `src/backend/__tests__/emr-attachments.test.ts` (append confirm tests)

**Interfaces:**
- Produces: `addAttachmentSchema` (extended), `addAttachment(tenantId, branchId, medicalRecordId, data, uploadedByUserId)` — consumed by Task 8 (controller).

- [ ] **Step 1: Write the failing tests** — append to `emr-attachments.test.ts`:

```typescript
describe('emr-attachments — POST /:id/attachments (confirm, extended)', () => {

  test('EA-09: storageKey path persists mimeType/fileSize/uploadedByUserId', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/${crypto.randomUUID()}-lab.pdf`
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'lab.pdf', storageKey, mimeType: 'application/pdf', fileSizeBytes: 4096, fileType: 'lab' })
      .expect(201)

    expect(res.body.data.storageKey).toBe(storageKey)
    expect(res.body.data.mimeType).toBe('application/pdf')
    expect(res.body.data.fileSize).toBe(4096)
    expect(res.body.data.uploadedByUserId).toBe(doctorUserId)
  })

  test('EA-10: legacy fileUrl-only path still works (F3 backward-compat regression guard)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'referral.pdf', fileUrl: 'https://portal.example.com/referral.pdf', fileType: 'other' })
      .expect(201)

    expect(res.body.data.fileUrl).toBe('https://portal.example.com/referral.pdf')
    expect(res.body.data.storageKey).toBeNull()
  })

  test('EA-11: both fileUrl and storageKey → 400 (XOR violation)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf', fileUrl: 'https://x.example.com/x.pdf', storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/x`, mimeType: 'application/pdf', fileSizeBytes: 100 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-12: neither fileUrl nor storageKey → 400', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('EA-13: storageKey with mismatched tenant/record prefix → 400 INVALID_STORAGE_KEY', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf', storageKey: `tenants/99999/emr/1/forged-x.pdf`, mimeType: 'application/pdf', fileSizeBytes: 100 })
      .expect(400)
    expect(res.body.code).toBe('INVALID_STORAGE_KEY')
  })

  test('EA-14: mimeType outside allow-list (text/html) → 400 VALIDATION_ERROR (schema-level, EMR-ATTACH-8)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.html', storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/x.html`, mimeType: 'text/html', fileSizeBytes: 100 })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

})
```

Add `import crypto from 'crypto'` (or use `require('crypto').randomUUID()` inline) at the top of the test file.

- [ ] **Step 2: Verify failure** — run the suite; EA-09/10 fail because the repository still spreads `...data` (old shape); EA-11..14 fail because the schema doesn't yet enforce XOR.

- [ ] **Step 3: Implement** — in `src/backend/services/medical-record.service.ts`:

```typescript
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as recordRepo from '../models/medical-record.repository'
import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES, assertStorageKeyPrefix } from './emr-attachment.constants'

// ... createMedicalRecordSchema / updateMedicalRecordSchema unchanged ...

export const addAttachmentSchema = z.object({
  fileName:      z.string().min(1).max(255),
  fileUrl:       z.string().url().optional(),
  storageKey:    z.string().min(1).optional(),
  mimeType:      z.enum(EMR_ATTACHMENT_MIME_ALLOWLIST).optional(),
  fileSizeBytes: z.number().int().positive().max(EMR_ATTACHMENT_MAX_SIZE_BYTES).optional(),
  fileType:      z.enum(['lab', 'xray', 'photo', 'other']).optional(),
}).refine(
  (data) => Boolean(data.fileUrl) !== Boolean(data.storageKey),
  { message: 'Provide exactly one of fileUrl or storageKey', path: ['fileUrl'] },
).refine(
  (data) => !data.storageKey || (data.mimeType !== undefined && data.fileSizeBytes !== undefined),
  { message: 'mimeType and fileSizeBytes are required when storageKey is provided', path: ['mimeType'] },
)
```

Update `addAttachment`:

```typescript
export async function addAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  data: AddAttachmentInput,
  uploadedByUserId: number,
) {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  if (data.storageKey) assertStorageKeyPrefix(tenantId, medicalRecordId, data.storageKey)
  return recordRepo.createAttachment(tenantId, medicalRecordId, data, data.storageKey ? uploadedByUserId : null)
}
```

Note: `uploadedByUserId` is only recorded for the new binary-upload path — a legacy `fileUrl`-only confirm doesn't necessarily correspond to an in-app upload action, so it stays `null` there, matching "nullable for legacy rows" (EMR-ATTACH-9).

- [ ] **Step 4: Run tests** — EA-09..14 should pass. Also re-run EA-01..08 and the pre-existing `medical-record-weight-sync.test.ts` to confirm no regression (the legacy `fileUrl`-only shape is untouched by the XOR refine as long as `storageKey` is absent).

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/medical-record.service.ts src/backend/models/medical-record.repository.ts src/backend/__tests__/emr-attachments.test.ts
git commit -m "feat(emr): extend attachment confirm to accept storageKey XOR fileUrl"
```

---

### Task 8: Controller — pass `uploadedByUserId` through to `addAttachment`

**Files:**
- Modify: `src/backend/controllers/medical-record.controller.ts`

**Interfaces:**
- Consumes: `addAttachment` (Task 7, new signature).

- [ ] **Step 1: Update `handleAddAttachment`**

```typescript
export async function handleAddAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await addAttachment(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      req.body,
      req.context!.userId,
    )
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}
```

- [ ] **Step 2: Run the full `emr-attachments.test.ts` suite** — confirms EA-09's `uploadedByUserId` assertion passes end-to-end through the real controller (this was likely already green from Task 7 if TypeScript didn't compile without this change — `addAttachment` now requires a 5th argument, so this task is really "make it compile" as much as "make it correct").

- [ ] **Step 3: Commit**

```bash
git add src/backend/controllers/medical-record.controller.ts
git commit -m "feat(emr): thread uploadedByUserId from JWT context into attachment confirm"
```

---

### Task 9: Backward-compatibility regression check

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full backend suite** — `cd D:\Development\AnimalClinic && npx jest --runInBand --forceExit` — confirm zero regressions, in particular:
  - `medical-record-weight-sync.test.ts` (uses the medical-record routes elsewhere)
  - `upload.test.ts` (pet-photo flow, untouched behavior — Task 3 only added an export)
  - Any RBAC/permission-matrix route-introspection test (`roleRouteMatrix.test.ts` or similar) — the 3 new routes must appear in its route inventory once added; if that test enumerates routes and fails because it doesn't yet know about the new permission requirements, that's expected until Task 13 documents them — re-run after Task 13 if so.

- [ ] **Step 2: No commit** (verification only) — if a regression is found, stop and fix before proceeding; do not paper over a red test.

---

### Task 10: Download route — presigned GET (TDD)

**Files:**
- Modify: `src/backend/services/emr-attachment.service.ts` — add `generateAttachmentDownloadUrl`
- Modify: `src/backend/controllers/emr-attachment.controller.ts` — add `handleDownloadAttachment`
- Modify: `src/backend/routes/medical-record.routes.ts` — add the route
- Modify: `src/backend/__tests__/emr-attachments.test.ts` — append download tests

**Interfaces:**
- Produces: `generateAttachmentDownloadUrl(tenantId, branchId, medicalRecordId, attachmentId): Promise<{downloadUrl, fileName}>` — consumed by the controller.

- [ ] **Step 1: Write the failing tests** — append:

```typescript
describe('emr-attachments — GET /:id/attachments/:attId/download', () => {
  let attachmentId: number

  beforeAll(async () => {
    const a = await prisma.attachment.create({
      data: {
        tenantId, medicalRecordId, fileName: 'download-me.pdf',
        storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/dl-uuid-download-me.pdf`,
        mimeType: 'application/pdf', fileSize: 555, uploadedByUserId: doctorUserId,
      },
    })
    attachmentId = a.id
  })

  test('EA-15: emr.view holder (doctor) gets a downloadUrl', async () => {
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200)
    expect(res.body.data.downloadUrl).toBe(MOCK_SIGNED_URL)
    expect(res.body.data.fileName).toBe('download-me.pdf')
  })

  test('EA-16: role without emr.view → 403', async () => {
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staffPerms = await prisma.rolePermission.findMany({ where: { roleId: staffRole.id } })
    const noViewRole = await prisma.clinicRole.create({ data: { tenantId, key: 'no_emr_view_staff', name: 'No-EMR-View Staff', isSystem: false } })
    for (const rp of staffPerms) {
      if (rp.permissionCode.startsWith('emr.')) continue
      await prisma.rolePermission.create({ data: { roleId: noViewRole.id, permissionCode: rp.permissionCode } })
    }
    const ts = Date.now() % 100000
    const noViewUser = await prisma.user.create({
      data: { tenantId, branchId, name: 'No View', username: `no_view_${ts}`, email: `no-view-${ts}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: noViewRole.id },
    })
    await prisma.userRole.create({ data: { userId: noViewUser.id, roleId: noViewRole.id, tenantId } })
    const noViewToken = signToken({ userId: noViewUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })

    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${noViewToken}`)
      .expect(403)
    expect(res.body.success).toBe(false)
  })

  test('EA-17: foreign-tenant attachment id → 404', async () => {
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/999999/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)
  })
})
```

- [ ] **Step 2: Verify failure**, then implement in `emr-attachment.service.ts` (append):

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { MedicalRecordError } from './medical-record.service'
import * as recordRepo from '../models/medical-record.repository'

export interface AttachmentDownload {
  downloadUrl: string
  fileName:    string
}

/**
 * Issue a short-TTL presigned GET for a private-bucket EMR attachment
 * (ADR-0021 F2 — the app never returns a public URL for EMR objects;
 * `Content-Disposition: attachment` forces a download rather than
 * inline rendering, closing off the SVG/HTML XSS vector at the browser).
 */
export async function generateAttachmentDownloadUrl(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<AttachmentDownload> {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  const attachment = await recordRepo.findAttachmentById(tenantId, medicalRecordId, attachmentId)
  if (!attachment) throw new MedicalRecordError('Attachment not found', 404)
  if (!attachment.storageKey) throw new MedicalRecordError('This attachment is a URL reference, not a stored file', 400)

  if (!isStorageConfigured()) {
    throw new AppError(503, 'Storage not configured', 'STORAGE_NOT_CONFIGURED')
  }

  const cfg    = getStorageConfig()
  const client = createS3Client()
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key:    attachment.storageKey,
    ResponseContentDisposition: `attachment; filename="${sanitizeFilename(attachment.fileName)}"`,
  })
  const downloadUrl = await getSignedUrl(client, command, { expiresIn: 60 })
  return { downloadUrl, fileName: attachment.fileName }
}
```

Add to `emr-attachment.controller.ts`:

```typescript
import { generateEmrAttachmentPresign, generateAttachmentDownloadUrl } from '../services/emr-attachment.service'

export async function handleDownloadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await generateAttachmentDownloadUrl(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      parseInt(req.params.attId),
    )
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

Add to `medical-record.routes.ts`:

```typescript
import { handlePresignAttachment, handleDownloadAttachment } from '../controllers/emr-attachment.controller'
// ...
router.get('/:id/attachments/:attId/download', requirePlane('clinic'), requirePermission('emr.view'), handleDownloadAttachment)
```

- [ ] **Step 3: Run tests** — EA-15..17 should pass.

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/emr-attachment.service.ts src/backend/controllers/emr-attachment.controller.ts src/backend/routes/medical-record.routes.ts src/backend/__tests__/emr-attachments.test.ts
git commit -m "feat(emr): add gated presigned-download route for attachments"
```

---

### Task 11: Delete route — billed-record guard (TDD)

**Files:**
- Modify: `src/backend/services/emr-attachment.service.ts` — add `deleteAttachment`
- Modify: `src/backend/controllers/emr-attachment.controller.ts` — add `handleDeleteAttachment`
- Modify: `src/backend/routes/medical-record.routes.ts` — add the route
- Modify: `src/backend/__tests__/emr-attachments.test.ts` — append delete tests

**Interfaces:**
- Produces: `deleteAttachment(tenantId, branchId, medicalRecordId, attachmentId): Promise<void>` — throws `MedicalRecordError(403)` if the parent record has a paid invoice (mirrors `updateMedicalRecord`'s existing guard).

- [ ] **Step 1: Write the failing tests** — append:

```typescript
describe('emr-attachments — DELETE /:id/attachments/:attId', () => {

  test('EA-18: doctor deletes an attachment successfully (204), row removed', async () => {
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'to-delete.pdf', storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/del-uuid-to-delete.pdf`, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)

    const stillThere = await prisma.attachment.findUnique({ where: { id: a.id } })
    expect(stillThere).toBeNull()
  })

  test('EA-19: delete blocked (403) when parent record has a paid invoice (BR-6)', async () => {
    const billedPet = await prisma.pet.create({
      data: { tenantId, name: 'Billed Pet', species: 'feline', owner: { create: { tenantId, firstName: 'Ann', lastName: 'Lee', phone: '0822222222' } } },
    })
    const billedRecord = await prisma.medicalRecord.create({ data: { tenantId, branchId, petId: billedPet.id, doctorId: doctorUserId } })
    await prisma.invoice.create({
      data: { tenantId, medicalRecordId: billedRecord.id, petId: billedPet.id, subtotal: 100, taxRate: 7, taxAmount: 7, totalAmount: 107, paymentStatus: 'paid' },
    })
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId: billedRecord.id, fileName: 'billed.pdf', storageKey: `tenants/${tenantId}/emr/${billedRecord.id}/uuid-billed.pdf`, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })

    const res = await request(server)
      .delete(`/api/medical-records/${billedRecord.id}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403)
    expect(res.body.success).toBe(false)

    const stillThere = await prisma.attachment.findUnique({ where: { id: a.id } })
    expect(stillThere).not.toBeNull()
  })

  test('EA-20: role without emr.attach (clinic_admin) → 403', async () => {
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'admin-cant-delete.pdf', storageKey: `tenants/${tenantId}/emr/${medicalRecordId}/uuid-admin.pdf`, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403)
  })

  test('EA-21: presign/confirm/delete each produce an AuditLog row via the existing global audit middleware (G-11)', async () => {
    const before = await prisma.auditLog.count({ where: { tenantId } })

    const presignRes = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments/presign`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'audited.pdf', contentType: 'application/pdf', fileSizeBytes: 100 })
      .expect(201)

    const confirmRes = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'audited.pdf', storageKey: presignRes.body.data.storageKey, mimeType: 'application/pdf', fileSizeBytes: 100 })
      .expect(201)

    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${confirmRes.body.data.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)

    // audit writes are fire-and-forget on res.on('finish') — give the event loop a tick
    await new Promise((r) => setTimeout(r, 50))

    const after = await prisma.auditLog.count({ where: { tenantId } })
    expect(after).toBeGreaterThanOrEqual(before + 3)
  })

})
```

- [ ] **Step 2: Verify failure**, then implement. Append to `emr-attachment.service.ts`:

```typescript
export async function deleteAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<void> {
  const record = await getMedicalRecord(tenantId, branchId, medicalRecordId)

  const hasPaidInvoice = record.invoices?.some((inv: { paymentStatus: string }) => inv.paymentStatus === 'paid')
  if (hasPaidInvoice) throw new MedicalRecordError('Cannot delete an attachment on a billed medical record', 403)

  const attachment = await recordRepo.findAttachmentById(tenantId, medicalRecordId, attachmentId)
  if (!attachment) throw new MedicalRecordError('Attachment not found', 404)

  await recordRepo.deleteAttachmentById(tenantId, medicalRecordId, attachmentId)

  if (attachment.storageKey && isStorageConfigured()) {
    const cfg    = getStorageConfig()
    const client = createS3Client()
    try {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: attachment.storageKey }))
    } catch {
      // Best-effort: the DB row is already gone; a surviving S3 object is
      // the accepted orphan risk (R7 / F4), not a new failure mode.
    }
  }
}
```

Add `import { DeleteObjectCommand } from '@aws-sdk/client-s3'` to the service's existing import line.

Add to `emr-attachment.controller.ts`:

```typescript
import { generateEmrAttachmentPresign, generateAttachmentDownloadUrl, deleteAttachment } from '../services/emr-attachment.service'

export async function handleDeleteAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteAttachment(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      parseInt(req.params.attId),
    )
    res.status(204).send()
  } catch (err) { next(err) }
}
```

Add to `medical-record.routes.ts`:

```typescript
import { handlePresignAttachment, handleDownloadAttachment, handleDeleteAttachment } from '../controllers/emr-attachment.controller'
// ...
router.delete('/:id/attachments/:attId', requirePlane('clinic'), requirePermission('emr.attach'), handleDeleteAttachment)
```

- [ ] **Step 3: Run tests** — EA-18..21 should pass. Re-run the full `emr-attachments.test.ts` file once more end-to-end.

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/emr-attachment.service.ts src/backend/controllers/emr-attachment.controller.ts src/backend/routes/medical-record.routes.ts src/backend/__tests__/emr-attachments.test.ts
git commit -m "feat(emr): add gated delete route with billed-record guard for attachments"
```

---

### Task 12: `permission-matrix.md` — document the 3 new routes

**Files:**
- Modify: `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md:122-124`

- [ ] **Step 1: Update the route→permission table**

Replace:
```
| `medical-record.routes` | GET | `emr.view` |
| | POST `/` , PUT `/:id` | `emr.create` / `emr.edit` |
| | POST `/:id/attachments` | `emr.attach` |
```
with:
```
| `medical-record.routes` | GET | `emr.view` |
| | POST `/` , PUT `/:id` | `emr.create` / `emr.edit` |
| | POST `/:id/attachments/presign` | `emr.attach` |
| | POST `/:id/attachments` | `emr.attach` |
| | GET `/:id/attachments/:attId/download` | `emr.view` |
| | DELETE `/:id/attachments/:attId` | `emr.attach` |
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/anemal-rbac-matrix/references/permission-matrix.md
git commit -m "docs(rbac): document EMR attachment presign/download/delete route permissions"
```

---

### Task 13: Frontend — `useEmrAttachmentUpload` hook (TDD)

**Files:**
- Create: `src/frontend/src/hooks/useEmrAttachmentUpload.ts`
- Create: `src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts`

**Interfaces:**
- Produces: `useEmrAttachmentUpload(): { uploadAttachment(medicalRecordId, file, fileType?): Promise<Attachment>, downloadAttachment(medicalRecordId, attachmentId): Promise<void>, isUploading, uploadError, clearUploadError }` — consumed by Task 14 (`ClinicEMR.tsx`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const postMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { post: (...args: unknown[]) => postMock(...args) } }))

import { useEmrAttachmentUpload } from '../hooks/useEmrAttachmentUpload'

const file = new File(['%PDF-1.4 fake'], 'lab.pdf', { type: 'application/pdf' })

beforeEach(() => {
  postMock.mockReset()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch
  global.open  = vi.fn()
})

describe('useEmrAttachmentUpload', () => {
  it('presigns, PUTs to S3, then confirms and returns the created attachment', async () => {
    postMock
      .mockResolvedValueOnce({ data: { data: { uploadUrl: 'https://s3.example.com/put?sig=x', storageKey: 'tenants/1/emr/9/uuid-lab.pdf' } } })
      .mockResolvedValueOnce({ data: { data: { id: 55, fileName: 'lab.pdf', mimeType: 'application/pdf', fileSize: file.size } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    let attachment
    await act(async () => {
      attachment = await result.current.uploadAttachment(9, file, 'lab')
    })

    expect(postMock).toHaveBeenNthCalledWith(1, '/api/medical-records/9/attachments/presign', {
      fileName: 'lab.pdf', contentType: 'application/pdf', fileSizeBytes: file.size,
    })
    expect(global.fetch).toHaveBeenCalledWith('https://s3.example.com/put?sig=x', expect.objectContaining({ method: 'PUT' }))
    expect(postMock).toHaveBeenNthCalledWith(2, '/api/medical-records/9/attachments', {
      fileName: 'lab.pdf', storageKey: 'tenants/1/emr/9/uuid-lab.pdf', mimeType: 'application/pdf', fileSizeBytes: file.size, fileType: 'lab',
    })
    expect((attachment as unknown as { id: number }).id).toBe(55)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.uploadError).toBeNull()
  })

  it('sets uploadError and rethrows when the S3 PUT fails', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { uploadUrl: 'https://s3.example.com/put?sig=x', storageKey: 'tenants/1/emr/9/uuid-lab.pdf' } } })
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch

    const { result } = renderHook(() => useEmrAttachmentUpload())

    await act(async () => {
      await expect(result.current.uploadAttachment(9, file)).rejects.toThrow()
    })
    await waitFor(() => expect(result.current.uploadError).toContain('500'))
  })

  it('surfaces the backend error message when presign is rejected (e.g. 403)', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: "Access denied: missing permission 'emr.attach'" } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    await act(async () => {
      await expect(result.current.uploadAttachment(9, file)).rejects.toBeTruthy()
    })
    await waitFor(() => expect(result.current.uploadError).toBe("Access denied: missing permission 'emr.attach'"))
  })
})
```

- [ ] **Step 2: Verify failure** — `cd D:\Development\AnimalClinic && npx vitest run useEmrAttachmentUpload --config src/frontend/vitest.config.ts` (adjust path to the frontend's actual vitest config/script — mirror whatever `package.json` test script the frontend already uses).

- [ ] **Step 3: Implement the hook**

```typescript
// src/frontend/src/hooks/useEmrAttachmentUpload.ts
import { useState } from 'react'
import api from '../utils/api'

interface Attachment {
  id:               number
  fileName:         string
  fileUrl?:         string | null
  fileType?:        string | null
  mimeType?:        string | null
  fileSize?:        number | null
  storageKey?:      string | null
  uploadedByUserId?: number | null
  createdAt?:       string
}

interface UseEmrAttachmentUploadResult {
  uploadAttachment:   (medicalRecordId: number, file: File, fileType?: string) => Promise<Attachment>
  downloadAttachment: (medicalRecordId: number, attachmentId: number) => Promise<void>
  isUploading:        boolean
  uploadError:        string | null
  clearUploadError:   () => void
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  const asAxios = err as { response?: { data?: { error?: string } } }
  return asAxios?.response?.data?.error ?? 'Upload failed'
}

export function useEmrAttachmentUpload(): UseEmrAttachmentUploadResult {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadAttachment = async (medicalRecordId: number, file: File, fileType?: string): Promise<Attachment> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const presignRes = await api.post(`/api/medical-records/${medicalRecordId}/attachments/presign`, {
        fileName:      file.name,
        contentType:   file.type,
        fileSizeBytes: file.size,
      })
      const { uploadUrl, storageKey } = presignRes.data.data as { uploadUrl: string; storageKey: string }

      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      })
      if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`)

      const confirmRes = await api.post(`/api/medical-records/${medicalRecordId}/attachments`, {
        fileName:      file.name,
        storageKey,
        mimeType:      file.type,
        fileSizeBytes: file.size,
        fileType,
      })
      return confirmRes.data.data as Attachment
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    } finally {
      setIsUploading(false)
    }
  }

  const downloadAttachment = async (medicalRecordId: number, attachmentId: number): Promise<void> => {
    try {
      const res = await api.get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      const { downloadUrl } = res.data.data as { downloadUrl: string }
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    }
  }

  return { uploadAttachment, downloadAttachment, isUploading, uploadError, clearUploadError }
}
```

- [ ] **Step 4: Run tests** — confirm green.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/useEmrAttachmentUpload.ts src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts
git commit -m "feat(emr): add useEmrAttachmentUpload hook (presign → PUT → confirm)"
```

---

### Task 14: `ClinicEMR.tsx` — Attachments panel upload/download/delete UI (TDD)

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicEMR.tsx`
- Create: `src/frontend/src/__tests__/ClinicEMR.attachments.test.tsx`

**Interfaces:**
- Consumes: `useEmrAttachmentUpload` (Task 13).

- [ ] **Step 1: Write the failing test**

```typescript
// src/frontend/src/__tests__/ClinicEMR.attachments.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const getMock  = vi.fn()
const postMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    get:  (...args: unknown[]) => getMock(...(args as [string, unknown])),
    post: (...args: unknown[]) => postMock(...args),
  },
}))
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ userId: 1 }) }))

import ClinicEMR from '../views/clinic/ClinicEMR'

const pet = { id: 42, name: 'Rex', species: 'canine', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' } }
const recordWithAttachment = {
  id: 7, petId: 42, createdAt: '2026-07-21T00:00:00.000Z',
  attachments: [
    { id: 55, fileName: 'lab.pdf', mimeType: 'application/pdf', fileSize: 20480, fileType: 'lab', createdAt: '2026-07-21T00:00:00.000Z', uploadedByUser: { id: 1, name: 'Dr. Rex' } },
  ],
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  getMock.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/api/search') {
      const q = config?.params?.q as string | undefined
      if (q && q.length >= 2) return Promise.resolve({ data: { data: [{ petId: 42, petName: 'Rex', species: 'canine', ownerName: 'Jane Doe', phone: '0812345678' }] } })
      return Promise.resolve({ data: { data: [] } })
    }
    if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
    if (url === '/api/medical-records') return Promise.resolve({ data: { data: { records: [{ id: 7, createdAt: recordWithAttachment.createdAt }] } } })
    if (url === '/api/medical-records/7') return Promise.resolve({ data: { data: recordWithAttachment } })
    return Promise.resolve({ data: { data: null } })
  })
})

function renderEMR() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClinicEMR />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ClinicEMR — Attachments panel', () => {
  it('renders existing attachment metadata: name, size, uploader, category badge', async () => {
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
    await userEvent.click(await screen.findByText('Rex'))
    await userEvent.click(await screen.findByText('7', { exact: false }).catch(() => screen.findByText(/07\/21|jul/i)))

    expect(await screen.findByText('lab.pdf')).toBeInTheDocument()
    expect(screen.getByText(/20(\.0)? ?KB|20480/i)).toBeInTheDocument()
    expect(screen.getByText('Dr. Rex')).toBeInTheDocument()
    expect(screen.getByText('lab')).toBeInTheDocument()
  })

  it('rejects an oversized file client-side without calling the upload hook', async () => {
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
    await userEvent.click(await screen.findByText('Rex'))
    await screen.findByText('lab.pdf')

    const bigFile = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
    const input = screen.getByTestId('emr-attachment-file-input') as HTMLInputElement
    await userEvent.upload(input, bigFile)

    expect(await screen.findByText(/25 ?MB|too large/i)).toBeInTheDocument()
    expect(postMock).not.toHaveBeenCalledWith(expect.stringContaining('/presign'), expect.anything())
  })

  it('rejects an unsupported file type client-side', async () => {
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
    await userEvent.click(await screen.findByText('Rex'))
    await screen.findByText('lab.pdf')

    const badFile = new File(['<svg></svg>'], 'evil.svg', { type: 'image/svg+xml' })
    const input = screen.getByTestId('emr-attachment-file-input') as HTMLInputElement
    await userEvent.upload(input, badFile)

    expect(await screen.findByText(/not supported|unsupported/i)).toBeInTheDocument()
  })
})
```

(This test intentionally tolerates two ways the record might get selected — via the records list or an implicit auto-select — because the exact record-list interaction isn't the object under test; adjust the second `userEvent.click` to whatever `ClinicEMR.tsx`'s actual record-row selector renders, matching the pattern already used in `ClinicEMR.weightSync.test.tsx`.)

- [ ] **Step 2: Verify failure.**

- [ ] **Step 3: Implement.** In `src/frontend/src/views/clinic/ClinicEMR.tsx`:

Update the `Attachment` interface (top of file, replaces the existing one-liner):

```typescript
interface Attachment {
  id: number
  fileName: string
  fileUrl?: string
  fileType?: string
  mimeType?: string
  fileSize?: number
  storageKey?: string
  uploadedByUser?: { id: number; name: string }
  createdAt?: string
}
```

Add the import (near the other hook imports at the top):

```typescript
import { useEmrAttachmentUpload } from '../../hooks/useEmrAttachmentUpload'
import Can from '../../components/Can'
```

Client-side allow-list (UX pre-check only — design §4.2 step 2, "not the boundary"; kept as a small local constant, deliberately not shared with the backend module since it's cross-package):

```typescript
const CLIENT_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])
const CLIENT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

Inside the `ClinicEMR` component function, alongside the other hooks:

```typescript
  const { uploadAttachment, downloadAttachment, isUploading, uploadError, clearUploadError } = useEmrAttachmentUpload()
  const [attachmentUiError, setAttachmentUiError] = useState<string | null>(null)

  const handleAttachmentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !selectedRecordId) return
    setAttachmentUiError(null)
    clearUploadError()

    if (file.size > CLIENT_MAX_ATTACHMENT_BYTES) {
      setAttachmentUiError('File is too large — the limit is 25 MB.')
      return
    }
    if (!CLIENT_ATTACHMENT_TYPES.has(file.type)) {
      setAttachmentUiError('This file type is not supported.')
      return
    }

    try {
      await uploadAttachment(selectedRecordId, file)
      refetchRecord()
    } catch {
      // uploadError from the hook already carries the server-side message
    }
  }
```

Replace the Attachments panel block (lines ~603–612) with:

```tsx
          {/* Attachments */}
          <div className="p-lg border-b border-outline-variant">
            <div className="flex items-center justify-between mb-md">
              <h4 className="text-body-sm font-semibold text-on-surface-variant">Attachments</h4>
              <Can perm="emr.attach">
                <label className="min-h-[36px] px-md flex items-center gap-xs rounded-lg bg-surface-container text-label-md font-medium text-on-surface-variant hover:bg-surface-container-high cursor-pointer transition-colors">
                  <MaterialIcon name="upload_file" size={16} />
                  {isUploading ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    data-testid="emr-attachment-file-input"
                    className="hidden"
                    disabled={isUploading}
                    onChange={handleAttachmentFileChange}
                  />
                </label>
              </Can>
            </div>

            {(attachmentUiError || uploadError) && (
              <p className="text-label-md text-error mb-sm">{attachmentUiError ?? uploadError}</p>
            )}

            {record?.attachments?.length ? record.attachments.map(a => (
              <div key={a.id} className="flex items-center gap-sm min-h-[44px] border-b border-outline-variant/50 py-xs">
                <MaterialIcon name="attach_file" size={16} className="text-on-surface-variant flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {a.storageKey ? (
                    <button
                      type="button"
                      onClick={() => downloadAttachment(selectedRecordId!, a.id)}
                      className="text-body-sm text-primary truncate hover:underline text-left"
                    >
                      {a.fileName}
                    </button>
                  ) : (
                    <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-body-sm text-primary truncate hover:underline">{a.fileName}</a>
                  )}
                  <p className="text-label-md text-on-surface-variant">
                    {formatFileSize(a.fileSize)}{a.fileSize && a.uploadedByUser ? ' · ' : ''}{a.uploadedByUser?.name}
                  </p>
                </div>
                {a.fileType && <span className="text-label-md bg-surface-container px-sm py-xs rounded-full flex-shrink-0">{a.fileType}</span>}
                <Can perm="emr.attach">
                  <button
                    type="button"
                    aria-label="Delete attachment"
                    onClick={async () => {
                      await api.delete(`/api/medical-records/${selectedRecordId}/attachments/${a.id}`)
                      refetchRecord()
                    }}
                    className="w-[36px] h-[36px] flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors flex-shrink-0"
                  >
                    <MaterialIcon name="delete" size={16} />
                  </button>
                </Can>
              </div>
            )) : <p className="text-label-md text-on-surface-variant">No attachments yet.</p>}
          </div>
```

- [ ] **Step 4: Run tests** — `npx vitest run ClinicEMR.attachments useEmrAttachmentUpload`. Adjust selector-dependent assertions if the actual rendered DOM differs slightly (e.g. exact record-selection interaction) — this is expected polish during TDD's red→green step, not a plan defect.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicEMR.tsx src/frontend/src/__tests__/ClinicEMR.attachments.test.tsx
git commit -m "feat(emr): add upload/download/delete UI to the EMR Attachments panel"
```

---

### Task 15: Full-suite verification

**Files:** none

- [ ] **Step 1: Backend** — `cd D:\Development\AnimalClinic && npx jest --runInBand --forceExit` — all suites green, including the new `emr-attachments.test.ts` (21 tests) and every pre-existing suite (no regressions to `upload.test.ts`, medical-record tests, or any RBAC route-matrix test).
- [ ] **Step 2: Frontend** — run the frontend's existing test script (mirror whatever `package.json` defines, e.g. `npm run test` in `src/frontend`) — all suites green, including the 2 new files (`useEmrAttachmentUpload.test.ts`, `ClinicEMR.attachments.test.tsx`).
- [ ] **Step 3: TypeScript** — `npx tsc --noEmit` in both `src/backend` and `src/frontend` (or the repo's existing typecheck script) — zero errors, in particular around the `Attachment` type's new optional fields and the `addAttachment`/`createAttachment` signature changes threaded through Tasks 6–8.
- [ ] **No commit** — this is the pre-QA gate; if anything is red, return to the relevant task and fix before declaring the plan executed.

---

## Self-review against the design doc's MoSCoW list (EMR-ATTACH-1 .. 13b)

| ID | Requirement | Task(s) | Covered? |
|---|---|---|---|
| EMR-ATTACH-1 | Dedicated EMR presign route, `emr.attach`-gated | 4, 5 | ✅ |
| EMR-ATTACH-2 | Presign validates record ∈ tenant/branch (404 else) | 4 (`getMedicalRecord` call) | ✅ |
| EMR-ATTACH-3 | Presign MIME allow-list | 2, 4 | ✅ (400, not 422 — see Global Constraints) |
| EMR-ATTACH-4 | Presign size cap via signed `Content-Length` | 2, 4 | ✅ (Zod cap = 400; S3-side binding is inherent to `ContentLength` on `PutObjectCommand`, not independently testable against mocked S3) |
| EMR-ATTACH-5 | S3 key namespaced `tenants/{t}/emr/{r}/…` | 4 | ✅ |
| EMR-ATTACH-6 | Confirm persists storageKey/mimeType/fileSize/uploadedByUserId | 6, 7, 8 | ✅ |
| EMR-ATTACH-7 | Confirm rejects mismatched storageKey prefix | 2, 7 | ✅ |
| EMR-ATTACH-8 | Confirm re-validates mimeType | 7 (schema-level `z.enum`) | ✅ |
| EMR-ATTACH-9 | New Attachment DB fields, additive/nullable | 1 | ✅ |
| EMR-ATTACH-10 | Frontend upload UI (pick→presign→PUT→confirm→refetch, progress/errors) | 13, 14 | ✅ |
| EMR-ATTACH-11 | Backend is the sole boundary (testable via API, no UI) | 4, 7 (all `emr-attachments.test.ts` tests are pure API calls) | ✅ |
| EMR-ATTACH-12 | Download route, `emr.view`-gated, presigned GET, `Content-Disposition: attachment` | 10 | ✅ |
| EMR-ATTACH-13 | Delete route, `emr.attach`-gated, billed-guard, audit-logged, removes S3 object | 11 | ✅ (audit via existing global middleware, not new code) |
| EMR-ATTACH-13b | Private-bucket app-level access (no public URL ever returned for EMR attachments) | 10 (download route never returns `fileUrl`/public URL; confirm's response includes `storageKey`, not a public URL) | ✅ (app-level; bucket-policy-level privacy is the tracked, non-blocking F2 infra follow-up) |

**Gap found and fixed during self-review:** the design doc's acceptance criteria (§6) illustrate validation failures as HTTP 422, but the codebase's actual, universal Zod-validation convention (`ValidationError` → 400) would have made every "422" acceptance criterion untestable/wrong if implemented literally. Resolved by documenting the 400 convention explicitly in Global Constraints and writing every test in Task 4/7 against 400 — no code or requirement is left unimplemented, only the illustrative status code in the design doc's prose is superseded by the real codebase convention.

No other gaps found. All 11 MUST + 3 SHOULD items map to a concrete task with real file paths and complete code. COULD items (14–16) and WON'T items are out of scope per the task brief and are not present anywhere in this plan.

---

## Plan complete

This plan is fully specified and saved at `docs/superpowers/plans/2026-07-21-emr-file-attachments.md`. Per CLAUDE.md's Standard Pipeline, **Step 5 (`@ponytail-agent` simplicity gate) runs next** — `/execute-plan` remains blocked until that gate returns APPROVE. No human is present in this run; the gate and subsequent steps proceed autonomously per the scheduled-task protocol already used for the brainstorm/design/grill docs this plan builds on.
