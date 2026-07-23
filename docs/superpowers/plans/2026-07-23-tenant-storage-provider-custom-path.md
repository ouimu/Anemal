# Per-Tenant Storage Provider — Custom Path (SMB Share) Driver — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Sub-project:** 1 of 3 on `feature/tenant-storage-provider` (custom-path now; Google Drive, OneDrive follow as later tasks on the same branch, per the locked build-order decision).

**Goal:** A Clinic Admin can point their tenant's EMR attachments + pet photos at a network share (SMB) instead of the shared server's local disk, authenticating with per-tenant credentials at the application layer (never relying on OS-level session state). Builds on ADR-0022's `StorageDriver` interface — `getStorageDriver()` becomes the async, per-tenant switch point ADR-0022 always intended.

**Inputs (read in full before this plan was written):**
- Design (final, post-grill): `docs/superpowers/specs/2026-07-23-storage-custom-path-driver-design.md`
- BA sign-off: `docs/superpowers/specs/2026-07-23-storage-custom-path-driver-ba-signoff.md`
- Grill record: `docs/superpowers/specs/2026-07-23-storage-custom-path-driver-grill.md`
- ADR: `docs/adr/0023-per-tenant-network-share-storage-driver.md`

**Architecture:** New `SmbShareDriver` (implements the existing `StorageDriver` interface) alongside `LocalDiskDriver`. `SmbShareDriver` talks to the network share only through an injectable `SmbClient` interface (`src/backend/config/smb-client.ts`) — this is the seam that lets every driver-level test run against a fake, in-memory SMB client with zero real network dependency; the concrete SMB2 library is wired up behind that one factory function (`createSmbClient`) and nowhere else. `getStorageDriver(tenantId: number)` becomes async: it reads (or defaults) `TenantStorageConfig`, decrypts the stored credential via the existing `SETTINGS_ENCRYPTION_KEY` AES-256-GCM helpers, and returns the right driver. All 5 existing call sites (`pet.service.ts` ×2, `emr-attachment.service.ts` ×3) are updated to `await` it, preserving the "resolve once per operation" rule already documented at the two call sites that do delete-then-save.

**Tech Stack:** Node/Express/TypeScript backend (Prisma/Postgres), React 18/Vite frontend, Jest/supertest (backend), Vitest/Testing Library (frontend). One new runtime dependency: an SMB2 client library (`@marsaud/smb2` — see Task 4), isolated behind `SmbClient`/`createSmbClient` so the specific package is a one-file decision.

## PR Split (Ponytail Step-5 ruling, 2026-07-23 — REQUIRED)

The single-PR plan was REJECTED on scope (criterion 4: >3 subsystems as one PR). Execute as two sequenced PRs on this **same branch** (`feature/tenant-storage-provider`) — no branch split, that is a locked user decision. Do not ship all 12 tasks at once.

- **Sub-PR A — storage-layer core (DB + storage-core + services), Tasks 1–7:**
  `TenantStorageConfig` schema + migration (Task 1), `StorageNotFoundError`/`StorageUnavailableError` types (Task 2), `LocalDiskDriver` atomic-write + error-classification hardening (Task 3), the `SmbClient` seam + `FakeSmbClient` test double + `createSmbClient()` wired to the real SMB2 library (Task 4 — the concrete package selection is the **first implementation sub-step of Sub-PR A**, done before Task 5 is written, so `SmbShareDriver` and every later real-connect test has a working factory to run against), `SmbShareDriver` (Task 5), the `TenantStorageConfig` repository + `resolveStorageConfig` service (Task 6), and the async `getStorageDriver(tenantId)` rewrite across all 5 existing call sites (Task 7). No user-facing surface ships in Sub-PR A — it is fully covered by unit tests against `FakeSmbClient`/temp dirs, nothing depends on a real network share yet.
- **Sub-PR B — API + frontend (services + API + frontend), Tasks 8–12. Depends on Sub-PR A having merged:**
  Storage-config write logic — validate/connect-test/persist/audit (Task 8), the `GET`/`PUT /clinic/storage-config` controller (Task 9), routes (Task 10), the Clinic Settings Storage frontend section + `useStorageConfig` hook (Task 11), and the EMR-attachment delete-logging fix (Task 12, unrelated bugfix riding along in the same branch per the original plan's note). Task 9's SC-07 connect-test integration test is the first place in either PR that exercises a real (non-routable, fail-fast) SMB connection attempt — it depends on Task 4's real `createSmbClient()` wiring from Sub-PR A already being in place, not a placeholder.

Each sub-PR runs its own Step 6→8 (execute → code-review/qa → finish-branch). Sub-PR B starts only after Sub-PR A merges to this branch's base for that PR.

## Global Constraints

- Every query that touches `TenantStorageConfig` MUST be tenant-scoped (`WHERE tenantId = :tenantId`); the table's PK **is** `tenantId` (1-to-1 with `Tenant`, `onDelete: Cascade`, same pattern as `TenantSettings`) so this falls out of using `findUnique({ where: { tenantId } })` — never a bare `findFirst`.
- RBAC deny-by-default: `PUT /clinic/storage-config` requires `clinic.integrations.edit`; `GET /clinic/storage-config` requires `clinic.profile.view`. No new permission code (BA R-3 resolved — reuse existing codes).
- Password is never returned by any `GET` — response carries `configured: boolean` instead of the credential fields.
- Storage keys stay server-built only (unchanged from ADR-0022) — this sub-project does not touch key construction, only which driver resolves them.
- No caching of `TenantStorageConfig` — one point-read per storage operation, by design (§3.5 BA sign-off, performance NFR accepted as-is).
- Layered architecture stays Route → Controller → Service → Repository; drivers are constructed only inside `getStorageDriver()`, never directly in a service/controller.
- Cross-tenant existence checks return 404, never 403 (ADR-0014 precedent) — unaffected by this change, but new code must not regress it.
- TypeScript strict mode; no `any` beyond what already exists in touched files.

---

## Task 1: `TenantStorageConfig` Prisma model + migration

**Files:**
- Modify: `src/backend/prisma/schema.prisma`
- Create: `src/backend/prisma/migrations/20260723120000_add_tenant_storage_config/migration.sql`
- Modify: `src/backend/models/settings-audit.repository.ts` (widen the `tableName` union — see Step 3)

**Interfaces:**
- Produces: Prisma model `TenantStorageConfig { tenantId Int @id, provider String @default("local"), smbHost String?, smbShare String?, smbUsername String?, smbPasswordEncrypted String?, updatedAt DateTime @updatedAt }` with `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`. Consumed by Task 6 (repository) and Task 7 (`getStorageDriver`).

- [ ] **Step 1: Add the model to `schema.prisma`**

Insert directly after the closing `}` of `model TenantSettings` (line 135):

```prisma
// Per-tenant BYO storage location (ADR-0023). One row per tenant; absence
// of a row means "use the operator's default LocalDiskDriver" — no backfill
// needed for existing tenants. provider values: 'local' | 'custom_path'
// (future: 'google_drive' | 'onedrive' — kept as a dedicated table, not
// columns on TenantSettings, specifically so those future OAuth-token
// columns land here without bloating TenantSettings, per BA sign-off §3.4).
model TenantStorageConfig {
  tenantId             Int      @id
  provider             String   @default("local") @db.VarChar(20)
  smbHost              String?  @db.VarChar(255)
  smbShare             String?  @db.VarChar(500)
  smbUsername          String?  @db.VarChar(255)
  smbPasswordEncrypted String?
  updatedAt            DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_storage_config")
}
```

Add the back-relation on `model Tenant` (next to the other 1-to-1 config relations, e.g. near where `TenantSettings` back-relation would be if present — check current `Tenant` model for its settings back-relation pattern and mirror it):

```prisma
  storageConfig TenantStorageConfig?
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- src/backend/prisma/migrations/20260723120000_add_tenant_storage_config/migration.sql
CREATE TABLE "tenant_storage_config" (
    "tenantId" INTEGER NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'local',
    "smbHost" VARCHAR(255),
    "smbShare" VARCHAR(500),
    "smbUsername" VARCHAR(255),
    "smbPasswordEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_storage_config_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "tenant_storage_config" ADD CONSTRAINT "tenant_storage_config_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Verify the referenced table name is `"tenants"` (check the `@@map` on `model Tenant`) before running — copy the exact mapped name other FK migrations use (e.g. `20260622155518_add_refresh_tokens/migration.sql`) rather than assuming.

- [ ] **Step 3: Widen `settings_audit_log`'s `tableName` type union**

`src/backend/models/settings-audit.repository.ts` — the DB column is already a plain `VARCHAR(100)` (no DB enum to migrate), but the TS type must accept the new value or Task 8's audit write won't compile:

```ts
// change:
  tableName: 'tenant_settings' | 'system_settings'
// to:
  tableName: 'tenant_settings' | 'system_settings' | 'tenant_storage_config'
```

Same edit in the `SettingsAuditListParams`/`list()` signature is NOT needed (that param is already a plain `string`).

- [ ] **Step 4: Generate + apply**

Run: `cd src/backend && npx prisma generate && npx prisma migrate dev --name add_tenant_storage_config` (or `migrate deploy` in CI/non-interactive contexts, matching how prior migrations in this repo were applied).
Expected: migration applies cleanly against the dev DB; `npx prisma studio` or a quick `SELECT * FROM tenant_storage_config;` confirms the empty table exists.

- [ ] **Step 5: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations/20260723120000_add_tenant_storage_config src/backend/models/settings-audit.repository.ts
git commit -m "feat(storage): add TenantStorageConfig model + migration (ADR-0023)"
```

---

## Task 2: Storage error types — distinguish not-found from unreachable (grill finding #3)

**Files:**
- Modify: `src/backend/config/storage-driver.ts`
- Create: `src/backend/__tests__/storage-errors.test.ts`

**Interfaces:**
- Produces: `class StorageNotFoundError extends AppError` (404, code `STORAGE_FILE_NOT_FOUND`), `class StorageUnavailableError extends AppError` (503, code `STORAGE_UNAVAILABLE`, message `"เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"`). Consumed by Task 3 (`LocalDiskDriver`), Task 5 (`SmbShareDriver`), and by `pet.service.ts`/`emr-attachment.service.ts` (Task 7) which currently do their own `exists()` check-then-404 — after Task 7 those call sites let the driver's own error surface instead of re-deriving it.

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/storage-errors.test.ts
import { StorageNotFoundError, StorageUnavailableError } from '../config/storage-driver'

describe('storage error types', () => {
  test('StorageNotFoundError is a 404 with a stable code', () => {
    const err = new StorageNotFoundError('tenants/1/photo/pet-1.jpg')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('STORAGE_FILE_NOT_FOUND')
  })

  test('StorageUnavailableError is a 503 with the retryable Thai copy (grill finding #3 — must not read as data loss)', () => {
    const err = new StorageUnavailableError(new Error('ETIMEDOUT'))
    expect(err.statusCode).toBe(503)
    expect(err.code).toBe('STORAGE_UNAVAILABLE')
    expect(err.message).toBe('เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-errors.test.ts`
Expected: FAIL — `StorageNotFoundError`/`StorageUnavailableError` not exported yet.

- [ ] **Step 3: Add the error classes to `storage-driver.ts`**

Add below `StorageKeyError`:

```ts
// Grill finding #3: exists()/read() must distinguish "genuinely missing"
// from "any other failure" — a network blip must never read the same as
// data loss (clinic staff mid-consult would otherwise think a file was
// deleted). Every driver throws one of these two, never a bare boolean
// swallow, from read()/exists() failure paths.
export class StorageNotFoundError extends AppError {
  constructor(key: string) {
    super(404, `Storage file not found: ${key}`, 'STORAGE_FILE_NOT_FOUND')
  }
}

export class StorageUnavailableError extends AppError {
  constructor(cause: unknown) {
    super(503, 'เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง', 'STORAGE_UNAVAILABLE', { cause: String(cause) })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-errors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/storage-driver.ts src/backend/__tests__/storage-errors.test.ts
git commit -m "feat(storage): add StorageNotFoundError/StorageUnavailableError (grill finding #3)"
```

---

## Task 3: `LocalDiskDriver` — atomic writes + real error classification

**Files:**
- Modify: `src/backend/config/storage-driver.ts`
- Modify: `src/backend/__tests__/storage-driver.test.ts` (extend, don't replace)

**Interfaces:**
- Changes behavior of `LocalDiskDriver.save/exists/read` only — the `StorageDriver` interface shape is unchanged. `exists()` now returns a plain boolean **only** for the true-not-found case (ENOENT); any other `fs` error rethrows as `StorageUnavailableError`. `read()` throws `StorageNotFoundError` on ENOENT, `StorageUnavailableError` on anything else.

- [ ] **Step 1: Write the failing tests (append to `storage-driver.test.ts`)**

```ts
import { StorageNotFoundError, StorageUnavailableError } from '../config/storage-driver'

// ... inside the existing describe('LocalDiskDriver', ...) block:

test('save() writes to a temp name then renames — grill finding #2 (atomic write)', async () => {
  await driver.save('atomic/first.txt', Buffer.from('v1'), 'text/plain')
  // Simulate a mid-write crash by writing a huge buffer and immediately reading:
  // the old file must never be observed truncated/missing between the two saves.
  const savePromise = driver.save('atomic/first.txt', Buffer.from('v2-longer-content'), 'text/plain')
  await savePromise
  const finalContent = fs.readFileSync(path.join(baseDir, 'atomic/first.txt')).toString()
  expect(finalContent).toBe('v2-longer-content')
  // No stray temp file left behind after a successful save:
  const dirEntries = fs.readdirSync(path.join(baseDir, 'atomic'))
  expect(dirEntries).toEqual(['first.txt'])
})

test('read() throws StorageNotFoundError (not a generic Error) for a missing file', async () => {
  await expect(driver.read('never/here.txt')).rejects.toBeInstanceOf(StorageNotFoundError)
})

test('exists() throws StorageUnavailableError (not false) when the base dir itself is unreadable', async () => {
  const unreadableBase = fs.mkdtempSync(path.join(os.tmpdir(), 'anemal-unreadable-'))
  const restrictedDriver = new LocalDiskDriver(unreadableBase)
  await restrictedDriver.save('probe.txt', Buffer.from('x'), 'text/plain')
  // Force a non-ENOENT error: replace the target with a directory of the same name
  // so fs.access hits EISDIR-adjacent errno instead of ENOENT — simplest reliable
  // way to produce "some other error" without touching OS permissions cross-platform.
  const target = path.join(unreadableBase, 'probe.txt')
  fs.rmSync(target)
  fs.mkdirSync(path.join(target, 'nested'), { recursive: true }) // probe.txt is now a directory
  await expect(restrictedDriver.read('probe.txt')).rejects.toBeInstanceOf(StorageUnavailableError)
  fs.rmSync(unreadableBase, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-driver.test.ts`
Expected: FAIL — `read()` currently throws a bare `EISDIR`/`ENOENT` Error, not the typed classes; the atomic-write test may pass already (direct `writeFile` still ends up correct in the non-crash case) but the "no stray temp file" assertion is the meaningful new check once Step 3 lands temp-then-rename.

- [ ] **Step 3: Implement — temp-then-rename + error classification**

Replace `save`/`read`/`exists` in `LocalDiskDriver`:

```ts
import { randomUUID } from 'crypto'

  async save(key: string, body: Buffer, _contentType: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    // Grill finding #2: write to a temp name in the same directory, then
    // rename over the final key. A connection/process drop mid-write leaves
    // the temp file orphaned, never the previous good file truncated —
    // critical for pet-photo overwrite-in-place.
    const tempTarget = `${target}.tmp-${randomUUID()}`
    await fs.writeFile(tempTarget, body)
    await fs.rename(tempTarget, target)
  }

  async read(key: string): Promise<Buffer> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      return await fs.readFile(target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageNotFoundError(key)
      throw new StorageUnavailableError(err)
    }
  }

  async delete(key: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.unlink(target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new StorageUnavailableError(err)
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.access(target)
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw new StorageUnavailableError(err)
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-driver.test.ts`
Expected: PASS (all prior + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/storage-driver.ts src/backend/__tests__/storage-driver.test.ts
git commit -m "fix(storage): LocalDiskDriver atomic writes + typed not-found/unavailable errors (grill #2, #3)"
```

---

## Task 4: `SmbClient` interface + fake test double + `createSmbClient()` factory

**Files:**
- Create: `src/backend/config/smb-client.ts`
- Create: `src/backend/__tests__/helpers/fakeSmbClient.ts`

**Interfaces:**
- Produces: `interface SmbClient { connect(): Promise<void>; writeFile(remotePath: string, body: Buffer): Promise<void>; readFile(remotePath: string): Promise<Buffer>; unlink(remotePath: string): Promise<void>; rename(fromPath: string, toPath: string): Promise<void>; exists(remotePath: string): Promise<boolean>; disconnect(): Promise<void> }`, `interface SmbClientConfig { host: string; share: string; username: string; password: string }`, `function createSmbClient(config: SmbClientConfig): SmbClient`, and error classes `SmbHostUnreachableError`/`SmbShareNotFoundError`/`SmbAuthRejectedError` (all `extends AppError`, 400-class — these surface as the specific save-time validation reasons in Task 8). Consumed by Task 5 (`SmbShareDriver`) via constructor injection, and Task 8 (controller connect-test) via `createSmbClient` directly.
- **Chosen SMB2 client package: `@marsaud/smb2`.** Rationale (Ponytail-required build-time judgment call, made now rather than left as a Task 4 placeholder): it is the pure-JS SMB2 client most widely used in production Node code for exactly this shape of task (connect/readFile/writeFile/unlink/rename/exists against an authenticated share) and needs no native/CLI dependency (`smbclient` binary, `node-gyp` toolchain), which matters because the app server itself must open the connection — a CLI-wrapper client (e.g. `samba-client`) is out because it isn't pure JS and requires an OS-level `smbclient` install on the server, which this design's per-tenant, app-layer-authenticated model does not assume is present. Re-verify current npm maintenance status (last publish, open issues) immediately before running `npm install` in Sub-PR A's Task 4 — if it has gone stale since this plan was written, the fallback is any other actively-maintained pure-JS SMB2/3 client satisfying the same `SmbClient` interface shape; the interface seam (this file) is what makes that swap a one-file change.
- This package selection is made and wired into `createSmbClient()` as the **first implementation sub-step of Sub-PR A**, before Task 5 (`SmbShareDriver`) is written — see the "PR Split" section near the top of this plan. `SmbShareDriver`'s own tests (Task 5) never depend on the chosen library or a live share — they run entirely against `FakeSmbClient`, an in-memory `Map<string, Buffer>` implementing the same `SmbClient` interface — but Task 9's SC-07 real-connect-test integration test in Sub-PR B has nothing to test against until this wiring exists.

- [ ] **Step 1: Write `smb-client.ts` (interface + error classes only, factory throws until the library is wired)**

```ts
// src/backend/config/smb-client.ts
// Thin seam between SmbShareDriver and whatever SMB2 client library is
// chosen. Every consumer depends on this interface, never on the concrete
// library — this is what lets SmbShareDriver's tests run against
// FakeSmbClient with zero network dependency (ADR-0023).
import { AppError } from '../utils/errors'

export interface SmbClientConfig {
  host:     string
  share:    string
  username: string
  password: string
}

export interface SmbClient {
  connect(): Promise<void>
  writeFile(remotePath: string, body: Buffer): Promise<void>
  readFile(remotePath: string): Promise<Buffer>
  unlink(remotePath: string): Promise<void>
  rename(fromPath: string, toPath: string): Promise<void>
  exists(remotePath: string): Promise<boolean>
  disconnect(): Promise<void>
}

// Surfaced as specific, distinct save-time reasons (design §"Address format")
// rather than one generic "failed" — the chosen SMB2 client library must
// distinguish these natively (connection refused/timeout vs. STATUS_BAD_NETWORK_NAME
// vs. STATUS_LOGON_FAILURE); createSmbClient's implementation maps the
// library's native errors onto these three.
export class SmbHostUnreachableError extends AppError {
  constructor(host: string) { super(400, `Cannot reach host: ${host}`, 'SMB_HOST_UNREACHABLE') }
}
export class SmbShareNotFoundError extends AppError {
  constructor(share: string) { super(400, `Share not found: ${share}`, 'SMB_SHARE_NOT_FOUND') }
}
export class SmbAuthRejectedError extends AppError {
  constructor() { super(400, 'Credentials were rejected', 'SMB_AUTH_REJECTED') }
}

/**
 * Real SMB2 client factory — implemented against `@marsaud/smb2` (chosen
 * package, see this task's rationale note above) as the first implementation
 * sub-step of Sub-PR A, before Task 5 (SmbShareDriver) is written. Wraps the
 * library's connect/readFile/writeFile/unlink/rename/exists calls and maps
 * its native connection/auth/share errors onto SmbHostUnreachableError /
 * SmbShareNotFoundError / SmbAuthRejectedError. Every other file depends only
 * on SmbClient — this is the one place the concrete package is imported.
 */
export function createSmbClient(config: SmbClientConfig): SmbClient {
  // @dev-agent: implement against `@marsaud/smb2` here (npm install first).
  throw new Error('createSmbClient: SMB2 library not yet wired up — implement against @marsaud/smb2')
}
```

- [ ] **Step 2: Write the fake test double**

```ts
// src/backend/__tests__/helpers/fakeSmbClient.ts
// In-memory stand-in for SmbClient — used by every SmbShareDriver unit test
// (Task 5) so none of them touch a real network share.
import { SmbClient, SmbHostUnreachableError, SmbShareNotFoundError, SmbAuthRejectedError } from '../../config/smb-client'

export interface FakeSmbClientOptions {
  failConnectAs?: 'unreachable' | 'share-not-found' | 'auth-rejected'
}

export class FakeSmbClient implements SmbClient {
  private files = new Map<string, Buffer>()
  private connected = false

  constructor(private opts: FakeSmbClientOptions = {}) {}

  async connect(): Promise<void> {
    if (this.opts.failConnectAs === 'unreachable') throw new SmbHostUnreachableError('fake-host')
    if (this.opts.failConnectAs === 'share-not-found') throw new SmbShareNotFoundError('fake-share')
    if (this.opts.failConnectAs === 'auth-rejected') throw new SmbAuthRejectedError()
    this.connected = true
  }

  private assertConnected() {
    if (!this.connected) throw new Error('FakeSmbClient: not connected — call connect() first')
  }

  async writeFile(remotePath: string, body: Buffer): Promise<void> {
    this.assertConnected()
    this.files.set(remotePath, Buffer.from(body))
  }

  async readFile(remotePath: string): Promise<Buffer> {
    this.assertConnected()
    const buf = this.files.get(remotePath)
    if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return buf
  }

  async unlink(remotePath: string): Promise<void> {
    this.assertConnected()
    this.files.delete(remotePath)
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    this.assertConnected()
    const buf = this.files.get(fromPath)
    if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    this.files.set(toPath, buf)
    this.files.delete(fromPath)
  }

  async exists(remotePath: string): Promise<boolean> {
    this.assertConnected()
    return this.files.has(remotePath)
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }
}
```

- [ ] **Step 3: No assertion step here** — this task has no independent test file of its own (the interface + fake are exercised through Task 5's `SmbShareDriver` tests). Verify only that both files compile: `cd src/backend && npx tsc --noEmit`.
Expected: no new type errors introduced by these two files.

- [ ] **Step 4: Commit**

```bash
git add src/backend/config/smb-client.ts src/backend/__tests__/helpers/fakeSmbClient.ts
git commit -m "feat(storage): SmbClient interface + FakeSmbClient test double (ADR-0023)"
```

---

## Task 5: `SmbShareDriver` implements `StorageDriver`

**Files:**
- Create: `src/backend/config/smb-share-driver.ts`
- Create: `src/backend/__tests__/smb-share-driver.test.ts`

**Interfaces:**
- Consumes: `SmbClient`/`SmbClientConfig` (Task 4), `StorageDriver`/`StorageNotFoundError`/`StorageUnavailableError` (Task 2/existing).
- Produces: `class SmbShareDriver implements StorageDriver` — constructor `(config: SmbClientConfig, clientFactory: (config: SmbClientConfig) => SmbClient = createSmbClient)`. The injectable second constructor param (defaulting to the real factory) is exactly what lets tests pass a factory that returns `FakeSmbClient` instead. Consumed by Task 7 (`getStorageDriver`) and Task 8 (controller's connect-and-test-write, called directly with the real `createSmbClient` default).

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/smb-share-driver.test.ts
import { SmbShareDriver } from '../config/smb-share-driver'
import { FakeSmbClient } from './helpers/fakeSmbClient'
import { StorageNotFoundError, StorageUnavailableError } from '../config/storage-driver'
import { SmbHostUnreachableError, SmbShareNotFoundError, SmbAuthRejectedError } from '../config/smb-client'

const fakeConfig = { host: 'fake-host', share: 'fake-share', username: 'u', password: 'p' }

describe('SmbShareDriver', () => {
  test('save() then read() round-trips the exact bytes', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('img-bytes'), 'image/jpeg')
    const buf = await driver.read('tenants/1/photo/pet-1.jpg')
    expect(buf.toString()).toBe('img-bytes')
  })

  test('save() writes to a temp name then renames (grill finding #2, mirrors LocalDiskDriver)', async () => {
    const client = new FakeSmbClient()
    const writeSpy = jest.spyOn(client, 'writeFile')
    const renameSpy = jest.spyOn(client, 'rename')
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await driver.save('a/b.txt', Buffer.from('x'), 'text/plain')
    expect(writeSpy).toHaveBeenCalledWith(expect.stringMatching(/\.tmp-/), expect.any(Buffer))
    expect(renameSpy).toHaveBeenCalledWith(expect.stringMatching(/\.tmp-/), 'a/b.txt')
  })

  test('exists() is false before save and true after', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    expect(await driver.exists('never.txt')).toBe(false)
    await driver.save('never.txt', Buffer.from('x'), 'text/plain')
    expect(await driver.exists('never.txt')).toBe(true)
  })

  test('read() on a missing key throws StorageNotFoundError, not the raw client error', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.read('ghost.txt')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('delete() is idempotent on an already-missing key', async () => {
    const client = new FakeSmbClient()
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.delete('nothing.txt')).resolves.toBeUndefined()
  })

  test('connection failure (unreachable host) surfaces as StorageUnavailableError from save/read/exists', async () => {
    const client = new FakeSmbClient({ failConnectAs: 'unreachable' })
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.save('a.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageUnavailableError)
    await expect(driver.exists('a.txt')).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  test('connect() opens and disconnect() closes per-operation — no persistent pooled connection (ADR-0023 §2)', async () => {
    const client = new FakeSmbClient()
    const connectSpy = jest.spyOn(client, 'connect')
    const disconnectSpy = jest.spyOn(client, 'disconnect')
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await driver.save('a.txt', Buffer.from('x'), 'text/plain')
    await driver.read('a.txt')
    expect(connectSpy).toHaveBeenCalledTimes(2) // once per operation, not shared
    expect(disconnectSpy).toHaveBeenCalledTimes(2)
  })
})

describe('SmbShareDriver — connect-time failure classification (used by the connect-test-write validation, Task 8)', () => {
  test.each([
    ['unreachable', SmbHostUnreachableError],
    ['share-not-found', SmbShareNotFoundError],
    ['auth-rejected', SmbAuthRejectedError],
  ] as const)('propagates %s as its distinct error type (not a generic failure)', async (failMode, ErrorClass) => {
    const client = new FakeSmbClient({ failConnectAs: failMode })
    const driver = new SmbShareDriver(fakeConfig, () => client)
    await expect(driver.save('a.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(ErrorClass)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest smb-share-driver.test.ts`
Expected: FAIL — `Cannot find module '../config/smb-share-driver'`.

- [ ] **Step 3: Implement `SmbShareDriver`**

```ts
// src/backend/config/smb-share-driver.ts
// StorageDriver backed by a per-tenant authenticated SMB share (ADR-0023).
// Opens and closes its own connection per operation — no pooling (accepted
// latency cost, revisit only if measured to matter).
import { randomUUID } from 'crypto'
import { StorageDriver, StorageNotFoundError, StorageUnavailableError } from './storage-driver'
import { SmbClient, SmbClientConfig, createSmbClient } from './smb-client'

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}

export class SmbShareDriver implements StorageDriver {
  constructor(
    private readonly config: SmbClientConfig,
    private readonly clientFactory: (config: SmbClientConfig) => SmbClient = createSmbClient,
  ) {}

  private async withClient<T>(op: (client: SmbClient) => Promise<T>): Promise<T> {
    const client = this.clientFactory(this.config)
    try {
      await client.connect() // classification errors (SmbHostUnreachableError etc.) propagate as-is
      return await op(client)
    } catch (err) {
      if (isNotFound(err)) throw err // let callers below map ENOENT to StorageNotFoundError
      if (err instanceof Error && err.name.startsWith('Smb')) throw err // connect-time classification error
      throw new StorageUnavailableError(err)
    } finally {
      await client.disconnect().catch(() => undefined)
    }
  }

  async save(key: string, body: Buffer, _contentType: string): Promise<void> {
    // Grill finding #2: temp-then-rename, same principle as LocalDiskDriver.
    const tempKey = `${key}.tmp-${randomUUID()}`
    await this.withClient(async (client) => {
      await client.writeFile(tempKey, body)
      await client.rename(tempKey, key)
    })
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await this.withClient((client) => client.readFile(key))
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(key)
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.withClient((client) => client.unlink(key))
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.withClient((client) => client.exists(key))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest smb-share-driver.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/smb-share-driver.ts src/backend/__tests__/smb-share-driver.test.ts
git commit -m "feat(storage): add SmbShareDriver (ADR-0023) — atomic writes, typed error classification"
```

---

## Task 6: `TenantStorageConfig` repository + `storage-config.service.ts` (encrypt/decrypt, resolve)

**Files:**
- Create: `src/backend/models/tenant-storage-config.repository.ts`
- Create: `src/backend/services/storage-config.service.ts`
- Create: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Produces: repository `getStorageConfig(tenantId: number): Promise<TenantStorageConfig | null>`, `upsertStorageConfig(tenantId: number, data: {...}): Promise<TenantStorageConfig>`. Service `resolveStorageConfig(tenantId: number): Promise<{ provider: 'local' } | { provider: 'custom_path', host: string, share: string, username: string, password: string }>` — this is what Task 7's `getStorageDriver` calls; it decrypts `smbPasswordEncrypted` via the existing `decryptField` helper (`src/backend/utils/encryption.ts`, reused verbatim, no new crypto code per ADR-0023 instruction to reuse `SETTINGS_ENCRYPTION_KEY`).

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/storage-config.service.test.ts
import { encryptField } from '../utils/encryption'

jest.mock('../models/tenant-storage-config.repository')
import * as repo from '../models/tenant-storage-config.repository'
import { resolveStorageConfig } from '../services/storage-config.service'

describe('resolveStorageConfig', () => {
  test('no config row → { provider: "local" }', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({ provider: 'local' })
  })

  test('provider="local" row → { provider: "local" } (explicit revert, not just absence)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({ provider: 'local' })
  })

  test('provider="custom_path" row → decrypts the stored password before returning', async () => {
    const encrypted = encryptField('supersecret')
    ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'custom_path',
      smbHost: '10.0.0.5', smbShare: 'vetfiles', smbUsername: 'clinicuser',
      smbPasswordEncrypted: encrypted,
    })
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({
      provider: 'custom_path', host: '10.0.0.5', share: 'vetfiles', username: 'clinicuser', password: 'supersecret',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement repository + service**

```ts
// src/backend/models/tenant-storage-config.repository.ts
import prisma from '../config/db'

export interface StorageConfigWriteData {
  provider:              'local' | 'custom_path'
  smbHost?:              string | null
  smbShare?:             string | null
  smbUsername?:          string | null
  smbPasswordEncrypted?: string | null
}

export function getStorageConfig(tenantId: number) {
  return prisma.tenantStorageConfig.findUnique({ where: { tenantId } })
}

export function upsertStorageConfig(tenantId: number, data: StorageConfigWriteData) {
  return prisma.tenantStorageConfig.upsert({
    where:  { tenantId },
    create: { tenantId, ...data },
    update: data,
  })
}
```

```ts
// src/backend/services/storage-config.service.ts
import * as repo from '../models/tenant-storage-config.repository'
import { decryptField } from '../utils/encryption'

export type ResolvedStorageConfig =
  | { provider: 'local' }
  | { provider: 'custom_path'; host: string; share: string; username: string; password: string }

/**
 * Resolves what driver a tenant should use. Absence of a row and an
 * explicit provider='local' row are equivalent — both mean "use the
 * operator's LocalDiskDriver default" (BA sign-off §3.3, no backfill needed).
 */
export async function resolveStorageConfig(tenantId: number): Promise<ResolvedStorageConfig> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local' }

  return {
    provider: 'custom_path',
    host:     row.smbHost ?? '',
    share:    row.smbShare ?? '',
    username: row.smbUsername ?? '',
    password: row.smbPasswordEncrypted ? decryptField(row.smbPasswordEncrypted) : '',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/tenant-storage-config.repository.ts src/backend/services/storage-config.service.ts src/backend/__tests__/storage-config.service.test.ts
git commit -m "feat(storage): TenantStorageConfig repository + resolveStorageConfig service (ADR-0023)"
```

---

## Task 7: `getStorageDriver(tenantId)` async + update all 5 call sites

**Files:**
- Modify: `src/backend/config/storage-driver.ts`
- Modify: `src/backend/services/pet.service.ts` (2 call sites: `uploadPetPhoto`, `getPetPhotoFile`)
- Modify: `src/backend/services/emr-attachment.service.ts` (3 call sites: `uploadEmrAttachment`, `getAttachmentFileForDownload`, `deleteAttachment`)
- Modify: `src/backend/__tests__/storage-driver.test.ts` (add async-resolution tests)
- Modify: existing `pet-photo`/`emr-attachments` integration test files only if the async signature change breaks a direct unit-level call to `getStorageDriver()` (grep first — the two service files are the only production callers per the design doc's confirmed call-site count).

**Interfaces:**
- Changes: `function getStorageDriver(): StorageDriver` → `async function getStorageDriver(tenantId: number): Promise<StorageDriver>`. Every caller must `await` it. **Resolve-once-per-operation rule (BA sign-off §1, §3.5):** in `uploadPetPhoto` and `uploadEmrAttachment` (each does delete-old-then-save-new or save-then-create-row-then-rollback-delete), call `getStorageDriver(tenantId)` exactly once at the top of the function and reuse the returned instance for every subsequent driver call in that function — never call it a second time mid-operation.

- [ ] **Step 1: Write the failing test (add to `storage-driver.test.ts`)**

```ts
describe('getStorageDriver(tenantId)', () => {
  test('no TenantStorageConfig row → resolves a LocalDiskDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({ provider: 'local' })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(LocalDiskDriver)
  })

  test('provider="custom_path" row → resolves a SmbShareDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({
      provider: 'custom_path', host: 'h', share: 's', username: 'u', password: 'p',
    })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(SmbShareDriver)
  })
})
```

(Add the necessary imports/mocks — `jest.mock('../services/storage-config.service')` at the top of the file, matching Task 6's test-mocking style.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-driver.test.ts`
Expected: FAIL — `getStorageDriver` is still synchronous and takes no `tenantId`.

- [ ] **Step 3: Implement**

`storage-driver.ts` — replace the final export:

```ts
import { resolveStorageConfig } from '../services/storage-config.service'
import { SmbShareDriver } from './smb-share-driver'

export async function getStorageDriver(tenantId: number): Promise<StorageDriver> {
  const resolved = await resolveStorageConfig(tenantId)
  if (resolved.provider === 'custom_path') {
    return new SmbShareDriver({
      host: resolved.host, share: resolved.share, username: resolved.username, password: resolved.password,
    })
  }
  return new LocalDiskDriver()
}
```

`pet.service.ts` — in `uploadPetPhoto`, change `const driver = getStorageDriver()` → `const driver = await getStorageDriver(tenantId)` (single resolution point already sits before both the old-photo delete and the new-photo save — no other change needed, the resolve-once rule already held structurally). In `getPetPhotoFile`, change `const driver = getStorageDriver()` → `const driver = await getStorageDriver(tenantId)`.

`emr-attachment.service.ts`:
- `uploadEmrAttachment`: `const driver = getStorageDriver()` → `const driver = await getStorageDriver(tenantId)` (single resolution already covers both the save and the rollback-delete in the catch block below it).
- `getAttachmentFileForDownload`: `const driver = getStorageDriver()` → `const driver = await getStorageDriver(tenantId)`.
- `deleteAttachment`: `await getStorageDriver().delete(attachment.storageKey)` → `await (await getStorageDriver(tenantId)).delete(attachment.storageKey)` (this call site does only one driver operation, so the inline `await (await ...)` is acceptable; Task 12 revisits this exact line for the logging fix, so leave the shape simple here).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-driver.test.ts` (new tests) and `cd src/backend && npx jest pet emr-attachments` (regression — confirms every existing pet-photo and EMR-attachment test still passes with the now-async driver resolution).
Expected: PASS — no behavior change for zero-config tenants (BA sign-off §3.3 "clean default" requirement).

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/storage-driver.ts src/backend/services/pet.service.ts src/backend/services/emr-attachment.service.ts src/backend/__tests__/storage-driver.test.ts
git commit -m "feat(storage): getStorageDriver(tenantId) becomes async, resolves per-tenant provider (ADR-0023)"
```

---

## Task 8: `storage-config.service.ts` — validate, connect-test, persist, audit (the PUT business logic)

**Files:**
- Modify: `src/backend/services/storage-config.service.ts` (add the write-path functions alongside Task 6's `resolveStorageConfig`)
- Modify: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Produces: `getStorageConfigForDisplay(tenantId: number): Promise<{ provider: string; configured: boolean; smbHost?: string; smbShare?: string; smbUsername?: string }>` (never includes the password), `updateStorageConfig(tenantId: number, userId: number, input: UpdateStorageConfigInput): Promise<...>` where `UpdateStorageConfigInput = { provider: 'local' | 'custom_path'; smbHost?: string; smbShare?: string; smbUsername?: string; smbPassword?: string; confirmBaseChange?: boolean }`. Throws `StorageConfigSwitchConfirmationRequiredError` (409, code `STORAGE_SWITCH_CONFIRMATION_REQUIRED`) if the effective base is changing and `confirmBaseChange` was not `true` (closes BA R-2 / design's switch-time confirmation). Consumed by Task 9's controller.

- [ ] **Step 1: Write the failing tests (add to `storage-config.service.test.ts`)**

```ts
import { updateStorageConfig, getStorageConfigForDisplay, StorageConfigSwitchConfirmationRequiredError } from '../services/storage-config.service'
import { SmbHostUnreachableError } from '../config/smb-client'

jest.mock('../config/smb-share-driver')
import { SmbShareDriver } from '../config/smb-share-driver'

describe('getStorageConfigForDisplay', () => {
  test('no row → { provider: "local", configured: false }, no password field present', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await getStorageConfigForDisplay(1)
    expect(result).toEqual({ provider: 'local', configured: false })
    expect(result).not.toHaveProperty('smbPassword')
    expect(result).not.toHaveProperty('smbPasswordEncrypted')
  })

  test('custom_path row → configured: true, host/share/username present, no password field', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:...',
    })
    const result = await getStorageConfigForDisplay(1)
    expect(result).toEqual({ provider: 'custom_path', configured: true, smbHost: 'h', smbShare: 's', smbUsername: 'u' })
  })
})

describe('updateStorageConfig', () => {
  beforeEach(() => jest.clearAllMocks())

  test('switching local → custom_path without confirmBaseChange throws the confirmation-required error, persists nothing', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null) // currently local (no row)
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p',
    })).rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })

  test('connect-and-test-write failure (host unreachable) → rejects with the specific error, persists nothing', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    ;(SmbShareDriver as jest.Mock).mockImplementation(() => ({
      save: jest.fn().mockRejectedValue(new SmbHostUnreachableError('h')),
    }))
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true,
    })).rejects.toBeInstanceOf(SmbHostUnreachableError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })

  test('happy path (with confirmation) — encrypts password, persists, writes an audit entry, cleans up the test-write marker', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const deleteSpy = jest.fn().mockResolvedValue(undefined)
    ;(SmbShareDriver as jest.Mock).mockImplementation(() => ({ save: jest.fn().mockResolvedValue(undefined), delete: deleteSpy }))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path' })
    await updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true,
    })
    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u',
      smbPasswordEncrypted: expect.stringMatching(/^enc:v1:/),
    }))
    expect(auditRepo.createMany).toHaveBeenCalledWith([expect.objectContaining({
      tenantId: 1, changedBy: 42, tableName: 'tenant_storage_config',
    })])
    // Resolved open question: the test-write marker is deleted, not left as a residual file.
    expect(deleteSpy).toHaveBeenCalledWith(`tenants/1/.storage-config-test`)
  })

  test('test-write marker cleanup failure is swallowed (logged, not thrown) — a transient delete failure must not block the config save that already succeeded its connect-test', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    ;(SmbShareDriver as jest.Mock).mockImplementation(() => ({
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockRejectedValue(new Error('share blip')),
    }))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path' })
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true,
    })).resolves.toBeUndefined()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })

  test('reverting custom_path → local does not require a connect-test (nothing to test-write against) and still requires confirmation', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:x' })
    await expect(updateStorageConfig(1, 42, { provider: 'local' }))
      .rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: FAIL — `updateStorageConfig`/`getStorageConfigForDisplay`/`StorageConfigSwitchConfirmationRequiredError` not exported yet.

- [ ] **Step 3: Implement**

Add to `storage-config.service.ts`:

```ts
import { encryptField } from '../utils/encryption'
import * as auditRepo from '../models/settings-audit.repository'
import { SmbShareDriver } from './smb-share-driver'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

export class StorageConfigSwitchConfirmationRequiredError extends AppError {
  constructor() {
    super(409, 'Changing the storage location requires confirmation — existing files will not move automatically', 'STORAGE_SWITCH_CONFIRMATION_REQUIRED')
  }
}

export interface StorageConfigDisplay {
  provider:    string
  configured:  boolean
  smbHost?:    string
  smbShare?:   string
  smbUsername?:string
}

/** Never includes the password — a "configured" boolean stands in for it (design §"Address format"). */
export async function getStorageConfigForDisplay(tenantId: number): Promise<StorageConfigDisplay> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local', configured: false }
  return {
    provider:   row.provider,
    configured: true,
    smbHost:    row.smbHost ?? undefined,
    smbShare:   row.smbShare ?? undefined,
    smbUsername:row.smbUsername ?? undefined,
  }
}

export interface UpdateStorageConfigInput {
  provider:           'local' | 'custom_path'
  smbHost?:           string
  smbShare?:          string
  smbUsername?:       string
  smbPassword?:       string
  confirmBaseChange?: boolean
}

// The "effective base" a tenant's files resolve against. Two custom_path
// configs with different host/share are a different base too, not just
// local vs custom_path (BA sign-off §2.3 note, generalized).
function effectiveBaseKey(row: { provider: string; smbHost?: string | null; smbShare?: string | null } | null): string {
  if (!row || row.provider === 'local') return 'local'
  return `custom_path:${row.smbHost}:${row.smbShare}`
}

export async function updateStorageConfig(
  tenantId: number,
  userId: number,
  input: UpdateStorageConfigInput,
): Promise<void> {
  const current = await repo.getStorageConfig(tenantId)
  const currentBase = effectiveBaseKey(current)
  const nextBase = effectiveBaseKey(
    input.provider === 'custom_path'
      ? { provider: 'custom_path', smbHost: input.smbHost, smbShare: input.smbShare }
      : { provider: 'local' },
  )

  if (currentBase !== nextBase && !input.confirmBaseChange) {
    throw new StorageConfigSwitchConfirmationRequiredError()
  }

  if (input.provider === 'custom_path') {
    // Connect-and-test-write BEFORE persisting anything (decision 5) — a
    // failure here (SmbHostUnreachableError / SmbShareNotFoundError /
    // SmbAuthRejectedError) propagates as-is and nothing is written.
    const testDriver = new SmbShareDriver({
      host: input.smbHost ?? '', share: input.smbShare ?? '',
      username: input.smbUsername ?? '', password: input.smbPassword ?? '',
    })
    const testKey = `tenants/${tenantId}/.storage-config-test`
    await testDriver.save(testKey, Buffer.from('test-write'), 'text/plain')
    // Resolved open question: clean up the marker file immediately after a
    // successful test-write — best-effort, logged not surfaced, so a
    // transient delete failure on the just-proven-writable share never
    // blocks the actual config save that follows.
    await testDriver.delete(testKey).catch((deleteErr) => {
      logger.warn({ tenantId, testKey, deleteErr: String(deleteErr) }, 'storage-config test-write marker cleanup failed — harmless orphan, ignored')
    })

    await repo.upsertStorageConfig(tenantId, {
      provider: 'custom_path',
      smbHost: input.smbHost, smbShare: input.smbShare, smbUsername: input.smbUsername,
      smbPasswordEncrypted: input.smbPassword ? encryptField(input.smbPassword) : current?.smbPasswordEncrypted,
    })
  } else {
    await repo.upsertStorageConfig(tenantId, { provider: 'local', smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null })
  }

  await auditRepo.createMany([{
    tenantId, changedBy: userId, tableName: 'tenant_storage_config',
    fieldName: 'provider', oldValue: current?.provider ?? 'local', newValue: input.provider,
  }])
}
```

Resolved: the test-write key (`tenants/{tenantId}/.storage-config-test`) is deleted immediately after a successful test-write (see the `testDriver.delete(testKey).catch(...)` line above) rather than left as a residual marker — cleanup is best-effort and logged, never allowed to block or fail the actual config save.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: PASS (6 new + 3 prior = 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/storage-config.service.ts src/backend/__tests__/storage-config.service.test.ts
git commit -m "feat(storage): storage-config validate/connect-test/persist/audit (ADR-0023, closes BA R-2/R-4)"
```

---

## Task 9: Controller — `GET /clinic/storage-config`, `PUT /clinic/storage-config`

**Files:**
- Modify: `src/backend/controllers/settings.controller.ts`
- Create: `src/backend/tests/integration/storage-config.test.ts`

**Interfaces:**
- Produces: `storageConfigSchema` (zod, `.strict()`), `getStorageConfig(req, res, next)`, `updateStorageConfig(req, res, next)` — added to `settings.controller.ts` alongside the existing section handlers, following the exact `updateSection` pattern already there.

- [ ] **Step 1: Write the failing integration tests**

```ts
// src/backend/tests/integration/storage-config.test.ts
// Follows the same seed/token pattern as tests/integration/settings.test.ts —
// copy that file's beforeAll/afterAll tenant+role+token setup verbatim,
// swapping only the endpoint under test.
import request from 'supertest'
// ...(seed a tenant, a clinic_admin token with clinic.integrations.edit + clinic.profile.view,
//     a doctor/staff token WITHOUT clinic.integrations.edit, per the existing settings.test.ts helper)

describe('GET /api/settings/clinic/storage-config', () => {
  test('SC-01: returns provider=local, configured=false for a tenant with no config row', async () => {
    const res = await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(res.body.data).toEqual({ provider: 'local', configured: false })
  })

  test('SC-02: password is never present in the response, even for a configured custom_path tenant', async () => {
    // ... seed a TenantStorageConfig row with provider=custom_path directly via prisma
    const res = await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(JSON.stringify(res.body)).not.toMatch(/smbPassword/i)
    expect(res.body.data.configured).toBe(true)
  })

  test('SC-03: doctor holding clinic.profile.view can read it too', async () => {
    await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${doctorToken}`).expect(200)
  })
})

describe('PUT /api/settings/clinic/storage-config', () => {
  test('SC-04: staff without clinic.integrations.edit → 403', async () => {
    await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ provider: 'local' }).expect(403)
  })

  test('SC-05: switching to custom_path without confirmBaseChange → 409, nothing persisted', async () => {
    const res = await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p' })
      .expect(409)
    expect(res.body.code).toBe('STORAGE_SWITCH_CONFIRMATION_REQUIRED')
  })

  test('SC-06: format-invalid host (empty string) → 400, nothing persisted', async () => {
    await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: '', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true })
      .expect(400)
  })

  test('SC-07: valid submission with confirmBaseChange=true — the SmbShareDriver connect-test will fail in CI (no real share), so this asserts a 400 SMB_* code, NOT a 500 or silent success — proves the request reaches the real connect-test path', async () => {
    const res = await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'custom_path', smbHost: '10.255.255.1', smbShare: 'nope', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true })
      .expect(400)
    expect(res.body.code).toMatch(/^SMB_/)
  })

  test('SC-08: reverting to local with confirmBaseChange=true → 200, configured becomes false', async () => {
    // seed a custom_path row first, then:
    const res = await request(server).put('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'local', confirmBaseChange: true }).expect(200)
    const getRes = await request(server).get('/api/settings/clinic/storage-config')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(getRes.body.data).toEqual({ provider: 'local', configured: false })
  })

  test('SC-09: no token → 401 on both GET and PUT', async () => {
    await request(server).get('/api/settings/clinic/storage-config').expect(401)
    await request(server).put('/api/settings/clinic/storage-config').send({ provider: 'local' }).expect(401)
  })
})
```

**Note on Test SC-07:** the connect-test genuinely dials out (per design — real authenticated connect-and-test-write, no mocking of the SMB layer at the API boundary). Point it at a non-routable address (`10.255.255.1`, RFC 5737-adjacent test range) so it fails fast and deterministically in CI without needing a real share — asserting it comes back as a `400` with an `SMB_*` code (not a hang, not a 500) is the meaningful regression guard here. If this proves flaky in CI (DNS/firewall timeout variance), the fallback is to inject a fake `SmbClient` factory into the service for this one test via a test-only override hook — flagged as an open question at the end of this plan since the design doesn't specify a controller-level test seam for this.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config.test.ts --testPathPattern=integration`
Expected: FAIL — route doesn't exist (404 on all requests).

- [ ] **Step 3: Implement the controller**

Add to `settings.controller.ts`:

```ts
import * as storageConfigSvc from '../services/storage-config.service'

export const storageConfigSchema = z.object({
  provider:          z.enum(['local', 'custom_path']),
  smbHost:           z.string().trim().min(1).max(255).optional(),
  smbShare:          z.string().trim().min(1).max(500).optional(),
  smbUsername:       z.string().trim().min(1).max(255).optional(),
  smbPassword:       z.string().min(1).max(500).optional(),
  confirmBaseChange: z.boolean().optional(),
}).strict().refine(
  (data) => data.provider !== 'custom_path' || (data.smbHost && data.smbShare && data.smbUsername),
  { message: 'smbHost, smbShare, and smbUsername are required when provider is custom_path' },
)

export async function getStorageConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await storageConfigSvc.getStorageConfigForDisplay(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateStorageConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    await storageConfigSvc.updateStorageConfig(tenantId, userId, req.body as storageConfigSvc.UpdateStorageConfigInput)
    const data = await storageConfigSvc.getStorageConfigForDisplay(tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
```

- [ ] **Step 4: Run test to verify it passes (after Task 10 wires the route — this step is a checkpoint, not a full pass yet)**

Run this task's test only after Task 10 lands the route; note that dependency explicitly here so execution doesn't stall trying to pass a route-less controller.

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/settings.controller.ts src/backend/tests/integration/storage-config.test.ts
git commit -m "feat(storage): storage-config controller (GET/PUT), format validation (ADR-0023)"
```

---

## Task 10: Routes — wire `/clinic/storage-config` into `settings.routes.ts`

**Files:**
- Modify: `src/backend/routes/settings.routes.ts`

**Interfaces:**
- Consumes: `getStorageConfig`/`updateStorageConfig`/`storageConfigSchema` (Task 9).

- [ ] **Step 1: Add the two routes**

```ts
router.get('/clinic/storage-config', requirePlane('clinic'), requirePermission('clinic.profile.view'),      ctrl.getStorageConfig)
router.put('/clinic/storage-config', requirePlane('clinic'), requirePermission('clinic.integrations.edit'), validate(ctrl.storageConfigSchema), ctrl.updateStorageConfig)
```

Place directly after the existing `router.put('/clinic/integrations', ...)` block (line 19–20) to keep the integrations-class routes visually grouped.

- [ ] **Step 2: Run Task 9's full test file**

Run: `cd src/backend && npx jest storage-config.test.ts --testPathPattern=integration`
Expected: PASS (9 tests, SC-01..SC-09).

- [ ] **Step 3: Run the full backend suite for regressions**

Run: `cd src/backend && npx jest`
Expected: PASS — no existing settings/pet/EMR test regresses (the async `getStorageDriver` change from Task 7 is the one with the widest blast radius; this is the checkpoint that confirms it didn't break anything).

- [ ] **Step 4: Commit**

```bash
git add src/backend/routes/settings.routes.ts
git commit -m "feat(storage): wire GET/PUT /clinic/storage-config routes (ADR-0023)"
```

---

## Task 11: Frontend — Clinic Settings "Storage" section

**Files:**
- Locate the existing Clinic Settings integrations-section component first (`grep -r "clinic.integrations\|integrationsSchema\|labApiKey" src/frontend/src` to find it — likely `src/frontend/src/views/ClinicSettings.tsx` or an `Integrations`-named subcomponent; confirm the exact path before editing, do not assume).
- Create: `src/frontend/src/components/settings/StorageConfigSection.tsx`
- Create: `src/frontend/src/hooks/useStorageConfig.ts` (React Query: `useQuery` for GET, `useMutation` for PUT)
- Modify: the Clinic Settings parent view to render `<StorageConfigSection />` in a new "Storage" tab/section, mirroring how the existing Integrations section is mounted.

**Interfaces:**
- Consumes: `GET /clinic/storage-config`, `PUT /clinic/storage-config` (Task 9/10).
- Produces: `useStorageConfig()` hook returning `{ data, isLoading, save: (input, opts?: { confirmBaseChange?: boolean }) => Promise<void>, error }`.

- [ ] **Step 1: Confirm the existing component location and its Tailwind/Compassionate-Care conventions**

Run: `grep -rl "clinic.integrations\|labApiKey" src/frontend/src` — read whichever file surfaces (do not skip this; the exact section-toggle/save/error-display pattern used there is what `StorageConfigSection.tsx` must copy, per `anemal-design-system`).

- [ ] **Step 2: Write `useStorageConfig.ts`**

```tsx
// src/frontend/src/hooks/useStorageConfig.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../utils/api' // confirm the actual shared axios/fetch wrapper name used by sibling hooks before importing

export interface StorageConfigData {
  provider: 'local' | 'custom_path'
  configured: boolean
  smbHost?: string
  smbShare?: string
  smbUsername?: string
}

export interface StorageConfigInput {
  provider: 'local' | 'custom_path'
  smbHost?: string
  smbShare?: string
  smbUsername?: string
  smbPassword?: string
  confirmBaseChange?: boolean
}

export function useStorageConfig() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['clinic', 'storage-config'],
    queryFn: async () => (await api.get<{ data: StorageConfigData }>('/settings/clinic/storage-config')).data.data,
  })
  const mutation = useMutation({
    mutationFn: (input: StorageConfigInput) => api.put('/settings/clinic/storage-config', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinic', 'storage-config'] }),
  })
  return { data: query.data, isLoading: query.isLoading, save: mutation.mutateAsync, error: mutation.error }
}
```

- [ ] **Step 3: Write `StorageConfigSection.tsx`**

Component requirements (mirror the Integrations section's exact Tailwind classes/tokens found in Step 1, do not invent new visual patterns):
- Radio group: `Local (default)` / `Network share`.
- When `Network share` selected: host/IP, share name, username, password text inputs. Password field shows a "connected" pill (not the raw value) once `data.configured === true`, replaced by an editable field only when the admin clicks "Change".
- Save button: on click, first attempt without `confirmBaseChange`. If the mutation error's `code === 'STORAGE_SWITCH_CONFIRMATION_REQUIRED'`, open a confirmation dialog with the exact copy from the design doc: *"Files already uploaded will stay at `<old base>` and won't be visible at the new location until moved there manually. Backing them up is now your clinic's responsibility."* — on confirm, resubmit with `confirmBaseChange: true`.
- On any other save error (`SMB_HOST_UNREACHABLE` / `SMB_SHARE_NOT_FOUND` / `SMB_AUTH_REJECTED` / validation), show the specific message inline under the relevant field, per design.
- UI hint text under the host field: "Path is evaluated on the clinic server, not your PC — use the share's network address (e.g. `192.168.1.10`), not a locally mapped drive letter" (BA sign-off R-5, ops-trap pre-emption).
- No raw hex colors, no emoji — reuse existing tokens (`anemal-design-system`).

- [ ] **Step 4: Mount it in the parent Clinic Settings view**

Add a "Storage" tab/section entry next to the existing Integrations entry, following that same registration pattern (exact edit depends on Step 1's findings — likely a tabs array or a route list; make the smallest edit that matches the existing pattern).

- [ ] **Step 5: Write a Testing Library test**

Create `src/frontend/src/components/settings/__tests__/StorageConfigSection.test.tsx` covering: renders "Local" selected by default when `configured: false`; selecting "Network share" reveals the 4 fields; save with a pending switch-confirmation error opens the confirmation dialog and resubmitting with confirmation calls the mutation a second time with `confirmBaseChange: true`; an `SMB_HOST_UNREACHABLE` error renders under the host field. Follow the existing Integrations-section test file's render/mock setup (React Query test wrapper, mocked `api`) as the template.

Run: `cd src/frontend && npx vitest run StorageConfigSection`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/components/settings/StorageConfigSection.tsx src/frontend/src/hooks/useStorageConfig.ts src/frontend/src/components/settings/__tests__/StorageConfigSection.test.tsx
git commit -m "feat(storage): Clinic Settings Storage section — provider radio, connect-test, switch confirmation (ADR-0023)"
```

(Parent-view mount edit ships in the same commit — add its modified file to the `git add` list once Step 1 identifies it.)

---

## Task 12: Delete-after-commit / rollback-delete best-effort logging fix (`emr-attachment.service.ts`)

**Files:**
- Modify: `src/backend/services/emr-attachment.service.ts`
- Modify: `src/backend/__tests__/emr-attachments.test.ts` (add 2 tests)

**Interfaces:** no signature change — `uploadEmrAttachment`'s rollback-delete and `deleteAttachment`'s post-commit delete both currently let a storage-layer failure propagate unhandled. Design's error-handling section requires these to be logged, not surfaced as a user-facing failure — the DB row is the source of truth.

- [ ] **Step 1: Write the failing tests**

```ts
// add to emr-attachments.test.ts
test('EA-19: rollback-delete failure after a DB error during upload does not mask the original DB error, and is logged', async () => {
  const loggerSpy = jest.spyOn(require('../utils/logger').logger, 'warn').mockImplementation(() => {})
  jest.spyOn(recordRepo, 'createAttachment').mockRejectedValueOnce(new Error('db down'))
  const driver = { save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockRejectedValueOnce(new Error('share down')) }
  jest.spyOn(storageDriverMod, 'getStorageDriver').mockResolvedValueOnce(driver as any)

  await expect(request(server)
    .post(`/api/medical-records/${medicalRecordId}/attachments`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' }))
    .resolves.toMatchObject({ status: 500 }) // the ORIGINAL db error surfaces, not the delete failure
  expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({ storageKey: expect.any(String) }), expect.stringMatching(/rollback/i))
})

test('EA-20: post-commit file delete failure after a successful row delete still returns 204, and is logged', async () => {
  const loggerSpy = jest.spyOn(require('../utils/logger').logger, 'warn').mockImplementation(() => {})
  const storageKey = `tenants/${tenantId}/emr/${medicalRecordId}/uuid-log-test.pdf`
  const a = await prisma.attachment.create({
    data: { tenantId, medicalRecordId, fileName: 'log-test.pdf', storageKey, mimeType: 'application/pdf', fileSize: 10, uploadedByUserId: doctorUserId },
  })
  const driver = { delete: jest.fn().mockRejectedValueOnce(new Error('share down')) }
  jest.spyOn(storageDriverMod, 'getStorageDriver').mockResolvedValueOnce(driver as any)

  await request(server)
    .delete(`/api/medical-records/${medicalRecordId}/attachments/${a.id}`)
    .set('Authorization', `Bearer ${doctorToken}`)
    .expect(204) // DB row is the source of truth — a storage-layer failure here must not surface as an error
  expect(loggerSpy).toHaveBeenCalledWith(expect.objectContaining({ storageKey }), expect.stringMatching(/orphan|delete/i))
})
```

(Add `import * as storageDriverMod from '../config/storage-driver'` and `import * as recordRepo from '../models/medical-record.repository'` at the top of the test file if not already present; import `logger` to spy on it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest emr-attachments.test.ts -t "EA-19|EA-20"`
Expected: FAIL — EA-19's request currently rejects/hangs on the unhandled rollback-delete rejection (or surfaces the wrong error); EA-20's request currently 500s instead of 204ing, since `deleteAttachment`'s file-delete failure is unhandled today.

- [ ] **Step 3: Implement the fix**

```ts
import { logger } from '../utils/logger'

// in uploadEmrAttachment's catch block:
  } catch (err) {
    await driver.delete(storageKey).catch((deleteErr) => {
      logger.warn({ tenantId, medicalRecordId, storageKey, deleteErr: String(deleteErr) }, 'EMR attachment rollback-delete failed — orphaned file on storage, DB write itself failed')
    })
    throw err // the ORIGINAL error (e.g. DB failure) is what the caller sees, never masked by the delete failure
  }

// in deleteAttachment, replace:
//   if (attachment.storageKey) {
//     await getStorageDriver().delete(attachment.storageKey)
//   }
// with:
  if (attachment.storageKey) {
    const driver = await getStorageDriver(tenantId)
    await driver.delete(attachment.storageKey).catch((deleteErr) => {
      logger.warn({ tenantId, medicalRecordId, attachmentId, storageKey: attachment.storageKey, deleteErr: String(deleteErr) }, 'EMR attachment file delete failed post-DB-commit — orphaned file, DB row is the source of truth')
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest emr-attachments.test.ts`
Expected: PASS (all prior + EA-19, EA-20).

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/emr-attachment.service.ts src/backend/__tests__/emr-attachments.test.ts
git commit -m "fix(storage): EMR attachment rollback-delete and post-commit delete are best-effort, logged not surfaced (ADR-0023)"
```

---

## Full regression pass (run once, after Task 12, before handing off to QA/Ponytail)

```bash
cd src/backend && npx jest
cd ../../src/frontend && npx vitest run
```
Expected: full green — the backend count grows by roughly 45 tests (Tasks 2,3,5,6,8,9,12), the frontend count grows by roughly 4 (Task 11); confirm the exact before/after totals when this actually runs and report them for the phase-status table update (`@pm-agent`'s documentation step, after QA sign-off).

---

## Open questions / things flagged back for a decision (not silently assumed)

1. **RESOLVED (2026-07-23) — Test-write residual file cleanup.** Task 8's connect-and-test-write now deletes the marker file (`tenants/{tenantId}/.storage-config-test`) immediately after the successful test-write, best-effort and logged (never allowed to fail the actual config save) — see Task 8's implementation and its new "cleans up the test-write marker" / "cleanup failure is swallowed" tests. No longer open.

2. **BA sign-off's R-1 (`STORAGE_ALLOWED_ROOTS` operator allowlist) is *not* implemented in this plan.** It was BA's required fix against the original raw-filesystem-path design; the grill's architecture change (app-layer SMB with per-tenant credentials, replacing native UNC/`fs` entirely) supersedes the specific risk R-1 was written against — the design doc's final "Accepted residual risk" note and ADR-0023 explicitly confirm this class of concern is now judged acceptable without an allowlist. I'm treating this as resolved-by-supersession rather than an open gap, but flagging it explicitly since a literal reading of the BA sign-off's "required changes" list would expect to see it land somewhere.

3. **G1 boot-guard extension** — same situation as #2. BA sign-off required extending ADR-0022's G1 (production boot guard) to cover `custom_path`. The final design and ADR-0023 (§10) explicitly say the opposite: G1 does NOT apply to `custom_path`, because it's tenant-owned/tenant-credentialed, not the shared-local-disk case G1 protects against. This plan follows the final design/ADR (the authoritative post-grill documents), not the earlier BA sign-off language — flagging the discrepancy so it isn't mistaken for an oversight.

4. **RESOLVED (2026-07-23, Ponytail-required) — Concrete SMB2 npm package selected: `@marsaud/smb2`.** Task 4 now names the package and its rationale (pure-JS, no native/CLI dependency, widest production usage for this exact connect/read/write/unlink/rename/exists shape) directly in the plan, and the "PR Split" section requires `createSmbClient()` be wired to it as the **first implementation sub-step of Sub-PR A**, before Task 5 (`SmbShareDriver`) is written — not left as a placeholder until later. Re-verify the package's current npm maintenance status immediately before `npm install` in case it has gone stale since this plan was written; the `SmbClient` interface seam makes swapping to an alternative a one-file change if so. No longer open.

5. **Frontend file/component names in Task 11 are best-guess** pending the `grep` in its Step 1 — the actual Clinic Settings file structure wasn't read as part of this plan (out of the four required-reading docs, but the frontend integrations section itself wasn't opened). Task 11 Step 1 exists specifically to resolve this before writing any component code; flagging so execution doesn't skip that grep.
