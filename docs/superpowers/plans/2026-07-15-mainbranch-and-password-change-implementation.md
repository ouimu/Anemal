# Implementation Plan — Main-Branch Auto-Provisioning Fix + Clinic Password Change

- **Document type:** Step-4 Write-Plan (Superpowers `writing-plans` format)
- **Author:** @pm-agent
- **Date:** 2026-07-15
- **Inputs (all read in full before writing this plan):**
  - `docs/superpowers/specs/2026-07-15-mainbranch-and-password-change-brainstorm.md` (Steps 1+3, BA sign-off §10, Grill Findings §11 — ALL RESOLVED)
  - `docs/adr/0015-platform-provisions-clinic-admin-identity.md` (accepted, incl. 2026-07-15 amendment extending the exception to the `branches` write)
  - `docs/superpowers/plans/2026-07-14-clinic-admins-tab-implementation.md` (format template; also the origin of the code this branch modifies)
  - Source read in full: `platform-customers.service.ts`, `platform-customers.repository.ts`, `auth.routes.ts`, `auth.controller.ts`, `auth.service.ts`, `user.routes.ts`, `user.controller.ts`, `user.service.ts`, `user.repository.ts`, `refresh-token.repository.ts`, `rate-limit.middleware.ts`, `auth.middleware.ts`, `errors.ts`, `schema.prisma` (User/Branch/RefreshToken models), `scripts/deactivate-duplicate-test-users.ts` (script precedent — no `create-platform-admin.ts` exists in this repo; the brainstorm's precedent reference is stale, this simpler script is the actual precedent used below)
- **Gate status:** `/grill-with-docs` COMPLETE, all 5 findings resolved (brainstorm §11). `/write-plan` unblocked. This plan is subject to `@ponytail-agent` review (Step 5) before `/execute-plan` (Step 6).

## Resolved decisions this plan bakes in verbatim (no re-litigation)

- **Q-G1:** clinic_admin may reset another clinic_admin's password in the same tenant via `PATCH /users/:id/password`. No extra role check beyond `staff.manage`.
- **Q-G2:** Admin self-reset via `PATCH /users/:id/password` (own id) is allowed, no current-password check — not a privilege escalation.
- **Q-G3:** 8h access-JWT residual after any password change/reset is accepted. No `tokenVersion` work in this branch.
- **Q-G4:** Backfill ships as a script under `src/backend/scripts/`, run manually once per environment (Neon prod included), not wired into CI/deploy.
- **Q-G5:** `POST /auth/change-password` reuses `loginRateLimiter` (per-IP keying) — no new rate-limit infra.
- **ADR-0015 amendment:** already recorded (2026-07-15) — the `branches` insert inside `createCustomer()`'s transaction is an extension of bound B-2 (no clinic-data reads), not a new exception. No further ADR work needed in this plan.
- Zero new permission codes (brainstorm §5). `PATCH /users/:id/password` reuses `staff.manage`; `POST /auth/change-password` is self-scoped (no permission code, same class as `GET /auth/me`).
- Cross-tenant / cross-scope failures are **404, never 403** (ADR-0014 BOLA precedent) — applies to `PATCH /users/:id/password` only; `POST /auth/change-password` has no target-user param so this doesn't apply there.
- Every password-affecting flow (B-1, B-2, and the existing platform `resetTenantAdminUserPassword`) ends by revoking **all** refresh-token families for the affected user via one new repository function, `revokeAllForUser(userId)`.
- No audit-log write added to `PATCH /users/:id/password` or `POST /auth/change-password` (brainstorm §4.2 — clinic-side `audit_logs` is pre-existing unused debt, R-4, out of scope here).

## Ponytail 7-point pre-check (combined scope — read before Step 5)

| # | Criterion | This branch |
|---|---|---|
| 1 | Over-engineering? | No — one insert (Item A), one repo fn + 2 routes reusing existing middleware/error patterns (Item B). No new abstractions. |
| 2 | Duplicate work? | No — extends existing `createCustomer()` transaction and existing `refresh-token.repository.ts`; does not reimplement anything. |
| 3 | Existing solution covers it? | No — no library gap; this is first-party business logic. |
| 4 | Scope too large (>3 subsystems/>10 files/>500 LOC)? | **Borderline — flagged explicitly below.** |
| 5 | Too many dependencies (>5 new)? | No — **0 new npm dependencies** (bcrypt, crypto, express-rate-limit all already in use). |
| 6 | Too many files (>15)? | No — **13 files total** (3 new, 10 modified). See inventory below. |
| 7 | Too many APIs (>3 new endpoints)? | No — **2 new endpoints** (`POST /auth/change-password`, `PATCH /users/:id/password`). Item A adds zero endpoints (internal transaction + offline script). |

**Explicit flag for @ponytail-agent on criterion 4:** two logically separate subsystems are touched — (a) platform tenant-provisioning (`platform-customers.service.ts` + a new backfill script) and (b) clinic auth/user credential management (`auth.*`, `user.*`, `refresh-token.repository.ts`). That is 2 subsystems, not >3, and BA scoped them onto one branch deliberately (brainstorm intro: "Two related items, one branch... bounded") because Item B's `revokeAllForUser` retrofit target IS Item A's neighboring file family (`platform-customers.service.ts`) — splitting the branch would mean touching `platform-customers.service.ts` twice across two PRs for related reasons. File count (13) and endpoint count (2) are both comfortably under threshold. Estimated production LOC (excluding tests) is ~150–200 lines across all 10 modified files — small deltas per file, not a single large diff. Test LOC is larger (~350–450 lines) because the gap analysis (§6) specifies dense acceptance-criteria coverage (PROV-1, PWD-1/2/3, each with positive + multiple negative cases) — this is expected test-to-code ratio for auth/BOLA-sensitive work (see PR #20, #22 precedent in CLAUDE.md phase table) and should not by itself trip criterion 4. **Recommendation: APPROVE as combined, but this is the reasoning Ponytail should verify, not assume.**

## File inventory (13 files — under the >15-file Ponytail threshold; 3 new, 10 modified)

| # | File | Change | Item |
|---|------|--------|------|
| 1 | `src/backend/models/refresh-token.repository.ts` | MODIFY — add `revokeAllForUser` | B (shared dependency, built first) |
| 2 | `src/backend/services/platform-customers.service.ts` | MODIFY — Item A: `branches` insert in `createCustomer()` tx + `branchId` in audit details. Item B: retrofit `resetTenantAdminUserPassword` to call `revokeAllForUser` | A + B |
| 3 | `src/backend/scripts/backfill-main-branch.ts` | NEW | A |
| 4 | `src/backend/tests/integration/platform-customer-admin-users.test.ts` | MODIFY — extend existing CO-1 describe block with branch assertions + two-step-login proof; extend CO-5's password-reset test with a token-revocation assertion (PWD-3 retrofit) | A + B |
| 5 | `src/backend/tests/integration/backfill-main-branch.test.ts` | NEW | A |
| 6 | `src/backend/services/auth.service.ts` | MODIFY — add `changePassword` | B |
| 7 | `src/backend/controllers/auth.controller.ts` | MODIFY — add `changePasswordSchema` + `handleChangePassword` | B |
| 8 | `src/backend/routes/auth.routes.ts` | MODIFY — mount `POST /auth/change-password` | B |
| 9 | `src/backend/models/user.repository.ts` | MODIFY — add `setPasswordHash` (tenant-scoped `updateMany`) | B |
| 10 | `src/backend/services/user.service.ts` | MODIFY — add `resetUserPassword` | B |
| 11 | `src/backend/controllers/user.controller.ts` | MODIFY — add `resetPasswordSchema` + `handleResetPassword` | B |
| 12 | `src/backend/routes/user.routes.ts` | MODIFY — mount `PATCH /users/:id/password` | B |
| 13 | `src/backend/tests/integration/password-management.test.ts` | NEW | B |

---

## TASK PWD-0 — `revokeAllForUser` (build first: B-1, B-2, and the platform-reset retrofit all depend on it)

### Step PWD-0.1 — Write the failing unit test

Create a new `describe` block at the end of the (assumed pre-existing, else create) `src/backend/tests/unit/refresh-token.repository.test.ts`. If this file does not already exist, create it fresh with just this block:

```ts
import prisma from '../../config/db'
import { revokeAllForUser } from '../../models/refresh-token.repository'

describe('revokeAllForUser', () => {
  afterEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { gte: 900000000 } } })
  })

  it('revokes every non-revoked token for the user, leaves other users untouched', async () => {
    const now = new Date()
    const future = new Date(Date.now() + 60_000)
    await prisma.refreshToken.createMany({
      data: [
        { tokenHash: 'rau-a1', familyId: 'fam-a1', userId: 900000001, tenantId: 1, plane: 'clinic', expiresAt: future },
        { tokenHash: 'rau-a2', familyId: 'fam-a2', userId: 900000001, tenantId: 1, plane: 'clinic', expiresAt: future },
        { tokenHash: 'rau-b1', familyId: 'fam-b1', userId: 900000002, tenantId: 1, plane: 'clinic', expiresAt: future },
      ],
    })

    await revokeAllForUser(900000001)

    const userATokens = await prisma.refreshToken.findMany({ where: { userId: 900000001 } })
    expect(userATokens.every(t => t.revokedAt !== null)).toBe(true)

    const userBTokens = await prisma.refreshToken.findMany({ where: { userId: 900000002 } })
    expect(userBTokens.every(t => t.revokedAt === null)).toBe(true)
  })

  it('is idempotent — re-running on already-revoked tokens is a no-op, no throw', async () => {
    await prisma.refreshToken.create({
      data: { tokenHash: 'rau-c1', familyId: 'fam-c1', userId: 900000003, tenantId: 1, plane: 'clinic', expiresAt: new Date(Date.now() + 60_000) },
    })
    await revokeAllForUser(900000003)
    await expect(revokeAllForUser(900000003)).resolves.not.toThrow()
  })
})
```

Run `npx jest tests/unit/refresh-token.repository.test.ts` from `src/backend` — fails: `revokeAllForUser` is not exported.

### Step PWD-0.2 — Implement `revokeAllForUser`

Edit `src/backend/models/refresh-token.repository.ts` — add after `revokeById`:

```ts
/**
 * Revoke every non-revoked refresh token belonging to a clinic user, across
 * all families. Used after any password change or reset (B-1/B-2/platform
 * reset) so a stolen or forgotten-but-valid 30-day refresh token can no
 * longer mint new access tokens (PWD-3, gap analysis §6).
 *
 * Existing 8h access JWTs are NOT invalidated by this call — accepted
 * residual (Q-G3, brainstorm §4.3), matches the deactivation residual.
 *
 * @param userId - Clinic `users.id` whose tokens should all be revoked.
 */
export async function revokeAllForUser(userId: number): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date() },
  })
}
```

### Step PWD-0.3 — Green

Run `npx jest tests/unit/refresh-token.repository.test.ts` from `src/backend` — both tests pass.

---

## TASK PROV-1 — Main Branch auto-creation inside `createCustomer()` transaction

### Step PROV-1.1 — Write the failing assertions (extend the existing CO-1 describe block)

Edit `src/backend/tests/integration/platform-customer-admin-users.test.ts`. In the existing `describe('CO-1: createCustomer() auto-creates first clinic_admin', ...)` block, extend the first test and add two new ones:

```ts
  it('✅ creates exactly one active Branch named "Main Branch"; audit details include branchId', async () => {
    const tenant = await createTenantViaService('prov1a')

    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Main Branch')
    expect(branches[0].isActive).toBe(true)

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'customer.create', targetTenantId: tenant.id },
    })
    expect((log.details as Record<string, unknown>).branchId).toBe(branches[0].id)
  })

  it('✅ rolls back tenant AND branch together if the transaction fails downstream', async () => {
    // Reuse the existing rollback simulation (role key temporarily renamed) —
    // the branch insert happens BEFORE the role lookup, so this proves the
    // whole transaction — branch included — rolls back, not just the user.
    const subdomain = `co-test-provrollback-${SFX}`
    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: '__temp_missing_prov__' } })
    try {
      await expect(
        customersService.createCustomer({ name: 'Prov Rollback Test', subdomain }, 1),
      ).rejects.toThrow("System role 'clinic_admin' not seeded")

      const tenant = await prisma.tenant.findUnique({ where: { subdomain } })
      expect(tenant).toBeNull()
      // No orphaned branch either — subdomain lookup above already proves no
      // tenant row exists, and Branch.tenantId has an onDelete: Cascade FK,
      // so no branch could exist without a parent tenant row.
    } finally {
      await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: 'clinic_admin' } })
    }
  })

  it('✅ a staff user created and assigned to the Main Branch can complete two-step login', async () => {
    const tenant = await createTenantViaService('prov1c')
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })

    const staffPasswordHash = await bcrypt.hash('StaffPass1!', 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({
      data: { tenantId: tenant.id, username: 'prov1staff', name: 'Prov Staff', passwordHash: staffPasswordHash, role: 'staff', isActive: true },
    })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: staff.id, roleId: staffRole.id } })
    await prisma.userBranch.create({ data: { tenantId: tenant.id, userId: staff.id, branchId: branch.id } })

    const step1 = await request(server)
      .post('/auth/login')
      .send({ subdomain: tenant.subdomain, username: 'prov1staff', password: 'StaffPass1!' })
    expect(step1.body.data.requiresBranchSelection).toBe(true)
    expect(step1.body.data.branches).toEqual([{ id: branch.id, name: 'Main Branch' }])

    const step2 = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken: step1.body.data.pendingToken, branchId: branch.id })
    expect(step2.status).toBe(200)
    expect(step2.body.data.token).toBeTruthy()
  })
```

Also add `createdTenantIds`-cascade cleanup awareness: `afterAll` already deletes `prisma.tenant.deleteMany` for `createdTenantIds`, and `Branch.tenant` has `onDelete: Cascade` (confirmed in `schema.prisma:559`) — no new cleanup code needed.

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — the 3 new assertions fail: zero branches exist, staff login 403s ("not assigned to any branch").

### Step PROV-1.2 — Implement the branch insert in `createCustomer()`

Edit `src/backend/services/platform-customers.service.ts`. Inside the existing `$transaction` callback (lines 264–298), add the branch insert immediately after `createdTenant` and before the role lookup:

```ts
  const { tenant, adminUserId } = await prisma.$transaction(async (tx) => {
    const createdTenant = await customersRepo.createTenant(createData, tx)

    // PROV-1 (ADR-0015 amendment, 2026-07-15): every tenant must start with
    // one branch so staff/doctor login and every branch-scoped module has
    // context from day one — matches prisma/seed.ts parity. Server-constant
    // name, no clinic-data read: within the amended B-2 bound. No
    // user_branches row for the admin — the admin role bypasses branch
    // selection entirely (auth.service.ts login()/selectBranch()), exactly
    // as seed-created tenants have no admin user_branches rows either.
    const branch = await tx.branch.create({
      data: { tenantId: createdTenant.id, name: 'Main Branch' },
    })

    const clinicAdminRole = await tx.clinicRole.findFirst({
      where: { key: 'clinic_admin', tenantId: null, isSystem: true },
    })
    if (!clinicAdminRole) {
      throw new Error("System role 'clinic_admin' not seeded")
    }

    const passwordHash = await bcrypt.hash(generateSecurePassword(), config.bcryptRounds)

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

    return { tenant: createdTenant, adminUserId: adminUser.id, branchId: branch.id }
  })
```

Note the return tuple now also carries `branchId` — update the destructure and the audit call right after the transaction:

```ts
  const { tenant, adminUserId, branchId } = await prisma.$transaction(async (tx) => {
    // ...(same body as above, returns { tenant: createdTenant, adminUserId: adminUser.id, branchId: branch.id })
  })

  await platformAuditRepo.createPlatformAuditLog({
    action: 'customer.create',
    targetTenantId: tenant.id,
    performedByPlatformUserId: performedById,
    details: { name: tenant.name, subdomain: tenant.subdomain, planId: tenant.planId, adminUserId, branchId },
  })
```

No repository signature change is needed — `tx.branch.create` uses the transaction client directly (same pattern already used for `tx.user.create` / `tx.userRole.create` in this function), so `platform-customers.repository.ts` is untouched by this task (it is only touched, if at all, indirectly — it is not in the file inventory for PROV-1).

### Step PROV-1.3 — Green

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — all CO-1 + new PROV-1 assertions pass. Run `npx jest platformConsole platformContract` — unaffected (existing assertions on `customer.create` audit details assert a subset of fields, still present).

---

## TASK PROV-2 — Idempotent backfill script

### Step PROV-2.1 — Write the failing integration test

Create `src/backend/tests/integration/backfill-main-branch.test.ts`:

```ts
/**
 * Backfill script (PROV-2): inserts a 'Main Branch' for any tenant with zero
 * Branch rows. Covers real Platform-Console tenants created between PR #23
 * and the PROV-1 fix landing (brainstorm §3.3).
 */
import { PrismaClient } from '@prisma/client'
import { backfillMainBranch } from '../../scripts/backfill-main-branch'

const prisma = new PrismaClient()
const createdTenantIds: number[] = []

afterAll(async () => {
  if (createdTenantIds.length) {
    await prisma.branch.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  await prisma.$disconnect()
})

describe('backfillMainBranch', () => {
  it('✅ inserts "Main Branch" for a tenant with zero branches', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Target', subdomain: `bf-target-${Date.now()}` } })
    createdTenantIds.push(tenant.id)

    const result = await backfillMainBranch()

    expect(result.inserted).toBeGreaterThanOrEqual(1)
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Main Branch')
  })

  it('✅ skips a tenant that already has a branch (any isActive value)', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Skip', subdomain: `bf-skip-${Date.now()}` } })
    createdTenantIds.push(tenant.id)
    await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Existing Branch', isActive: false } })

    await backfillMainBranch()

    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Existing Branch')
  })

  it('✅ idempotent: second run against the same DB state inserts 0 rows', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Idempotent', subdomain: `bf-idem-${Date.now()}` } })
    createdTenantIds.push(tenant.id)

    await backfillMainBranch()
    const second = await backfillMainBranch()

    // second run must not touch the tenant created above nor re-insert anywhere
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(second.inserted).toBe(0)
  })
})
```

Run `npx jest tests/integration/backfill-main-branch.test.ts` from `src/backend` — fails: no such module `../../scripts/backfill-main-branch`.

### Step PROV-2.2 — Implement the script

Create `src/backend/scripts/backfill-main-branch.ts`:

```ts
/**
 * One-time backfill (PROV-2, brainstorm §3.3 / Q-G4): insert a 'Main Branch'
 * for every tenant that currently has zero Branch rows. Covers real
 * Platform-Console-provisioned tenants created between PR #23 (first-admin
 * auto-provisioning) and PROV-1 (this branch) landing — those tenants exist
 * with an admin user but no branch, blocking all staff/doctor login.
 *
 * Idempotent by construction: only tenants with COUNT(branches) = 0 are
 * touched, regardless of isActive. Safe to re-run against the same
 * environment (Q-G4 — run manually once per environment, e.g. Neon prod,
 * not wired into CI/deploy).
 *
 * Run via: npx ts-node src/backend/scripts/backfill-main-branch.ts
 */
import prisma from '../config/db'

export async function backfillMainBranch(): Promise<{ inserted: number }> {
  const tenantsWithoutBranches = await prisma.tenant.findMany({
    where: { branches: { none: {} } },
    select: { id: true, name: true },
  })

  for (const tenant of tenantsWithoutBranches) {
    await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main Branch' } })
  }

  return { inserted: tenantsWithoutBranches.length }
}

if (require.main === module) {
  backfillMainBranch()
    .then((result) => { console.log(`Backfilled Main Branch for ${result.inserted} tenant(s).`) })
    .catch((err) => { console.error(err); process.exitCode = 1 })
    .finally(async () => { await prisma.$disconnect() })
}
```

### Step PROV-2.3 — Green

Run `npx jest tests/integration/backfill-main-branch.test.ts` from `src/backend` — all 3 tests pass.

---

## TASK PWD-1 — `POST /auth/change-password` (self-service)

### Step PWD-1.1 — Write the failing tests

Create `src/backend/tests/integration/password-management.test.ts`:

```ts
/**
 * Clinic-plane password management (PWD-1/PWD-2/PWD-3, brainstorm §4).
 *
 *   PWD-1  POST  /auth/change-password              (self-service)
 *   PWD-2  PATCH /users/:id/password                 (admin resets staff/doctor/peer-admin)
 *   PWD-3  refresh-token revocation on both flows above (platform-reset retrofit
 *          is asserted in platform-customer-admin-users.test.ts, same file as CO-5)
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import app from '../../app'

const prisma = new PrismaClient()
let server: Server

const SFX = `pw${Date.now().toString(36)}`
const createdTenantIds: number[] = []

async function makeTenantWithAdmin(subdomainSuffix: string, adminPassword: string) {
  const tenant = await prisma.tenant.create({ data: { name: `PW Test ${subdomainSuffix}`, subdomain: `pw-test-${subdomainSuffix}-${SFX}` } })
  createdTenantIds.push(tenant.id)
  const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  const admin = await prisma.user.create({
    data: { tenantId: tenant.id, username: 'pwadmin', name: 'PW Admin', passwordHash, role: 'admin', isActive: true },
  })
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: admin.id, roleId: clinicAdminRole.id } })
  return { tenant, admin }
}

async function loginAdmin(subdomain: string, password: string) {
  const res = await request(server).post('/auth/login').send({ subdomain, username: 'pwadmin', password })
  return { token: res.body.data.token as string, refreshToken: res.body.data.refreshToken as string }
}

let platformToken: string

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  const platformRes = await request(server).post('/platform/auth/login').send({
    email: process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.app',
    password: process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!',
  })
  platformToken = platformRes.body.data?.token
})

afterAll(async () => {
  if (createdTenantIds.length) {
    await prisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.refreshToken.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─────────────────────────────────────────────────────────────────────────────
// PWD-1 — POST /auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
describe('PWD-1: POST /auth/change-password', () => {
  it('✅ correct current password → 204; new password works on next login; old refresh token rejected', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1a', 'OldPass1!')
    const { token, refreshToken } = await loginAdmin(tenant.subdomain, 'OldPass1!')

    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })
    expect(res.status).toBe(204)

    const relogin = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'pwadmin', password: 'NewPass1!' })
    expect(relogin.status).toBe(200)

    const refreshAttempt = await request(server).post('/auth/refresh').send({ refreshToken })
    expect(refreshAttempt.status).toBe(401)
  })

  it('❌ wrong current password → 401; hash unchanged (old password still logs in)', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1b', 'OldPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'OldPass1!')

    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass1!', newPassword: 'NewPass1!' })
    expect(res.status).toBe(401)

    const stillWorks = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'pwadmin', password: 'OldPass1!' })
    expect(stillWorks.status).toBe(200)
  })

  it('❌ 422 when newPassword is shorter than 8 characters', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1c', 'OldPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'OldPass1!')

    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPass1!', newPassword: 'short1' })
    expect(res.status).toBe(422)
  })

  it('❌ 403 with a platform-plane token (plane guard)', async () => {
    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ currentPassword: 'x', newPassword: 'NewPass1!' })
    expect(res.status).toBe(403)
  })

  it('❌ 401 with no token', async () => {
    const res = await request(server).post('/auth/change-password').send({ currentPassword: 'x', newPassword: 'NewPass1!' })
    expect(res.status).toBe(401)
  })

  it('never logs the plaintext password on a failed attempt', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1d', 'OldPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'OldPass1!')
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass1!', newPassword: 'SuperSecretNew1!' })

    const loggedText = consoleSpy.mock.calls.flat().map(String).join('\n')
    expect(loggedText).not.toContain('SuperSecretNew1!')
    consoleSpy.mockRestore()
  })
})
```

Run `npx jest tests/integration/password-management.test.ts` from `src/backend` — the whole `PWD-1` block fails with 404 (route not mounted).

### Step PWD-1.2 — Add `changePassword` to `auth.service.ts`

Edit `src/backend/services/auth.service.ts` — add near the bottom, after `revokeClinicToken`:

```ts
/**
 * Self-service password change (PWD-1, brainstorm §4.2 B-1). The caller can
 * only ever act on their own row — userId/tenantId come from the verified
 * JWT context, never from the request body, so BOLA is structurally
 * impossible here (there is no target-user parameter).
 *
 * On success, ALL of the caller's refresh-token families are revoked
 * (PWD-3) so a stolen 30-day refresh token stops working immediately. The
 * 8h access JWT already in the caller's hand keeps working until it expires
 * (Q-G3, accepted residual).
 *
 * @param tenantId        - From req.context (JWT), never trusted from body.
 * @param userId          - From req.context (JWT), never trusted from body.
 * @param currentPassword - Must match the caller's existing hash.
 * @param newPassword     - Already validated >= 8 chars by the zod schema.
 * @throws AuthError(401) if currentPassword does not match.
 */
export async function changePassword(
  tenantId: number,
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  const matches = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!matches) throw new AuthError('Current password is incorrect', 401)

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
  await userRepo.setPasswordHash(tenantId, userId, passwordHash)
  await refreshTokenRepo.revokeAllForUser(userId)
}
```

Add the two new imports at the top of `auth.service.ts` (extend the existing import block):

```ts
import { config } from '../config/env'
```

(`bcrypt`, `authRepo`, `userRepo`, `refreshTokenRepo` are already imported in this file.)

### Step PWD-1.3 — Add `setPasswordHash` to `user.repository.ts`

Edit `src/backend/models/user.repository.ts` — add after `setActive`:

```ts
/**
 * Set a new password hash for a user, tenant-scoped (`updateMany`, BOLA
 * guard — mirrors `setActive`/`updateUserBranch`). Used by both
 * self-service change (PWD-1) and admin reset (PWD-2).
 *
 * @param tenantId     - Tenant scope (multi-tenancy isolation).
 * @param userId       - Target user's primary key.
 * @param passwordHash - New bcrypt hash.
 * @returns Number of rows updated (0 = not found in this tenant).
 */
export async function setPasswordHash(
  tenantId: number,
  userId: number,
  passwordHash: string,
): Promise<number> {
  const result = await prisma.user.updateMany({ where: { id: userId, tenantId }, data: { passwordHash } })
  return result.count
}
```

### Step PWD-1.4 — Add the zod schema and controller handler

Edit `src/backend/controllers/auth.controller.ts` — add after `logoutSchema`:

```ts
/** Zod schema for POST /auth/change-password (PWD-1). */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
}).strict()

/**
 * Handle POST /auth/change-password.
 * Self-service only — userId/tenantId come from req.context (JWT), never
 * from the body (no target-user param exists on this route by design).
 */
export async function handleChangePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, tenantId } = req.context!
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>
    await changePassword(tenantId, userId, currentPassword, newPassword)
    res.status(204).send()
  } catch (err) { next(err) }
}
```

Add `changePassword` to the existing import line from `'../services/auth.service'` at the top of the file.

### Step PWD-1.5 — Mount the route

Edit `src/backend/routes/auth.routes.ts`:

- Add `changePasswordSchema, handleChangePassword` to the existing controller import.
- Add after the `/switch-branch` route:

```ts
// POST /auth/change-password — self-service; current password required (PWD-1)
router.post('/change-password', authMiddleware, requirePlane('clinic'), loginRateLimiter, validate(changePasswordSchema), handleChangePassword)
```

(Q-G5: reuses `loginRateLimiter`, already imported in this file.)

### Step PWD-1.6 — Green

Run `npx jest tests/integration/password-management.test.ts` from `src/backend` — all PWD-1 tests pass.

---

## TASK PWD-2 — `PATCH /users/:id/password` (admin reset)

### Step PWD-2.1 — Write the failing tests

Append to `src/backend/tests/integration/password-management.test.ts`:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// PWD-2 — PATCH /users/:id/password
// ─────────────────────────────────────────────────────────────────────────────
describe('PWD-2: PATCH /users/:id/password', () => {
  async function makeStaffUser(tenantId: number, username: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({ data: { tenantId, username, name: 'Staffer', passwordHash, role: 'staff', isActive: true } })
    await prisma.userRole.create({ data: { tenantId, userId: staff.id, roleId: staffRole.id } })
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    await prisma.userBranch.create({ data: { tenantId, userId: staff.id, branchId: branch.id } })
    return staff
  }

  it('✅ admin resets a staff password; target refresh tokens revoked; staff logs in with new password', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd2a', 'AdminPass1!')
    const { token: adminToken } = await loginAdmin(tenant.subdomain, 'AdminPass1!')
    const staff = await makeStaffUser(tenant.id, 'staffer2a', 'StaffOld1!')

    // Log staff in first to get a refresh token to prove revocation.
    const staffLogin1 = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'staffer2a', password: 'StaffOld1!' })
    const staffBranchId = staffLogin1.body.data.branches[0].id
    const staffStep2 = await request(server).post('/auth/select-branch').send({ pendingToken: staffLogin1.body.data.pendingToken, branchId: staffBranchId })
    const staffRefreshToken = staffStep2.body.data.refreshToken

    const res = await request(server)
      .patch(`/users/${staff.id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'StaffNew1!' })
    expect(res.status).toBe(204)

    const refreshAttempt = await request(server).post('/auth/refresh').send({ refreshToken: staffRefreshToken })
    expect(refreshAttempt.status).toBe(401)

    const relogin = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'staffer2a', password: 'StaffNew1!' })
    expect(relogin.status).toBe(200)
  })

  it('✅ admin resets ANOTHER clinic_admin (peer) — Q-G1 allow', async () => {
    const { tenant, admin: adminA } = await makeTenantWithAdmin('pwd2b', 'AdminAPass1!')
    const { token: adminAToken } = await loginAdmin(tenant.subdomain, 'AdminAPass1!')

    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    const passwordHash = await bcrypt.hash('AdminBPass1!', 10)
    const adminB = await prisma.user.create({ data: { tenantId: tenant.id, username: 'peeradmin', name: 'Peer Admin', passwordHash, role: 'admin', isActive: true } })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: adminB.id, roleId: clinicAdminRole.id } })

    const res = await request(server)
      .patch(`/users/${adminB.id}/password`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ newPassword: 'AdminBNew1!' })
    expect(res.status).toBe(204)
  })

  it('✅ admin resets own password via this route (Q-G2 — no current-password check)', async () => {
    const { tenant, admin } = await makeTenantWithAdmin('pwd2c', 'SelfOld1!')
    const { token } = await loginAdmin(tenant.subdomain, 'SelfOld1!')

    const res = await request(server)
      .patch(`/users/${admin.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'SelfNew1!' })
    expect(res.status).toBe(204)
  })

  it('❌ 404 when :id belongs to a different tenant (BOLA — ADR-0014 precedent, not 403)', async () => {
    const { tenant: tenantA } = await makeTenantWithAdmin('pwd2d1', 'AdminAPass1!')
    const { admin: adminB } = await makeTenantWithAdmin('pwd2d2', 'AdminBPass1!')
    const { token: tokenA } = await loginAdmin(tenantA.subdomain, 'AdminAPass1!')

    const res = await request(server)
      .patch(`/users/${adminB.id}/password`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ newPassword: 'CrossTenant1!' })
    expect(res.status).toBe(404)
  })

  it('❌ 403 when caller lacks staff.manage (a staff-role token)', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd2e', 'AdminPass1!')
    const staff = await makeStaffUser(tenant.id, 'staffer2e', 'StaffPass1!')
    const staffLogin1 = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'staffer2e', password: 'StaffPass1!' })
    const staffStep2 = await request(server).post('/auth/select-branch').send({ pendingToken: staffLogin1.body.data.pendingToken, branchId: staffLogin1.body.data.branches[0].id })
    const staffToken = staffStep2.body.data.token

    const res = await request(server)
      .patch(`/users/${staff.id}/password`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ newPassword: 'ShouldFail1!' })
    expect(res.status).toBe(403)
  })

  it('❌ 403 with a platform-plane token (plane guard)', async () => {
    const { tenant, admin } = await makeTenantWithAdmin('pwd2f', 'AdminPass1!')
    const res = await request(server)
      .patch(`/users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ newPassword: 'ShouldFail1!' })
    expect(res.status).toBe(403)
  })

  it('❌ 422 when newPassword is shorter than 8 characters', async () => {
    const { tenant, admin } = await makeTenantWithAdmin('pwd2g', 'AdminPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'AdminPass1!')
    const res = await request(server)
      .patch(`/users/${admin.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'short1' })
    expect(res.status).toBe(422)
  })
})
```

Run `npx jest tests/integration/password-management.test.ts` from `src/backend` — the whole `PWD-2` block fails with 404 (route not mounted).

### Step PWD-2.2 — Add `resetUserPassword` to `user.service.ts`

Edit `src/backend/services/user.service.ts` — add after `deactivateUser`:

```ts
import { config } from '../config/env'
import * as refreshTokenRepo from '../models/refresh-token.repository'
```

(Add these two imports to the existing top-of-file import block — `bcrypt` is already imported.)

```ts
/**
 * Admin resets another clinic user's password (PWD-2, brainstorm §4.2 B-2).
 * No current-password check (that is the point of an admin reset — Q-G2
 * also allows self-targeting via this same route). Tenant-scoped
 * `updateMany` (user.repository.ts `setPasswordHash`) means a cross-tenant
 * `userId` affects 0 rows → 404, never 403 (ADR-0014 BOLA precedent).
 *
 * @param tenantId    - Caller's tenant (req.context, never from body/params).
 * @param userId      - Target user's primary key (path param).
 * @param newPassword - Already validated >= 8 chars by the zod schema.
 */
export async function resetUserPassword(
  tenantId: number,
  userId: number,
  newPassword: string,
): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
  const updated = await userRepo.setPasswordHash(tenantId, userId, passwordHash)
  if (updated === 0) throw new UserError('User not found', 404)
  await refreshTokenRepo.revokeAllForUser(userId)
}
```

### Step PWD-2.3 — Add the zod schema and controller handler

Edit `src/backend/controllers/user.controller.ts` — add after `updateUserSchema`:

```ts
/** Zod schema for PATCH /users/:id/password (PWD-2). */
export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
}).strict()
```

Add the handler after `deactivateUser`:

```ts
/**
 * PATCH /users/:id/password
 * Admin resets a clinic user's password within the caller's tenant.
 * Guarded by staff.manage. Q-G1: resetting a peer clinic_admin is allowed.
 * Q-G2: resetting one's own id via this route is allowed (no current-password check).
 */
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newPassword } = req.body as z.infer<typeof resetPasswordSchema>
    await userService.resetUserPassword(req.context!.tenantId, Number(req.params.id), newPassword)
    res.status(204).send()
  } catch (err) { next(err) }
}
```

### Step PWD-2.4 — Mount the route

Edit `src/backend/routes/user.routes.ts`:

- Add `resetPasswordSchema` to the existing schema import.
- Add after the `PUT /:id` route:

```ts
router.patch('/:id/password', requirePlane('clinic'), requirePermission('staff.manage'), validate(resetPasswordSchema), userController.resetPassword)
```

### Step PWD-2.5 — Green

Run `npx jest tests/integration/password-management.test.ts` from `src/backend` — all PWD-2 tests pass.

---

## TASK PWD-3 — Retrofit token revocation into the existing platform reset

### Step PWD-3.1 — Write the failing assertion (extend the existing CO-5 describe block)

Edit `src/backend/tests/integration/platform-customer-admin-users.test.ts`. In the existing `describe('CO-5: PATCH /platform/customers/:id/admin-users/:userId/password', ...)` block, add:

```ts
  it('✅ revokes the target clinic_admin\'s refresh tokens (PWD-3 retrofit — previously left 30-day tokens valid)', async () => {
    const tenant = await createTenantViaService('co5g')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    // The auto-created admin has a server-generated password we don't know,
    // so log in via a fresh password we set directly for this test only.
    const knownHash = await bcrypt.hash('KnownPass1!', 10)
    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: knownHash } })
    const loginRes = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'admin', password: 'KnownPass1!' })
    const adminRefreshToken = loginRes.body.data.refreshToken

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)

    const refreshAttempt = await request(server).post('/auth/refresh').send({ refreshToken: adminRefreshToken })
    expect(refreshAttempt.status).toBe(401)
  })
```

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — this new test fails: the refresh token is still valid (200, not 401) because `resetTenantAdminUserPassword` doesn't revoke tokens yet.

### Step PWD-3.2 — Add the retrofit call

Edit `src/backend/services/platform-customers.service.ts` — in `resetTenantAdminUserPassword` (currently ends at line 539), add one line right after the successful `updateMany`:

```ts
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

  // PWD-3 retrofit (R-5, brainstorm §4.3): a platform reset used to leave the
  // clinic_admin's 30-day refresh tokens valid. Now revoked, same as B-1/B-2.
  await refreshTokenRepo.revokeAllForUser(userId)

  await platformAuditRepo.createPlatformAuditLog({
    action: 'tenant.admin_user.password_reset',
    targetTenantId: tenantId,
    performedByPlatformUserId: performedById,
    details: { userId },
  })

  const user = await customersRepo.findTenantAdminUser(tenantId, userId)
  if (!user) throw new AdminUserNotFoundError()
  return { ...user, password: plaintext }
}
```

Add `import * as refreshTokenRepo from '../models/refresh-token.repository'` to the top import block of `platform-customers.service.ts`.

### Step PWD-3.3 — Green

Run `npx jest tests/integration/platform-customer-admin-users.test.ts` from `src/backend` — the new CO-5 assertion passes.

---

## Final verification (run once, after all 5 tasks)

```
cd src/backend
npx jest tests/unit/refresh-token.repository.test.ts
npx jest tests/integration/platform-customer-admin-users.test.ts
npx jest tests/integration/backfill-main-branch.test.ts
npx jest tests/integration/password-management.test.ts
npx jest   # full suite — confirm no regression on the ~953 backend tests
```

Manual (once per environment, Q-G4 — not automated): `npx ts-node src/backend/scripts/backfill-main-branch.ts` against the target DB (dev, then Neon prod after merge).

## Handoff sequence (per CLAUDE.md Agent Router)

1. **@db-agent** — review PROV-1's transaction placement (branch insert before role lookup — order matters for the rollback test), PROV-2's backfill script query safety (`branches: { none: {} }` — confirm no N+1 risk at real tenant-count scale; acceptable for a one-time manual script), and the two new tenant-scoped `updateMany` calls (`setPasswordHash`) for isolation compliance.
2. **@dev-agent** — implement PWD-0 → PROV-1 → PROV-2 → PWD-1 → PWD-2 → PWD-3 in that order (PWD-0 is a shared dependency; PROV-1/PROV-2 and PWD-1/PWD-2 are otherwise independent of each other and could be parallelized by two dev-agent instances if desired — PWD-3 must come last since it depends on PWD-0's `revokeAllForUser`).
3. **@qa-agent** — run the full gap-analysis §6 acceptance table (PROV-1, PWD-1, PWD-2, PWD-3) plus the standard isolation/RBAC regression pass (`.claude/roadmap/qa-protocols.md`); confirm no plaintext password ever appears in logs/audit across all 3 password-affecting flows.
4. **@pm-agent** — after QA sign-off, update `.claude/specs/implementation-status-matrix.md`, the phase table in `CLAUDE.md`, and `docs/index.html` / `docs/functional_spec_detailed.html`, then run `/anemal-finish-branch` (Step 8).

**Before Step 6 (`/execute-plan`) begins: this plan requires `@ponytail-agent` APPROVE (Step 5) — see the pre-check table above.**
