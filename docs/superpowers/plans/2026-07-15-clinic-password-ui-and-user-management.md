# Clinic Password UI + User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the frontend for the already-merged password endpoints (admin reset + self-service change), close the first-admin lockout gap with a server-side guard (deactivation, role-demotion, and restore-quota bypass), and make deactivate/restore directly discoverable on the User Management screen.

**Architecture:** Backend adds one tenant-scoped repository query (`findPrimaryAdminId`) and extends one existing service guard (`assertNotPrimaryAdminDeactivation` in `user.service.ts`) that both existing write paths (`deactivateUser`, `updateUser`) call before mutating. No new routes. Frontend adds a reusable `describeSaveError` util (extracted from `UserManagementTab.tsx`), a `skipAuthRedirect` escape hatch on the shared axios instance (so a wrong-current-password 401 doesn't trigger the global logout redirect), a self-service change-password card on `PreferencesPage`, and an admin-reset field + row-level Deactivate/Restore controls on `UserManagementTab` — all calling endpoints that already exist from PR #26.

**Tech Stack:** Node.js/Express/Prisma/PostgreSQL backend (Jest, `--runInBand --forceExit`); React 18/TypeScript/Zustand/React Query/Tailwind frontend (Vitest + Testing Library).

## Global Constraints

- No new API endpoints, no new npm dependencies, no schema/migration changes (per brainstorm Ponytail pre-check and BA sign-off).
- Every tenant-scoped query/mutation must include `tenantId` in its `WHERE` clause (`anemal-db-context`).
- All new/changed routes stay behind existing `requirePlane('clinic')` + `requirePermission('staff.manage')` (admin actions) or auth-only (self-service) — no permission-catalogue changes.
- Password inputs: `type="password"`, `autoComplete="new-password"` (admin reset, self-service new/confirm) or `"current-password"` (self-service current), never logged or toasted.
- Primary admin = lowest-`id` user with legacy `role = 'admin'` within a tenant (`user.repository.ts` `findPrimaryAdminId`), per ADR-0016 D-1.
- Guard trigger conditions (ADR-0016 D-5): 403 "Cannot deactivate the primary clinic admin" on `isActive: false`; 403 "Cannot change the primary clinic admin's role" on `role` set to anything other than `'admin'`. Both only apply when `userId === findPrimaryAdminId(tenantId)`.
- Restore quota (ADR-0016 D-6): an `isActive: false → true` transition in `updateUser` must call `subscriptionService.assertCanAddUser(tenantId)` before applying.
- Platform-plane `deactivateTenantAdminUser` (CO-4) stays exempt from the guard — do not touch `platform-customers.service.ts` (ADR-0016 D-7).
- No pessimistic locking on `findPrimaryAdminId` (ADR-0016 D-8, accepted risk) — add the required `// ponytail:` comment, no test.
- Self-edit routing (ADR-0016 D-2): the admin-reset-password field never renders when `clinic_admin` edits their own row; show a pointer to Preferences instead.
- Confirm copy for row Deactivate (ADR-0016 D-4): "Deactivate {name}? They will no longer be able to log in. You can restore them later." Confirm button label "Deactivate". Restore has no confirm step.

---

## File Structure

**Backend (modify only, no new files):**
- `src/backend/models/user.repository.ts` — add `findPrimaryAdminId(tenantId)`.
- `src/backend/services/user.service.ts` — add `assertNotPrimaryAdminDeactivation(tenantId, userId, change)`; call from `deactivateUser` and `updateUser`; add restore-quota check in `updateUser`.
- `src/backend/tests/unit/user.repository.test.ts` — append `findPrimaryAdminId` tests.
- `src/backend/tests/integration/user-primary-admin-protection.test.ts` — new integration test file (guard + quota + tenant isolation + permission ordering).

**Frontend (new + modify):**
- `src/frontend/src/utils/errorMessages.ts` — new: `describeSaveError`, extracted so both `UserManagementTab.tsx` and `PreferencesPage.tsx` can use it.
- `src/frontend/src/utils/api.ts` — modify: add `skipAuthRedirect` request-config escape hatch.
- `src/frontend/src/hooks/useChangePassword.ts` — new: self-service change-password mutation hook.
- `src/frontend/src/views/settings/PreferencesPage.tsx` — modify: add "Change password" card.
- `src/frontend/src/views/admin/UserManagementTab.tsx` — modify: admin-reset field (self-edit routed away), primary-admin lock on the Active-account checkbox, row-level Deactivate/Restore buttons + confirm dialog + lock icon.
- `src/frontend/src/utils/api.test.ts` — new: `skipAuthRedirect` interceptor behavior.
- `src/frontend/src/__tests__/PreferencesPage.changePassword.test.tsx` — new.
- `src/frontend/src/__tests__/UserManagementTab.test.tsx` — new (component had no prior dedicated test file).

---

## Task 1: `findPrimaryAdminId` repository helper

**Files:**
- Modify: `src/backend/models/user.repository.ts`
- Test: `src/backend/tests/unit/user.repository.test.ts`

**Interfaces:**
- Produces: `export function findPrimaryAdminId(tenantId: number): Promise<number | null>` — tenant-scoped, returns the lowest `id` among `role = 'admin'` rows, or `null` if none.

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/tests/unit/user.repository.test.ts` (before the final closing of the file, after the existing `replaceUserBranches` describe block):

```typescript
describe('findPrimaryAdminId', () => {
  it('returns the lowest-id role=admin user for the tenant', async () => {
    const admin1 = await prisma.user.create({
      data: {
        tenantId: tid, name: 'Primary Admin', username: `pa_${Date.now()}`,
        email: `pa-${Date.now()}@example.com`, passwordHash: 'x', role: 'admin', isActive: true,
      },
    })
    const admin2 = await prisma.user.create({
      data: {
        tenantId: tid, name: 'Second Admin', username: `sa_${Date.now()}`,
        email: `sa-${Date.now()}@example.com`, passwordHash: 'x', role: 'admin', isActive: true,
      },
    })
    const result = await userRepo.findPrimaryAdminId(tid)
    expect(result).toBe(admin1.id)
    expect(result).not.toBe(admin2.id)
  })

  it('returns null when the tenant has no role=admin user', async () => {
    const emptyTenant = await prisma.tenant.create({
      data: { name: 'No Admin Tenant', subdomain: `no-admin-${Date.now()}` },
    })
    try {
      const result = await userRepo.findPrimaryAdminId(emptyTenant.id)
      expect(result).toBeNull()
    } finally {
      await prisma.tenant.delete({ where: { id: emptyTenant.id } })
    }
  })

  it('is tenant-isolated: an admin in another tenant never affects this tenant\'s result', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Other Admin Tenant', subdomain: `other-admin-${Date.now()}` },
    })
    try {
      const foreignAdmin = await prisma.user.create({
        data: {
          tenantId: otherTenant.id, name: 'Foreign Admin', username: `fa_${Date.now()}`,
          email: `fa-${Date.now()}@example.com`, passwordHash: 'x', role: 'admin', isActive: true,
        },
      })
      const resultForThisTenant = await userRepo.findPrimaryAdminId(tid)
      const resultForOtherTenant = await userRepo.findPrimaryAdminId(otherTenant.id)
      expect(resultForThisTenant).not.toBe(foreignAdmin.id)
      expect(resultForOtherTenant).toBe(foreignAdmin.id)
    } finally {
      await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } })
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix src/backend test -- user.repository.test.ts`
Expected: FAIL — `userRepo.findPrimaryAdminId is not a function`

- [ ] **Step 3: Implement `findPrimaryAdminId`**

Append to `src/backend/models/user.repository.ts` (after `updatePreferences`, end of file):

```typescript
/**
 * Return the lowest-id user with legacy `role = 'admin'` for a tenant — the
 * tenant's "primary admin" (ADR-0016 D-1). Returns null if the tenant has no
 * such user. Tenant-scoped `findFirst` (BOLA-safe by construction).
 *
 * @param tenantId - Tenant scope (multi-tenancy isolation).
 */
export async function findPrimaryAdminId(tenantId: number): Promise<number | null> {
  const admin = await prisma.user.findFirst({
    where:   { tenantId, role: 'admin' },
    orderBy: { id: 'asc' },
    select:  { id: true },
  })
  return admin?.id ?? null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/backend test -- user.repository.test.ts`
Expected: PASS (all `findPrimaryAdminId` cases plus the pre-existing `getUserBranches`/`replaceUserBranches` cases)

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/user.repository.ts src/backend/tests/unit/user.repository.test.ts
git commit -m "feat(user-repo): add tenant-scoped findPrimaryAdminId helper"
```

---

## Task 2: Primary-admin lockout guard in `user.service.ts`

**Files:**
- Modify: `src/backend/services/user.service.ts`
- Test: `src/backend/tests/integration/user-primary-admin-protection.test.ts` (new)

**Interfaces:**
- Consumes: `userRepo.findPrimaryAdminId(tenantId): Promise<number | null>` (Task 1); `subscriptionService.assertCanAddUser(tenantId): Promise<void>` (throws `QuotaExceededError`, 409, when at seat limit — already imported as `subscriptionService` in `user.service.ts`).
- Produces: internal `assertNotPrimaryAdminDeactivation(tenantId: number, userId: number, change: { isActive?: boolean; role?: string }): Promise<void>` — throws `UserError(message, 403)`. Not exported (module-internal); `deactivateUser` and `updateUser` call it.

- [ ] **Step 1: Write the failing integration tests**

Create `src/backend/tests/integration/user-primary-admin-protection.test.ts`:

```typescript
/**
 * ADR-0016 — primary-admin lockout protection.
 * Covers: deactivation guard (D-5), role-demotion guard (D-5), restore
 * seat-quota check (D-6), permission-ordering (route guard fires before the
 * business-rule guard), and tenant isolation.
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUB = 'primary-admin-t1'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let adminToken = ''       // primary admin (lowest id role=admin)
let admin2Token = ''      // second admin (higher id)
let staffToken = ''       // no staff.manage
let primaryAdminId = 0
let admin2Id = 0
let staffId = 0
let branchId = 0

async function login(username: string): Promise<string> {
  const step1 = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUB, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server)
    .post('/auth/select-branch')
    .send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tenant = await prisma.tenant.create({ data: { name: 'Primary Admin T1', subdomain: SUB } })
  tid = tenant.id

  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })
  branchId = branch.id

  const [adminRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const uAdmin = await prisma.user.create({
    data: {
      tenantId: tid, branchId, name: 'Primary Admin', username: 'primary_admin_t1',
      email: 'primary@t1.test', passwordHash, role: 'admin', roleId: adminRole.id,
    },
  })
  primaryAdminId = uAdmin.id
  await prisma.userRole.create({ data: { userId: primaryAdminId, roleId: adminRole.id, tenantId: tid } })

  const uAdmin2 = await prisma.user.create({
    data: {
      tenantId: tid, branchId, name: 'Second Admin', username: 'second_admin_t1',
      email: 'second@t1.test', passwordHash, role: 'admin', roleId: adminRole.id,
    },
  })
  admin2Id = uAdmin2.id
  await prisma.userRole.create({ data: { userId: admin2Id, roleId: adminRole.id, tenantId: tid } })

  const uStaff = await prisma.user.create({
    data: {
      tenantId: tid, branchId, name: 'Staff T1', username: 'staff_t1',
      email: 'staff@t1.test', passwordHash, role: 'staff', roleId: staffRole.id,
    },
  })
  staffId = uStaff.id
  await prisma.userRole.create({ data: { userId: staffId, roleId: staffRole.id, tenantId: tid } })
  await prisma.userBranch.create({ data: { tenantId: tid, userId: staffId, branchId } })

  adminToken = await login('primary_admin_t1')
  admin2Token = await login('second_admin_t1')
  staffToken = await login('staff_t1')
})

afterAll(async () => {
  clearPermCache()
  await prisma.tenantQuota.deleteMany({ where: { tenantId: tid } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()

  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30_000)

describe('DELETE /users/:id — primary admin deactivation guard', () => {
  it('returns 403 when deactivating the primary admin', async () => {
    const res = await request(server)
      .delete(`/users/${primaryAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Cannot deactivate the primary clinic admin/)
  })

  it('returns 403 before ever running the deactivation for a non-staff.manage caller (permission ordering)', async () => {
    const res = await request(server)
      .delete(`/users/${admin2Id}`)
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
    // route-level requirePermission fires first — never reaches the business-rule guard
    expect(res.body.error).not.toMatch(/primary clinic admin/)
  })
})

describe('PUT /users/:id — isActive:false on primary admin', () => {
  it('returns 403 with the same message as DELETE', async () => {
    const res = await request(server)
      .put(`/users/${primaryAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Cannot deactivate the primary clinic admin/)
  })

  it('allows deactivating a second (non-primary) admin', async () => {
    const res = await request(server)
      .put(`/users/${admin2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)
  })

  it('allows reactivating the second admin again (isActive:true, no quota configured)', async () => {
    const res = await request(server)
      .put(`/users/${admin2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(true)
  })
})

describe('PUT /users/:id — role change away from admin on primary admin', () => {
  it('returns 403 when changing the primary admin\'s role to staff', async () => {
    const res = await request(server)
      .put(`/users/${primaryAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Cannot change the primary clinic admin's role/)
  })

  it('allows setting the primary admin\'s role to admin (no-op transition)', async () => {
    const res = await request(server)
      .put(`/users/${primaryAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' })
    expect(res.status).toBe(200)
  })
})

describe('PUT /users/:id — other edits to the primary admin remain allowed', () => {
  it('allows a name change on the primary admin', async () => {
    const res = await request(server)
      .put(`/users/${primaryAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Primary Admin Renamed' })
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Primary Admin Renamed')
  })

  it('allows an admin password reset targeting the primary admin', async () => {
    const res = await request(server)
      .patch(`/users/${primaryAdminId}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'BrandNewPass1!' })
    expect(res.status).toBe(204)
  })
})

describe('Restore vs seat quota (ADR-0016 D-6)', () => {
  it('blocks restoring a deactivated user when the tenant is at its seat quota', async () => {
    // Deactivate admin2 first so it is available to "restore".
    await request(server)
      .put(`/users/${admin2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })

    // Active users right now: primaryAdminId + staffId = 2. Cap quota at 2 so
    // restoring admin2 (would make 3) is blocked.
    await prisma.tenantQuota.upsert({
      where:  { tenantId: tid },
      create: { tenantId: tid, maxUsers: 2 },
      update: { maxUsers: 2 },
    })

    const res = await request(server)
      .put(`/users/${admin2Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Quota exceeded for users/)

    await prisma.tenantQuota.delete({ where: { tenantId: tid } })
  })
})

describe('Tenant isolation', () => {
  it('a primary-admin id in another tenant never blocks this tenant\'s deactivation of the same numeric id', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Other Primary Admin Tenant', subdomain: `other-pa-${Date.now()}` },
    })
    try {
      // Deactivating staffId in THIS tenant must succeed even though staffId's
      // numeric value may coincide with another tenant's primary-admin id —
      // findPrimaryAdminId(tid) only ever looks inside tid.
      const res = await request(server)
        .put(`/users/${staffId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
      expect(res.status).toBe(200)
      // restore for subsequent tests
      await request(server)
        .put(`/users/${staffId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: true })
    } finally {
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix src/backend test -- user-primary-admin-protection.test.ts`
Expected: FAIL — the primary-admin-specific 403 assertions fail (deactivation/role-change currently succeed with 200/204 since no guard exists yet); the quota-vs-restore test also fails (restore currently succeeds, no 409).

- [ ] **Step 3: Implement the guard in `user.service.ts`**

Edit `src/backend/services/user.service.ts`. Add the guard function after the `LEGACY_ROLE_TO_SYSTEM_KEY` constant (after line 22, before `safe()`):

```typescript
/**
 * Guards against lockout-equivalent actions on the tenant's primary admin
 * (ADR-0016). The primary admin is the lowest-id `role='admin'` user in the
 * tenant (userRepo.findPrimaryAdminId). Throws 403 when the target user IS
 * the primary admin AND the requested change would either:
 *   (a) set isActive to false (deactivation), or
 *   (b) set role to anything other than 'admin' (role-demotion bypass, D-5).
 * Reactivation, non-role/non-isActive edits (name, password) are unaffected.
 *
 * // ponytail: no pessimistic lock (SELECT...FOR UPDATE) on
 * // findPrimaryAdminId — accepted TOCTOU risk (ADR-0016 D-8). A missed race
 * // fails closed (a rare spurious 403 that a retry resolves), never open.
 *
 * Deliberately NOT called from platform-customers.service.ts
 * deactivateTenantAdminUser (CO-4) — that path is the platform operator's
 * audited recovery mechanism for a locked-out tenant (ADR-0016 D-7).
 */
async function assertNotPrimaryAdminDeactivation(
  tenantId: number,
  userId: number,
  change: { isActive?: boolean; role?: string },
): Promise<void> {
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  if (primaryAdminId === null || userId !== primaryAdminId) return

  if (change.isActive === false) {
    throw new UserError('Cannot deactivate the primary clinic admin', 403)
  }
  if (change.role !== undefined && change.role !== 'admin') {
    throw new UserError("Cannot change the primary clinic admin's role", 403)
  }
}
```

Now wire it into `updateUser` (replace the existing function body, lines 87-106):

```typescript
export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest
): Promise<UserResponse> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)

  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: body.isActive, role: body.role })

  // ADR-0016 D-6: restoring a deactivated user must re-check the seat quota,
  // same as createUser — restore should not be a quota-enforcement bypass.
  if (body.isActive === true && existing.isActive === false) {
    await subscriptionService.assertCanAddUser(tenantId)
  }

  if (body.role !== undefined) {
    const systemKey = LEGACY_ROLE_TO_SYSTEM_KEY[body.role]
    if (!systemKey) throw new UserError(`Unknown role: ${body.role}`, 400)

    const roleRow = await roleRepo.findSystemRoleByKey(systemKey)
    if (!roleRow) throw new UserError(`System role '${systemKey}' not seeded`, 500)

    await userRepo.replaceUserRole(tenantId, userId, roleRow.id)
  }

  const user = await userRepo.updateUser(tenantId, userId, body)
  if (!user) throw new UserError('User not found', 404)
  return safe(user)
}
```

Now wire it into `deactivateUser` (replace lines 239-243):

```typescript
export async function deactivateUser(tenantId: number, userId: number): Promise<void> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)
  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: false })
  await userRepo.setActive(tenantId, userId, false)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/backend test -- user-primary-admin-protection.test.ts`
Expected: PASS (all cases)

Run the full existing user-related suites to check for regressions:
Run: `npm --prefix src/backend test -- user-branch-assign.test.ts user-create-t5.test.ts user.repository.test.ts`
Expected: PASS (no regressions)

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/user.service.ts src/backend/tests/integration/user-primary-admin-protection.test.ts
git commit -m "feat(user-service): guard primary admin against deactivation, role-demotion, and restore-quota bypass"
```

---

## Task 3: `skipAuthRedirect` escape hatch on the shared axios instance

**Files:**
- Modify: `src/frontend/src/utils/api.ts`
- Test: `src/frontend/src/utils/api.test.ts` (new)

**Interfaces:**
- Produces: an `AxiosRequestConfig` extension `skipAuthRedirect?: boolean` — when `true` on the request that produced a 401, the global "clear auth + redirect to /login" side effect is skipped and the rejection still propagates normally so the caller's own `.catch`/mutation `onError` can show an inline message. Consumed by Task 5's `useChangePassword` hook.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/utils/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const clearAuth = vi.fn()

vi.mock('../store/authStore', () => ({
  useAuthStore: { getState: () => ({ token: '', clearAuth }) },
}))

import api from './api'

function getRejectedHandler(): (err: unknown) => Promise<never> {
  // axios stores interceptors internally; the response interceptor registered
  // in api.ts is the first (only) one, so index 0's `rejected` is our handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (api.interceptors.response as any).handlers[0].rejected
}

beforeEach(() => {
  clearAuth.mockReset()
  delete (window as unknown as { location?: unknown }).location
  ;(window as unknown as { location: { href: string } }).location = { href: '' }
})

describe('api response interceptor — 401 handling', () => {
  it('clears auth and redirects on a plain 401 (no skipAuthRedirect)', async () => {
    const rejected = getRejectedHandler()
    const err = { response: { status: 401 }, config: {} }
    await expect(rejected(err)).rejects.toBe(err)
    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(window.location.href).toBe('/login')
  })

  it('does NOT clear auth or redirect on a 401 when the request set skipAuthRedirect', async () => {
    const rejected = getRejectedHandler()
    const err = { response: { status: 401 }, config: { skipAuthRedirect: true } }
    await expect(rejected(err)).rejects.toBe(err)
    expect(clearAuth).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('still rejects (does not redirect) for non-401 errors', async () => {
    const rejected = getRejectedHandler()
    const err = { response: { status: 422 }, config: {} }
    await expect(rejected(err)).rejects.toBe(err)
    expect(clearAuth).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- api.test.ts`
Expected: FAIL — the second case fails because the current interceptor redirects on every 401 regardless of `skipAuthRedirect`.

- [ ] **Step 3: Implement `skipAuthRedirect`**

Replace `src/frontend/src/utils/api.ts` in full:

```typescript
// Axios instance — injects JWT from auth store on every request
import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/authStore'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * When true, a 401 response for this request will NOT trigger the global
     * "clear auth + redirect to /login" side effect below. Used by
     * self-service flows (e.g. change-password) where a 401 means "wrong
     * current password" — a normal inline-error case, not a session expiry.
     */
    skipAuthRedirect?: boolean
  }
}

const api = axios.create({ baseURL: '/' })

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const skipAuthRedirect = err.config?.skipAuthRedirect === true
    if (err.response?.status === 401 && !skipAuthRedirect) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend test -- api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/utils/api.ts src/frontend/src/utils/api.test.ts
git commit -m "feat(api): add skipAuthRedirect escape hatch for self-service 401s"
```

---

## Task 4: Extract `describeSaveError` to a shared util

**Files:**
- Create: `src/frontend/src/utils/errorMessages.ts`
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx`

**Interfaces:**
- Produces: `export function describeSaveError(err: unknown): string` — identical behavior to the function currently inlined in `UserManagementTab.tsx` (lines 22-30). Consumed by Task 6 (`PreferencesPage.tsx`) and Task 7 (admin-reset section).
- Consumes (in `UserManagementTab.tsx`): nothing new — this task only moves existing code and updates the one call site's import.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/utils/errorMessages.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { describeSaveError } from './errorMessages'

describe('describeSaveError', () => {
  it('returns the first field error message when present', () => {
    const err = { response: { data: { details: { fieldErrors: { newPassword: ['Password must be at least 8 characters'] } } } } }
    expect(describeSaveError(err)).toBe('newPassword: Password must be at least 8 characters')
  })

  it('returns "Save failed — <error>" when a top-level error string is present', () => {
    const err = { response: { data: { error: 'Current password is incorrect' } } }
    expect(describeSaveError(err)).toBe('Save failed — Current password is incorrect')
  })

  it('falls back to a generic message when no server error shape is recognized', () => {
    expect(describeSaveError({})).toBe('Save failed — check all fields.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- errorMessages.test.ts`
Expected: FAIL — `Cannot find module './errorMessages'`

- [ ] **Step 3: Create the shared util and update the call site**

Create `src/frontend/src/utils/errorMessages.ts`:

```typescript
import type { AxiosError } from 'axios'

/** Surfaces the server's actual validation/error message instead of a generic "Save failed". */
export function describeSaveError(err: unknown): string {
  const body = (err as AxiosError<{ error?: string; details?: { fieldErrors?: Record<string, string[]> } }>)?.response?.data
  const fieldErrors = body?.details?.fieldErrors
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, msgs]) => msgs?.length)
    if (first) return `${first[0]}: ${first[1][0]}`
  }
  return body?.error ? `Save failed — ${body.error}` : 'Save failed — check all fields.'
}
```

Edit `src/frontend/src/views/admin/UserManagementTab.tsx`: remove the inline `describeSaveError` (lines 21-30) and import the shared one instead.

Old (lines 1-11):
```typescript
// @uiux-agent spec: user list, role badges, add/edit/deactivate modal — 44px tap targets
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import Can from '../../components/Can'
import RolePicker from '../../components/roles/RolePicker'
import { useUserRolesQuery } from '../../hooks/useUserRoles'
import { useT } from '../../i18n'
```

New:
```typescript
// @uiux-agent spec: user list, role badges, add/edit/deactivate modal — 44px tap targets
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../utils/api'
import { useAuthStore } from '../../store/authStore'
import Can from '../../components/Can'
import RolePicker from '../../components/roles/RolePicker'
import { useUserRolesQuery } from '../../hooks/useUserRoles'
import { useT } from '../../i18n'
import { describeSaveError } from '../../utils/errorMessages'
```

Old (lines 21-30, the inline function — delete entirely):
```typescript
/** Surfaces the server's actual validation/error message instead of a generic "Save failed". */
function describeSaveError(err: unknown): string {
  const body = (err as AxiosError<{ error?: string; details?: { fieldErrors?: Record<string, string[]> } }>)?.response?.data
  const fieldErrors = body?.details?.fieldErrors
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, msgs]) => msgs?.length)
    if (first) return `${first[0]}: ${first[1][0]}`
  }
  return body?.error ? `Save failed — ${body.error}` : 'Save failed — check all fields.'
}
```

(No `New:` block — this block is deleted outright; the file now goes straight from the import block to the `INITIALS`/`AVATAR_BG` constants that followed it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/frontend test -- errorMessages.test.ts`
Expected: PASS

Run the frontend build/typecheck to confirm the removed local function didn't break anything:
Run: `npm --prefix src/frontend run build`
Expected: build succeeds (no unused-import or missing-symbol errors)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/utils/errorMessages.ts src/frontend/src/utils/errorMessages.test.ts src/frontend/src/views/admin/UserManagementTab.tsx
git commit -m "refactor(frontend): extract describeSaveError into a shared util"
```

---

## Task 5: `useChangePassword` hook

**Files:**
- Create: `src/frontend/src/hooks/useChangePassword.ts`

**Interfaces:**
- Consumes: `api` (default export of `src/frontend/src/utils/api.ts`, Task 3's `skipAuthRedirect` config option).
- Produces: `export interface ChangePasswordInput { currentPassword: string; newPassword: string }` and `export function useChangePassword()` — a React Query `useMutation` result whose `mutate`/`mutateAsync` accepts `ChangePasswordInput` and POSTs to `/auth/change-password` with `skipAuthRedirect: true`. Consumed by Task 6 (`PreferencesPage.tsx`).

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/hooks/useChangePassword.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const post = vi.fn()
vi.mock('../utils/api', () => ({ default: { post: (...args: unknown[]) => post(...args) } }))

import { useChangePassword } from './useChangePassword'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => { post.mockReset() })

describe('useChangePassword', () => {
  it('POSTs to /auth/change-password with skipAuthRedirect: true', async () => {
    post.mockResolvedValue({ status: 204 })
    const { result } = renderHook(() => useChangePassword(), { wrapper })

    result.current.mutate({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(post).toHaveBeenCalledWith(
      '/auth/change-password',
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      { skipAuthRedirect: true },
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix src/frontend test -- useChangePassword.test.ts`
Expected: FAIL — `Cannot find module './useChangePassword'`

- [ ] **Step 3: Implement the hook**

Create `src/frontend/src/hooks/useChangePassword.ts`:

```typescript
// Self-service password change (PWD-1). No target-user param — server derives
// the caller's identity from the JWT (req.context), never from the body.
import { useMutation } from '@tanstack/react-query'
import api from '../utils/api'

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

/**
 * POST /auth/change-password. Uses `skipAuthRedirect: true` so a 401 (wrong
 * current password) surfaces as an inline error instead of triggering the
 * global "session expired" logout redirect in utils/api.ts.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordInput) =>
      api.post('/auth/change-password', data, { skipAuthRedirect: true }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix src/frontend test -- useChangePassword.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/useChangePassword.ts src/frontend/src/hooks/useChangePassword.test.ts
git commit -m "feat(hooks): add useChangePassword self-service mutation hook"
```

---

## Task 6: Self-service "Change password" card on `PreferencesPage`

**Files:**
- Modify: `src/frontend/src/views/settings/PreferencesPage.tsx`
- Test: `src/frontend/src/__tests__/PreferencesPage.changePassword.test.tsx` (new)

**Interfaces:**
- Consumes: `useChangePassword()` (Task 5); `describeSaveError(err)` (Task 4).
- Produces: no new exports — a self-contained card rendered unconditionally (no `<Can>` gate — self-service, any authenticated clinic user) inside the existing `PreferencesPage` default export.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/__tests__/PreferencesPage.changePassword.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({ mutate: vi.fn() }))
const state = vi.hoisted(() => ({ isPending: false, isSuccess: false, isError: false, error: null as unknown }))

vi.mock('../hooks/useChangePassword', () => ({
  useChangePassword: () => ({ mutate: h.mutate, ...state }),
}))
vi.mock('../hooks/usePersonalPreferences', () => ({
  useSavePreferences: () => ({ mutate: vi.fn() }),
}))
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector: (s: { theme: string; language: string; toggleTheme: () => void; setLanguage: () => void }) => unknown) =>
    selector({ theme: 'light', language: 'en', toggleTheme: vi.fn(), setLanguage: vi.fn() }),
}))

import PreferencesPage from '../views/settings/PreferencesPage'

function renderPage() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><PreferencesPage /></QueryClientProvider>)
}

beforeEach(() => {
  h.mutate.mockReset()
  state.isPending = false
  state.isSuccess = false
  state.isError = false
  state.error = null
})

describe('PreferencesPage — Change password card', () => {
  it('renders current/new/confirm password fields', () => {
    renderPage()
    expect(screen.getByLabelText(/Current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^New password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Confirm new password/i)).toBeInTheDocument()
  })

  it('blocks submit and shows a mismatch error when new !== confirm, with zero network calls', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'Mismatch1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
    expect(h.mutate).not.toHaveBeenCalled()
  })

  it('submits matching passwords via useChangePassword', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'NewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    expect(h.mutate).toHaveBeenCalledWith(
      { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
      expect.anything(),
    )
  })

  it('shows the real server message on a 401 (wrong current password)', async () => {
    h.mutate.mockImplementation((_data, opts) => {
      opts.onError({ response: { data: { error: 'Current password is incorrect' } } })
    })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'Wrong1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'NewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    await waitFor(() => expect(screen.getByText(/Current password is incorrect/i)).toBeInTheDocument())
  })

  it('shows the real server message on a 422 (new password too short)', async () => {
    h.mutate.mockImplementation((_data, opts) => {
      opts.onError({ response: { data: { error: 'Password must be at least 8 characters' } } })
    })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    await waitFor(() => expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument())
  })

  it('shows an inline success message and clears the fields on 204', async () => {
    h.mutate.mockImplementation((_data, opts) => { opts.onSuccess() })
    renderPage()
    fireEvent.change(screen.getByLabelText(/Current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^New password/i), { target: { value: 'NewPass1!' } })
    fireEvent.change(screen.getByLabelText(/Confirm new password/i), { target: { value: 'NewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: /Change password/i }))

    await waitFor(() => expect(screen.getByText(/Password changed/i)).toBeInTheDocument())
    expect((screen.getByLabelText(/Current password/i) as HTMLInputElement).value).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix src/frontend test -- PreferencesPage.changePassword.test.tsx`
Expected: FAIL — no "Change password" card exists yet on `PreferencesPage`.

- [ ] **Step 3: Implement the card**

Edit `src/frontend/src/views/settings/PreferencesPage.tsx`.

Old (lines 1-6):
```typescript
import { useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useSavePreferences } from '../../hooks/usePersonalPreferences'
import { useT } from '../../i18n'
import MaterialIcon from '../../components/MaterialIcon'
```

New:
```typescript
import { useState } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useSavePreferences } from '../../hooks/usePersonalPreferences'
import { useChangePassword } from '../../hooks/useChangePassword'
import { describeSaveError } from '../../utils/errorMessages'
import { useT } from '../../i18n'
import MaterialIcon from '../../components/MaterialIcon'
```

Old (inside the component, lines 31-42 — the state block just after the function signature):
```typescript
export default function PreferencesPage() {
  const t = useT()
  const theme = useUiStore(s => s.theme)
  const language = useUiStore(s => s.language)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const setLanguage = useUiStore(s => s.setLanguage)
  const { mutate: savePrefs } = useSavePreferences()

  const [notifs, setNotifs] = useState<NotifPrefs>(loadNotifs)
  const [saved, setSaved] = useState(false)

  const isDark = theme === 'dark'
```

New:
```typescript
export default function PreferencesPage() {
  const t = useT()
  const theme = useUiStore(s => s.theme)
  const language = useUiStore(s => s.language)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const setLanguage = useUiStore(s => s.setLanguage)
  const { mutate: savePrefs } = useSavePreferences()
  const changePassword = useChangePassword()

  const [notifs, setNotifs] = useState<NotifPrefs>(loadNotifs)
  const [saved, setSaved] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const isDark = theme === 'dark'

  function handleChangePassword() {
    setPwSuccess(false)
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New password and confirm password do not match.')
      return
    }
    setPwError(null)
    changePassword.mutate(
      { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword },
      {
        onSuccess: () => {
          setPwSuccess(true)
          setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        },
        onError: (err: unknown) => setPwError(describeSaveError(err)),
      },
    )
  }
```

Add the card just after the "Language" card block (after the closing `</div>` that ends the Language section, i.e. right before the `{/* Personal Notifications */}` comment). Old anchor (lines 100-101):
```typescript
      </div>

      {/* Personal Notifications */}
```

New:
```typescript
      </div>

      {/* Change password (self-service, PWD-1) */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">Change password</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="pw-current" className="text-label-md text-on-surface-variant">Current password</label>
          <input
            id="pw-current" type="password" autoComplete="current-password"
            value={pwForm.currentPassword}
            onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pw-new" className="text-label-md text-on-surface-variant">New password</label>
          <input
            id="pw-new" type="password" autoComplete="new-password"
            value={pwForm.newPassword}
            onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pw-confirm" className="text-label-md text-on-surface-variant">Confirm new password</label>
          <input
            id="pw-confirm" type="password" autoComplete="new-password"
            value={pwForm.confirmPassword}
            onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
            className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full"
          />
        </div>

        {pwError && <p className="text-body-sm text-error-on-container">{pwError}</p>}
        {pwSuccess && <p className="text-body-sm text-secondary">Password changed.</p>}

        <button
          type="button"
          onClick={handleChangePassword}
          disabled={changePassword.isPending}
          className="min-h-[44px] px-xl self-start bg-primary text-primary-on rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {changePassword.isPending ? 'Changing…' : 'Change password'}
        </button>
      </div>

      {/* Personal Notifications */}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/frontend test -- PreferencesPage.changePassword.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/settings/PreferencesPage.tsx src/frontend/src/__tests__/PreferencesPage.changePassword.test.tsx
git commit -m "feat(preferences): add self-service change-password card (PWD-1)"
```

---

## Task 7: Admin-reset-password field in `UserManagementTab` (with self-edit routing)

**Files:**
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx`
- Test: `src/frontend/src/__tests__/UserManagementTab.test.tsx` (new — this is the first dedicated test file for this component; subsequent tasks append to it)

**Interfaces:**
- Consumes: `describeSaveError` (Task 4, already imported in Task 4); `useAuthStore(s => s.userId)` (already imported); `useAuthStore(s => s.hasPermission)` via the existing `<Can perm="staff.manage">` component.
- Produces: no new exports. Adds a `resetPassword` mutation and section inside `Modal`, gated on `!isNew && !isSelf`.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/__tests__/UserManagementTab.test.tsx`:

```typescript
/**
 * UserManagementTab — admin-reset-password field (Task 7), primary-admin lock
 * (Task 8), and row Deactivate/Restore actions (Task 9). One shared test file,
 * grown task-by-task per docs/superpowers/plans/2026-07-15-clinic-password-ui-and-user-management.md.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
}))
vi.mock('../utils/api', () => ({ default: api }))

const state = vi.hoisted(() => ({ userId: 1, permissions: ['staff.manage', 'staff.assign_role'] }))
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (s: { userId: number; hasPermission: (p: string) => boolean }) => unknown) =>
    selector({ userId: state.userId, hasPermission: (p: string) => state.permissions.includes(p) }),
}))

vi.mock('../hooks/useUserRoles', () => ({ useUserRolesQuery: () => ({ data: [], refetch: vi.fn() }) }))
vi.mock('../components/roles/RolePicker', () => ({ default: () => null }))
vi.mock('../i18n', () => ({ useT: () => (key: string) => key }))

import UserManagementTab from '../views/admin/UserManagementTab'

const ADMIN = { id: 1, name: 'Primary Admin', username: 'admin', email: null, role: 'admin', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', branchId: null }
const SECOND_ADMIN = { id: 2, name: 'Second Admin', username: 'admin2', email: null, role: 'admin', isActive: true, createdAt: '2026-01-02T00:00:00.000Z', branchId: null }
const STAFF = { id: 3, name: 'Staff One', username: 'staff1', email: null, role: 'staff', isActive: true, createdAt: '2026-01-03T00:00:00.000Z', branchId: null }
const INACTIVE_STAFF = { id: 4, name: 'Staff Two', username: 'staff2', email: null, role: 'staff', isActive: false, createdAt: '2026-01-04T00:00:00.000Z', branchId: null }

function renderTab() {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}><UserManagementTab /></QueryClientProvider>)
}

beforeEach(() => {
  vi.resetAllMocks()
  state.userId = 1
  state.permissions = ['staff.manage', 'staff.assign_role']
  api.get.mockImplementation((url: string) => {
    if (url === '/users') return Promise.resolve({ data: { data: [ADMIN, SECOND_ADMIN, STAFF, INACTIVE_STAFF] } })
    if (url === '/api/branches') return Promise.resolve({ data: { data: [] } })
    if (/\/users\/\d+\/branches/.test(url)) return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: [] } })
  })
})

describe('Admin reset-password field (Task 7)', () => {
  it('renders in edit mode for a non-self user, calls PATCH /users/:id/password, shows success', async () => {
    renderTab()
    fireEvent.click(await screen.findAllByRole('button', { name: 'Edit' }).then(btns => btns[1])) // SECOND_ADMIN row (2nd active row)
    expect(screen.getByLabelText(/Reset password/i)).toBeInTheDocument()

    api.patch.mockResolvedValue({ status: 204 })
    fireEvent.change(screen.getByLabelText(/Reset password/i), { target: { value: 'BrandNewPass1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/2/password', { newPassword: 'BrandNewPass1!' }))
    await waitFor(() => expect(screen.getByText(/Password reset\./i)).toBeInTheDocument())
  })

  it('is absent from the create form', async () => {
    renderTab()
    fireEvent.click(await screen.findByRole('button', { name: /Add user/i }))
    expect(screen.queryByLabelText(/Reset password/i)).not.toBeInTheDocument()
  })

  it('does not render when staff.manage is absent', async () => {
    state.permissions = []
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' }).catch(() => [])
    // Without staff.manage the row action area itself is gated (existing <Can>
    // pattern); if any Edit-equivalent surface remains reachable, the
    // reset-password field still must not appear.
    if (editButtons.length > 0) {
      fireEvent.click(editButtons[0])
      expect(screen.queryByLabelText(/Reset password/i)).not.toBeInTheDocument()
    } else {
      expect(editButtons).toHaveLength(0)
    }
  })

  it('shows the real server error on a 422 instead of a generic message', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1])
    api.patch.mockRejectedValue({ response: { data: { error: 'Password must be at least 8 characters' } } })
    fireEvent.change(screen.getByLabelText(/Reset password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument())
  })

  it('hides the field for the primary admin editing their own row, shows a Preferences pointer instead', async () => {
    state.userId = 1 // matches ADMIN.id — self
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[0]) // ADMIN's own row
    expect(screen.queryByLabelText(/Reset password/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Settings → Preferences/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix src/frontend test -- UserManagementTab.test.tsx`
Expected: FAIL — no "Reset password" label/button exists yet.

- [ ] **Step 3: Implement the admin-reset section**

Edit `src/frontend/src/views/admin/UserManagementTab.tsx`.

Add a mutation inside `Modal`, right after the existing `save` mutation (old anchor, the block ending at line 71 `})` before `const inputCls = ...`):

Old:
```typescript
  const save = useMutation({
    mutationFn: () => isNew
      ? api.post('/users', { name: form.name, username: form.username, email: form.email || undefined, password: form.password, role: form.role })
      : api.put(`/users/${user.id}`, { name: form.name, role: form.role, isActive: form.isActive }),
    onSuccess: async (res) => {
      const uid = isNew ? (res.data as { data: { id: number } }).data.id : user.id!
      await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds }).catch(() => {})
      qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose()
    },
  })

  const inputCls = 'min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20'
```

New:
```typescript
  const save = useMutation({
    mutationFn: () => isNew
      ? api.post('/users', { name: form.name, username: form.username, email: form.email || undefined, password: form.password, role: form.role })
      : api.put(`/users/${user.id}`, { name: form.name, role: form.role, isActive: form.isActive }),
    onSuccess: async (res) => {
      const uid = isNew ? (res.data as { data: { id: number } }).data.id : user.id!
      await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds }).catch(() => {})
      qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onClose()
    },
  })

  const currentUserId = useAuthStore(s => s.userId)
  const isSelf = !isNew && user.id === currentUserId
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const resetPw = useMutation({
    mutationFn: () => api.patch(`/users/${user.id}/password`, { newPassword: resetPasswordValue }),
    onSuccess: () => setResetPasswordValue(''),
  })

  const inputCls = 'min-h-[44px] px-3 border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20'
```

Add the section itself right after the RolePicker block (old anchor, lines 142-153):

Old:
```typescript
          {!isNew && (
            <>
              <hr className="border-outline-variant my-4" />
              <Can perm="staff.assign_role">
                <RolePicker
                  userId={editUserId}
                  currentRoles={userRoles}
                  onRolesChanged={() => { void refetchUserRoles() }}
                />
              </Can>
            </>
          )}
        </div>
```

New:
```typescript
          {!isNew && (
            <>
              <hr className="border-outline-variant my-4" />
              <Can perm="staff.assign_role">
                <RolePicker
                  userId={editUserId}
                  currentRoles={userRoles}
                  onRolesChanged={() => { void refetchUserRoles() }}
                />
              </Can>
              <hr className="border-outline-variant my-4" />
              <Can perm="staff.manage">
                {isSelf ? (
                  <p className="text-xs text-on-surface-variant">
                    Change your own password in Settings → Preferences.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="admin-reset-password" className="text-xs text-on-surface-variant">Reset password</label>
                    <input
                      id="admin-reset-password" type="password" autoComplete="new-password"
                      value={resetPasswordValue}
                      onChange={e => setResetPasswordValue(e.target.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => resetPw.mutate()}
                      disabled={resetPw.isPending || resetPasswordValue.length === 0}
                      className="min-h-[44px] px-4 self-start border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
                    >
                      {resetPw.isPending ? 'Resetting…' : 'Reset password'}
                    </button>
                    {resetPw.isSuccess && <p className="text-xs text-secondary">Password reset.</p>}
                    {resetPw.isError && <p className="text-xs text-error-on-container">{describeSaveError(resetPw.error)}</p>}
                  </div>
                )}
              </Can>
            </>
          )}
        </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/frontend test -- UserManagementTab.test.tsx`
Expected: PASS (all Task 7 cases)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/admin/UserManagementTab.tsx src/frontend/src/__tests__/UserManagementTab.test.tsx
git commit -m "feat(admin-users): add admin reset-password field with self-edit routing (PWD-2, ADR-0016 D-2)"
```

---

## Task 8: Primary-admin lock on the "Active account" checkbox

**Files:**
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx`
- Test: append to `src/frontend/src/__tests__/UserManagementTab.test.tsx`

**Interfaces:**
- Consumes: the `users` list already fetched in the outer `UserManagementTab` component.
- Produces: `Modal` gains an `isPrimaryAdmin: boolean` prop, computed by the parent as `user.id === primaryAdminId` where `primaryAdminId = min(id)` among `users` with `role === 'admin'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/frontend/src/__tests__/UserManagementTab.test.tsx`:

```typescript
describe('Primary-admin lock on Active-account checkbox (Task 8)', () => {
  it('disables the Active-account checkbox with a lock note when editing the primary admin', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[0]) // ADMIN (id=1) is the lowest-id admin => primary
    const checkbox = screen.getByLabelText(/Active account/i) as HTMLInputElement
    expect(checkbox).toBeDisabled()
    expect(screen.getByText(/Primary admin — cannot be deactivated/i)).toBeInTheDocument()
  })

  it('leaves the checkbox enabled for a second admin (non-primary)', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1]) // SECOND_ADMIN (id=2)
    const checkbox = screen.getByLabelText(/Active account/i) as HTMLInputElement
    expect(checkbox).not.toBeDisabled()
    expect(screen.queryByText(/Primary admin — cannot be deactivated/i)).not.toBeInTheDocument()
  })

  it('surfaces the real server error via describeSaveError if the backend 403s anyway (stale client)', async () => {
    renderTab()
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    fireEvent.click(editButtons[1])
    api.put.mockRejectedValue({ response: { data: { error: 'Cannot deactivate the primary clinic admin' } } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
    await waitFor(() => expect(screen.getByText(/Cannot deactivate the primary clinic admin/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix src/frontend test -- UserManagementTab.test.tsx`
Expected: FAIL — the checkbox is never disabled today (no `isPrimaryAdmin` concept exists).

- [ ] **Step 3: Implement the lock**

Edit `src/frontend/src/views/admin/UserManagementTab.tsx`.

Change the `Modal` function signature (old, line 37):
```typescript
function Modal({ user, onClose }: { user: Partial<User> & { isNew?: boolean }; onClose: () => void }) {
```

New:
```typescript
function Modal({ user, onClose, isPrimaryAdmin }: { user: Partial<User> & { isNew?: boolean }; onClose: () => void; isPrimaryAdmin: boolean }) {
```

Change the "Active account" checkbox block (old, lines 136-141):
```typescript
          {!isNew && (
            <label className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4"/>
              <span className="text-sm text-on-surface">{t('admin.users.activeAccount')}</span>
            </label>
          )}
```

New:
```typescript
          {!isNew && (
            <label className={`flex items-center gap-2 min-h-[44px] ${isPrimaryAdmin ? '' : 'cursor-pointer'}`}>
              <input
                type="checkbox" checked={form.isActive} disabled={isPrimaryAdmin}
                aria-label={t('admin.users.activeAccount')}
                onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4"
              />
              <span className="text-sm text-on-surface">{t('admin.users.activeAccount')}</span>
              {isPrimaryAdmin && <span className="text-xs text-on-surface-variant">Primary admin — cannot be deactivated</span>}
            </label>
          )}
```

Update the render call site inside `UserManagementTab` (old, line 184):
```typescript
      {modal && <Modal user={modal} onClose={() => setModal(null)}/>}
```

New (also compute `primaryAdminId`; insert the computation right before this line, after the `active`/`inactive` split — old anchor lines 179-184):

Old:
```typescript
  const active   = users.filter(u => u.isActive)
  const inactive = users.filter(u => !u.isActive)

  return (
    <>
      {modal && <Modal user={modal} onClose={() => setModal(null)}/>}
```

New:
```typescript
  const active   = users.filter(u => u.isActive)
  const inactive = users.filter(u => !u.isActive)
  const primaryAdminId = users
    .filter(u => u.role === 'admin')
    .reduce<number | null>((min, u) => (min === null || u.id < min ? u.id : min), null)

  return (
    <>
      {modal && <Modal user={modal} onClose={() => setModal(null)} isPrimaryAdmin={modal.id === primaryAdminId} />}
```

Note: the `t('admin.users.activeAccount')` key is reused as the `aria-label` so `getByLabelText(/Active account/i)` in the test resolves to the checkbox (Testing Library prefers the wrapping `<label>` text association, and the explicit `aria-label` disambiguates it from the lock-note `<span>` for the disabled state).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/frontend test -- UserManagementTab.test.tsx`
Expected: PASS (all Task 7 + Task 8 cases)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/admin/UserManagementTab.tsx src/frontend/src/__tests__/UserManagementTab.test.tsx
git commit -m "feat(admin-users): disable Active-account checkbox for the primary admin (ADR-0016 D-1/D-9)"
```

---

## Task 9: Row-level Deactivate/Restore + confirm dialog + primary-admin lock icon

**Files:**
- Modify: `src/frontend/src/views/admin/UserManagementTab.tsx`
- Test: append to `src/frontend/src/__tests__/UserManagementTab.test.tsx`

**Interfaces:**
- Consumes: `primaryAdminId` (Task 8, computed in the outer component); `describeSaveError` (Task 4).
- Produces: no new exports. Active rows get a "Deactivate" button (or a disabled lock icon for the primary-admin row) that opens a confirm dialog before calling `DELETE /users/:id`; inactive rows' existing "Restore" button now calls `PUT /users/:id { isActive: true }` directly instead of opening the edit modal.

- [ ] **Step 1: Write the failing tests**

Append to `src/frontend/src/__tests__/UserManagementTab.test.tsx`:

```typescript
describe('Row-level Deactivate/Restore (Task 9)', () => {
  it('shows a Deactivate button on active, non-primary-admin rows; confirming calls DELETE', async () => {
    api.delete.mockResolvedValue({ status: 200 })
    renderTab()
    const rows = await screen.findAllByRole('listitem').catch(() => [])
    // Fallback: locate by username text if rows aren't <li> — use the row container via testId-free text lookup.
    const secondAdminDeactivate = screen.getAllByRole('button', { name: /^Deactivate$/i })
    expect(secondAdminDeactivate.length).toBeGreaterThan(0)

    fireEvent.click(secondAdminDeactivate[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Second Admin/)).toBeInTheDocument()
    expect(within(dialog).getByText(/You can restore them later/i)).toBeInTheDocument()
    expect(api.delete).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/users/2'))
  })

  it('shows a disabled lock icon instead of Deactivate on the primary-admin row, and it fires no request', async () => {
    renderTab()
    await screen.findAllByRole('button', { name: 'Edit' })
    // Only one Deactivate button should exist (for SECOND_ADMIN); STAFF also
    // gets one, so exactly two non-primary-admin active rows => two buttons.
    const deactivateButtons = screen.getAllByRole('button', { name: /^Deactivate$/i })
    expect(deactivateButtons).toHaveLength(2) // SECOND_ADMIN + STAFF, not ADMIN (primary)
    const lockIcon = screen.getByLabelText(/Primary admin — cannot be deactivated/i)
    fireEvent.click(lockIcon)
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('Restore calls PUT /users/:id {isActive:true} directly, no confirm dialog', async () => {
    api.put.mockResolvedValue({ status: 200 })
    renderTab()
    const restoreButton = await screen.findByRole('button', { name: 'Restore' })
    fireEvent.click(restoreButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/users/4', { isActive: true }))
  })

  it('surfaces a server error via describeSaveError if Deactivate 403s (stale client)', async () => {
    api.delete.mockRejectedValue({ response: { data: { error: 'Cannot deactivate the primary clinic admin' } } })
    renderTab()
    const deactivateButtons = await screen.findAllByRole('button', { name: /^Deactivate$/i })
    fireEvent.click(deactivateButtons[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(screen.getByText(/Cannot deactivate the primary clinic admin/i)).toBeInTheDocument())
  })

  it('does not render Deactivate/Restore actions without staff.manage', async () => {
    state.permissions = []
    renderTab()
    await screen.findByText('Second Admin')
    expect(screen.queryByRole('button', { name: /^Deactivate$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix src/frontend test -- UserManagementTab.test.tsx`
Expected: FAIL — no "Deactivate" button, no confirm dialog, and "Restore" currently opens the edit modal instead of calling `PUT` directly.

- [ ] **Step 3: Implement discoverable Deactivate/Restore**

Edit `src/frontend/src/views/admin/UserManagementTab.tsx`.

Add a confirm-dialog component and row mutations. Insert this new component right before `export default function UserManagementTab()` (old anchor, line 168):

Old:
```typescript
export default function UserManagementTab() {
```

New:
```typescript
function DeactivateConfirmDialog({ user, onCancel, onConfirmed }: { user: User; onCancel: () => void; onConfirmed: () => void }) {
  const qc = useQueryClient()
  const deactivate = useMutation({
    mutationFn: () => api.delete(`/users/${user.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      onConfirmed()
    },
  })
  return (
    <div role="dialog" aria-label="Confirm deactivate" className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-on-surface mb-4">
          Deactivate {user.name}? They will no longer be able to log in. You can restore them later.
        </p>
        {deactivate.isError && <p className="text-xs text-error-on-container mb-2">{describeSaveError(deactivate.error)}</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 min-h-[44px] border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">Cancel</button>
          <button
            onClick={() => deactivate.mutate()}
            disabled={deactivate.isPending}
            className="flex-1 min-h-[44px] bg-error text-error-on rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-error/90"
          >
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UserManagementTab() {
```

Add a `RestoreButton` inline mutation and update the outer component. Replace the outer component in full (old, lines 168-244, through the end of the file):

Old:
```typescript
export default function UserManagementTab() {
  const t = useT()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const [modal, setModal] = useState<(Partial<User> & { isNew?: boolean }) | null>(null)
  const currentUserId = useAuthStore(s => s.userId)

  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">{t('common.loading')}</p>

  const active   = users.filter(u => u.isActive)
  const inactive = users.filter(u => !u.isActive)
  const primaryAdminId = users
    .filter(u => u.role === 'admin')
    .reduce<number | null>((min, u) => (min === null || u.id < min ? u.id : min), null)

  return (
    <>
      {modal && <Modal user={modal} onClose={() => setModal(null)} isPrimaryAdmin={modal.id === primaryAdminId} />}
      <div className="space-y-6">
        {/* Active users */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Active users ({active.length})</h3>
            <button onClick={() => setModal({ isNew: true })}
              className="min-h-[44px] px-4 flex items-center gap-2 border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">
              + {t('admin.users.addUser')}
            </button>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant">
            {active.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_BG[user.role] ?? 'bg-surface-container text-on-surface-variant'}`}>
                  {INITIALS(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {user.name} {user.id === currentUserId && <span className="text-xs text-on-surface-variant">(you)</span>}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate font-code">@{user.username}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] ?? ''}`}>{user.role}</span>
                <button onClick={() => setModal(user)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Inactive users */}
        {inactive.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Deactivated ({inactive.length})</h3>
            <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant opacity-60">
              {inactive.map(user => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                  <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-xs font-semibold text-on-surface-variant flex-shrink-0">
                    {INITIALS(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface-variant truncate line-through">{user.name}</p>
                    <p className="text-xs text-outline-variant truncate font-code">@{user.username}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">inactive</span>
                  <button onClick={() => setModal(user)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
```

New:
```typescript
export default function UserManagementTab() {
  const t = useT()
  const qc = useQueryClient()
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  })
  const [modal, setModal] = useState<(Partial<User> & { isNew?: boolean }) | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<User | null>(null)
  const currentUserId = useAuthStore(s => s.userId)

  const restore = useMutation({
    mutationFn: (userId: number) => api.put(`/users/${userId}`, { isActive: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  if (isLoading) return <p className="text-sm text-on-surface-variant py-8 text-center">{t('common.loading')}</p>

  const active   = users.filter(u => u.isActive)
  const inactive = users.filter(u => !u.isActive)
  const primaryAdminId = users
    .filter(u => u.role === 'admin')
    .reduce<number | null>((min, u) => (min === null || u.id < min ? u.id : min), null)

  return (
    <>
      {modal && <Modal user={modal} onClose={() => setModal(null)} isPrimaryAdmin={modal.id === primaryAdminId} />}
      {confirmDeactivate && (
        <DeactivateConfirmDialog
          user={confirmDeactivate}
          onCancel={() => setConfirmDeactivate(null)}
          onConfirmed={() => setConfirmDeactivate(null)}
        />
      )}
      <div className="space-y-6">
        {/* Active users */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Active users ({active.length})</h3>
            <button onClick={() => setModal({ isNew: true })}
              className="min-h-[44px] px-4 flex items-center gap-2 border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low">
              + {t('admin.users.addUser')}
            </button>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant">
            {active.map(user => {
              const isPrimaryAdmin = user.id === primaryAdminId
              return (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_BG[user.role] ?? 'bg-surface-container text-on-surface-variant'}`}>
                    {INITIALS(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {user.name} {user.id === currentUserId && <span className="text-xs text-on-surface-variant">(you)</span>}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate font-code">@{user.username}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[user.role] ?? ''}`}>{user.role}</span>
                  <Can perm="staff.manage">
                    {isPrimaryAdmin ? (
                      <button
                        disabled
                        aria-label="Primary admin — cannot be deactivated"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-on-surface-variant opacity-50 cursor-not-allowed"
                      >
                        <MaterialIcon name="lock" size={20} />
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeactivate(user)}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-error-on-container hover:bg-surface-container-low">
                        Deactivate
                      </button>
                    )}
                  </Can>
                  <button onClick={() => setModal(user)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                    Edit
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* Inactive users */}
        {inactive.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Deactivated ({inactive.length})</h3>
            <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant opacity-60">
              {inactive.map(user => (
                <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[56px]">
                  <div className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-xs font-semibold text-on-surface-variant flex-shrink-0">
                    {INITIALS(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface-variant truncate line-through">{user.name}</p>
                    <p className="text-xs text-outline-variant truncate font-code">@{user.username}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-surface-container text-on-surface-variant">inactive</span>
                  <Can perm="staff.manage">
                    <button onClick={() => restore.mutate(user.id)}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-outline-variant rounded-lg text-xs text-on-surface-variant hover:bg-surface-container-low">
                      Restore
                    </button>
                  </Can>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
```

Add the `MaterialIcon` import (needed for the lock icon). Old (top-of-file import block, after Task 4's edit):
```typescript
import { describeSaveError } from '../../utils/errorMessages'
```

New:
```typescript
import { describeSaveError } from '../../utils/errorMessages'
import MaterialIcon from '../../components/MaterialIcon'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix src/frontend test -- UserManagementTab.test.tsx`
Expected: PASS (all Task 7 + 8 + 9 cases)

Run the full frontend suite to check for regressions in any test that imports `UserManagementTab` indirectly (e.g. i18n suites):
Run: `npm --prefix src/frontend test`
Expected: PASS (no regressions)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/views/admin/UserManagementTab.tsx src/frontend/src/__tests__/UserManagementTab.test.tsx
git commit -m "feat(admin-users): discoverable row Deactivate/Restore actions with confirm dialog and primary-admin lock icon (USER-DISC-1)"
```

---

## Task 10: Full-suite regression pass

**Files:** none (verification only)

**Interfaces:** none — this task runs the complete backend and frontend suites to confirm the branch as a whole is green before handoff to `/code-review` (Step 7).

- [ ] **Step 1: Run the full backend suite**

Run: `npm --prefix src/backend test`
Expected: PASS — all suites green, including the new `user-primary-admin-protection.test.ts` and the extended `user.repository.test.ts`, plus every pre-existing suite (no regressions from the `updateUser`/`deactivateUser` guard wiring).

- [ ] **Step 2: Run the full frontend suite**

Run: `npm --prefix src/frontend test`
Expected: PASS — all suites green, including the five new/modified test files from Tasks 3–9.

- [ ] **Step 3: Run the frontend production build**

Run: `npm --prefix src/frontend run build`
Expected: build succeeds with no TypeScript errors (confirms the `axios` module augmentation in Task 3 and all new props/types type-check cleanly across the whole app, not just the files touched).

- [ ] **Step 4: Commit (only if any fixups were needed in Steps 1-3; otherwise skip)**

```bash
git add -A
git commit -m "test: full-suite regression pass for clinic password UI + user management branch"
```

---

## Self-Review

**1. Spec coverage** — mapped against the pm-agent task list and ADR-0016:
- PWD-UI-1 (admin reset) → Task 7. ✓
- PWD-UI-2 (self-service) → Tasks 3, 5, 6 (the 401-redirect fix is a load-bearing prerequisite the BA sign-off flagged as a "minor implementation caution," promoted to its own task since it changes shared infrastructure). ✓
- ADMIN-PROT-1 (`findPrimaryAdminId`) → Task 1. ✓
- ADMIN-PROT-2 (guard, extended per D-5/D-6) → Task 2. ✓
- ADMIN-PROT-3 (frontend lock) → Task 8. ✓
- USER-DISC-1 (row Deactivate/Restore) → Task 9. ✓
- D-7 (platform CO-4 exemption) → no code task; documented in Task 2's guard docstring and Global Constraints, matching ADR-0016's "no code change" resolution. ✓
- D-8 (TOCTOU, no lock) → `// ponytail:` comment included in Task 2's guard. ✓
- BA caution on `describeSaveError` reuse → Task 4 (extraction task, prerequisite for Tasks 6 and 7). ✓
- BA caution on `primaryAdminId` requiring the unfiltered list → satisfied structurally: `UserManagementTab` fetches the full tenant user list via plain `GET /users` (no pagination params exist on that endpoint today), so the caution's precondition already holds; noted in Task 8's Interfaces as the reason no extra guard code is needed.
- §7 (permanent delete) → explicitly out of scope, no task references it beyond this note.

**2. Placeholder scan** — searched for "TBD", "TODO", "similar to Task", "add error handling" — none found. Every step has complete, runnable code or an exact shell command with expected output.

**3. Type consistency check:**
- `findPrimaryAdminId(tenantId: number): Promise<number | null>` — declared in Task 1, consumed identically in Task 2's guard.
- `assertNotPrimaryAdminDeactivation(tenantId, userId, change: { isActive?: boolean; role?: string })` — declared and both call sites in Task 2 pass matching shapes (`{ isActive }` from `deactivateUser`, `{ isActive: body.isActive, role: body.role }` from `updateUser`).
- `describeSaveError(err: unknown): string` — declared once in Task 4, imported with the same signature in Task 6 (`PreferencesPage.tsx`) and Task 7 (`UserManagementTab.tsx`); the pre-existing call site in `UserManagementTab.tsx` (`save.isError` block) is untouched by Task 4's edit and continues to resolve via the new import.
- `useChangePassword()` return shape (`{ mutate, isPending, ... }` from `useMutation`) — declared in Task 5, consumed in Task 6 with the exact `ChangePasswordInput` shape (`currentPassword`, `newPassword`).
- `Modal` props — `isPrimaryAdmin: boolean` added in Task 8; the single render call site (`UserManagementTab`, updated in Task 8 and again in Task 9) always supplies it, so no call site is left with a missing required prop.
- `skipAuthRedirect?: boolean` — declared via module augmentation in Task 3, consumed in Task 5's `api.post(..., { skipAuthRedirect: true })`.
- No naming drift found between tasks (e.g., no `clearLayers`/`clearFullLayers`-style mismatch) — verified by tracing every cross-task symbol above.

No gaps found requiring a new task.

Execution: subagent-driven-development, no human confirmation needed (autonomous scheduled run).
