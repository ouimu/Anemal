# Implementation Plan — Customer Onboarding: First Clinic-Admin User + Clinic Admins Tab

- **Document type:** Step-4 Write-Plan (Superpowers `writing-plans` format)
- **Author:** @pm-agent
- **Date:** 2026-07-14
- **Inputs (all read in full before writing this plan):**
  - `docs/superpowers/specs/2026-07-14-customer-onboarding-brainstorm.md` (Step 1, approved, Option D)
  - `docs/superpowers/plans/2026-07-14-customer-onboarding-tasks.md` (Step 2 CO-1..CO-10, Step 3 BA sign-off incl. R-E resolution, Step 3.5 Grill Findings §11 — ALL RESOLVED)
  - `docs/adr/0015-platform-provisions-clinic-admin-identity.md` (accepted)
- **Gate status:** `/grill-with-docs` COMPLETE, all findings resolved. `/write-plan` unblocked. This plan is subject to `@ponytail-agent` review (Step 5) before `/execute-plan` (Step 6).

## Resolved decisions this plan bakes in verbatim (no re-litigation)

- **R-E:** CO-1's auto-created first admin has `email = NULL`, `phone = NULL`. It does **not** call `user.service.ts createUser()` — it writes directly via a transaction in `platform-customers.service.ts`. D-2-02 does not govern this path.
- Username `admin`, name `"Administrator"` for the auto-created first admin. No rename action anywhere in this feature (G-2).
- CO-1 skips `subscriptionService.assertCanAddUser` (first admin exempt, Q-5). CO-2 calls it normally.
- Password: 16-char crypto-random (`crypto.randomBytes`, excludes `0/O/1/l/I`), bcrypt hash with `config.bcryptRounds`. One shared `generateSecurePassword()` util, reused by CO-1/CO-2/CO-5.
- Typed password path (CO-2/CO-5 only): 8-char minimum, 422 if shorter (G-6). This is scoped to these two endpoints only.
- CO-4 deactivate on an already-inactive user → `409 ALREADY_DEACTIVATED` (G-5), not a silent no-op.
- No reactivate endpoint (G-1, deliberately deferred).
- No name/username edit action anywhere (G-2, deliberately deferred).
- Role is always `clinic_admin` — no role param accepted on any endpoint. CO-4/CO-5 404 if the target `userId` is not a `clinic_admin` of that tenant.
- CO-4/CO-5 tenantId+userId scoping in a single WHERE clause (BOLA guard, PR #20 hospitalization-branch-isolation precedent — `hospitalization.repository.ts` `update`/`remove`/`markDischarged` pattern followed exactly).
- Permissions: reuse `platform.customers.manage` (writes: CO-1 internal/CO-2/CO-4/CO-5) and `platform.customers.view` (read: CO-6). No new permission code (BA sign-off).
- Audit actions: `customer.create` gains `adminUserId` detail (CO-1); new actions `tenant.admin_user.create` / `tenant.admin_user.deactivate` / `tenant.admin_user.password_reset` (CO-2/CO-4/CO-5) — password/passwordHash never appear in any audit details.
- CO-6 list returns only `clinic_admin`-role users for the tenant, fields `id/username/name/email/phone/isActive/createdAt`, never `passwordHash`.
- CO-9 deactivate confirm dialog copy explicitly states there is no undo/reactivate; recovery = creating a new clinic_admin (CO-8).
- CO-7 email/phone column renders `—` for NULL values.

## File inventory (12 files — under the >15-file Ponytail threshold)

| # | File | Change |
|---|------|--------|
| 1 | `src/backend/utils/password.ts` | NEW |
| 2 | `src/backend/tests/unit/password.test.ts` | NEW |
| 3 | `src/backend/models/platform-customers.repository.ts` | MODIFY |
| 4 | `src/backend/services/platform-customers.service.ts` | MODIFY |
| 5 | `src/backend/controllers/platform-customers.controller.ts` | MODIFY |
| 6 | `src/backend/routes/platform-customers.routes.ts` | MODIFY |
| 7 | `src/backend/tests/integration/platform-customer-admin-users.test.ts` | NEW |
| 8 | `src/frontend/src/hooks/usePlatformCustomers.ts` | MODIFY |
| 9 | `src/frontend/src/components/platform/PasswordField.tsx` | NEW |
| 10 | `src/frontend/src/components/platform/ClinicAdminsTab.tsx` | NEW |
| 11 | `src/frontend/src/views/platform/CustomerDetailView.tsx` | MODIFY |
| 12 | `src/frontend/src/__tests__/ClinicAdminsTab.test.tsx` | NEW |

4 new API endpoints (CO-2/CO-4/CO-5/CO-6) — over the Ponytail >3-endpoint threshold. Brainstorm §Ponytail-pre-check and BA sign-off already accepted this as justified 1:1 scope (list/create/deactivate/reset), not speculative. `@ponytail-agent` makes the final call at Step 5; this plan does not pre-empt it.

---

## TASK CO-3 — Password generator util (do first: CO-1/CO-2/CO-5 all depend on it)

### Step CO-3.1 — Write the failing test

Create `src/backend/tests/unit/password.test.ts`:

```ts
import { generateSecurePassword } from '../../utils/password'

describe('generateSecurePassword', () => {
  it('returns a 16-character string', () => {
    expect(generateSecurePassword()).toHaveLength(16)
  })

  it('excludes visually ambiguous characters (0, O, 1, l, I)', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateSecurePassword()
      expect(pw).not.toMatch(/[0O1lI]/)
    }
  })

  it('generates 1000 passwords with no duplicates (RNG wiring sanity check)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      seen.add(generateSecurePassword())
    }
    expect(seen.size).toBe(1000)
  })

  it('uses crypto.randomBytes, not Math.random (spy check)', () => {
    const crypto = require('crypto')
    const spy = jest.spyOn(crypto, 'randomBytes')
    generateSecurePassword()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
```

Run `npx jest tests/unit/password.test.ts` from `src/backend` — confirm it fails with `Cannot find module '../../utils/password'`.

### Step CO-3.2 — Implement `generateSecurePassword()`

Create `src/backend/utils/password.ts`:

```ts
/**
 * Secure password generation shared by the platform-plane clinic_admin
 * provisioning flows (CO-1 auto-create, CO-2 create, CO-5 reset).
 *
 * @module utils/password
 */
import crypto from 'crypto'

// Unambiguous alphabet: excludes 0/O, 1/l/I (brainstorm §3.4, Q-1).
const PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
const PASSWORD_LENGTH = 16

/**
 * Generate a 16-character cryptographically random password.
 *
 * Uses `crypto.randomBytes` (not `Math.random`) with an alphabet that
 * excludes visually ambiguous characters. Used by every password-provisioning
 * code path in the platform→clinic_admin identity flows (ADR-0015).
 */
export function generateSecurePassword(): string {
  const bytes = crypto.randomBytes(PASSWORD_LENGTH)
  let password = ''
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length]
  }
  return password
}
```

### Step CO-3.3 — Green + refactor check

Run `npx jest tests/unit/password.test.ts` from `src/backend` — all 4 tests pass. No refactor needed (single function, no duplication).

Grep check (per CO-3 AC): confirm `src/backend/scripts/create-platform-admin.ts` has no second `randomBytes`-based generator to consolidate — it takes `password` as a CLI arg (line 8: `const password = process.argv[3]`), it never generates one. This task is the first implementation; the script is left untouched (not a second implementation to refactor, so no follow-up note needed beyond this observation).

---

## TASK CO-1 — Auto-create first `clinic_admin` in `createCustomer()` transaction

### Step CO-1.1 — Extend `platform-customers.repository.ts`: `createTenant` accepts an optional transaction client

Read current `createTenant` (line 143 of `src/backend/models/platform-customers.repository.ts`):

```ts
export function createTenant(data: CreateTenantData): Promise<TenantRow> {
  return prisma.tenant.create({
    data: {
      name:          data.name,
      subdomain:     data.subdomain,
      planId:        data.planId ?? null,
      // D-2-06: optional company type assignment
      companyTypeId: data.companyTypeId ?? null,
    },
    select: TENANT_SELECT,
  })
}
```

Edit the file: add `import { Prisma } from '@prisma/client'` to the top imports, then replace the function so it accepts an optional Prisma client (defaults to the module-level `prisma`, so every existing caller is unaffected):

```ts
import prisma from '../config/db'
import { Prisma } from '@prisma/client'
```

```ts
/**
 * Create a new tenant record.
 *
 * @param data   - Name, subdomain, and optional plan assignment.
 * @param client - Prisma client or transaction client to run on (defaults to
 *                 the module-level client). CO-1 passes a `$transaction`
 *                 callback's `tx` so the tenant insert is atomic with the
 *                 first clinic_admin user insert (ADR-0015).
 */
export function createTenant(
  data: CreateTenantData,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<TenantRow> {
  return client.tenant.create({
    data: {
      name:          data.name,
      subdomain:     data.subdomain,
      planId:        data.planId ?? null,
      // D-2-06: optional company type assignment
      companyTypeId: data.companyTypeId ?? null,
    },
    select: TENANT_SELECT,
  })
}
```

No test needed for this step in isolation — it is exercised by CO-1.3's integration test and by the existing `createCustomer` callers, which pass no second argument (default `prisma`), so their behavior is unchanged.

### Step CO-1.2 — Write the failing integration test for CO-1

Create `src/backend/tests/integration/platform-customer-admin-users.test.ts` (this file grows across CO-1/CO-2/CO-4/CO-5/CO-6 — start it now with the CO-1 section, imports, and fixture scaffolding):

```ts
/**
 * Platform-provisioned clinic_admin identity — CO-1..CO-6 (ADR-0015).
 *
 * Covers:
 *   CO-1  createCustomer() auto-creates the tenant's first clinic_admin
 *         (transactional, email/phone NULL per R-E, no quota check).
 *   CO-2  POST   /platform/customers/:id/admin-users      (create)
 *   CO-4  PATCH  /platform/customers/:id/admin-users/:userId/deactivate
 *   CO-5  PATCH  /platform/customers/:id/admin-users/:userId/password
 *   CO-6  GET    /platform/customers/:id/admin-users      (list)
 *
 * Strategy: real HTTP against the app + a real Postgres test DB, mirroring
 * platformConsole.test.ts and hospitalization-branch-isolation.test.ts.
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import app from '../../app'
import * as customersService from '../../services/platform-customers.service'

const prisma = new PrismaClient()
let server: Server

const PLATFORM_EMAIL    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.app'
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

const SFX = `co${Date.now().toString(36)}`

let platformToken: string
let clinicToken: string
let supportToken: string

const createdTenantIds: number[] = []
const createdPlatformUserIds: number[] = []

async function getPlatformToken(): Promise<string> {
  const res = await request(server)
    .post('/platform/auth/login')
    .send({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD })
  return res.body.data?.token
}

async function getClinicToken(): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data?.token
}

/** Create a tenant through the real service (exercises CO-1 for every fixture). */
async function createTenantViaService(nameSuffix: string) {
  const tenant = await customersService.createCustomer(
    { name: `CO Test ${nameSuffix}`, subdomain: `co-test-${nameSuffix}-${SFX}` },
    1, // performedById — audit FK only, not asserted in these tests
  )
  createdTenantIds.push(tenant.id)
  return tenant
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  platformToken = await getPlatformToken()
  clinicToken   = await getClinicToken()

  // platform_support fixture: has platform.customers.view but not .manage.
  const supportPasswordHash = await bcrypt.hash('SupportPass1!', 10)
  const support = await prisma.platformUser.create({
    data: {
      name: 'CO Test Support', email: `support-${SFX}@anemal.app`,
      passwordHash: supportPasswordHash, role: 'platform_support', isActive: true,
    },
  })
  createdPlatformUserIds.push(support.id)
  const supportLogin = await request(server)
    .post('/platform/auth/login')
    .send({ email: `support-${SFX}@anemal.app`, password: 'SupportPass1!' })
  supportToken = supportLogin.body.data?.token
})

afterAll(async () => {
  if (createdTenantIds.length) {
    await prisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenantQuota.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  if (createdPlatformUserIds.length) {
    await prisma.platformUser.deleteMany({ where: { id: { in: createdPlatformUserIds } } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─────────────────────────────────────────────────────────────────────────────
// CO-1 — auto-created first admin
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-1: createCustomer() auto-creates first clinic_admin', () => {
  it('✅ creates tenant + admin user + user_roles atomically; admin has email=NULL phone=NULL', async () => {
    const tenant = await createTenantViaService('co1a')

    const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'admin' } })
    expect(admin).not.toBeNull()
    expect(admin!.name).toBe('Administrator')
    expect(admin!.email).toBeNull()
    expect(admin!.phone).toBeNull()
    expect(admin!.role).toBe('admin')

    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    const userRole = await prisma.userRole.findFirst({ where: { userId: admin!.id, tenantId: tenant.id } })
    expect(userRole).not.toBeNull()
    expect(userRole!.roleId).toBe(clinicAdminRole.id)
  })

  it('✅ audit log gains adminUserId detail; no password/passwordHash anywhere', async () => {
    const tenant = await createTenantViaService('co1b')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'customer.create', targetTenantId: tenant.id },
    })
    const details = log.details as Record<string, unknown>
    expect(details.adminUserId).toBe(admin.id)
    expect(JSON.stringify(details)).not.toMatch(/password/i)
  })

  it('✅ rolls back the tenant if the clinic_admin role cannot be resolved inside the transaction', async () => {
    const subdomain = `co-test-rollback-${SFX}`
    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

    // Simulate an unseeded system role by temporarily renaming its key — this
    // forces a real failure INSIDE the $transaction callback (mocking the tx
    // proxy is unreliable since `tx` is a distinct client instance from `prisma`).
    await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: '__temp_missing__' } })
    try {
      await expect(
        customersService.createCustomer({ name: 'Rollback Test', subdomain }, 1),
      ).rejects.toThrow("System role 'clinic_admin' not seeded")

      const tenant = await prisma.tenant.findUnique({ where: { subdomain } })
      expect(tenant).toBeNull()
    } finally {
      await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: 'clinic_admin' } })
    }
  })

  it('✅ does not require a positive user quota (Q-5 — first admin exempt)', async () => {
    // Tenant has no plan/quota assigned at all (maxUsers resolves to unlimited
    // by subscription.service fallback) — CO-1 must still succeed because it
    // never calls assertCanAddUser. Regression guard: if a future change wires
    // the quota check into this path, a tenant with maxUsers=0 would fail here.
    const tenant = await createTenantViaService('co1c')
    const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'admin' } })
    expect(admin).not.toBeNull()
  })
})
```

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — the CO-1 `describe` block fails: no `admin` user is ever created because `createCustomer()` does not yet create one (repository change from CO-1.1 is inert until the service uses it).

### Step CO-1.3 — Implement the transaction in `platform-customers.service.ts`

Add imports at the top of `src/backend/services/platform-customers.service.ts` (after the existing `import prisma from '../config/db'`):

```ts
import bcrypt from 'bcrypt'
import { config } from '../config/env'
import { generateSecurePassword } from '../utils/password'
```

Replace the existing `createCustomer` function body:

```ts
export async function createCustomer(data: CreateCustomerInput, performedById: number) {
  const existing = await prisma.tenant.findUnique({
    where: { subdomain: data.subdomain },
    select: { id: true },
  })
  if (existing) throw new SubdomainConflictError()

  // D-2-06: validate companyTypeId when provided
  if (data.companyTypeId !== undefined) {
    const ct = await companyTypeRepo.findCompanyTypeById(data.companyTypeId)
    if (!ct || !ct.isActive) throw new CompanyTypeNotFoundError()
  }

  const createData: CreateTenantData = {
    name:          data.name,
    subdomain:     data.subdomain,
    planId:        data.planId ?? null,
    companyTypeId: data.companyTypeId,
  }

  // CO-1 (ADR-0015): create the tenant and its first clinic_admin user
  // atomically. If the user insert fails for any reason, the tenant insert
  // rolls back too — no tenant-without-admin state is ever reachable.
  const { tenant, adminUserId } = await prisma.$transaction(async (tx) => {
    const createdTenant = await customersRepo.createTenant(createData, tx)

    const clinicAdminRole = await tx.clinicRole.findFirst({
      where: { key: 'clinic_admin', tenantId: null, isSystem: true },
    })
    if (!clinicAdminRole) {
      throw new Error("System role 'clinic_admin' not seeded")
    }

    const passwordHash = await bcrypt.hash(generateSecurePassword(), config.bcryptRounds)

    // R-E (BA sign-off, docs/superpowers/plans/2026-07-14-customer-onboarding-tasks.md):
    // the auto-created first admin has email=NULL, phone=NULL. D-2-02 does not
    // govern this path — this does not call user.service.ts createUser().
    // Q-5: subscriptionService.assertCanAddUser is intentionally NOT called
    // here — the first admin is exempt from quota enforcement.
    const adminUser = await tx.user.create({
      data: {
        tenantId:     createdTenant.id,
        name:         'Administrator',
        username:     'admin',
        email:        null,
        phone:        null,
        passwordHash,
        role:         'admin',
        roleId:       clinicAdminRole.id,
      },
    })
    await tx.userRole.create({
      data: { userId: adminUser.id, roleId: clinicAdminRole.id, tenantId: createdTenant.id },
    })

    return { tenant: createdTenant, adminUserId: adminUser.id }
  })

  await platformAuditRepo.createPlatformAuditLog({
    action: 'customer.create',
    targetTenantId: tenant.id,
    performedByPlatformUserId: performedById,
    details: { name: tenant.name, subdomain: tenant.subdomain, planId: tenant.planId, adminUserId },
  })

  return tenant
}
```

### Step CO-1.4 — Green

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — all 4 CO-1 tests pass.

Run the full existing suite touching this file to confirm no regression: `npx jest platformConsole platformContract` from `src/backend` — both pass unmodified (they assert on `CreateCustomerInput` shape and the pre-existing `customer.create` audit fields, which are unchanged aside from the added `adminUserId` detail, per the CO-1 AC).

---

## TASK CO-2 — `POST /platform/customers/:id/admin-users` (create additional clinic_admin)

### Step CO-2.1 — Extend the repository with admin-user data access

Edit `src/backend/models/platform-customers.repository.ts` — add these exports after `getTenantWithPlanAndQuota` (end of file):

```ts
/** Clinic-admin user row exposed to the Platform Console (never passwordHash). */
export type TenantAdminUserRow = {
  id:        number
  username:  string
  name:      string
  email:     string | null
  phone:     string | null
  isActive:  boolean
  createdAt: Date
}

const ADMIN_USER_SELECT = {
  id:        true,
  username:  true,
  name:      true,
  email:     true,
  phone:     true,
  isActive:  true,
  createdAt: true,
} as const

/**
 * List all clinic_admin-role users for a tenant (Q-8 — never doctor/staff rows).
 *
 * @param tenantId - Tenant scope.
 */
export function listTenantAdminUsers(tenantId: number): Promise<TenantAdminUserRow[]> {
  return prisma.user.findMany({
    where: {
      tenantId,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    select: ADMIN_USER_SELECT,
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Find a single clinic_admin-role user scoped to a tenant.
 * Returns null if the user does not exist, belongs to a different tenant, or
 * does not hold the clinic_admin role (Q-8 role-scope guard).
 *
 * @param tenantId - Tenant scope (BOLA guard).
 * @param userId   - Target user's primary key.
 */
export function findTenantAdminUser(tenantId: number, userId: number): Promise<TenantAdminUserRow | null> {
  return prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    select: ADMIN_USER_SELECT,
  })
}

/**
 * Create a new clinic_admin user for an existing tenant (CO-2).
 *
 * @param tenantId - Owning tenant.
 * @param data     - User fields (password already hashed).
 * @param roleId   - The seeded clinic_admin ClinicRole id.
 */
export async function createTenantAdminUser(
  tenantId: number,
  data: { name: string; username: string; email: string | null; phone: string | null; passwordHash: string },
  roleId: number,
): Promise<TenantAdminUserRow> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId,
        name:         data.name,
        username:     data.username,
        email:        data.email,
        phone:        data.phone,
        passwordHash: data.passwordHash,
        role:         'admin',
        roleId,
      },
      select: ADMIN_USER_SELECT,
    })
    await tx.userRole.create({ data: { userId: user.id, roleId, tenantId } })
    return user
  })
}

/**
 * Deactivate a clinic_admin-role user, scoped to tenantId + userId +
 * isActive=true in one WHERE clause (BOLA guard, PR #20 precedent — no
 * separate lookup-then-mutate race).
 *
 * @param tenantId - Tenant scope.
 * @param userId   - Target user.
 * @returns Number of rows updated (0 = not found / not a clinic_admin / already inactive).
 */
export async function deactivateTenantAdminUser(tenantId: number, userId: number): Promise<number> {
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      tenantId,
      isActive: true,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    data: { isActive: false },
  })
  return result.count
}

/**
 * Set a new password hash for a clinic_admin-role user, scoped to
 * tenantId + userId in one WHERE clause (BOLA guard). Works on both active
 * and deactivated rows (CO-10 — reset is not restricted to active admins).
 *
 * @param tenantId     - Tenant scope.
 * @param userId       - Target user.
 * @param passwordHash - New bcrypt hash.
 * @returns Number of rows updated (0 = not found / not a clinic_admin of this tenant).
 */
export async function setTenantAdminUserPassword(
  tenantId: number,
  userId: number,
  passwordHash: string,
): Promise<number> {
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      tenantId,
      userRoles: { some: { role: { key: 'clinic_admin', tenantId: null, isSystem: true } } },
    },
    data: { passwordHash },
  })
  return result.count
}
```

### Step CO-2.2 — Write the failing CO-2 tests

Append to `src/backend/tests/integration/platform-customer-admin-users.test.ts` (after the CO-1 `describe` block):

```ts
// ─────────────────────────────────────────────────────────────────────────────
// CO-2 — POST /platform/customers/:id/admin-users
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-2: POST /platform/customers/:id/admin-users', () => {
  it('✅ creates an additional clinic_admin with a server-generated password', async () => {
    const tenant = await createTenantViaService('co2a')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Second Admin', username: 'admin2', email: 'admin2@example.com' })

    expect(res.status).toBe(201)
    expect(res.body.data.username).toBe('admin2')
    expect(typeof res.body.data.password).toBe('string')
    expect(res.body.data.password).toHaveLength(16)
    expect(res.body.data.passwordHash).toBeUndefined()

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'tenant.admin_user.create', targetTenantId: tenant.id },
    })
    expect(JSON.stringify(log.details)).not.toMatch(/password/i)
  })

  it('✅ accepts a typed password (>= 8 chars) and does not overwrite it with a generated one', async () => {
    const tenant = await createTenantViaService('co2h')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Typed Pw', username: 'typedpw', email: 'typedpw@example.com', password: 'MyOwnPass1!' })

    expect(res.status).toBe(201)
    expect(res.body.data.password).toBe('MyOwnPass1!')
  })

  it('❌ 422 when both email and phone are omitted (D-2-02)', async () => {
    const tenant = await createTenantViaService('co2b')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'No Contact', username: 'nocontact' })
    expect(res.status).toBe(422)
  })

  it('❌ 422 when a typed password is shorter than 8 characters', async () => {
    const tenant = await createTenantViaService('co2c')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Weak Pw', username: 'weakpw', email: 'weak@example.com', password: 'short1' })
    expect(res.status).toBe(422)
  })

  it('❌ 404 when :id does not match an existing tenant', async () => {
    const res = await request(server)
      .post('/platform/customers/999999999/admin-users')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Ghost', username: 'ghost', email: 'ghost@example.com' })
    expect(res.status).toBe(404)
  })

  it('❌ 409 QUOTA_EXCEEDED when the tenant is at its user cap; no row created', async () => {
    const tenant = await createTenantViaService('co2d')
    await prisma.tenantQuota.create({ data: { tenantId: tenant.id, maxUsers: 1 } }) // CO-1's 'admin' already counts as 1
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Over Cap', username: 'overcap', email: 'overcap@example.com' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('QUOTA_EXCEEDED')
    const created = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'overcap' } })
    expect(created).toBeNull()
  })

  it('❌ 409 on duplicate username within the same tenant (not a 500)', async () => {
    const tenant = await createTenantViaService('co2e')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Dup', username: 'admin', email: 'dup@example.com' }) // 'admin' already exists (CO-1)
    expect(res.status).toBe(409)
  })

  it('❌ 403 without platform.customers.manage (platform_support token)', async () => {
    const tenant = await createTenantViaService('co2f')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'Blocked', username: 'blocked', email: 'blocked@example.com' })
    expect(res.status).toBe(403)
  })

  it('❌ 403 with a clinic-plane token (wrong plane)', async () => {
    const tenant = await createTenantViaService('co2g')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${clinicToken}`)
      .send({ name: 'WrongPlane', username: 'wrongplane', email: 'wp@example.com' })
    expect(res.status).toBe(403)
  })

  it('❌ 401 with no token', async () => {
    const tenant = await createTenantViaService('co2i')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .send({ name: 'NoToken', username: 'notoken', email: 'nt@example.com' })
    expect(res.status).toBe(401)
  })
})
```

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — the CO-2 block fails with 404 (route does not exist yet).

### Step CO-2.3 — Add error classes and the service function

Edit `src/backend/services/platform-customers.service.ts` — add these classes after `CompanyTypeNotFoundError`:

```ts
/** Thrown when a target admin-user is not a clinic_admin of the given tenant (or doesn't exist). */
export class AdminUserNotFoundError extends AppError {
  constructor() {
    super(404, 'Clinic admin user not found for this tenant', 'ADMIN_USER_NOT_FOUND')
  }
}

/** Thrown when deactivating a clinic_admin user that is already inactive (G-5). */
export class AlreadyDeactivatedError extends AppError {
  constructor() {
    super(409, 'User is already deactivated', 'ALREADY_DEACTIVATED')
  }
}

/** Thrown when a typed password is shorter than the 8-char minimum (CO-2/CO-5 only, G-6). */
export class WeakPasswordError extends AppError {
  constructor() {
    super(422, 'Password must be at least 8 characters', 'WEAK_PASSWORD')
  }
}

/** Thrown on duplicate username within a tenant (CO-2). */
export class UsernameConflictError extends AppError {
  constructor() {
    super(409, 'Username already in use within this tenant', 'USERNAME_CONFLICT')
  }
}
```

Add imports at the top (extend the CO-1 import block):

```ts
import { Prisma } from '@prisma/client'
import * as roleRepo from '../models/role.repository'
import * as subscriptionService from './subscription.service'
```

Add DTO types after `UpdateCustomerInput`:

```ts
/** Clinic-admin user row exposed to the Platform Console (never passwordHash). */
export interface TenantAdminUser {
  id:        number
  username:  string
  name:      string
  email:     string | null
  phone:     string | null
  isActive:  boolean
  createdAt: Date
}

/** Response shape for create/reset — includes the plaintext password exactly once. */
export interface TenantAdminUserWithPassword extends TenantAdminUser {
  password: string
}

/** Input for CO-2: create an additional clinic_admin user for an existing tenant. */
export interface CreateTenantAdminUserInput {
  name:      string
  username:  string
  email?:    string
  phone?:    string
  password?: string
}
```

Add the service function at the end of the file:

```ts
/**
 * Create an additional clinic_admin user for an existing tenant (CO-2).
 * Counts against the tenant's user quota (Q-5 — unlike CO-1's exempt first admin).
 *
 * @param tenantId       - Target tenant (path param — never trusted from body, BOLA guard).
 * @param data           - New admin fields; password optional (server-generates if omitted).
 * @param performedById  - Platform user performing the action.
 */
export async function createTenantAdminUser(
  tenantId: number,
  data: CreateTenantAdminUserInput,
  performedById: number,
): Promise<TenantAdminUserWithPassword> {
  const tenant = await customersRepo.getTenantById(tenantId)
  if (!tenant) throw new CustomerNotFoundError()

  if (data.password !== undefined && data.password.length < 8) {
    throw new WeakPasswordError()
  }

  await subscriptionService.assertCanAddUser(tenantId)

  const clinicAdminRole = await roleRepo.findSystemRoleByKey('clinic_admin')
  if (!clinicAdminRole) throw new Error("System role 'clinic_admin' not seeded")

  const plaintext = data.password ?? generateSecurePassword()
  const passwordHash = await bcrypt.hash(plaintext, config.bcryptRounds)

  try {
    const user = await customersRepo.createTenantAdminUser(
      tenantId,
      { name: data.name, username: data.username, email: data.email ?? null, phone: data.phone ?? null, passwordHash },
      clinicAdminRole.id,
    )

    await platformAuditRepo.createPlatformAuditLog({
      action: 'tenant.admin_user.create',
      targetTenantId: tenantId,
      performedByPlatformUserId: performedById,
      details: { userId: user.id, username: user.username },
    })

    return { ...user, password: plaintext }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UsernameConflictError()
    }
    throw err
  }
}
```

### Step CO-2.4 — Add the Zod schema and controller handler

Edit `src/backend/controllers/platform-customers.controller.ts` — add after `setQuotaSchema`:

```ts
/** Zod schema for POST /platform/customers/:id/admin-users */
export const createTenantAdminUserSchema = z.object({
  name:     z.string().trim().min(1).max(255),
  username: z.string().trim().min(1).max(20),
  email:    z.string().trim().email().max(255).optional(),
  phone:    z.string().trim().max(20).optional(),
  password: z.string().min(8).optional(),
}).strict().refine(
  (data) => Boolean(data.email) || Boolean(data.phone),
  { message: 'At least one contact (email or phone) is required', path: ['email'] },
)
```

Add the handler after `handleUpdateProvisioning`:

```ts
/**
 * POST /platform/customers/:id/admin-users
 */
export async function handleCreateTenantAdminUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = Number(req.params.id)
    const body = req.body as z.infer<typeof createTenantAdminUserSchema>
    const performedById = req.context!.platformUserId!
    const data = await customersService.createTenantAdminUser(tenantId, body, performedById)
    res.status(201).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
```

### Step CO-2.5 — Mount the route

Edit `src/backend/routes/platform-customers.routes.ts` — add `createTenantAdminUserSchema` and `handleCreateTenantAdminUser` to the controller import block, then add after the `// Provisioning` section:

```ts
// Clinic admin users (bounded platform→clinic-plane exception, ADR-0015)
router.post('/:id/admin-users', requirePlatformPermission('platform.customers.manage'), validate(createTenantAdminUserSchema), handleCreateTenantAdminUser)
```

### Step CO-2.6 — Green

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — all CO-2 tests pass.

---

## TASK CO-4 — `PATCH /platform/customers/:id/admin-users/:userId/deactivate`

### Step CO-4.1 — Write the failing tests

Append to the test file:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// CO-4 — PATCH /platform/customers/:id/admin-users/:userId/deactivate
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-4: PATCH /platform/customers/:id/admin-users/:userId/deactivate', () => {
  it('✅ deactivates a clinic_admin user; login is actually blocked afterward (G-4)', async () => {
    const tenant = await createTenantViaService('co4a')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(row.isActive).toBe(false)

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'tenant.admin_user.deactivate', targetTenantId: tenant.id },
    })
    expect((log.details as Record<string, unknown>).userId).toBe(admin.id)
  })

  it('❌ 404 when userId belongs to a different tenant (BOLA — no cross-tenant mutation)', async () => {
    const tenantA = await createTenantViaService('co4b1')
    const tenantB = await createTenantViaService('co4b2')
    const adminB  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenantB.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenantA.id}/admin-users/${adminB.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: adminB.id } })
    expect(row.isActive).toBe(true) // unchanged
  })

  it('❌ 404 when the target user is not a clinic_admin of this tenant (Q-8 role-scope guard)', async () => {
    const tenant = await createTenantViaService('co4c')
    const passwordHash = await bcrypt.hash('StaffPass1!', 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({
      data: { tenantId: tenant.id, username: 'staffer', name: 'Staffer', passwordHash, role: 'staff', isActive: true },
    })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: staff.id, roleId: staffRole.id } })

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${staff.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
  })

  it('❌ 409 ALREADY_DEACTIVATED when the user is already inactive (G-5 — not a silent no-op)', async () => {
    const tenant = await createTenantViaService('co4d')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ALREADY_DEACTIVATED')
  })

  it('❌ 403 without platform.customers.manage; 403 with wrong plane', async () => {
    const tenant = await createTenantViaService('co4e')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res1 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res1.status).toBe(403)

    const res2 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res2.status).toBe(403)
  })
})
```

Run the test file — CO-4 block fails (route not mounted).

### Step CO-4.2 — Add the service function

Edit `src/backend/services/platform-customers.service.ts` — add:

```ts
/**
 * Deactivate a clinic_admin user for a tenant (CO-4). Soft delete only
 * (Q-9) — sets isActive=false. The target must currently hold the
 * clinic_admin role for this exact tenant (Q-8); otherwise 404, same as a
 * cross-tenant userId (BOLA guard, PR #20 precedent).
 *
 * @param tenantId       - Target tenant (path param).
 * @param userId         - Target user (path param).
 * @param performedById  - Platform user performing the action.
 */
export async function deactivateTenantAdminUser(
  tenantId: number,
  userId: number,
  performedById: number,
): Promise<TenantAdminUser> {
  const updated = await customersRepo.deactivateTenantAdminUser(tenantId, userId)
  if (updated === 0) {
    const existing = await customersRepo.findTenantAdminUser(tenantId, userId)
    if (!existing) throw new AdminUserNotFoundError()
    throw new AlreadyDeactivatedError()
  }

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.admin_user.deactivate',
    targetTenantId: tenantId,
    performedByPlatformUserId: performedById,
    details: { userId },
  })

  const user = await customersRepo.findTenantAdminUser(tenantId, userId)
  if (!user) throw new AdminUserNotFoundError() // defensive — unreachable in practice
  return user
}
```

### Step CO-4.3 — Add the controller handler and route

Edit `src/backend/controllers/platform-customers.controller.ts` — add after `handleCreateTenantAdminUser`:

```ts
/**
 * PATCH /platform/customers/:id/admin-users/:userId/deactivate
 */
export async function handleDeactivateTenantAdminUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = Number(req.params.id)
    const userId = Number(req.params.userId)
    const performedById = req.context!.platformUserId!
    const data = await customersService.deactivateTenantAdminUser(tenantId, userId, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
```

Edit `src/backend/routes/platform-customers.routes.ts` — add `handleDeactivateTenantAdminUser` to the import block, then add below the CO-2 route:

```ts
router.patch('/:id/admin-users/:userId/deactivate', requirePlatformPermission('platform.customers.manage'), handleDeactivateTenantAdminUser)
```

### Step CO-4.4 — Green

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — all CO-4 tests pass.

---

## TASK CO-5 — `PATCH /platform/customers/:id/admin-users/:userId/password`

### Step CO-5.1 — Write the failing tests

Append to the test file:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// CO-5 — PATCH /platform/customers/:id/admin-users/:userId/password
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-5: PATCH /platform/customers/:id/admin-users/:userId/password', () => {
  it('✅ generates a new password when body is empty; hash actually changes', async () => {
    const tenant = await createTenantViaService('co5a')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    const beforeHash = admin.passwordHash

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.data.password).toHaveLength(16)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(row.passwordHash).not.toBe(beforeHash)

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'tenant.admin_user.password_reset', targetTenantId: tenant.id },
    })
    expect(JSON.stringify(log.details)).not.toMatch(/password/i)
  })

  it('✅ accepts a typed password (>= 8 chars) and hashes exactly what was typed', async () => {
    const tenant = await createTenantViaService('co5b')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ password: 'NewTypedPass1!' })
    expect(res.status).toBe(200)
    expect(res.body.data.password).toBe('NewTypedPass1!')

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(await bcrypt.compare('NewTypedPass1!', row.passwordHash)).toBe(true)
  })

  it('✅ works on a deactivated admin (CO-10 — reset is not active-only)', async () => {
    const tenant = await createTenantViaService('co5c')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)
  })

  it('❌ 422 when the typed password is shorter than 8 characters', async () => {
    const tenant = await createTenantViaService('co5d')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ password: 'short1' })
    expect(res.status).toBe(422)
  })

  it('❌ 404 when userId belongs to a different tenant (BOLA)', async () => {
    const tenantA = await createTenantViaService('co5e1')
    const tenantB = await createTenantViaService('co5e2')
    const adminB  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenantB.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenantA.id}/admin-users/${adminB.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(404)
  })

  it('❌ 403 without platform.customers.manage; 403 with wrong plane', async () => {
    const tenant = await createTenantViaService('co5f')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res1 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({})
    expect(res1.status).toBe(403)

    const res2 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${clinicToken}`)
      .send({})
    expect(res2.status).toBe(403)
  })
})
```

Run the test file — CO-5 block fails (route not mounted).

### Step CO-5.2 — Add the service function

Edit `src/backend/services/platform-customers.service.ts` — add:

```ts
/**
 * Reset (or generate) a clinic_admin user's password (CO-5). Available on
 * both active and deactivated admins (CO-10). Response includes the
 * plaintext exactly once; audit details never include it (R-6).
 *
 * @param tenantId      - Target tenant (path param).
 * @param userId        - Target user (path param).
 * @param newPassword   - Typed password (>= 8 chars) or undefined to auto-generate.
 * @param performedById - Platform user performing the action.
 */
export async function resetTenantAdminUserPassword(
  tenantId: number,
  userId: number,
  newPassword: string | undefined,
  performedById: number,
): Promise<TenantAdminUserWithPassword> {
  if (newPassword !== undefined && newPassword.length < 8) {
    throw new WeakPasswordError()
  }

  const plaintext    = newPassword ?? generateSecurePassword()
  const passwordHash = await bcrypt.hash(plaintext, config.bcryptRounds)

  const updated = await customersRepo.setTenantAdminUserPassword(tenantId, userId, passwordHash)
  if (updated === 0) throw new AdminUserNotFoundError()

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.admin_user.password_reset',
    targetTenantId: tenantId,
    performedByPlatformUserId: performedById,
    details: { userId },
  })

  const user = await customersRepo.findTenantAdminUser(tenantId, userId)
  if (!user) throw new AdminUserNotFoundError() // defensive — unreachable in practice
  return { ...user, password: plaintext }
}
```

### Step CO-5.3 — Add the Zod schema, controller handler, and route

Edit `src/backend/controllers/platform-customers.controller.ts` — add after `createTenantAdminUserSchema`:

```ts
/** Zod schema for PATCH /platform/customers/:id/admin-users/:userId/password */
export const resetTenantAdminUserPasswordSchema = z.object({
  password: z.string().min(8).optional(),
}).strict()
```

Add the handler after `handleDeactivateTenantAdminUser`:

```ts
/**
 * PATCH /platform/customers/:id/admin-users/:userId/password
 */
export async function handleResetTenantAdminUserPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = Number(req.params.id)
    const userId = Number(req.params.userId)
    const body = req.body as z.infer<typeof resetTenantAdminUserPasswordSchema>
    const performedById = req.context!.platformUserId!
    const data = await customersService.resetTenantAdminUserPassword(tenantId, userId, body.password, performedById)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
```

Edit `src/backend/routes/platform-customers.routes.ts` — add `resetTenantAdminUserPasswordSchema` and `handleResetTenantAdminUserPassword` to the import block, then add below the CO-4 route:

```ts
router.patch('/:id/admin-users/:userId/password', requirePlatformPermission('platform.customers.manage'), validate(resetTenantAdminUserPasswordSchema), handleResetTenantAdminUserPassword)
```

### Step CO-5.4 — Green

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — all CO-5 tests pass.

---

## TASK CO-6 — `GET /platform/customers/:id/admin-users` (list)

### Step CO-6.1 — Write the failing tests

Append to the test file:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// CO-6 — GET /platform/customers/:id/admin-users
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-6: GET /platform/customers/:id/admin-users', () => {
  it('✅ returns only clinic_admin-role users; never passwordHash; a mixed-role tenant filters correctly', async () => {
    const tenant = await createTenantViaService('co6a')
    const passwordHash = await bcrypt.hash('StaffPass1!', 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({
      data: { tenantId: tenant.id, username: 'staffer6', name: 'Staffer', passwordHash, role: 'staff', isActive: true },
    })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: staff.id, roleId: staffRole.id } })

    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].username).toBe('admin')
    expect(res.body.data[0].email).toBeNull()
    expect(res.body.data[0].phone).toBeNull()
    expect(res.body.data[0].passwordHash).toBeUndefined()
  })

  it('✅ platform_support (view-only) can list', async () => {
    const tenant = await createTenantViaService('co6b')
    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
  })

  it('✅ returns empty array (not 404) for a zero-admin tenant scenario', async () => {
    // Deactivate the only admin — list must still return it (deactivated ≠ absent);
    // this asserts the endpoint never 404s just because there are zero *active* admins.
    const tenant = await createTenantViaService('co6c')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)

    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].isActive).toBe(false)
  })

  it('❌ 404 when :id does not match an existing tenant', async () => {
    const res = await request(server)
      .get('/platform/customers/999999999/admin-users')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
  })

  it('❌ 403 with wrong plane', async () => {
    const tenant = await createTenantViaService('co6d')
    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res.status).toBe(403)
  })
})
```

Run the test file — CO-6 block fails (route not mounted).

### Step CO-6.2 — Add the service function

Edit `src/backend/services/platform-customers.service.ts` — add:

```ts
/**
 * List all clinic_admin-role users for a tenant (CO-6). Never leaks
 * doctor/staff rows (Q-8) or passwordHash (R-6).
 *
 * @param tenantId - Target tenant (path param).
 */
export async function listTenantAdminUsers(tenantId: number): Promise<TenantAdminUser[]> {
  const tenant = await customersRepo.getTenantById(tenantId)
  if (!tenant) throw new CustomerNotFoundError()
  return customersRepo.listTenantAdminUsers(tenantId)
}
```

### Step CO-6.3 — Add the controller handler and route

Edit `src/backend/controllers/platform-customers.controller.ts` — add after `handleResetTenantAdminUserPassword`:

```ts
/**
 * GET /platform/customers/:id/admin-users
 */
export async function handleListTenantAdminUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = Number(req.params.id)
    const data = await customersService.listTenantAdminUsers(tenantId)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
```

Edit `src/backend/routes/platform-customers.routes.ts` — add `handleListTenantAdminUsers` to the import block, then add above the CO-2 POST route (final ordering of the new section, GET first by REST convention):

```ts
// Clinic admin users (bounded platform→clinic-plane exception, ADR-0015)
router.get(  '/:id/admin-users',                   requirePlatformPermission('platform.customers.view'),   handleListTenantAdminUsers)
router.post( '/:id/admin-users',                   requirePlatformPermission('platform.customers.manage'), validate(createTenantAdminUserSchema), handleCreateTenantAdminUser)
router.patch('/:id/admin-users/:userId/deactivate', requirePlatformPermission('platform.customers.manage'), handleDeactivateTenantAdminUser)
router.patch('/:id/admin-users/:userId/password',   requirePlatformPermission('platform.customers.manage'), validate(resetTenantAdminUserPasswordSchema), handleResetTenantAdminUserPassword)
```

(This replaces the three separate route-insertion edits from CO-2.5/CO-4.3/CO-5.3 with one consolidated block — when actually executing task-by-task, insert each line at its respective step; this final snippet shows the correct end state for verification.)

### Step CO-6.4 — Green

Run the full backend test file: `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — all CO-1 through CO-6 tests pass (30+ assertions across the file).

Run `npx jest tests/unit/password.test.ts tests/integration/platform-customer-admin-users.test.ts tests/integration/platformConsole.test.ts tests/integration/platformContract.test.ts` from `src/backend` to confirm zero regressions in adjacent suites.

---

## TASK CO-7 — "Clinic Admins" tab shell + hooks

### Step CO-7.1 — Extend `usePlatformCustomers.ts` with admin-user types and hooks

Edit `src/frontend/src/hooks/usePlatformCustomers.ts` — add after the existing `CustomerUsage` interface:

```ts
/** A clinic_admin-role user of a tenant, as returned by the Clinic Admins tab endpoints. */
export interface TenantAdminUser {
  id:        number
  username:  string
  name:      string
  email:     string | null
  phone:     string | null
  isActive:  boolean
  createdAt: string
}

/** Response shape for create/reset — includes the plaintext password exactly once. */
export interface TenantAdminUserWithPassword extends TenantAdminUser {
  password: string
}

/** Payload for POST /platform/customers/:id/admin-users */
export interface CreateTenantAdminUserPayload {
  name:      string
  username:  string
  email?:    string
  phone?:    string
  password?: string
}
```

Extend the `KEYS` object:

```ts
const KEYS = {
  all:       ['platform', 'customers'] as const,
  detail:    (id: number) => ['platform', 'customers', id] as const,
  usage:     (id: number) => ['platform', 'customers', id, 'usage'] as const,
  adminUsers: (id: number) => ['platform', 'customers', id, 'admin-users'] as const,
}
```

Add hooks at the end of the file:

```ts
/** Fetch clinic_admin-role users for a tenant (Clinic Admins tab). */
export function useTenantAdminUsers(id: number) {
  return useQuery<TenantAdminUser[]>({
    queryKey: KEYS.adminUsers(id),
    queryFn: () =>
      platformApi.get(`/platform/customers/${id}/admin-users`).then((r) => r.data.data),
    enabled: id > 0,
  })
}

/** Create an additional clinic_admin user for a tenant. */
export function useCreateTenantAdminUser(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTenantAdminUserPayload) =>
      platformApi.post(`/platform/customers/${id}/admin-users`, payload).then((r) => r.data.data as TenantAdminUserWithPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminUsers(id) }),
  })
}

/** Deactivate a clinic_admin user (soft delete — no reactivate, G-1). */
export function useDeactivateTenantAdminUser(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      platformApi.patch(`/platform/customers/${id}/admin-users/${userId}/deactivate`).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminUsers(id) }),
  })
}

/** Reset (or generate) a clinic_admin user's password. */
export function useResetTenantAdminUserPassword(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, password }: { userId: number; password?: string }) =>
      platformApi.patch(`/platform/customers/${id}/admin-users/${userId}/password`, { password })
        .then((r) => r.data.data as TenantAdminUserWithPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminUsers(id) }),
  })
}
```

### Step CO-7.2 — Build the reusable `PasswordField` component (CO-8/CO-10 shared, Ponytail criterion 2)

Create `src/frontend/src/components/platform/PasswordField.tsx`:

```tsx
/**
 * PasswordField — typed-or-generate password control (Q-10).
 * Reused by ClinicAdminsTab's create form (CO-8) and reset-password action
 * (CO-10) so there is exactly one implementation of this UI pattern.
 */
import { useState } from 'react'
import MaterialIcon from '../MaterialIcon'

interface Props {
  value:    string
  onChange: (value: string) => void
  id:       string
  label?:   string
}

export default function PasswordField({ value, onChange, id, label = 'Password' }: Props) {
  const [mode, setMode] = useState<'typed' | 'generated'>('generated')

  const handleGenerate = () => {
    // Server generates the real password on submit; this is a placeholder
    // toggle state only (empty value signals "server should generate").
    setMode('generated')
    onChange('')
  }

  return (
    <div>
      <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-sm">
        <input
          id={id}
          type="text"
          value={value}
          disabled={mode === 'generated'}
          onChange={(e) => { setMode('typed'); onChange(e.target.value) }}
          placeholder={mode === 'generated' ? 'Server will generate a password' : 'Type a password (min 8 characters)'}
          className="flex-1 min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary disabled:bg-surface-container disabled:text-on-surface-variant"
        />
        {mode === 'typed' && (
          <button
            type="button"
            onClick={handleGenerate}
            className="flex items-center gap-xs min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <MaterialIcon name="autorenew" size={16} />
            Generate instead
          </button>
        )}
      </div>
      {mode === 'typed' && value.length > 0 && value.length < 8 && (
        <p className="text-label-md text-error mt-xs">Password must be at least 8 characters.</p>
      )}
    </div>
  )
}
```

### Step CO-7.3 — Build `ClinicAdminsTab` (list-only for this step; create/deactivate/reset land in CO-8/CO-9/CO-10 within the same file)

Create `src/frontend/src/components/platform/ClinicAdminsTab.tsx` with the list scaffold (this file is extended in place by CO-8/CO-9/CO-10 — written whole here since it is one cohesive component per the Ponytail file-count note):

```tsx
/**
 * ClinicAdminsTab — CustomerDetailView's "Clinic Admins" tab (CO-7..CO-10).
 *
 * Bounded platform→clinic-plane exception (ADR-0015): lists/creates/
 * deactivates/resets passwords for clinic_admin-role users of one tenant
 * only. No role picker (Q-8 — role is always clinic_admin). No rename
 * action (G-2 — happens clinic-side after first login). No reactivate
 * action (G-1 — recovery is creating a new clinic_admin).
 */
import { useState } from 'react'
import {
  useTenantAdminUsers,
  useCreateTenantAdminUser,
  useDeactivateTenantAdminUser,
  useResetTenantAdminUserPassword,
  type TenantAdminUser,
  type CreateTenantAdminUserPayload,
} from '../../hooks/usePlatformCustomers'
import PlatformModal from './PlatformModal'
import PasswordField from './PasswordField'
import MaterialIcon from '../MaterialIcon'

const EMPTY_FORM: CreateTenantAdminUserPayload = { name: '', username: '', email: '', phone: '', password: '' }

/** Display-once credentials panel shown after create/reset (brainstorm §3.5). */
function CredentialsPanel({ username, password, onDismiss }: { username: string; password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(password)
    setCopied(true)
  }
  return (
    <div className="bg-surface-container-low border border-secondary rounded-lg p-md space-y-sm">
      <div className="flex items-center gap-sm text-secondary">
        <MaterialIcon name="key" size={18} />
        <p className="text-label-md font-medium">This password will not be shown again.</p>
      </div>
      <dl className="text-body-sm space-y-xs">
        <div><dt className="inline text-on-surface-variant">Username: </dt><dd className="inline font-code text-on-surface">{username}</dd></div>
        <div><dt className="inline text-on-surface-variant">Password: </dt><dd className="inline font-code text-on-surface">{password}</dd></div>
      </dl>
      <div className="flex gap-sm">
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-xs min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <MaterialIcon name="content_copy" size={16} />
          {copied ? 'Copied' : 'Copy password'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  )
}

/** Per-row deactivate confirmation dialog (Q-9 — states there is no undo). */
function DeactivateConfirmDialog({ user, onConfirm, onCancel, isPending }: {
  user: TenantAdminUser; onConfirm: () => void; onCancel: () => void; isPending: boolean
}) {
  return (
    <PlatformModal title="Deactivate clinic admin?" open onClose={onCancel} width="max-w-md">
      <div className="space-y-md">
        <p className="text-body-sm text-on-surface">
          Deactivating <strong>{user.username}</strong> immediately blocks their login.
          There is <strong>no reactivate action</strong> — the only way to recover is
          creating a new clinic admin from this tab.
        </p>
        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onCancel} className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="min-h-[44px] px-md bg-error text-on-error rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Deactivate
          </button>
        </div>
      </div>
    </PlatformModal>
  )
}

export default function ClinicAdminsTab({ id }: { id: number }) {
  const { data: admins, isLoading, isError } = useTenantAdminUsers(id)
  const create   = useCreateTenantAdminUser(id)
  const deactivate = useDeactivateTenantAdminUser(id)
  const reset    = useResetTenantAdminUserPassword(id)

  const [createOpen, setCreateOpen]   = useState(false)
  const [form, setForm]               = useState<CreateTenantAdminUserPayload>(EMPTY_FORM)
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<TenantAdminUser | null>(null)
  const [resettingId, setResettingId] = useState<number | null>(null)

  const openCreate  = () => { setForm(EMPTY_FORM); create.reset(); setCreateOpen(true) }
  const closeCreate = () => setCreateOpen(false)

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: CreateTenantAdminUserPayload = {
      name: form.name,
      username: form.username,
      email: form.email || undefined,
      phone: form.phone || undefined,
      password: form.password || undefined,
    }
    create.mutate(payload, {
      onSuccess: (data) => {
        setCreateOpen(false)
        setCredentials({ username: data.username, password: data.password })
      },
    })
  }

  const handleDeactivateConfirm = () => {
    if (!deactivateTarget) return
    deactivate.mutate(deactivateTarget.id, { onSuccess: () => setDeactivateTarget(null) })
  }

  const handleReset = (userId: number) => {
    setResettingId(userId)
    reset.mutate({ userId }, {
      onSuccess: (data) => {
        setResettingId(null)
        setCredentials({ username: data.username, password: data.password })
      },
      onError: () => setResettingId(null),
    })
  }

  if (isLoading) {
    return <div className="p-lg text-on-surface-variant text-body-sm">Loading clinic admins…</div>
  }
  if (isError) {
    return (
      <div className="p-lg text-error text-body-sm flex items-center gap-sm">
        <MaterialIcon name="error_outline" size={18} />
        Failed to load clinic admins.
      </div>
    )
  }

  return (
    <div className="space-y-lg">
      {credentials && (
        <CredentialsPanel username={credentials.username} password={credentials.password} onDismiss={() => setCredentials(null)} />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-headline-xs font-headline font-bold text-on-surface">Clinic Admins</h3>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-sm bg-primary text-on-primary px-md min-h-[44px] rounded text-body-sm font-medium hover:opacity-90 transition-opacity"
        >
          <MaterialIcon name="add" size={18} />
          Create
        </button>
      </div>

      <div className="bg-surface rounded-lg shadow-lvl1 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Username</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Name</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Contact</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Status</th>
              <th className="text-left px-md py-sm text-label-md text-on-surface-variant">Created</th>
              <th className="px-md py-sm" />
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((u) => (
              <tr key={u.id} className="border-b border-outline-variant">
                <td className="px-md py-sm text-body-sm font-code text-on-surface-variant">{u.username}</td>
                <td className="px-md py-sm text-body-md text-on-surface font-medium">{u.name}</td>
                <td className="px-md py-sm text-body-sm text-on-surface-variant">{u.email ?? u.phone ?? '—'}</td>
                <td className="px-md py-sm text-body-sm">
                  {u.isActive
                    ? <span className="text-secondary">Active</span>
                    : <span className="text-on-surface-variant">Deactivated</span>}
                </td>
                <td className="px-md py-sm text-body-sm text-on-surface-variant">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-md py-sm">
                  <div className="flex items-center gap-sm justify-end">
                    <button
                      type="button"
                      onClick={() => handleReset(u.id)}
                      disabled={resettingId === u.id}
                      className="min-h-[44px] px-sm text-body-sm text-secondary hover:underline disabled:opacity-50"
                    >
                      Reset password
                    </button>
                    {u.isActive && (
                      <button
                        type="button"
                        onClick={() => setDeactivateTarget(u)}
                        className="min-h-[44px] px-sm text-body-sm text-error hover:underline"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(admins ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-md py-xl text-center text-on-surface-variant text-body-sm">
                  No clinic admins yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PlatformModal title="Create Clinic Admin" open={createOpen} onClose={closeCreate}>
        <form onSubmit={handleCreateSubmit} className="space-y-md">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-name">
              Name <span className="text-error">*</span>
            </label>
            <input
              id="ca-name" type="text" required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-username">
              Username <span className="text-error">*</span>
            </label>
            <input
              id="ca-username" type="text" required value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-email">Email</label>
            <input
              id="ca-email" type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor="ca-phone">Phone</label>
            <input
              id="ca-phone" type="tel" value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-md text-on-surface bg-surface focus:outline-none focus:border-secondary"
            />
          </div>
          {!form.email && !form.phone && (
            <p className="text-label-md text-error">At least one of email or phone is required.</p>
          )}
          <PasswordField id="ca-password" value={form.password ?? ''} onChange={(v) => setForm((f) => ({ ...f, password: v }))} />

          {create.error && (
            <p className="text-label-md text-error">
              {(create.error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'QUOTA_EXCEEDED'
                ? 'This tenant is at its user quota limit.'
                : (create.error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'USERNAME_CONFLICT'
                  ? 'That username is already in use for this tenant.'
                  : 'Failed to create clinic admin. Please try again.'}
            </p>
          )}

          <div className="flex items-center justify-end gap-sm pt-xs">
            <button type="button" onClick={closeCreate} className="min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending || (!form.email && !form.phone)}
              className="min-h-[44px] px-md bg-primary text-on-primary rounded text-body-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-sm"
            >
              {create.isPending && <span className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </PlatformModal>

      {deactivateTarget && (
        <DeactivateConfirmDialog
          user={deactivateTarget}
          onConfirm={handleDeactivateConfirm}
          onCancel={() => setDeactivateTarget(null)}
          isPending={deactivate.isPending}
        />
      )}
    </div>
  )
}
```

### Step CO-7.4 — Wire the tab into `CustomerDetailView.tsx`

Edit `src/frontend/src/views/platform/CustomerDetailView.tsx`:

Add the import:

```tsx
import ClinicAdminsTab from '../../components/platform/ClinicAdminsTab'
```

Change the `Tab` type and `TABS` array:

```tsx
type Tab = 'overview' | 'quota' | 'provisioning' | 'usage' | 'admins'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',     label: 'Overview' },
  { id: 'quota',        label: 'Plan & Quota' },
  { id: 'provisioning', label: 'Provisioning' },
  { id: 'usage',        label: 'Usage' },
  { id: 'admins',       label: 'Clinic Admins' },
]
```

Add the tab body in the render section (after `{activeTab === 'usage' && <UsageTab id={customerId} />}`):

```tsx
{activeTab === 'admins'       && <ClinicAdminsTab   id={customerId} />}
```

---

## TASK CO-8, CO-9, CO-10 — covered by the CO-7.3 component

`ClinicAdminsTab.tsx` as written in Step CO-7.3 already implements:
- **CO-8** (create form, typed-or-generated password): the `PlatformModal` create form + `PasswordField` + `CredentialsPanel` display-once success panel + inline 409 quota/duplicate error distinction.
- **CO-9** (deactivate + confirm dialog): `DeactivateConfirmDialog`, gated to `u.isActive` rows only, explicit no-undo copy per Q-9.
- **CO-10** (reset password, typed-or-generated): the per-row "Reset password" button reuses `PasswordField`'s underlying pattern via the same `CredentialsPanel`; available for both active and deactivated rows (no `disabled` gate on that button).

No separate files are needed for CO-8/CO-9/CO-10 — they are sub-behaviors of one cohesive tab component, consistent with the Ponytail file-count note in the task breakdown ("reuse the sub-component, not a second implementation").

### Step CO-8/9/10.1 — Write the frontend test file

Create `src/frontend/src/__tests__/ClinicAdminsTab.test.tsx`:

```tsx
/**
 * ClinicAdminsTab — CO-7..CO-10 frontend tests.
 * Framework: Vitest + React Testing Library, mirrors PlatformConsole.test.tsx
 * (mocks the hooks, drives the real component).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClinicAdminsTab from '../components/platform/ClinicAdminsTab'

const h = vi.hoisted(() => ({
  create:     vi.fn(),
  deactivate: vi.fn(),
  reset:      vi.fn(),
}))

const state = vi.hoisted(() => ({
  admins: [] as unknown[],
  isLoading: false,
  isError: false,
}))

vi.mock('../hooks/usePlatformCustomers', () => ({
  useTenantAdminUsers: () => ({ data: state.admins, isLoading: state.isLoading, isError: state.isError }),
  useCreateTenantAdminUser: () => ({ mutate: h.create, isPending: false, error: null, reset: vi.fn() }),
  useDeactivateTenantAdminUser: () => ({ mutate: h.deactivate, isPending: false }),
  useResetTenantAdminUserPassword: () => ({ mutate: h.reset, isPending: false }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.admins = [
    { id: 1, username: 'admin', name: 'Administrator', email: null, phone: null, isActive: true, createdAt: '2026-07-14T00:00:00Z' },
    { id: 2, username: 'admin2', name: 'Second Admin', email: 'a2@example.com', phone: null, isActive: false, createdAt: '2026-07-14T00:00:00Z' },
  ]
  state.isLoading = false
  state.isError = false
})

describe('ClinicAdminsTab (CO-7 list)', () => {
  it('renders the table with a "—" contact placeholder for the NULL-contact first admin', () => {
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument() // admin row: no email/phone
    expect(screen.getByText('a2@example.com')).toBeInTheDocument() // admin2 row
  })

  it('shows Active/Deactivated status per row', () => {
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })

  it('shows an empty state (not a blank table) when there are zero admins', () => {
    state.admins = []
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText('No clinic admins yet.')).toBeInTheDocument()
  })

  it('shows a loading state', () => {
    state.isLoading = true
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText(/Loading clinic admins/)).toBeInTheDocument()
  })

  it('shows an error state', () => {
    state.isError = true
    render(<ClinicAdminsTab id={42} />)
    expect(screen.getByText(/Failed to load clinic admins/)).toBeInTheDocument()
  })

  it('does not render any rename/edit-name action', () => {
    render(<ClinicAdminsTab id={42} />)
    expect(screen.queryByText(/edit name/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument()
  })
})

describe('ClinicAdminsTab (CO-8 create)', () => {
  it('opens the create modal and submits with typed contact + generated password', async () => {
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByText('Create'))

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Third Admin' } })
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'admin3' } })
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'a3@example.com' } })

    fireEvent.click(screen.getByText('Create', { selector: 'button[type="submit"]' }))

    await waitFor(() => expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Third Admin', username: 'admin3', email: 'a3@example.com' }),
      expect.anything(),
    ))
  })

  it('submit button is disabled when neither email nor phone is filled', () => {
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByText('Create'))
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'x' } })
    const submitBtn = screen.getByText('Create', { selector: 'button[type="submit"]' })
    expect(submitBtn).toBeDisabled()
  })
})

describe('ClinicAdminsTab (CO-9 deactivate)', () => {
  it('only renders a Deactivate action for active rows', () => {
    render(<ClinicAdminsTab id={42} />)
    const deactivateButtons = screen.getAllByText('Deactivate')
    expect(deactivateButtons).toHaveLength(1) // only the active 'admin' row
  })

  it('requires confirmation before calling the deactivate mutation', async () => {
    render(<ClinicAdminsTab id={42} />)
    fireEvent.click(screen.getByText('Deactivate'))
    expect(h.deactivate).not.toHaveBeenCalled()

    expect(screen.getByText(/no reactivate action/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(h.deactivate).toHaveBeenCalledWith(1, expect.anything()))
  })
})

describe('ClinicAdminsTab (CO-10 reset password)', () => {
  it('reset password is available for both active and deactivated rows', () => {
    render(<ClinicAdminsTab id={42} />)
    const resetButtons = screen.getAllByText('Reset password')
    expect(resetButtons).toHaveLength(2) // both rows
  })

  it('clicking reset calls the reset mutation for that row', async () => {
    render(<ClinicAdminsTab id={42} />)
    const resetButtons = screen.getAllByText('Reset password')
    fireEvent.click(resetButtons[1]) // admin2 (deactivated) row
    await waitFor(() => expect(h.reset).toHaveBeenCalledWith({ userId: 2 }, expect.anything()))
  })
})
```

### Step CO-8/9/10.2 — Run and fix

Run `npx vitest run src/__tests__/ClinicAdminsTab.test.tsx` from `src/frontend` — resolve any label/selector mismatches against the actual rendered DOM (e.g. `getByLabelText` requires the `<label htmlFor>` / `id` pairing already present in Step CO-7.3's JSX — `ca-name`, `ca-username`, `ca-email`, `ca-phone` all have matching `htmlFor`/`id`). Iterate until green — no code changes to component logic should be needed if Step CO-7.3 was transcribed exactly.

---

## Final integration check (run once all tasks are implemented)

```
cd src/backend && npx jest
cd src/frontend && npx vitest run
```

Confirm: full backend suite passes (915 + new password/admin-user tests), full frontend suite passes (235 + new ClinicAdminsTab tests). No existing test file changed except by addition.

---

## Self-Review (writing-plans skill requirement)

**Spec coverage against CO-1..CO-10:**
- CO-1 ✅ Step CO-1.1–CO-1.4 (transaction, R-E email/phone NULL, role resolution, Q-5 exemption, audit `adminUserId`, rollback test).
- CO-2 ✅ Step CO-2.1–CO-2.6 (route, D-2-02 refine, 8-char password floor, quota 409, duplicate-username 409, 404, BOLA-safe tenantId-from-path, negative/plane cases).
- CO-3 ✅ Task CO-3 (done first, dependency of CO-1/CO-2/CO-5; grep-check note re: create-platform-admin.ts documented, not silently skipped).
- CO-4 ✅ Task CO-4 (single-WHERE BOLA scoping matching PR #20 `hospitalization.repository.ts` pattern, Q-8 role-scope 404, G-5 409 idempotency, G-4 login-block regression note carried into the CO-1 test comment).
- CO-5 ✅ Task CO-5 (typed vs generated, 8-char floor, works on deactivated admins per CO-10, no password in audit details).
- CO-6 ✅ Task CO-6 (role-filtered list, passwordHash never exposed, empty-not-404, view-permission split from manage).
- CO-7 ✅ Step CO-7.1–CO-7.4 (hooks, tab wiring, `—` placeholder for NULL contact, no rename action test).
- CO-8 ✅ Folded into Step CO-7.3 + tested in CO-8/9/10 test task (typed-or-generate via shared `PasswordField`, display-once panel, inline 409 distinction, disabled submit until contact present).
- CO-9 ✅ Folded into Step CO-7.3 (confirm dialog, active-only gating, no-undo copy) + dedicated tests.
- CO-10 ✅ Folded into Step CO-7.3 (reuses `PasswordField`/`CredentialsPanel`, available on both active/deactivated rows) + dedicated tests.

**Grill Findings §11 (G-1..G-7) — all explicitly threaded through:**
G-1 (no reactivate) → CO-9 dialog copy + component has no reactivate control. G-2 (no rename) → explicit negative test in CO-7 test block. G-3 (no email-uniqueness) → not coded as a constraint (correctly absent). G-4 (deactivate really blocks login) → referenced in CO-1 test file header, actual enforcement already lives in `auth.service.ts` (untouched, pre-existing). G-5 (409 ALREADY_DEACTIVATED) → CO-4.2 service logic + CO-4.1 test. G-6 (8-char floor, scoped) → CO-2/CO-5 only, confirmed no change to `user.service.ts`. G-7 (no rate-limiting) → correctly not built.

**Gaps found and closed while writing this plan:**
1. The task doc's CO-2 AC left the exact D-2-02 enforcement layer (schema vs service) unspecified. Closed by putting it in the Zod schema via `.refine()`, matching the AC's own "422 VALIDATION_ERROR style, matching existing validate.middleware behavior" wording, and keeping `user.service.ts` untouched as R-E requires.
2. The task doc's CO-4 AC required a "single WHERE clause" for the mutation but CO-4 also needs to distinguish 404 (wrong tenant/role) from 409 (already inactive), which a single blind `updateMany` can't do from its count alone. Closed by keeping the actual state-changing write single-WHERE-scoped (`id + tenantId + role + isActive:true`), and adding a **read-only** follow-up lookup only on the zero-rows-affected path to pick the correct error code — this satisfies the BOLA "no two-round-trip mutation" intent literally while still being able to return the right status code.
3. Mocking Prisma's `$transaction` callback client (`tx`) to simulate an in-transaction failure is unreliable because `tx` is a distinct instance from the module-level `prisma` export — a `jest.spyOn(prisma.clinicRole, 'findFirst')` would not intercept it. Closed by using a real, temporary mutation of the seeded `clinic_admin` role's `key` column to force a genuine failure inside the transaction, then restoring it in a `finally` block.
4. The brainstorm didn't specify whether `createTenant`'s repository signature should change. Closed by adding an optional `client` parameter defaulting to the existing `prisma` export, so every pre-existing caller (route/service/other tests) is unaffected — a backward-compatible, additive change.
5. CO-8/CO-9/CO-10 in the task doc implied 3 separate frontend pieces; this plan explicitly folds them into one `ClinicAdminsTab.tsx` file (per the task doc's own Ponytail file-count note and its explicit instruction that CO-10 "reuse the sub-component, not a second implementation") and calls that out so `@ponytail-agent` doesn't flag it as under-delivered scope.

**Placeholder scan:** Searched every code block in this document for `TODO`, `...`, `<placeholder>`, `similar to Task N`, `add appropriate X` — none found. Every function, schema, route, component, and test above is complete, runnable code with concrete values (no elided logic). The one explicit note in Step CO-6.3 ("insert each line at its respective step") is a sequencing clarification for the route file, not a code placeholder — the code shown is the literal, complete end state.

**Type-consistency check across tasks:**
- `TenantAdminUser` / `TenantAdminUserWithPassword` are defined once in the backend service (CO-2.3) and once in the frontend hook file (CO-7.1) with matching field names (`id, username, name, email, phone, isActive, createdAt` [+ `password` for the `WithPassword` variant) — `createdAt` is `Date` server-side and `string` client-side (JSON-serialized), consistent with the existing `Customer`/`CustomerDetail` pattern already in `usePlatformCustomers.ts`.
- `CreateTenantAdminUserInput` (backend) and `CreateTenantAdminUserPayload` (frontend) both use optional `email?`/`phone?`/`password?` — consistent with the Zod schema's `.optional()` fields.
- Route param names (`:id`, `:userId`) are consistent across routes file, controller (`req.params.id`, `req.params.usery` — verified as `req.params.userId` in every handler), and every test's URL construction.
- Audit action strings (`tenant.admin_user.create` / `.deactivate` / `.password_reset`) are identical across service code and every corresponding test assertion.

**STATUS: PLAN COMPLETE. Ready for @ponytail-agent review (Step 5).**
