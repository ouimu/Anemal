# Unified Local-Disk Storage Driver (EMR Attachments + Pet Photos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken S3 presign upload paths (EMR attachments + pet photos, both currently 503 STORAGE_NOT_CONFIGURED) with a pluggable `StorageDriver` abstraction and a local-disk implementation, so both upload paths work with zero external setup while staying structured for a future BYO-cloud driver.

**Architecture:** New `StorageDriver` interface (`save`/`read`/`delete`/`exists`) with `LocalDiskDriver` as the only implementation (`src/backend/config/storage-driver.ts`). EMR attachments move from presign→PUT→confirm to a single multipart `POST` that writes through the driver; pet photos move the same way but use a stable per-pet key (overwrite-in-place, no orphans). Both are served back through authenticated, permission-gated backend routes that stream bytes — never a public URL. Frontend collapses to single multipart uploads and adds a shared `AuthedPetImage`/`useAuthedImage` blob-fetch component since `<img src>` cannot carry the Bearer auth header the private routes require.

**Tech Stack:** Node/Express/TypeScript backend (Prisma/Postgres), React 18/Vite frontend, `multer` (new dep, memory storage) for multipart parsing, Jest/supertest (backend), Vitest/Testing Library (frontend).

## PR Split (Ponytail Step-5 ruling, 2026-07-22 — REQUIRED)

The single-PR plan was REJECTED on scope (criteria 4 + 7). Execute as two sequenced PRs; do NOT ship all 19 tasks at once. Same Option A end-state, two PRs.

- **PR1 — EMR fix (fixes the reported 503 bug): Tasks 1, 2, 3, 4, 5, 6, 7, 12.**
  Driver + LocalDiskDriver + G1 boot guard + multer + EMR multipart upload/download/delete + EMR frontend (`useEmrAttachmentUpload` single call + blob download). **Task 12 MUST ride in PR1** — Task 5 deletes the EMR presign route, so shipping backend without the frontend rewrite turns the 503 into a 404. PR1 LEAVES the S3 stack (`config/storage.ts`, `upload.service.ts`) in place — pet-photo still imports it until PR2. Do NOT do Task 11's S3 deletion in PR1.
- **PR2 — pet-photo migration + S3 teardown (fast-follow): Tasks 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19.**
  `photoUrl` schema lock-down, pet-photo routes, `AuthedPetImage`, `usePhotoUpload`, display-site edits, S3-stack deletion + `@aws-sdk` removal (safe here — PR2 removes the last `config/storage.ts` consumer), docs/status-matrix update.

Each PR runs its own Step 6→8 (execute → code-review/qa → finish-branch). PR2 starts after PR1 merges.

## Global Constraints

- Every query that touches `Pet`/`Attachment`/`MedicalRecord` rows MUST be tenant-scoped (`WHERE tenantId = :tenantId`, existing pattern via `getMedicalRecord`/`getPet`) — no new query bypasses this.
- RBAC is deny-by-default: every new/changed route carries an explicit `requirePlane('clinic')` + `requirePermission(code)`, matching the BA-approved matrix (`emr.attach`, `emr.view`, `crm.edit`, `crm.view`).
- TypeScript strict mode; no `any` beyond what already exists in touched files.
- Layered architecture stays Route → Controller → Service → Repository; no route or controller talks to Prisma or the storage driver directly except through a service function.
- No raw hex colors or emoji in any touched UI file (`ClinicPets.tsx`, `ClinicEMR.tsx`, `AuthedPetImage.tsx`) — reuse existing Tailwind/Compassionate Care tokens and `MaterialIcon`.
- Cross-tenant/cross-record access returns 404, never 403, on existence checks (ADR-0014 existence-leak precedent) — already the pattern in `getMedicalRecord`/`getPet`; new pet-photo checks must match it.
- Storage keys are server-built only; no route ever accepts a client-supplied storage key or `photoUrl` for direct use in a `driver.read`/`driver.save` call.
- Local-disk driver is testing-only (ADR-0022 §9) — the G1 boot guard (Task 3) must ship in the same PR as the driver, not be deferred.

---

## Task 1: Relocate `sanitizeFilename` to a shared util

**Files:**
- Create: `src/backend/utils/filename.ts`
- Create: `src/backend/__tests__/filename.test.ts`
- Modify (import only, no behavior change yet): none — `upload.service.ts` and `emr-attachment.service.ts` keep importing the old location until Task 5/11 rewire them.

**Interfaces:**
- Produces: `sanitizeFilename(name: string): string` — strips path-unsafe characters, caps length at 100, exported from `src/backend/utils/filename.ts`. Every later task that builds a storage key (Task 5 EMR, Task 9 pet photo) imports from here.

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/filename.test.ts
import { sanitizeFilename } from '../utils/filename'

describe('sanitizeFilename', () => {
  test('keeps safe characters unchanged', () => {
    expect(sanitizeFilename('lab-result_2026.pdf')).toBe('lab-result_2026.pdf')
  })

  test('replaces path-unsafe characters with underscores', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd')
  })

  test('caps length at 100 characters', () => {
    const long = 'a'.repeat(150) + '.pdf'
    expect(sanitizeFilename(long).length).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest filename.test.ts`
Expected: FAIL — `Cannot find module '../utils/filename'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/backend/utils/filename.ts
// Shared filename-safety control for storage-key construction (relocated
// from upload.service.ts before that file's deletion — ADR-0022 §5).
// Strips path-unsafe characters and caps length; applied by every
// key-builder (EMR attachments, pet photos) so a hostile filename can never
// become part of a filesystem path.
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest filename.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/utils/filename.ts src/backend/__tests__/filename.test.ts
git commit -m "feat(storage): add shared sanitizeFilename util (ADR-0022 prep)"
```

---

## Task 2: `StorageDriver` interface + `LocalDiskDriver`

**Files:**
- Create: `src/backend/config/storage-driver.ts`
- Create: `src/backend/__tests__/storage-driver.test.ts`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: none (leaf module).
- Produces: `interface StorageDriver { save(key, body: Buffer, contentType: string): Promise<void>; read(key): Promise<Buffer>; delete(key): Promise<void>; exists(key): Promise<boolean> }`, `class LocalDiskDriver implements StorageDriver` (constructor takes optional `baseDir: string`, defaults to `process.env.ATTACHMENT_DIR || './attachments'`), `function getStorageDriver(): StorageDriver`, `class StorageKeyError extends AppError`. Task 5 (EMR) and Task 9 (pet photo) call `getStorageDriver()` and use only the `StorageDriver` interface.

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/storage-driver.test.ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import { LocalDiskDriver } from '../config/storage-driver'

describe('LocalDiskDriver', () => {
  let baseDir: string
  let driver: LocalDiskDriver

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-storage-test-'))
    driver = new LocalDiskDriver(baseDir)
  })

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true })
  })

  test('save() writes the buffer, creating parent directories as needed', async () => {
    await driver.save('tenants/1/emr/2/file.pdf', Buffer.from('hello'), 'application/pdf')
    const written = fs.readFileSync(path.join(baseDir, 'tenants/1/emr/2/file.pdf'))
    expect(written.toString()).toBe('hello')
  })

  test('read() round-trips the exact bytes previously saved', async () => {
    await driver.save('a/b.txt', Buffer.from('round-trip'), 'text/plain')
    const buf = await driver.read('a/b.txt')
    expect(buf.toString()).toBe('round-trip')
  })

  test('exists() is false before save and true after', async () => {
    expect(await driver.exists('never/written.txt')).toBe(false)
    await driver.save('now/written.txt', Buffer.from('x'), 'text/plain')
    expect(await driver.exists('now/written.txt')).toBe(true)
  })

  test('delete() on a missing file does not throw (idempotent)', async () => {
    await expect(driver.delete('nothing/here.txt')).resolves.toBeUndefined()
  })

  test('save()/read()/delete()/exists() all reject a relative-traversal key', async () => {
    const evilKey = '../../etc/passwd'
    await expect(driver.save(evilKey, Buffer.from('x'), 'text/plain')).rejects.toThrow(/invalid storage key/i)
    await expect(driver.read(evilKey)).rejects.toThrow(/invalid storage key/i)
    await expect(driver.delete(evilKey)).rejects.toThrow(/invalid storage key/i)
    await expect(driver.exists(evilKey)).rejects.toThrow(/invalid storage key/i)
  })

  test('save() rejects an absolute-path key', async () => {
    const absoluteKey = path.resolve(os.tmpdir(), 'outside-basedir.txt')
    await expect(driver.save(absoluteKey, Buffer.from('x'), 'text/plain')).rejects.toThrow(/invalid storage key/i)
  })

  test('ATTACHMENT_DIR env var overrides the default base dir when no baseDir arg is given', async () => {
    const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-storage-env-'))
    const original = process.env.ATTACHMENT_DIR
    process.env.ATTACHMENT_DIR = envDir
    try {
      const envDriver = new LocalDiskDriver()
      await envDriver.save('probe.txt', Buffer.from('env'), 'text/plain')
      expect(fs.readFileSync(path.join(envDir, 'probe.txt')).toString()).toBe('env')
    } finally {
      if (original === undefined) delete process.env.ATTACHMENT_DIR
      else process.env.ATTACHMENT_DIR = original
      fs.rmSync(envDir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-driver.test.ts`
Expected: FAIL — `Cannot find module '../config/storage-driver'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/backend/config/storage-driver.ts
// Pluggable storage abstraction (ADR-0022). LocalDiskDriver is the only
// implementation now — a future BYO-cloud driver implements the same
// StorageDriver interface, and getStorageDriver() becomes the switch point.
import { promises as fs } from 'fs'
import path from 'path'
import { AppError } from '../utils/errors'

export interface StorageDriver {
  save(key: string, body: Buffer, contentType: string): Promise<void>
  read(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

export class StorageKeyError extends AppError {
  constructor(key: string) {
    super(400, `Invalid storage key: ${key}`, 'INVALID_STORAGE_KEY_PATH')
  }
}

// Trust-boundary check (do not simplify away): resolves the key against
// baseDir and asserts the result stays inside baseDir. Catches both `..`
// relative traversal and absolute-path keys (path.relative to a
// different-drive/root absolute path returns an absolute string itself,
// which the isAbsolute check below also rejects).
function resolveSafePath(baseDir: string, key: string): string {
  const resolvedBase = path.resolve(baseDir)
  const resolvedTarget = path.resolve(resolvedBase, key)
  const relative = path.relative(resolvedBase, resolvedTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new StorageKeyError(key)
  }
  return resolvedTarget
}

export class LocalDiskDriver implements StorageDriver {
  private readonly baseDir: string

  constructor(baseDir: string = process.env.ATTACHMENT_DIR || './attachments') {
    this.baseDir = baseDir
  }

  async save(key: string, body: Buffer, _contentType: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body)
  }

  async read(key: string): Promise<Buffer> {
    const target = resolveSafePath(this.baseDir, key)
    return fs.readFile(target)
  }

  async delete(key: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.unlink(target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }
}

export function getStorageDriver(): StorageDriver {
  return new LocalDiskDriver()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-driver.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Add the `.gitignore` entry**

Add this line to `.gitignore` (repo root), after the existing `coverage/` line:

```
attachments/
```

- [ ] **Step 6: Commit**

```bash
git add src/backend/config/storage-driver.ts src/backend/__tests__/storage-driver.test.ts .gitignore
git commit -m "feat(storage): add StorageDriver interface + LocalDiskDriver (ADR-0022)"
```

---

## Task 3: Production boot guard (grill G1)

**Files:**
- Modify: `src/backend/config/env.ts`
- Create: `src/backend/__tests__/env.storageGuard.test.ts`

**Interfaces:**
- Consumes: `process.env.NODE_ENV`, `process.env.ALLOW_LOCAL_STORAGE_IN_PROD`.
- Produces: none new — this is a side-effecting module-load guard, not a function other tasks call.

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/env.storageGuard.test.ts
describe('config/env — production local-storage boot guard (G1)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV
  const ORIGINAL_ALLOW    = process.env.ALLOW_LOCAL_STORAGE_IN_PROD

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV
    if (ORIGINAL_ALLOW === undefined) delete process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    else process.env.ALLOW_LOCAL_STORAGE_IN_PROD = ORIGINAL_ALLOW
    jest.resetModules()
  })

  test('NODE_ENV=production without ALLOW_LOCAL_STORAGE_IN_PROD throws on import', () => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    delete process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    expect(() => require('../config/env')).toThrow(/local-disk storage driver is testing-only/i)
  })

  test('NODE_ENV=production with ALLOW_LOCAL_STORAGE_IN_PROD=true does not throw', () => {
    jest.resetModules()
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_LOCAL_STORAGE_IN_PROD = 'true'
    expect(() => require('../config/env')).not.toThrow()
  })

  test('NODE_ENV=development does not throw regardless of ALLOW_LOCAL_STORAGE_IN_PROD', () => {
    jest.resetModules()
    process.env.NODE_ENV = 'development'
    delete process.env.ALLOW_LOCAL_STORAGE_IN_PROD
    expect(() => require('../config/env')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest env.storageGuard.test.ts`
Expected: FAIL — first test expects a throw that doesn't happen yet.

- [ ] **Step 3: Write minimal implementation**

Append to the end of `src/backend/config/env.ts` (after the existing `export const config = {...}` block):

```ts
// G1 (ADR-0022): the local-disk storage driver is testing-only — it pools
// every tenant's files on the operator's server and loses them on every
// redeploy. Refuse to boot in production unless explicitly overridden.
if (config.nodeEnv === 'production' && process.env.ALLOW_LOCAL_STORAGE_IN_PROD !== 'true') {
  throw new Error(
    'Local-disk storage driver is testing-only and must not run in production. ' +
    'Set ALLOW_LOCAL_STORAGE_IN_PROD=true to override (not recommended; see ADR-0022).'
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest env.storageGuard.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/env.ts src/backend/__tests__/env.storageGuard.test.ts
git commit -m "feat(storage): boot guard blocks local-disk driver in production (grill G1)"
```

---

## Task 4: Add `multer` dependency

**Files:**
- Modify: `src/backend/package.json`

**Interfaces:**
- Produces: the `multer` module + `req.file`/`req.files` ambient типing via `@types/multer`, consumed by Task 5 (`medical-record.routes.ts`) and Task 9 (`pet.routes.ts`).

- [ ] **Step 1: Install the dependency**

Run (from `src/backend`):

```bash
cd src/backend
npm install multer@^1.4.5-lts.1
npm install --save-dev @types/multer@^1.4.11
```

- [ ] **Step 2: Verify install**

Run: `cd src/backend && npm ls multer`
Expected: `vetclinic-backend@0.1.0 ... └── multer@1.4.5-lts.1` (or the resolved version), no `UNMET DEPENDENCY` error.

- [ ] **Step 3: Commit**

```bash
git add src/backend/package.json src/backend/package-lock.json
git commit -m "chore(storage): add multer for multipart upload parsing"
```

---

## Task 5: EMR multipart upload (replaces presign) + preserves legacy fileUrl registration

This is the largest task — it touches the repository, service, controller, and route layers for EMR attachment creation, and rewrites the upload-related tests. `POST /:id/attachments/presign` is retired here (its schema/controller function are deleted); `POST /:id/attachments` becomes dual-mode: multipart file → new driver-backed upload, JSON body → the existing "register a URL reference" capability from ADR-0021 (verified live via the `EA-10`/backward-compat test in the current suite — this capability is preserved, not dropped).

**Files:**
- Modify: `src/backend/models/medical-record.repository.ts`
- Modify: `src/backend/services/medical-record.service.ts`
- Modify: `src/backend/services/emr-attachment.service.ts`
- Modify: `src/backend/controllers/emr-attachment.controller.ts`
- Modify: `src/backend/controllers/medical-record.controller.ts`
- Modify: `src/backend/routes/medical-record.routes.ts`
- Rewrite: `src/backend/__tests__/emr-attachments.test.ts` (full rewrite — presign describe block and storageKey-confirm tests dropped, multipart tests added; download/delete describe blocks land here too since Step 1 below writes the whole file at once for a coherent test cycle across Tasks 5–7)

**Interfaces:**
- Consumes: `getStorageDriver()` (Task 2), `sanitizeFilename()` (Task 1), `EMR_ATTACHMENT_MIME_ALLOWLIST`/`EMR_ATTACHMENT_MAX_SIZE_BYTES`/`assertStorageKeyPrefix` (existing `emr-attachment.constants.ts`, unchanged), `getMedicalRecord(tenantId, branchId, id)` (existing).
- Produces: `recordRepo.createAttachment(tenantId, medicalRecordId, data: AttachmentCreateData, uploadedByUserId: number | null)` — `AttachmentCreateData` is a new local interface (decoupled from any zod schema) with fields `{fileName, fileUrl?, storageKey?, mimeType?, fileSizeBytes?, fileType?}`. `registerAttachmentUrlSchema`/`registerAttachmentUrl(tenantId, branchId, medicalRecordId, data)` (medical-record.service.ts, JSON fileUrl-only path). `uploadEmrAttachment(tenantId, branchId, medicalRecordId, file: {buffer, mimetype, originalname, size}, fileType, uploadedByUserId)` (emr-attachment.service.ts). `handleAttachmentSubmit` (emr-attachment.controller.ts) — the single controller both Task 6 (download) and Task 7 (delete) sit beside in the same file. Task 6 consumes `getAttachmentFileForDownload`; Task 7 consumes `deleteAttachment` — both declared as stubs here so the file compiles, fully implemented in their own tasks.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/backend/__tests__/emr-attachments.test.ts`:

```ts
// src/backend/__tests__/emr-attachments.test.ts
/**
 * Test Suite: emr-attachments — EMR file attachment upload/download/delete
 * @qa-agent | ADR-0022 (local-disk storage driver) | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * Files are written to a real temp directory (ATTACHMENT_DIR) — no mocking
 * of the storage layer, since LocalDiskDriver has no external dependency.
 * Run: npx jest --testPathPattern=emr-attachments
 */
import request from 'supertest'
import { Server } from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

let server: Server
let tenantId: number
let branchId: number
let doctorToken: string
let staffToken: string
let adminToken: string
let medicalRecordId: number
let doctorUserId: number
let attachmentDir: string

const SUBDOMAIN = `emr-attach-test-${Date.now()}`

beforeAll(async () => {
  attachmentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-emr-attach-'))
  process.env.ATTACHMENT_DIR = attachmentDir

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

  const owner = await prisma.owner.create({ data: { tenantId, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  const record = await prisma.medicalRecord.create({
    data: { tenantId, branchId, petId: pet.id, doctorId: doctorUser.id, assessment: 'Checkup' },
  })
  medicalRecordId = record.id
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
  fs.rmSync(attachmentDir, { recursive: true, force: true })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('emr-attachments — POST /:id/attachments (multipart upload)', () => {

  test('EA-01: doctor uploads a PDF — 201, file lands on disk, row created', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'lab-result.pdf', contentType: 'application/pdf' })
      .field('fileType', 'lab')
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.storageKey).toMatch(new RegExp(`^tenants/${tenantId}/emr/${medicalRecordId}/.+lab-result\\.pdf$`))
    expect(res.body.data.mimeType).toBe('application/pdf')
    expect(res.body.data.uploadedByUserId).toBe(doctorUserId)
    const onDisk = path.join(attachmentDir, res.body.data.storageKey)
    expect(fs.existsSync(onDisk)).toBe(true)
    expect(fs.readFileSync(onDisk).toString()).toBe('%PDF-1.4 fake')
  })

  test('EA-02: staff (clinic_staff) also gets 201', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('jpeg-bytes'), { filename: 'xray.jpg', contentType: 'image/jpeg' })
      .expect(201)
  })

  test('EA-03: disallowed MIME type (SVG) → 400, no file/row created', async () => {
    const before = await prisma.attachment.count({ where: { tenantId, medicalRecordId } })
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('<svg></svg>'), { filename: 'evil.svg', contentType: 'image/svg+xml' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(await prisma.attachment.count({ where: { tenantId, medicalRecordId } })).toBe(before)
  })

  test('EA-04: oversized file (26 MB) → 400, no file/row created', async () => {
    const before = await prisma.attachment.count({ where: { tenantId, medicalRecordId } })
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.alloc(26 * 1024 * 1024, 1), { filename: 'huge.pdf', contentType: 'application/pdf' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(await prisma.attachment.count({ where: { tenantId, medicalRecordId } })).toBe(before)
  })

  test('EA-05: user without emr.attach → 403', async () => {
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staffPerms = await prisma.rolePermission.findMany({ where: { roleId: staffRole.id } })
    const noAttachRole = await prisma.clinicRole.create({ data: { tenantId, key: 'no_emr_attach_staff', name: 'No-EMR-Attach Staff', isSystem: false } })
    for (const rp of staffPerms) {
      if (rp.permissionCode === 'emr.attach') continue
      await prisma.rolePermission.create({ data: { roleId: noAttachRole.id, permissionCode: rp.permissionCode } })
    }
    const ts = Date.now() % 100000
    const noAttachUser = await prisma.user.create({
      data: { tenantId, branchId, name: 'No Attach', username: `no_attach_${ts}`, email: `no-attach-${ts}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: noAttachRole.id },
    })
    await prisma.userRole.create({ data: { userId: noAttachUser.id, roleId: noAttachRole.id, tenantId } })
    const noAttachToken = signToken({ userId: noAttachUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })

    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${noAttachToken}`)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(403)
  })

  test('EA-06: foreign-tenant record → 404 (existence-leak precedent, ADR-0014)', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other EMR Tenant', subdomain: `${SUBDOMAIN}-other` } })
    const otherBranch = await prisma.branch.create({ data: { tenantId: otherTenant.id, name: 'Main' } })
    const otherDoctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const otherDoctor = await prisma.user.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, name: 'Other Doc', username: `other_doc_${Date.now() % 100000}`, email: `other-${Date.now()}@test.local`, passwordHash: await bcrypt.hash('TestPass1!', 4), roleId: otherDoctorRole.id },
    })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Bob', lastName: 'Lee', phone: '0811111111' } })
    const otherPet = await prisma.pet.create({ data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Fido', species: 'canine' } })
    const otherRecord = await prisma.medicalRecord.create({
      data: { tenantId: otherTenant.id, branchId: otherBranch.id, petId: otherPet.id, doctorId: otherDoctor.id },
    })

    const res = await request(server)
      .post(`/api/medical-records/${otherRecord.id}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`) // doctorToken belongs to the FIRST tenant
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(404)
    expect(res.body.success).toBe(false)

    await prisma.medicalRecord.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.branch.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

  test('EA-07: no token → 401', async () => {
    await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(401)
  })

})

describe('emr-attachments — POST /:id/attachments (fileUrl registration, backward-compat)', () => {

  test('EA-08: legacy fileUrl-only JSON registration still works (ADR-0021 backward-compat, uploadedByUserId stays null)', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'referral.pdf', fileUrl: 'https://portal.example.com/referral.pdf', fileType: 'other' })
      .expect(201)

    expect(res.body.data.fileUrl).toBe('https://portal.example.com/referral.pdf')
    expect(res.body.data.storageKey).toBeNull()
    expect(res.body.data.uploadedByUserId).toBeNull()
  })

  test('EA-09: neither file nor fileUrl → 400 VALIDATION_ERROR', async () => {
    const res = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ fileName: 'x.pdf' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

})

describe('emr-attachments — GET /:id/attachments/:attId/download', () => {
  let attachmentId: number
  let storageKey: string

  beforeAll(async () => {
    storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/dl-uuid-download-me.pdf`
    fs.mkdirSync(path.dirname(path.join(attachmentDir, storageKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, storageKey), 'pdf-bytes-here')
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'download-me.pdf', storageKey, mimeType: 'application/pdf', fileSize: 555, uploadedByUserId: doctorUserId },
    })
    attachmentId = a.id
  })

  test('EA-10: emr.view holder (doctor) streams the correct bytes + headers', async () => {
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200)
    expect(res.text).toBe('pdf-bytes-here')
    expect(res.headers['content-type']).toContain('application/pdf')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.headers['content-disposition']).toContain('download-me.pdf')
  })

  test('EA-11: role without emr.view → 403', async () => {
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

  test('EA-12: foreign-tenant attachment id → 404', async () => {
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/999999/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)
  })

  test('EA-13: row exists but file missing on disk (data drift) → 404', async () => {
    const driftKey = `tenants/${tenantId}/emr/${medicalRecordId}/missing-uuid-ghost.pdf`
    const drift = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'ghost.pdf', storageKey: driftKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    const res = await request(server)
      .get(`/api/medical-records/${medicalRecordId}/attachments/${drift.id}/download`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)
    await prisma.attachment.delete({ where: { id: drift.id } })
  })

})

describe('emr-attachments — DELETE /:id/attachments/:attId', () => {

  test('EA-14: doctor deletes an attachment — 204, row AND file removed', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/del-uuid-to-delete.pdf`
    fs.mkdirSync(path.dirname(path.join(attachmentDir, storageKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, storageKey), 'bytes')
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'to-delete.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)

    expect(await prisma.attachment.findUnique({ where: { id: a.id } })).toBeNull()
    expect(fs.existsSync(path.join(attachmentDir, storageKey))).toBe(false)
  })

  test('EA-15: delete tolerates an already-missing file — row still removed, no 500', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/already-gone.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'already-gone.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)
    expect(await prisma.attachment.findUnique({ where: { id: a.id } })).toBeNull()
  })

  test('EA-16: delete blocked (403) when parent record has a paid invoice (BR-6)', async () => {
    const billedOwner = await prisma.owner.create({ data: { tenantId, firstName: 'Ann', lastName: 'Lee', phone: '0822222222' } })
    const billedPet = await prisma.pet.create({ data: { tenantId, ownerId: billedOwner.id, name: 'Billed Pet', species: 'feline' } })
    const billedRecord = await prisma.medicalRecord.create({ data: { tenantId, branchId, petId: billedPet.id, doctorId: doctorUserId } })
    await prisma.invoice.create({
      data: { tenantId, medicalRecordId: billedRecord.id, petId: billedPet.id, invoiceNo: `INV-EMR-TEST-${Date.now()}`, subtotal: 100, taxRate: 7, taxAmount: 7, totalAmount: 107, paymentStatus: 'paid' },
    })
    const storageKey = `tenants/${tenantId}/emr/${billedRecord.id}/uuid-billed.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId: billedRecord.id, fileName: 'billed.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })

    const res = await request(server)
      .delete(`/api/medical-records/${billedRecord.id}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403)
    expect(res.body.success).toBe(false)
    expect(await prisma.attachment.findUnique({ where: { id: a.id } })).not.toBeNull()
  })

  test('EA-17: clinic_admin holds emr.attach per live RBAC seed → delete succeeds', async () => {
    const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/uuid-admin.pdf`
    const a = await prisma.attachment.create({
      data: { tenantId, medicalRecordId, fileName: 'admin-can-delete.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
    })
    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204)
  })

})

describe('emr-attachments — audit trail', () => {
  test('EA-18: upload/delete each produce an AuditLog row via the existing global audit middleware', async () => {
    const before = await prisma.auditLog.count({ where: { tenantId } })

    const uploadRes = await request(server)
      .post(`/api/medical-records/${medicalRecordId}/attachments`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('audited'), { filename: 'audited.pdf', contentType: 'application/pdf' })
      .expect(201)

    await request(server)
      .delete(`/api/medical-records/${medicalRecordId}/attachments/${uploadRes.body.data.id}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(204)

    await new Promise((r) => setTimeout(r, 50))

    const after = await prisma.auditLog.count({ where: { tenantId } })
    expect(after).toBeGreaterThanOrEqual(before + 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest emr-attachments.test.ts`
Expected: FAIL — EA-01 etc. hit the still-live presign-based route/handlers; the multipart POST returns whatever the old `addAttachmentSchema` JSON-only validator does with a multipart body (400), and `storageKey` assertions on the response don't match.

- [ ] **Step 3: Implement — repository, service, controller, route**

`src/backend/models/medical-record.repository.ts` — replace the `createAttachment` function and its import line:

```ts
// replace this import line:
// import type { CreateMedicalRecordInput, UpdateMedicalRecordInput, AddAttachmentInput } from '../services/medical-record.service'
import type { CreateMedicalRecordInput, UpdateMedicalRecordInput } from '../services/medical-record.service'
```

```ts
// replace the existing createAttachment function with:
export interface AttachmentCreateData {
  fileName:       string
  fileUrl?:       string | null
  storageKey?:    string | null
  mimeType?:      string | null
  fileSizeBytes?: number | null
  fileType?:      string | null
}

export function createAttachment(
  tenantId: number,
  medicalRecordId: number,
  data: AttachmentCreateData,
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
```

`src/backend/services/medical-record.service.ts` — replace the `addAttachmentSchema`/`addAttachment` section:

```ts
// remove the old import line:
// import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES, assertStorageKeyPrefix } from './emr-attachment.constants'
// (this file no longer needs anything from emr-attachment.constants.ts)
```

```ts
// remove addAttachmentSchema, AddAttachmentInput, and addAttachment entirely, replace with:
export const registerAttachmentUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl:  z.string().url(),
  fileType: z.enum(['lab', 'xray', 'photo', 'other']).optional(),
})

export type RegisterAttachmentUrlInput = z.infer<typeof registerAttachmentUrlSchema>

/**
 * Register a URL-reference attachment (ADR-0021 backward-compat — a
 * non-upload way to attach an externally-hosted file, e.g. a referral
 * letter link). `uploadedByUserId` stays null: a URL reference doesn't
 * correspond to an in-app upload action (EMR-ATTACH-9).
 */
export async function registerAttachmentUrl(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  data: RegisterAttachmentUrlInput,
) {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  return recordRepo.createAttachment(
    tenantId, medicalRecordId,
    { fileName: data.fileName, fileUrl: data.fileUrl, fileType: data.fileType },
    null,
  )
}
```

`src/backend/services/emr-attachment.service.ts` — replace the upload portion (leave `getAttachmentFileForDownload`/`deleteAttachment` as stubs for now, filled in Tasks 6–7):

```ts
// src/backend/services/emr-attachment.service.ts
import { randomUUID } from 'crypto'
import { AppError } from '../utils/errors'
import { getStorageDriver } from '../config/storage-driver'
import { sanitizeFilename } from '../utils/filename'
import { getMedicalRecord, MedicalRecordError } from './medical-record.service'
import * as recordRepo from '../models/medical-record.repository'
import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES } from './emr-attachment.constants'

export interface EmrUploadFile {
  buffer:       Buffer
  mimetype:     string
  originalname: string
  size:         number
}

/**
 * Store an EMR attachment via the active StorageDriver and create its row.
 * The server builds the storageKey (client never supplies one) — this
 * eliminates the IDOR vector the old presign-confirm flow needed
 * assertStorageKeyPrefix to defend on upload (BA sign-off §2.2).
 */
export async function uploadEmrAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  file: EmrUploadFile,
  fileType: string | undefined,
  uploadedByUserId: number,
) {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)

  if (!(EMR_ATTACHMENT_MIME_ALLOWLIST as readonly string[]).includes(file.mimetype)) {
    throw new AppError(400, 'File type not allowed', 'VALIDATION_ERROR')
  }
  if (file.size > EMR_ATTACHMENT_MAX_SIZE_BYTES) {
    throw new AppError(400, 'File exceeds the 25 MB limit', 'VALIDATION_ERROR')
  }

  const safeName   = sanitizeFilename(file.originalname)
  const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/${randomUUID()}-${safeName}`
  const driver     = getStorageDriver()

  await driver.save(storageKey, file.buffer, file.mimetype)

  try {
    return await recordRepo.createAttachment(
      tenantId,
      medicalRecordId,
      { fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSizeBytes: file.size, fileType: fileType ?? null },
      uploadedByUserId,
    )
  } catch (err) {
    await driver.delete(storageKey)
    throw err
  }
}

// Implemented in Task 6.
export async function getAttachmentFileForDownload(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  throw new MedicalRecordError('Not implemented', 501)
}

// Implemented in Task 7.
export async function deleteAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<void> {
  throw new MedicalRecordError('Not implemented', 501)
}
```

`src/backend/controllers/emr-attachment.controller.ts` — full rewrite:

```ts
// src/backend/controllers/emr-attachment.controller.ts
import { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../utils/errors'
import { uploadEmrAttachment, getAttachmentFileForDownload, deleteAttachment } from '../services/emr-attachment.service'
import { registerAttachmentUrl, registerAttachmentUrlSchema } from '../services/medical-record.service'

/**
 * Dual-mode POST /:id/attachments: a multipart request (req.file present,
 * set by the multer middleware in the route) is a real file upload; a JSON
 * request is a legacy URL-reference registration (ADR-0021 backward-compat).
 */
export async function handleAttachmentSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const medicalRecordId = parseInt(req.params.id)

    if (req.file) {
      const fileType = typeof req.body?.fileType === 'string' ? req.body.fileType : undefined
      const data = await uploadEmrAttachment(
        req.context!.tenantId,
        req.context?.branchId,
        medicalRecordId,
        { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname, size: req.file.size },
        fileType,
        req.context!.userId,
      )
      res.status(201).json({ success: true, data })
      return
    }

    const parsed = registerAttachmentUrlSchema.safeParse(req.body)
    if (!parsed.success) {
      next(new ValidationError(parsed.error.flatten()))
      return
    }
    const data = await registerAttachmentUrl(req.context!.tenantId, req.context?.branchId, medicalRecordId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleDownloadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await getAttachmentFileForDownload(
      req.context!.tenantId,
      req.context?.branchId,
      parseInt(req.params.id),
      parseInt(req.params.attId),
    )
    res.setHeader('Content-Type', file.mimeType)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`)
    res.send(file.buffer)
  } catch (err) { next(err) }
}

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

`src/backend/controllers/medical-record.controller.ts` — remove `handleAddAttachment` and the now-unused `addAttachment` import:

```ts
// replace the import line:
// import { listMedicalRecords, getMedicalRecord, createMedicalRecord, updateMedicalRecord, addAttachment } from '../services/medical-record.service'
import { listMedicalRecords, getMedicalRecord, createMedicalRecord, updateMedicalRecord } from '../services/medical-record.service'
// and delete the handleAddAttachment function (lines 39-50) entirely.
```

`src/backend/routes/medical-record.routes.ts` — full rewrite:

```ts
import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord,
} from '../controllers/medical-record.controller'
import { handleAttachmentSubmit, handleDownloadAttachment, handleDeleteAttachment } from '../controllers/emr-attachment.controller'
import { createMedicalRecordSchema, updateMedicalRecordSchema } from '../services/medical-record.service'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()
router.use(authMiddleware)

router.get('/',                          requirePlane('clinic'), requirePermission('emr.view'),   handleListMedicalRecords)
router.get('/:id',                       requirePlane('clinic'), requirePermission('emr.view'),   handleGetMedicalRecord)
router.post('/',                         requirePlane('clinic'), requirePermission('emr.create'), validate(createMedicalRecordSchema), handleCreateMedicalRecord)
router.put('/:id',                       requirePlane('clinic'), requirePermission('emr.edit'),   validate(updateMedicalRecordSchema), handleUpdateMedicalRecord)
router.post('/:id/attachments',          requirePlane('clinic'), requirePermission('emr.attach'), upload.single('file'), handleAttachmentSubmit)
router.get('/:id/attachments/:attId/download', requirePlane('clinic'), requirePermission('emr.view'), handleDownloadAttachment)
router.delete('/:id/attachments/:attId', requirePlane('clinic'), requirePermission('emr.attach'), handleDeleteAttachment)

export default router
```

- [ ] **Step 4: Run test to verify the upload/registration describe blocks pass**

Run: `cd src/backend && npx jest emr-attachments.test.ts -t "multipart upload|fileUrl registration"`
Expected: PASS (11 tests: EA-01..EA-09). The download/delete/audit describe blocks (EA-10..EA-18) still FAIL at 501 — expected, they're completed in Tasks 6–7.

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/medical-record.repository.ts src/backend/services/medical-record.service.ts \
        src/backend/services/emr-attachment.service.ts src/backend/controllers/emr-attachment.controller.ts \
        src/backend/controllers/medical-record.controller.ts src/backend/routes/medical-record.routes.ts \
        src/backend/__tests__/emr-attachments.test.ts
git commit -m "feat(emr): multipart attachment upload via StorageDriver, retire presign (ADR-0022)"
```

---

## Task 6: EMR authenticated streaming download

**Files:**
- Modify: `src/backend/services/emr-attachment.service.ts`

**Interfaces:**
- Consumes: `assertStorageKeyPrefix` (existing `emr-attachment.constants.ts`), `getStorageDriver()` (Task 2), `recordRepo.findAttachmentById` (existing, unchanged).
- Produces: `getAttachmentFileForDownload(tenantId, branchId, medicalRecordId, attachmentId): Promise<{buffer: Buffer, mimeType: string, fileName: string}>` — replaces the Task 5 stub. `handleDownloadAttachment` (Task 5) already calls this signature.

- [ ] **Step 1: Tests already written in Task 5** (EA-10..EA-13 in `emr-attachments.test.ts`) — no new test file needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest emr-attachments.test.ts -t "download"`
Expected: FAIL — 501 from the Task 5 stub.

- [ ] **Step 3: Write minimal implementation**

In `src/backend/services/emr-attachment.service.ts`, replace the stub `getAttachmentFileForDownload` with:

```ts
import { assertStorageKeyPrefix } from './emr-attachment.constants'
// (add assertStorageKeyPrefix to the existing named import from './emr-attachment.constants')
```

```ts
export interface AttachmentFile {
  buffer:   Buffer
  mimeType: string
  fileName: string
}

/**
 * Read an EMR attachment's bytes for authenticated streaming download.
 * `Content-Disposition: attachment` (set by the controller) forces a
 * download rather than inline rendering — closes the SVG/HTML XSS vector
 * at the browser (carried over from ADR-0021 F2). assertStorageKeyPrefix
 * is defense-in-depth here (the value comes from a tenant/record-scoped DB
 * row, not the client — BA sign-off §2.2).
 */
export async function getAttachmentFileForDownload(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  attachmentId: number,
): Promise<AttachmentFile> {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  const attachment = await recordRepo.findAttachmentById(tenantId, medicalRecordId, attachmentId)
  if (!attachment) throw new MedicalRecordError('Attachment not found', 404)
  if (!attachment.storageKey) throw new MedicalRecordError('This attachment is a URL reference, not a stored file', 400)

  assertStorageKeyPrefix(tenantId, medicalRecordId, attachment.storageKey)

  const driver = getStorageDriver()
  if (!(await driver.exists(attachment.storageKey))) {
    throw new MedicalRecordError('Attachment file is missing', 404)
  }
  const buffer = await driver.read(attachment.storageKey)
  return { buffer, mimeType: attachment.mimeType ?? 'application/octet-stream', fileName: attachment.fileName }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest emr-attachments.test.ts -t "download"`
Expected: PASS (4 tests: EA-10..EA-13)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/emr-attachment.service.ts
git commit -m "feat(emr): authenticated streaming download via StorageDriver (ADR-0022)"
```

---

## Task 7: EMR delete via driver

**Files:**
- Modify: `src/backend/services/emr-attachment.service.ts`

**Interfaces:**
- Consumes: `getStorageDriver()` (Task 2), `recordRepo.findAttachmentById`/`deleteAttachmentById` (existing).
- Produces: `deleteAttachment(tenantId, branchId, medicalRecordId, attachmentId): Promise<void>` — replaces the Task 5 stub.

- [ ] **Step 1: Tests already written in Task 5** (EA-14..EA-18) — no new test file needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest emr-attachments.test.ts -t "DELETE|audit trail"`
Expected: FAIL — 501 from the Task 5 stub.

- [ ] **Step 3: Write minimal implementation**

Replace the stub `deleteAttachment` in `src/backend/services/emr-attachment.service.ts`:

```ts
/**
 * Delete an EMR attachment. Mirrors updateMedicalRecord's billed-record
 * guard (BR-6) — once the parent medical record has a paid invoice, its
 * attachments are frozen. driver.delete is idempotent (tolerates an
 * already-missing file), so prior data drift never blocks row deletion.
 */
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

  if (attachment.storageKey) {
    await getStorageDriver().delete(attachment.storageKey)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest emr-attachments.test.ts`
Expected: PASS (all 18 tests in the file)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/emr-attachment.service.ts
git commit -m "feat(emr): delete attachment via StorageDriver (ADR-0022)"
```

---

## Task 8: Remove client-writable `photoUrl` from pet schemas (security fix, BA §2.3)

**Files:**
- Modify: `src/backend/services/pet.service.ts`
- Create: `src/backend/__tests__/pet-photo.test.ts` (this task writes only its own test into the file; Tasks 9–10 append to it)

**Interfaces:**
- Consumes: none new.
- Produces: `createPetSchema`/`updatePetSchema` with `photoUrl` removed — `updatePetSchema` is derived via `.partial()` from `createPetSchema`, so removing it there removes it from both automatically.

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/pet-photo.test.ts
import request from 'supertest'
import { Server } from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

let server: Server
let tenantId: number
let branchId: number
let staffToken: string
let doctorToken: string
let petId: number
let attachmentDir: string

const SUBDOMAIN = `pet-photo-test-${Date.now()}`

beforeAll(async () => {
  attachmentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-pet-photo-'))
  process.env.ATTACHMENT_DIR = attachmentDir

  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'Pet Photo Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  branchId = branch.id

  const ts = Date.now() % 100000
  const staffRole  = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })

  const staffUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Photo Staff', username: `photo_staff_${ts}`, email: `photo-staff-${ts}@test.local`, passwordHash: hash, roleId: staffRole.id },
  })
  const doctorUser = await prisma.user.create({
    data: { tenantId, branchId, name: 'Photo Doctor', username: `photo_doc_${ts}`, email: `photo-doc-${ts}@test.local`, passwordHash: hash, roleId: doctorRole.id },
  })

  await seedUserRoles(prisma, [
    { userId: staffUser.id,  tenantId, roleKey: 'clinic_staff' },
    { userId: doctorUser.id, tenantId, roleKey: 'doctor' },
  ])

  staffToken  = signToken({ userId: staffUser.id,  tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'staff' })
  doctorToken = signToken({ userId: doctorUser.id, tenantId, branchId, plane: 'clinic', permSetVersion: 1, role: 'doctor' })

  const owner = await prisma.owner.create({ data: { tenantId, firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } })
  const pet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'Rex', species: 'canine' } })
  petId = pet.id
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.pet.deleteMany({ where: { tenantId } })
  await prisma.owner.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  fs.rmSync(attachmentDir, { recursive: true, force: true })
})

describe('pet.service — photoUrl is server-managed only (BA §2.3 R-1)', () => {
  test('PP-08: creating a pet does not accept a client-supplied photoUrl', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const res = await request(server)
      .post('/api/pets')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ ownerId: owner.id, name: 'Whiskers', species: 'feline', photoUrl: 'tenants/999/photo/pet-1.jpg' })
      .expect(201)
    expect(res.body.data.photoUrl).toBeNull()
    await prisma.pet.delete({ where: { id: res.body.data.id } })
  })

  test('PP-08b: updating a pet does not accept a client-supplied photoUrl', async () => {
    const res = await request(server)
      .put(`/api/pets/${petId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ photoUrl: 'tenants/999/photo/forged.jpg' })
      .expect(200)
    expect(res.body.data.photoUrl).not.toBe('tenants/999/photo/forged.jpg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest pet-photo.test.ts`
Expected: FAIL — `createPetSchema` currently accepts `photoUrl`, so PP-08 gets back the forged value instead of null.

- [ ] **Step 3: Write minimal implementation**

In `src/backend/services/pet.service.ts`, remove the `photoUrl` line from `createPetSchema`:

```ts
export const createPetSchema = z.object({
  ownerId:             z.number().int().positive(),
  name:                z.string().min(1).max(100),
  species:             z.string().min(1).max(50),
  breed:               z.string().max(100).optional().nullable(),
  color:               z.string().max(100).optional().nullable(),
  birthDate:           z.string().optional().nullable(),
  gender:              z.enum(['male', 'female', 'unknown']).optional().nullable(),
  weightKg:            z.number().positive().max(999.99).optional().nullable(),
  microchipId:         z.string().max(50).optional().nullable(),
  allergies:           z.string().optional().nullable(),
  underlyingConditions:z.string().optional().nullable(),
})
```

(The `photoUrl: z.string().optional().nullable(),` line is deleted. `updatePetSchema` is unchanged code-wise — it derives from `createPetSchema.partial()` and now inherits the removal automatically.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest pet-photo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/pet.service.ts src/backend/__tests__/pet-photo.test.ts
git commit -m "fix(pet): remove client-writable photoUrl from create/update schemas (BA sign-off R-1)"
```

---

## Task 9: Pet-photo upload route (stable key, grill G2)

**Files:**
- Modify: `src/backend/models/pet.repository.ts`
- Modify: `src/backend/services/pet.service.ts`
- Modify: `src/backend/controllers/pet.controller.ts`
- Modify: `src/backend/routes/pet.routes.ts`
- Modify: `src/backend/__tests__/pet-photo.test.ts` (append)

**Interfaces:**
- Consumes: `getStorageDriver()` (Task 2), `getPet(tenantId, id, includeEmr)` (existing).
- Produces: `petRepo.updatePetPhotoUrl(tenantId, id, photoUrl): Promise<Pet>`. `uploadPetPhoto(tenantId, petId, file: {buffer, mimetype, size}): Promise<Pet>` (pet.service.ts). `handleUploadPetPhoto` (pet.controller.ts). Task 10 (download) sits beside these in the same files.

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/pet-photo.test.ts` (after the existing `describe` block, before the final closing of the file):

```ts
describe('pet-photo — POST /api/pets/:id/photo', () => {

  test('PP-01: staff (crm.edit) uploads a JPEG — 201, file on disk, pet.photoUrl set to the stable key', async () => {
    const res = await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('jpeg-bytes'), { filename: 'rex.jpg', contentType: 'image/jpeg' })
      .expect(201)

    const expectedKey = `tenants/${tenantId}/photo/pet-${petId}.jpg`
    expect(res.body.data.photoUrl).toBe(expectedKey)
    expect(fs.existsSync(path.join(attachmentDir, expectedKey))).toBe(true)
  })

  test('PP-02: re-uploading the same format overwrites in place — zero orphan (grill G2)', async () => {
    const expectedKey = `tenants/${tenantId}/photo/pet-${petId}.jpg`
    await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('jpeg-bytes-v2'), { filename: 'rex-v2.jpg', contentType: 'image/jpeg' })
      .expect(201)

    expect(fs.readFileSync(path.join(attachmentDir, expectedKey)).toString()).toBe('jpeg-bytes-v2')
    const filesInPhotoDir = fs.readdirSync(path.join(attachmentDir, 'tenants', String(tenantId), 'photo'))
    expect(filesInPhotoDir).toEqual([`pet-${petId}.jpg`])
  })

  test('PP-03: format change (jpg to png) deletes the old file (grill G2)', async () => {
    const oldKey = `tenants/${tenantId}/photo/pet-${petId}.jpg`
    const newKey = `tenants/${tenantId}/photo/pet-${petId}.png`
    await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('png-bytes'), { filename: 'rex.png', contentType: 'image/png' })
      .expect(201)

    expect(fs.existsSync(path.join(attachmentDir, oldKey))).toBe(false)
    expect(fs.existsSync(path.join(attachmentDir, newKey))).toBe(true)
  })

  test('PP-04: disallowed image type (gif) → 400, photoUrl unchanged', async () => {
    const before = await prisma.pet.findUniqueOrThrow({ where: { id: petId } })
    const res = await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.from('gif-bytes'), { filename: 'rex.gif', contentType: 'image/gif' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    const after = await prisma.pet.findUniqueOrThrow({ where: { id: petId } })
    expect(after.photoUrl).toBe(before.photoUrl)
  })

  test('PP-05: oversized image (6 MB) → 400', async () => {
    const res = await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', Buffer.alloc(6 * 1024 * 1024, 1), { filename: 'huge.jpg', contentType: 'image/jpeg' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  test('PP-06: foreign-tenant pet id → 404', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other Photo Tenant', subdomain: `${SUBDOMAIN}-other` } })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Bob', lastName: 'Lee', phone: '0811111111' } })
    const otherPet = await prisma.pet.create({ data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Fido', species: 'canine' } })

    await request(server)
      .post(`/api/pets/${otherPet.id}/photo`)
      .set('Authorization', `Bearer ${staffToken}`) // staffToken belongs to the FIRST tenant
      .attach('file', Buffer.from('x'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(404)

    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

  test('PP-07: user without crm.edit (doctor) → 403', async () => {
    await request(server)
      .post(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .attach('file', Buffer.from('x'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(403)
  })

})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest pet-photo.test.ts -t "POST /api/pets/:id/photo"`
Expected: FAIL — `POST /api/pets/:id/photo` doesn't exist yet (404 from Express's own fallback, not the app's).

- [ ] **Step 3: Write minimal implementation**

`src/backend/models/pet.repository.ts` — add:

```ts
export function updatePetPhotoUrl(tenantId: number, id: number, photoUrl: string) {
  return prisma.pet.update({ where: { id, tenantId }, data: { photoUrl } })
}
```

`src/backend/services/pet.service.ts` — add near the bottom of the file:

```ts
import { getStorageDriver } from '../config/storage-driver'

const PET_PHOTO_MIME_ALLOWLIST = ['image/jpeg', 'image/png', 'image/webp'] as const
const PET_PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024
const PET_PHOTO_EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PET_PHOTO_CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export interface PetPhotoUploadFile {
  buffer:   Buffer
  mimetype: string
  size:     number
}

function buildPetPhotoKey(tenantId: number, petId: number, mimetype: string): string {
  return `tenants/${tenantId}/photo/pet-${petId}.${PET_PHOTO_EXTENSION[mimetype]}`
}

/**
 * Stable per-pet key (grill G2) — a same-format re-upload overwrites in
 * place (zero orphan, zero delete code). A format change (different
 * extension) triggers a best-effort delete of the previous file.
 */
export async function uploadPetPhoto(tenantId: number, petId: number, file: PetPhotoUploadFile) {
  const pet = await getPet(tenantId, petId, false)

  if (!(PET_PHOTO_MIME_ALLOWLIST as readonly string[]).includes(file.mimetype)) {
    throw new PetError('Image type not allowed', 400)
  }
  if (file.size > PET_PHOTO_MAX_SIZE_BYTES) {
    throw new PetError('Image exceeds the 5 MB limit', 400)
  }

  const storageKey = buildPetPhotoKey(tenantId, petId, file.mimetype)
  const driver = getStorageDriver()

  if (pet.photoUrl && pet.photoUrl !== storageKey) {
    await driver.delete(pet.photoUrl)
  }
  await driver.save(storageKey, file.buffer, file.mimetype)
  return petRepo.updatePetPhotoUrl(tenantId, petId, storageKey)
}

export interface PetPhotoFileResult {
  buffer:      Buffer
  contentType: string
}

/**
 * Serve-time prefix guard (BA sign-off §2.3, R-1): even though photoUrl is
 * now server-managed only, this is defense-in-depth against any value that
 * predates this fix or is set by direct DB access — the guard, not the
 * schema change alone, is what actually stops a cross-tenant/cross-module
 * read at the point driver.read is called.
 */
export async function getPetPhotoFile(tenantId: number, petId: number): Promise<PetPhotoFileResult> {
  const pet = await getPet(tenantId, petId, false)
  if (!pet.photoUrl) throw new PetError('Pet has no photo', 404)

  const expectedPrefix = `tenants/${tenantId}/photo/`
  if (!pet.photoUrl.startsWith(expectedPrefix)) {
    throw new PetError('Invalid photo reference', 404)
  }

  const driver = getStorageDriver()
  if (!(await driver.exists(pet.photoUrl))) {
    throw new PetError('Photo file is missing', 404)
  }
  const buffer = await driver.read(pet.photoUrl)
  const ext = pet.photoUrl.split('.').pop() ?? ''
  return { buffer, contentType: PET_PHOTO_CONTENT_TYPE[ext] ?? 'application/octet-stream' }
}
```

`src/backend/controllers/pet.controller.ts` — add:

```ts
import { ValidationError } from '../utils/errors'
import { listPets, getPet, createPet, updatePet, uploadPetPhoto, getPetPhotoFile } from '../services/pet.service'
// (extend the existing import from '../services/pet.service' with uploadPetPhoto, getPetPhotoFile)

export async function handleUploadPetPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new ValidationError({ file: ['file is required'] })
    const data = await uploadPetPhoto(req.context!.tenantId, parseInt(req.params.id), {
      buffer: req.file.buffer, mimetype: req.file.mimetype, size: req.file.size,
    })
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

// handleGetPetPhoto stub — implemented in Task 10.
export async function handleGetPetPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getPetPhotoFile(req.context!.tenantId, parseInt(req.params.id))
    res.setHeader('Content-Type', data.contentType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(data.buffer)
  } catch (err) { next(err) }
}
```

(`handleGetPetPhoto` is written fully here since `getPetPhotoFile` is already implemented above — Task 10 only adds the route wiring and its own tests, which is why it's listed as a separate reviewable task.)

`src/backend/routes/pet.routes.ts` — full rewrite:

```ts
import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListPets, handleGetPet, handleCreatePet, handleUpdatePet, handleUploadPetPhoto, handleGetPetPhoto } from '../controllers/pet.controller'
import { createPetSchema, updatePetSchema } from '../services/pet.service'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()
router.use(authMiddleware)

router.get('/',    requirePlane('clinic'), requirePermission('crm.view'),   handleListPets)
router.get('/:id', requirePlane('clinic'), requirePermission('crm.view'),   handleGetPet)
router.post('/',   requirePlane('clinic'), requirePermission('crm.create'), validate(createPetSchema), handleCreatePet)
router.put('/:id', requirePlane('clinic'), requirePermission('crm.edit'),   validate(updatePetSchema), handleUpdatePet)
router.post('/:id/photo', requirePlane('clinic'), requirePermission('crm.edit'), upload.single('file'), handleUploadPetPhoto)
router.get('/:id/photo',  requirePlane('clinic'), requirePermission('crm.view'), handleGetPetPhoto)

export default router
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest pet-photo.test.ts -t "POST /api/pets/:id/photo"`
Expected: PASS (7 tests: PP-01..PP-07)

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/pet.repository.ts src/backend/services/pet.service.ts \
        src/backend/controllers/pet.controller.ts src/backend/routes/pet.routes.ts \
        src/backend/__tests__/pet-photo.test.ts
git commit -m "feat(pet): photo upload via StorageDriver, stable per-pet key (grill G2)"
```

---

## Task 10: Pet-photo authenticated streaming download (prefix guard)

**Files:**
- Modify: `src/backend/__tests__/pet-photo.test.ts` (append — the route/service/controller code was already written in Task 9's Step 3, since `getPetPhotoFile`/`handleGetPetPhoto`/the `GET /:id/photo` route all shipped together for a coherent, reviewable route pair. This task's job is to add and pass the download-specific tests.)

**Interfaces:**
- Consumes: `getPetPhotoFile(tenantId, petId)` (Task 9), `handleGetPetPhoto` (Task 9).
- Produces: none new.

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/pet-photo.test.ts`:

```ts
describe('pet-photo — GET /api/pets/:id/photo', () => {

  test('PP-09: crm.view holder streams the correct bytes + Content-Type', async () => {
    const res = await request(server)
      .get(`/api/pets/${petId}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200)
    expect(res.headers['content-type']).toContain('image/png') // last upload in Task 9's PP-03 was a png
  })

  test('PP-10: pet with no photo → 404', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const photolessPet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'NoPhoto', species: 'canine' } })

    await request(server)
      .get(`/api/pets/${photolessPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)

    await prisma.pet.delete({ where: { id: photolessPet.id } })
  })

  test('PP-11: photoUrl set but file missing on disk (data drift) → 404', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const driftPet = await prisma.pet.create({
      data: { tenantId, ownerId: owner.id, name: 'Drift', species: 'canine', photoUrl: `tenants/${tenantId}/photo/pet-ghost.jpg` },
    })

    await request(server)
      .get(`/api/pets/${driftPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)

    await prisma.pet.delete({ where: { id: driftPet.id } })
  })

  test('PP-12: forged out-of-tenant photoUrl fails the prefix guard → 404, not a cross-tenant read (BA §2.3 R-1)', async () => {
    const owner = await prisma.owner.findFirstOrThrow({ where: { tenantId } })
    const forgedKey = 'tenants/999999/photo/pet-1.jpg'
    fs.mkdirSync(path.dirname(path.join(attachmentDir, forgedKey)), { recursive: true })
    fs.writeFileSync(path.join(attachmentDir, forgedKey), 'someone-elses-photo')
    const forgedPet = await prisma.pet.create({
      data: { tenantId, ownerId: owner.id, name: 'Forged', species: 'canine', photoUrl: forgedKey },
    })

    const res = await request(server)
      .get(`/api/pets/${forgedPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)
    expect(res.body.success).toBe(false)

    await prisma.pet.delete({ where: { id: forgedPet.id } })
    fs.rmSync(path.join(attachmentDir, 'tenants', '999999'), { recursive: true, force: true })
  })

  test('PP-13: foreign-tenant pet id → 404', async () => {
    const otherTenant = await prisma.tenant.create({ data: { name: 'Other Photo Tenant 2', subdomain: `${SUBDOMAIN}-other2` } })
    const otherOwner = await prisma.owner.create({ data: { tenantId: otherTenant.id, firstName: 'Ann', lastName: 'Lee', phone: '0822222222' } })
    const otherPet = await prisma.pet.create({ data: { tenantId: otherTenant.id, ownerId: otherOwner.id, name: 'Ghost', species: 'canine' } })

    await request(server)
      .get(`/api/pets/${otherPet.id}/photo`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404)

    await prisma.pet.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.owner.deleteMany({ where: { tenantId: otherTenant.id } })
    await prisma.tenant.deleteMany({ where: { id: otherTenant.id } })
  })

})
```

- [ ] **Step 2: Run test to verify it passes** (implementation already shipped in Task 9)

Run: `cd src/backend && npx jest pet-photo.test.ts`
Expected: PASS (all 15 tests in the file: PP-01..PP-13 plus the two from Task 8)

If PP-09/PP-11/PP-12/PP-13 fail, re-check that Task 9's `getPetPhotoFile`/`handleGetPetPhoto`/route wiring landed exactly as specified — this task adds no new production code.

- [ ] **Step 3: Commit**

```bash
git add src/backend/__tests__/pet-photo.test.ts
git commit -m "test(pet): cover authenticated photo download + prefix-guard regression (BA sign-off R-1)"
```

---

## Task 11: Delete the S3 stack, remove `@aws-sdk/*`, unmount the presign route

**Files:**
- Delete: `src/backend/config/storage.ts`
- Delete: `src/backend/services/upload.service.ts`
- Delete: `src/backend/controllers/upload.controller.ts`
- Delete: `src/backend/routes/upload.routes.ts`
- Delete: `src/backend/__tests__/upload.test.ts`
- Modify: `src/backend/app.ts`
- Modify: `src/backend/package.json`
- Create: `src/backend/__tests__/upload-route-removed.test.ts`

**Interfaces:**
- Consumes: none (this is a pure deletion/cleanup task, verified by grep before deleting).
- Produces: none.

- [ ] **Step 1: Verify safety before deleting (grep, not a test)**

Run: `cd src/backend && grep -rn "@aws-sdk" . --include=*.ts --exclude-dir=node_modules`
Expected: zero remaining hits outside the 4 files being deleted in this task (all EMR/pet-photo code was rewritten off `@aws-sdk` in Tasks 5–10).

- [ ] **Step 2: Write the failing test**

```ts
// src/backend/__tests__/upload-route-removed.test.ts
import request from 'supertest'
import { Server } from 'http'
import app from '../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('POST /api/upload/presign — retired (ADR-0022)', () => {
  test('returns 404 NOT_FOUND — the S3 presign route no longer exists', async () => {
    const res = await request(server).post('/api/upload/presign').send({})
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd src/backend && npx jest upload-route-removed.test.ts`
Expected: FAIL — the route still exists and returns 400 (validation error on empty body), not 404.

- [ ] **Step 4: Delete the S3 stack and unmount the route**

```bash
rm src/backend/config/storage.ts
rm src/backend/services/upload.service.ts
rm src/backend/controllers/upload.controller.ts
rm src/backend/routes/upload.routes.ts
rm src/backend/__tests__/upload.test.ts
```

In `src/backend/app.ts`, remove the import and mount line:

```ts
// remove: import uploadRoutes from './routes/upload.routes'
// remove: app.use('/api/upload',          uploadRoutes)
```

In `src/backend/package.json`, remove the two `@aws-sdk/*` dependency lines:

```json
// remove: "@aws-sdk/client-s3": "^3.1067.0",
// remove: "@aws-sdk/s3-request-presigner": "^3.1067.0",
```

Run: `cd src/backend && npm install`
Expected: lockfile updates to drop the two packages, `npm ls @aws-sdk/client-s3` reports it as not installed.

- [ ] **Step 5: Run test to verify it passes, then run the full backend suite**

Run: `cd src/backend && npx jest upload-route-removed.test.ts`
Expected: PASS (1 test)

Run: `cd src/backend && npm test`
Expected: all suites pass — this is the checkpoint that confirms nothing else imported the deleted files.

- [ ] **Step 6: Commit**

```bash
git add -A src/backend/config/storage.ts src/backend/services/upload.service.ts \
        src/backend/controllers/upload.controller.ts src/backend/routes/upload.routes.ts \
        src/backend/__tests__/upload.test.ts src/backend/__tests__/upload-route-removed.test.ts \
        src/backend/app.ts src/backend/package.json src/backend/package-lock.json
git commit -m "chore(storage): delete retired S3 presign stack, drop @aws-sdk deps (ADR-0022)"
```

---

## Task 12: Frontend — `useEmrAttachmentUpload` single multipart call + blob download

**Files:**
- Modify: `src/frontend/src/hooks/useEmrAttachmentUpload.ts`
- Rewrite: `src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts`

**Interfaces:**
- Consumes: `api` (axios instance, `src/frontend/src/utils/api.ts`, unchanged).
- Produces: `uploadAttachment(medicalRecordId: number, file: File, fileType?: string): Promise<Attachment>` (signature unchanged from the caller's point of view — `ClinicEMR.tsx` needs no JSX changes). `downloadAttachment(medicalRecordId: number, attachmentId: number): Promise<void>` (signature unchanged).

- [ ] **Step 1: Write the failing tests**

Replace `src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const postMock = vi.fn()
const getMock  = vi.fn()
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args), get: (...args: unknown[]) => getMock(...args) },
}))

import { useEmrAttachmentUpload } from '../hooks/useEmrAttachmentUpload'

const file = new File(['%PDF-1.4 fake'], 'lab.pdf', { type: 'application/pdf' })

beforeEach(() => {
  postMock.mockReset()
  getMock.mockReset()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
  globalThis.URL.revokeObjectURL = vi.fn()
  globalThis.open = vi.fn()
})

describe('useEmrAttachmentUpload', () => {
  it('uploads via a single multipart POST and returns the created attachment', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { id: 55, fileName: 'lab.pdf', mimeType: 'application/pdf', fileSize: file.size } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    let attachment
    await act(async () => {
      attachment = await result.current.uploadAttachment(9, file, 'lab')
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]
    expect(url).toBe('/api/medical-records/9/attachments')
    expect(body).toBeInstanceOf(FormData)
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
    expect((attachment as unknown as { id: number }).id).toBe(55)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.uploadError).toBeNull()
  })

  it('surfaces the backend error message when upload is rejected', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'File type not allowed' } } })

    const { result } = renderHook(() => useEmrAttachmentUpload())

    await act(async () => {
      await expect(result.current.uploadAttachment(9, file)).rejects.toBeTruthy()
    })
    await waitFor(() => expect(result.current.uploadError).toBe('File type not allowed'))
  })

  it('downloads via a blob GET and opens an object URL', async () => {
    const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' })
    getMock.mockResolvedValueOnce({ data: blob })

    const { result } = renderHook(() => useEmrAttachmentUpload())
    await act(async () => {
      await result.current.downloadAttachment(9, 55)
    })

    expect(getMock).toHaveBeenCalledWith('/api/medical-records/9/attachments/55/download', { responseType: 'blob' })
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(globalThis.open).toHaveBeenCalledWith('blob:mock-url', '_blank', 'noopener,noreferrer')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run useEmrAttachmentUpload.test.ts`
Expected: FAIL — the hook still does presign→PUT→confirm (3 calls), and download still does JSON `downloadUrl` + `window.open`, not a blob GET.

- [ ] **Step 3: Write minimal implementation**

Replace `src/frontend/src/hooks/useEmrAttachmentUpload.ts`:

```ts
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

/**
 * Single multipart POST to the local-disk-backed EMR attachment route
 * (emr.attach-gated). Replaces the retired presign → PUT → confirm flow
 * (ADR-0022) — the server now builds the storage key and streams the file
 * straight to disk.
 */
export function useEmrAttachmentUpload(): UseEmrAttachmentUploadResult {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadAttachment = async (medicalRecordId: number, file: File, fileType?: string): Promise<Attachment> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (fileType) formData.append('fileType', fileType)

      const res = await api.post(`/api/medical-records/${medicalRecordId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data.data as Attachment
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    } finally {
      setIsUploading(false)
    }
  }

  const downloadAttachment = async (medicalRecordId: number, attachmentId: number): Promise<void> => {
    try {
      const res = await api.get(`/api/medical-records/${medicalRecordId}/attachments/${attachmentId}/download`, {
        responseType: 'blob',
      })
      const objectUrl = URL.createObjectURL(res.data as Blob)
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
    } catch (err: unknown) {
      setUploadError(extractErrorMessage(err))
      throw err
    }
  }

  return { uploadAttachment, downloadAttachment, isUploading, uploadError, clearUploadError }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run useEmrAttachmentUpload.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the existing ClinicEMR attachments test to confirm no regression**

Run: `cd src/frontend && npx vitest run ClinicEMR.attachments.test.tsx`
Expected: PASS (unchanged — this test only exercises client-side MIME/size rejection before the hook is called, so it's unaffected by the hook's internals).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/hooks/useEmrAttachmentUpload.ts src/frontend/src/__tests__/useEmrAttachmentUpload.test.ts
git commit -m "feat(emr): single multipart upload + blob download in useEmrAttachmentUpload (ADR-0022)"
```

---

## Task 13: `AuthedPetImage` component + `useAuthedImage` hook

**Files:**
- Create: `src/frontend/src/components/AuthedPetImage.tsx`
- Create: `src/frontend/src/__tests__/AuthedPetImage.test.tsx`

**Interfaces:**
- Consumes: `api` (axios instance), `MaterialIcon` (`src/frontend/src/components/MaterialIcon.tsx`, unchanged).
- Produces: `useAuthedImage(petId?: number): {objectUrl: string | null, loading: boolean}`. `<AuthedPetImage petId?: number, alt: string, className?: string, iconSize?: number />` (default export). Tasks 15–18 import the default export.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/frontend/src/__tests__/AuthedPetImage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { get: (...args: unknown[]) => getMock(...args) } }))

import AuthedPetImage from '../components/AuthedPetImage'

beforeEach(() => {
  getMock.mockReset()
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-pet-photo')
  globalThis.URL.revokeObjectURL = vi.fn()
})

describe('AuthedPetImage', () => {
  it('renders a placeholder icon while there is no photo (404)', async () => {
    getMock.mockRejectedValueOnce({ response: { status: 404 } })
    render(<AuthedPetImage petId={1} alt="Rex" />)
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/pets/1/photo', { responseType: 'blob' }))
    expect(screen.queryByAltText('Rex')).not.toBeInTheDocument()
  })

  it('renders the fetched photo as an <img> with an object URL', async () => {
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    getMock.mockResolvedValueOnce({ data: blob })
    render(<AuthedPetImage petId={2} alt="Fido" />)
    const img = await screen.findByAltText('Fido')
    expect(img).toHaveAttribute('src', 'blob:mock-pet-photo')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run AuthedPetImage.test.tsx`
Expected: FAIL — `Cannot find module '../components/AuthedPetImage'`

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/frontend/src/components/AuthedPetImage.tsx
import { useEffect, useState } from 'react'
import api from '../utils/api'
import MaterialIcon from './MaterialIcon'

/**
 * Fetches a private pet photo as a blob (carrying the Bearer auth header
 * via the axios interceptor) and exposes it as a revocable object URL.
 * Plain `<img src="/api/pets/:id/photo">` cannot send the Authorization
 * header, so this hook is the only correct way to render a pet photo
 * post-ADR-0022.
 */
export function useAuthedImage(petId: number | undefined): { objectUrl: string | null; loading: boolean } {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (!petId) { setObjectUrl(null); return }
    let cancelled = false
    let currentUrl: string | null = null
    setLoading(true)

    api.get(`/api/pets/${petId}/photo`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(res.data as Blob)
        setObjectUrl(currentUrl)
      })
      .catch(() => { if (!cancelled) setObjectUrl(null) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [petId])

  return { objectUrl, loading }
}

interface AuthedPetImageProps {
  petId?:     number
  alt:        string
  className?: string
  iconSize?:  number
}

export default function AuthedPetImage({ petId, alt, className, iconSize = 24 }: AuthedPetImageProps) {
  const { objectUrl } = useAuthedImage(petId)

  if (!objectUrl) {
    return (
      <div className={`bg-surface-container-high flex items-center justify-center ${className ?? ''}`}>
        <MaterialIcon name="pets" size={iconSize} className="text-on-surface-variant" />
      </div>
    )
  }
  return <img src={objectUrl} alt={alt} className={className} />
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run AuthedPetImage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/components/AuthedPetImage.tsx src/frontend/src/__tests__/AuthedPetImage.test.tsx
git commit -m "feat(pet): add AuthedPetImage/useAuthedImage for private photo serving (ADR-0022)"
```

---

## Task 14: Frontend — `usePhotoUpload` single multipart call

**Files:**
- Modify: `src/frontend/src/hooks/usePhotoUpload.ts`
- Create: `src/frontend/src/hooks/usePhotoUpload.test.ts`

**Interfaces:**
- Consumes: `api` (axios instance).
- Produces: `uploadPhoto(petId: number, file: File): Promise<void>` — **signature changed** from `uploadPhoto(file: File): Promise<string>`. Tasks 15–16 (AddPetModal/EditPetModal) call the new two-argument, void-returning signature.

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/src/hooks/usePhotoUpload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const postMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { post: (...args: unknown[]) => postMock(...args) } }))

import { usePhotoUpload } from './usePhotoUpload'

const file = new File(['jpeg-bytes'], 'rex.jpg', { type: 'image/jpeg' })

beforeEach(() => { postMock.mockReset() })

describe('usePhotoUpload', () => {
  it('uploads via a single multipart POST to /api/pets/:id/photo', async () => {
    postMock.mockResolvedValueOnce({ data: { data: { id: 1, photoUrl: 'tenants/1/photo/pet-1.jpg' } } })
    const { result } = renderHook(() => usePhotoUpload())

    await act(async () => {
      await result.current.uploadPhoto(1, file)
    })

    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]
    expect(url).toBe('/api/pets/1/photo')
    expect(body).toBeInstanceOf(FormData)
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
    expect(result.current.isUploading).toBe(false)
    expect(result.current.uploadError).toBeNull()
  })

  it('surfaces the backend error message on rejection', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { error: 'Image exceeds the 5 MB limit' } } })
    const { result } = renderHook(() => usePhotoUpload())

    await act(async () => {
      await expect(result.current.uploadPhoto(1, file)).rejects.toBeTruthy()
    })
    await waitFor(() => expect(result.current.uploadError).toBe('Image exceeds the 5 MB limit'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run usePhotoUpload.test.ts`
Expected: FAIL — the hook still calls `/api/upload/presign` then PUTs to S3.

- [ ] **Step 3: Write minimal implementation**

Replace `src/frontend/src/hooks/usePhotoUpload.ts`:

```ts
import { useState } from 'react'
import api from '../utils/api'

interface UsePhotoUploadResult {
  uploadPhoto: (petId: number, file: File) => Promise<void>
  isUploading: boolean
  uploadError: string | null
  clearUploadError: () => void
}

/**
 * Single multipart POST to the local-disk-backed pet-photo route
 * (crm.edit-gated). Replaces the retired presign → PUT flow (ADR-0022).
 * Requires a pet id — new pets are created first, then the photo is
 * uploaded referencing the new id (AddPetModal's create-then-upload
 * ordering, grill G3).
 */
export function usePhotoUpload(): UsePhotoUploadResult {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const clearUploadError = () => setUploadError(null)

  const uploadPhoto = async (petId: number, file: File): Promise<void> => {
    setIsUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/api/pets/${petId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message :
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Upload failed'
      setUploadError(msg)
      throw err
    } finally {
      setIsUploading(false)
    }
  }

  return { uploadPhoto, isUploading, uploadError, clearUploadError }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run usePhotoUpload.test.ts`
Expected: PASS (2 tests). Note: `AddPetModal.test.tsx`/`EditPetModal.test.tsx` will now FAIL (their `usePhotoUpload` mocks and payload assertions target the old signature) — expected, fixed in Tasks 15–16.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/usePhotoUpload.ts src/frontend/src/hooks/usePhotoUpload.test.ts
git commit -m "feat(pet): single multipart upload in usePhotoUpload, petId-first signature (ADR-0022)"
```

---

## Task 15: `AddPetModal` — create-then-upload ordering (grill G2/G3)

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx` (`AddPetModal` function only)
- Rewrite: `src/frontend/src/__tests__/AddPetModal.test.tsx`

**Interfaces:**
- Consumes: `usePhotoUpload()` returning `{uploadPhoto(petId, file), isUploading, uploadError}` (Task 14).
- Produces: no new exports — `AddPetModal` keeps its existing `{ownerId, ownerName, onClose, onSuccess}` prop signature.

- [ ] **Step 1: Write the failing tests**

Replace `src/frontend/src/__tests__/AddPetModal.test.tsx`:

```tsx
// src/frontend/src/__tests__/AddPetModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { uploadPhotoMock } = vi.hoisted(() => ({ uploadPhotoMock: vi.fn().mockResolvedValue(undefined) }))

const postMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
vi.mock('../utils/api', () => ({
  default: { post: (...args: unknown[]) => postMock(...args) },
}))
vi.mock('../hooks/usePhotoUpload', () => ({
  usePhotoUpload: () => ({ uploadPhoto: uploadPhotoMock, isUploading: false, uploadError: '' }),
}))

import { AddPetModal } from '../views/clinic/ClinicPets'

beforeEach(() => {
  postMock.mockClear()
  postMock.mockResolvedValue({ data: { data: { id: 1 } } })
  uploadPhotoMock.mockClear()
  uploadPhotoMock.mockResolvedValue(undefined)
})

describe('AddPetModal — weightKg field', () => {
  it('renders a weight input with the correct placeholder', () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByPlaceholderText(/weight in kg/i)).toBeInTheDocument()
  })

  it('submits weightKg as a number in the create-pet payload', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.type(screen.getByPlaceholderText(/weight in kg/i), '12.5')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: 12.5 }))
  })

  it('submits weightKg as null when left blank', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.click(screen.getByText('Save Pet'))
    expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ weightKg: null }))
  })

  it('does not send photoUrl in the create-pet payload (server-managed only, ADR-0022)', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    await userEvent.click(screen.getByText('Save Pet'))
    const payload = postMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('photoUrl')
  })
})

describe('AddPetModal — create-then-upload photo (grill G2/G3)', () => {
  it('creates the pet first, then uploads the photo referencing the new pet id', async () => {
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    const file = new File(['jpeg-bytes'], 'rex.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByText('Save Pet'))

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/api/pets', expect.objectContaining({ name: 'Rex' })))
    expect(uploadPhotoMock).toHaveBeenCalledWith(1, file)
  })

  it('does not block pet creation when the photo upload fails (G3 — no rollback)', async () => {
    uploadPhotoMock.mockRejectedValueOnce(new Error('Upload failed'))
    const onSuccess = vi.fn()
    render(<AddPetModal ownerId={1} ownerName="Jane Doe" onClose={vi.fn()} onSuccess={onSuccess} />)
    await userEvent.type(screen.getByPlaceholderText(/pet name/i), 'Rex')
    const file = new File(['jpeg-bytes'], 'rex.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByText('Save Pet'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run AddPetModal.test.tsx`
Expected: FAIL — `AddPetModal` still calls `uploadPhoto(photoFile)` (one arg) before `POST /api/pets`, and sends `photoUrl` in the payload.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, replace the `AddPetModal` function's `submit` handler:

```tsx
const submit = async (e: React.FormEvent) => {
  e.preventDefault()
  setSaving(true)
  setError('')
  try {
    const res = await api.post('/api/pets', {
      ownerId,
      name: form.name,
      species: form.species,
      breed: form.breed || null,
      color: form.color || null,
      gender: form.gender || null,
      birthDate: form.birthDate || null,
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      microchipId: form.microchipId || null,
      allergies: form.allergies || null,
      underlyingConditions: form.underlyingConditions || null,
    })
    const newPetId = res.data.data.id as number
    if (photoFile) {
      // Grill G3: no rollback on photo failure — the pet is already
      // created and valid without a photo; swallow the error here and
      // let the user retry from Edit Pet.
      try { await uploadPhoto(newPetId, photoFile) } catch { /* non-fatal, see G3 */ }
    }
    onSuccess()
  } catch (err: unknown) {
    setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
  } finally { setSaving(false) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run AddPetModal.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/__tests__/AddPetModal.test.tsx
git commit -m "feat(pet): AddPetModal create-then-upload photo ordering, no photoUrl in payload (grill G2/G3)"
```

---

## Task 16: `EditPetModal` — single-call upload + `AuthedPetImage` preview

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx` (`EditPetModal` function only)
- Rewrite: `src/frontend/src/__tests__/EditPetModal.test.tsx`

**Interfaces:**
- Consumes: `usePhotoUpload()` (Task 14), `AuthedPetImage` default export (Task 13).
- Produces: no new exports — `EditPetModal` keeps its existing `{pet, onClose, onSuccess}` prop signature.

- [ ] **Step 1: Write the failing tests**

Replace `src/frontend/src/__tests__/EditPetModal.test.tsx`:

```tsx
// src/frontend/src/__tests__/EditPetModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const putMock = vi.fn().mockResolvedValue({ data: { data: { id: 1 } } })
const invalidateQueriesMock = vi.fn()
const uploadPhotoMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../utils/api', () => ({
  default: { put: (...args: unknown[]) => putMock(...args) },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))
vi.mock('../hooks/usePhotoUpload', () => ({
  usePhotoUpload: () => ({ uploadPhoto: uploadPhotoMock, isUploading: false, uploadError: '' }),
}))
vi.mock('../components/AuthedPetImage', () => ({
  default: ({ alt }: { alt: string }) => <div data-testid="authed-pet-image">{alt}</div>,
}))

import { EditPetModal } from '../views/clinic/ClinicPets'

const mockPet = {
  id: 1, ownerId: 1, name: 'Rex', species: 'canine', breed: 'Labrador', color: 'Golden',
  birthDate: '2020-01-15T00:00:00.000Z', gender: 'male', weightKg: 12.5, microchipId: 'CHIP123',
  photoUrl: 'tenants/1/photo/pet-1.jpg',
  allergies: 'Pollen', underlyingConditions: 'None', isActive: true,
}

describe('EditPetModal — pre-population', () => {
  it('pre-populates all fields from the pet prop', () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByDisplayValue('Rex')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('CHIP123')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2020-01-15')).toBeInTheDocument()
  })

  it('renders the existing photo via AuthedPetImage (storage key, not a raw <img src>)', () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByTestId('authed-pet-image')).toBeInTheDocument()
  })
})

describe('EditPetModal — submit handler', () => {
  beforeEach(() => {
    putMock.mockClear()
    invalidateQueriesMock.mockClear()
    uploadPhotoMock.mockClear()
  })

  it('submits PUT /api/pets/:id with typed field values', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const weightInput = screen.getByDisplayValue('12.5')
    await userEvent.clear(weightInput)
    await userEvent.type(weightInput, '15')
    await userEvent.click(screen.getByText('Save Changes'))
    expect(putMock).toHaveBeenCalledWith('/api/pets/1', expect.objectContaining({ weightKg: 15 }))
  })

  it('does not send photoUrl in the update payload (server-managed only, ADR-0022)', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.click(screen.getByText('Save Changes'))
    const payload = putMock.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('photoUrl')
  })

  it('sends null for a cleared optional field', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const microchipInput = screen.getByDisplayValue('CHIP123')
    await userEvent.clear(microchipInput)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(putMock).toHaveBeenCalledWith('/api/pets/1', expect.objectContaining({ microchipId: null }))
  })

  it('save refreshes detail view', async () => {
    const onSuccess = vi.fn()
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={onSuccess} />)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(onSuccess).toHaveBeenCalled()
  })

  it('invalidates the pet query on save (query invalidation, A5)', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['pet', 1] })
  })

  it('photo-change path — uploads the new photo referencing the pet id before saving', async () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const file = new File(['data'], 'new-photo.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByText('Save Changes'))
    expect(uploadPhotoMock).toHaveBeenCalledWith(1, file)
    expect(putMock).toHaveBeenCalledWith('/api/pets/1', expect.not.objectContaining({ photoUrl: expect.anything() }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run EditPetModal.test.tsx`
Expected: FAIL — `EditPetModal` calls `uploadPhoto(photoFile)` (one arg, returns a URL) and initializes `photoPreview` from `pet.photoUrl` directly (now a storage key, not renderable as a raw `<img src>`); `AuthedPetImage` mock never renders since it isn't used yet.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, add the import near the top (with the other component imports):

```tsx
import AuthedPetImage from '../../components/AuthedPetImage'
```

Replace the `EditPetModal` function's state/submit/photo-preview JSX:

```tsx
export function EditPetModal({ pet, onClose, onSuccess }: { pet: Pet; onClose: () => void; onSuccess: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: pet.name, species: pet.species, breed: pet.breed ?? '', color: pet.color ?? '',
    gender: pet.gender ?? '', birthDate: pet.birthDate ? pet.birthDate.slice(0, 10) : '', weightKg: pet.weightKg?.toString() ?? '',
    microchipId: pet.microchipId ?? '', allergies: pet.allergies ?? '', underlyingConditions: pet.underlyingConditions ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile]       = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { uploadPhoto, isUploading, uploadError } = usePhotoUpload()

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (photoFile) await uploadPhoto(pet.id, photoFile)
      await api.put(`/api/pets/${pet.id}`, {
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        color: form.color || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        microchipId: form.microchipId || null,
        allergies: form.allergies || null,
        underlyingConditions: form.underlyingConditions || null,
      })
      qc.invalidateQueries({ queryKey: ['pet', pet.id] })
      onSuccess()
    } catch (err: unknown) {
      if (!uploadError) {
        setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save')
      }
    } finally { setSaving(false) }
  }

  const busy = saving || isUploading

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-lg">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md p-xl overflow-y-auto max-h-[90vh]">
        <h3 className="text-headline-sm font-headline font-bold text-primary mb-lg">{t('clinic.pets.editPet')}</h3>
        {(error || uploadError) && <p className="text-error text-body-sm mb-md">{error || uploadError}</p>}
        <form onSubmit={submit} className="flex flex-col gap-md">
          <div className="flex items-center gap-md">
            <div className="w-16 h-16 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden flex-shrink-0 border border-outline-variant">
              {photoPreview
                ? <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                : <AuthedPetImage petId={pet.id} alt={pet.name} className="w-full h-full object-cover" />
              }
            </div>
```

(The remaining JSX below the photo block — file input, form fields, buttons — stays exactly as it already is; only the state initializer, `submit`, and the photo-preview `<div>`'s inner conditional change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run EditPetModal.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/__tests__/EditPetModal.test.tsx
git commit -m "feat(pet): EditPetModal single-call photo upload + AuthedPetImage preview (ADR-0022)"
```

---

## Task 17: `ClinicPets.tsx` display sites — grid + detail hero → `AuthedPetImage`

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicPets.tsx` (`OwnerPanel` grid card + `PetDetail` hero only)
- Create: `src/frontend/src/__tests__/ClinicPetsPhotoDisplay.test.tsx`

**Interfaces:**
- Consumes: `AuthedPetImage` default export (Task 13).
- Produces: none new.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/frontend/src/__tests__/ClinicPetsPhotoDisplay.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../components/AuthedPetImage', () => ({
  default: ({ alt }: { alt: string }) => <div data-testid="authed-pet-image">{alt}</div>,
}))
vi.mock('../utils/api', () => ({ default: {} }))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { hasPermission: (code: string) => boolean }) => unknown) => selector({ hasPermission: () => false }),
}))

const petWithPhoto = {
  id: 9, ownerId: 1, name: 'Rex', species: 'canine', photoUrl: 'tenants/1/photo/pet-9.jpg',
  owner: { id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', isActive: true, pets: [] },
}
const ownerWithPhotoPet = {
  id: 1, firstName: 'Jane', lastName: 'Doe', phone: '0812345678', isActive: true,
  pets: [petWithPhoto],
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = opts.queryKey[0]
    if (key === 'owner') return { data: { data: ownerWithPhotoPet }, isLoading: false }
    return { data: { data: petWithPhoto }, isLoading: false }
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import { OwnerPanel, PetDetail } from '../views/clinic/ClinicPets'

describe('ClinicPets — pet photo display sites (ADR-0022 AuthedPetImage swap)', () => {
  it('grid card renders a pet with photoUrl via AuthedPetImage', () => {
    render(<OwnerPanel ownerId={1} onSelectPet={vi.fn()} onAddPet={vi.fn()} />)
    expect(screen.getByTestId('authed-pet-image')).toHaveTextContent('Rex')
  })

  it('detail hero renders the pet photo via AuthedPetImage', () => {
    render(<MemoryRouter><PetDetail petId={9} onAddVaccination={vi.fn()} /></MemoryRouter>)
    expect(screen.getByTestId('authed-pet-image')).toHaveTextContent('Rex')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run ClinicPetsPhotoDisplay.test.tsx`
Expected: FAIL — both sites still render a raw `<img src={pet.photoUrl}>`, so the `AuthedPetImage` mock never renders.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/src/views/clinic/ClinicPets.tsx`, in `PetDetail` (pet hero, currently `pet.photoUrl ? <img src={pet.photoUrl} .../> : <div>...</div>`):

```tsx
{pet.photoUrl
  ? <AuthedPetImage petId={pet.id} alt={pet.name} className="w-[120px] h-[120px] rounded-xl object-cover border border-outline-variant" iconSize={48} />
  : <div className="w-[120px] h-[120px] rounded-xl bg-surface-container-high flex items-center justify-center"><MaterialIcon name="pets" size={48} className="text-on-surface-variant" /></div>
}
```

In `OwnerPanel` (pet grid card, currently `pet.photoUrl ? <img src={pet.photoUrl} .../> : <div>...</div>`):

```tsx
{pet.photoUrl
  ? <AuthedPetImage petId={pet.id} alt={pet.name} className="w-16 h-16 rounded-full object-cover border border-outline-variant" iconSize={28} />
  : <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center">
      <MaterialIcon name="pets" size={28} className="text-on-surface-variant" />
    </div>
}
```

(`AuthedPetImage` import was already added to this file in Task 16.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run ClinicPetsPhotoDisplay.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the broader ClinicPets suite to confirm no regression**

Run: `cd src/frontend && npx vitest run ClinicPetsOwnerList.test.tsx OwnerPanel.test.tsx PetDetail.editButton.test.tsx PetDetail.admitButton.test.tsx ClinicPetsMedicalTab.test.tsx PetOverview.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicPets.tsx src/frontend/src/__tests__/ClinicPetsPhotoDisplay.test.tsx
git commit -m "feat(pet): swap grid + detail photo display to AuthedPetImage (ADR-0022)"
```

---

## Task 18: `ClinicEMR.tsx` pet avatar → `AuthedPetImage`

**Files:**
- Modify: `src/frontend/src/views/clinic/ClinicEMR.tsx`
- Create: `src/frontend/src/__tests__/ClinicEMR.petAvatar.test.tsx`

**Interfaces:**
- Consumes: `AuthedPetImage` default export (Task 13).
- Produces: none new.

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/src/__tests__/ClinicEMR.petAvatar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const getMock = vi.fn()
vi.mock('../utils/api', () => ({ default: { get: (...args: unknown[]) => getMock(...(args as [string, unknown])) } }))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector?: (s: { userId: number; hasPermission: (perm: string) => boolean }) => unknown) => {
    const state = { userId: 1, hasPermission: () => true }
    return selector ? selector(state) : state
  },
}))
vi.mock('../components/AuthedPetImage', () => ({
  default: ({ alt }: { alt: string }) => <div data-testid="authed-pet-image">{alt}</div>,
}))

import ClinicEMR from '../views/clinic/ClinicEMR'

const pet = { id: 42, name: 'Rex', species: 'canine', photoUrl: 'tenants/1/photo/pet-42.jpg', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' } }

beforeEach(() => {
  getMock.mockReset()
  getMock.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    if (url === '/api/search') {
      const q = config?.params?.q as string | undefined
      if (q && q.length >= 2) return Promise.resolve({ data: { data: [{ petId: 42, petName: 'Rex', species: 'canine', ownerName: 'Jane Doe', phone: '0812345678' }] } })
      return Promise.resolve({ data: { data: [] } })
    }
    if (url === '/api/pets/42') return Promise.resolve({ data: { data: pet } })
    if (url === '/api/medical-records') return Promise.resolve({ data: { data: { records: [] } } })
    return Promise.resolve({ data: { data: null } })
  })
})

function renderEMR() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><ClinicEMR /></MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ClinicEMR — pet avatar photo display (ADR-0022 AuthedPetImage swap)', () => {
  it('renders the sidebar pet avatar via AuthedPetImage when the pet has a photo', async () => {
    renderEMR()
    await userEvent.type(screen.getByPlaceholderText(/pet or owner/i), 'Rex')
    await userEvent.click(await screen.findByText('Rex'))
    expect(await screen.findByTestId('authed-pet-image')).toHaveTextContent('Rex')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run ClinicEMR.petAvatar.test.tsx`
Expected: FAIL — the sidebar still renders a raw `<img src={pet.photoUrl}>`.

- [ ] **Step 3: Write minimal implementation**

In `src/frontend/src/views/clinic/ClinicEMR.tsx`, add the import near the top (with the other component imports):

```tsx
import AuthedPetImage from '../../components/AuthedPetImage'
```

Replace the sidebar pet-avatar block (currently `pet.photoUrl ? <img src={pet.photoUrl} .../> : <div>...</div>` inside the `{pet && (...)}` block):

```tsx
{pet.photoUrl
  ? <AuthedPetImage petId={pet.id} alt={pet.name} className="w-10 h-10 rounded-full object-cover" iconSize={20} />
  : <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center"><MaterialIcon name="pets" size={20} className="text-on-surface-variant" /></div>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run ClinicEMR.petAvatar.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Run the existing ClinicEMR suites to confirm no regression**

Run: `cd src/frontend && npx vitest run ClinicEMR.attachments.test.tsx ClinicEMR.weightSync.test.tsx ClinicEMR.petIdParam.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/views/clinic/ClinicEMR.tsx src/frontend/src/__tests__/ClinicEMR.petAvatar.test.tsx
git commit -m "feat(emr): swap sidebar pet avatar to AuthedPetImage (ADR-0022)"
```

---

## Task 19: Full-suite verification + docs (pm-agent, LAST)

**Files:**
- Modify: `CLAUDE.md` (Phases table)
- Modify: `.claude/specs/implementation-status-matrix.md`

**Interfaces:** none — documentation only, run after every other task's tests are green.

- [ ] **Step 1: Run the full backend suite**

Run: `cd src/backend && npm test`
Expected: all suites PASS. Record the final `Tests: X passed, Y total` line — it's needed for Step 3 below.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd src/frontend && npm test`
Expected: all suites PASS. Record the final test count.

- [ ] **Step 3: Update CLAUDE.md's Phases table**

In the `## Phases` table in `CLAUDE.md`, insert a new row directly above the `| EMR file attachments | ... |` row (reverse-chronological order, newest on top):

```
| Local-disk storage driver | Unified `StorageDriver` abstraction (`storage-driver.ts`) replaces the broken S3 presign paths for both EMR attachments and pet photos — local disk now, BYO-cloud-per-tenant driver required before production (ADR-0022, boot-guarded: refuses to start in `NODE_ENV=production` unless `ALLOW_LOCAL_STORAGE_IN_PROD=true`). EMR upload collapses presign→PUT→confirm to one multipart `POST`, download/delete stream through the driver; legacy fileUrl-reference registration (ADR-0021) is preserved on the same route. Pet photos move to a stable per-pet key (overwrite-in-place, no orphans) and a private, permission-gated serve route — closes a client-writable-`photoUrl` cross-tenant/cross-module read hole (BA sign-off). New `AuthedPetImage`/`useAuthedImage` frontend component replaces every raw `<img src={photoUrl}>` site (`ClinicPets.tsx` grid + detail, `ClinicEMR.tsx` avatar). Deletes the S3 presign stack (`config/storage.ts`, `upload.service.ts`, `upload.controller.ts`, `upload.routes.ts`) and both `@aws-sdk/*` deps (PR #<fill in>, ADR-0022) | ✅ <fill in backend total> backend + <fill in frontend total> frontend tests |
```

Replace `<fill in>`/`<fill in backend total>`/`<fill in frontend total>` with the actual PR number (once opened by `/anemal-finish-branch`) and the test counts recorded in Steps 1–2.

- [ ] **Step 4: Update `implementation-status-matrix.md`**

Prepend a new paragraph to the running changelog header (immediately after the `> **Header rule...` block, before the existing `> Current totals as of PR #41...` paragraph):

```
> Current totals as of PR #<fill in> (2026-07-22, "unified local-disk storage
> driver", ADR-0022): replaced the broken S3 presign paths (both EMR
> attachments and pet photos returned 503 STORAGE_NOT_CONFIGURED with no AWS
> credentials configured) with a pluggable `StorageDriver` abstraction and a
> `LocalDiskDriver` implementation, boot-guarded against accidental
> production use. EMR upload is now a single multipart `POST` (was
> presign→PUT→confirm); the legacy fileUrl-reference registration path from
> ADR-0021 is preserved on the same route. Pet photos use a stable per-pet
> key (overwrite-in-place) and a private authenticated serve route, closing
> a client-writable-`photoUrl` cross-tenant/cross-module read hole found in
> BA sign-off. New `AuthedPetImage`/`useAuthedImage` component replaces every
> raw `<img src={photoUrl}>` across `ClinicPets.tsx` and `ClinicEMR.tsx`.
> Deletes the S3 presign stack and both `@aws-sdk/*` deps. Local disk is
> testing-only — a BYO-cloud-per-tenant driver is required before
> production (recorded in cross-session operator memory).
> Backend <fill in prior total> → <fill in new total>, frontend <fill in prior total> → <fill in new total> — on top of PR #41 (2026-07-21,
```

(This prepends before the existing `"EMR file attachment uploads for pet medical records"` paragraph — the `— on top of PR #41 (2026-07-21,` fragment intentionally reconnects to the existing text that follows it, preserving the chronological chain.)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .claude/specs/implementation-status-matrix.md
git commit -m "docs: record unified local-disk storage driver ship (ADR-0022)"
```

---

## Ponytail scope note

This plan touches roughly 25 backend files (2 new: `storage-driver.ts`, `filename.ts`; 4 deleted: the S3 stack; ~15 modified across EMR/pet routes-controllers-services-repositories; ~5 test files) and ~11 frontend files (1 new: `AuthedPetImage.tsx`; ~8 modified; ~5 test files), for a total in the high 30s — clearing the Ponytail Gate's >15-files and >3-subsystems thresholds (driver core, EMR upload migration, pet-photo upload migration, serving routes, frontend image-display refactor, S3-stack deletion).

**Approved fallback (per this task's brief) if `@ponytail-agent` rejects on scope:** split at the Task 8/11 boundary. Ship first: Tasks 1–7 (driver core + boot guard + multer dep + full EMR migration) and Task 11 (S3-stack deletion, since Task 5 already moved EMR off it — Task 11's grep-verify step would need re-running to confirm pet-photo code isn't blocking it, so if split, Task 11 should move to the fast-follow PR alongside pet-photo, deleting the S3 stack only once both upload paths are confirmed off it) — this delivers a complete, independently shippable fix for the reported EMR 503 bug. Fast-follow PR: Tasks 8–10 (pet-photo backend, including the R-1 security fix) + Tasks 13–18 (AuthedPetImage + all pet-photo frontend wiring) + Task 11 (S3 deletion, now safe) + Task 19 (docs, run once at the end of whichever PR ships last). Groups are already self-contained per the file lists above, so this split is mechanical — no task needs rewriting, only reordering across two PRs.
