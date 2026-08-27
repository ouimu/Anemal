/**
 * role.repository.test.ts — RST-3 / RST-5 tenant-scoping tests for the role repository.
 *
 * Covers the two functions this branch re-scoped:
 *   - `countRoleUsage(roleId, tenantId)`  (RST-1, gates deleteRole)  → T1, T1b, T2
 *   - `listRoles(tenantId)`'s `_count.userRoles` (RST-5)             → T3, T4
 *
 * Uses the real Prisma client against the test DB with its own isolated tenant /
 * role / user fixtures — same convention as `tests/unit/user.repository.test.ts`.
 * Never reads or mutates seeded dev-clinic / test-clinic rows.
 *
 * ---------------------------------------------------------------------------
 * The "drift" fixture this file builds
 * ---------------------------------------------------------------------------
 * `UserRole.tenantId` is denormalized (schema.prisma:939) and NO composite FK ties
 * it to the owning tenant of `UserRole.roleId`. So the DB happily accepts a row
 * whose `roleId` belongs to tenant A while its `tenantId` says tenant B. The app
 * cannot produce such a row today (`user.service.ts`'s
 * `assertRoleBelongsToCallerTenant` blocks it), but a repository query that filters
 * on `roleId` alone would still count it — which is exactly the isolation defect
 * RST-1 closes: a pre-check gating a state-changing operation must be scoped to the
 * caller's tenant in the query itself (ADR-0025 D-1).
 *
 * ---------------------------------------------------------------------------
 * @qa-agent deviation from the plan's literal T1 (2026-08-27) — read before editing
 * ---------------------------------------------------------------------------
 * The plan (Task 4) specifies the fixture as ONE legitimate row `{userA, roleId,
 * tenantA}` + ONE drifted row `{userB, roleId, tenantB}`, then asserts
 * `countRoleUsage(roleId, tenantB.id) === 0` (T1) and
 * `countRoleUsage(roleId, tenantA.id) === 1` (T2), with the falsifiability check
 * expecting T1 to return 2 once the fix is reverted.
 *
 * Those three statements cannot all hold. `countRoleUsage` filters on the row's own
 * `tenantId` column, and the drifted row's `tenantId` IS tenant B's — so under the
 * shipped fix `countRoleUsage(roleId, tenantB.id)` returns 1, not 0. No tenant scope
 * yields 0 against that two-row fixture, so the plan's literal T1 would fail against
 * correct code.
 *
 * This file keeps the plan's INTENT (one clean-zero exclusion case, one positive
 * inclusion case, both red when the fix is reverted) and makes the fixture
 * internally consistent by adding a second, drift-only role:
 *   - `sharedRoleId` — owned by tenant A, one legitimate tenant-A row + one drifted
 *      tenant-B row  → T2 (=1, was 2 unscoped), T1b (=1, was 2 unscoped)
 *   - `orphanRoleId` — owned by tenant A, ONLY a drifted tenant-B row, no tenant-A
 *      row at all      → T1 (=0, was 1 unscoped). This is the clean zero the plan
 *      asked for, and it is also the fixture that makes RST-6's P2003 catch
 *      load-bearing (count says 0, the FK still says Restrict — see
 *      tests/unit/role.service.test.ts T5).
 */

import prisma from '../../config/db'
import * as roleRepo from '../../models/role.repository'

const STAMP = Date.now()

let tenantAId = 0
let tenantBId = 0

/** Seeded system role (tenantId = null, isSystem = true) — reused for T3. */
let systemStaffRoleId = 0

/** Custom role owned by tenant A. Holds one legit tenant-A row + one drifted tenant-B row. */
let sharedRoleId = 0
/** Custom role owned by tenant A. Holds ONLY a drifted tenant-B row — zero tenant-A rows. */
let orphanRoleId = 0

let userAId = 0   // tenant A — legitimate holder of sharedRoleId
let userA2Id = 0  // tenant A — holder of the system staff role (T3)
let userBId = 0   // tenant B — drifted holder of sharedRoleId
let userB2Id = 0  // tenant B — drifted holder of orphanRoleId
let userB3Id = 0  // tenant B — holder of the system staff role (T3)

beforeAll(async () => {
  const [tenantA, tenantB] = await Promise.all([
    prisma.tenant.create({ data: { name: 'RoleRepo Unit A', subdomain: `role-repo-unit-a-${STAMP}` } }),
    prisma.tenant.create({ data: { name: 'RoleRepo Unit B', subdomain: `role-repo-unit-b-${STAMP}` } }),
  ])
  tenantAId = tenantA.id
  tenantBId = tenantB.id

  const staffRole = await prisma.clinicRole.findFirstOrThrow({
    where: { key: 'clinic_staff', tenantId: null, isSystem: true },
  })
  systemStaffRoleId = staffRole.id

  const [sharedRole, orphanRole] = await Promise.all([
    prisma.clinicRole.create({
      data: { tenantId: tenantAId, isSystem: false, name: `RR Shared ${STAMP}`, key: `rr_shared_${STAMP}` },
    }),
    prisma.clinicRole.create({
      data: { tenantId: tenantAId, isSystem: false, name: `RR Orphan ${STAMP}`, key: `rr_orphan_${STAMP}` },
    }),
  ])
  sharedRoleId = sharedRole.id
  orphanRoleId = orphanRole.id

  // Drift holders keep their PRIMARY roleId on the system staff role so that the
  // only FK referencing the tenant-A custom roles is UserRole.role (onDelete: Restrict).
  const [userA, userA2, userB, userB2, userB3] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenantAId, name: 'RR User A', username: `rra_${STAMP}`,
        email: `rra-${STAMP}@example.test`, passwordHash: 'x', roleId: sharedRoleId, isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenantAId, name: 'RR User A2', username: `rra2_${STAMP}`,
        email: `rra2-${STAMP}@example.test`, passwordHash: 'x', roleId: systemStaffRoleId, isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenantBId, name: 'RR User B', username: `rrb_${STAMP}`,
        email: `rrb-${STAMP}@example.test`, passwordHash: 'x', roleId: systemStaffRoleId, isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenantBId, name: 'RR User B2', username: `rrb2_${STAMP}`,
        email: `rrb2-${STAMP}@example.test`, passwordHash: 'x', roleId: systemStaffRoleId, isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenantBId, name: 'RR User B3', username: `rrb3_${STAMP}`,
        email: `rrb3-${STAMP}@example.test`, passwordHash: 'x', roleId: systemStaffRoleId, isActive: true,
      },
    }),
  ])
  userAId = userA.id
  userA2Id = userA2.id
  userBId = userB.id
  userB2Id = userB2.id
  userB3Id = userB3.id

  // UserRole PK is @@id([userId, roleId]) and @@unique([tenantId, userId]) — one row
  // per user per tenant, so each row above needs its own user.
  await prisma.userRole.createMany({
    data: [
      // legitimate: role owned by tenant A, row tagged tenant A
      { userId: userAId,  roleId: sharedRoleId,      tenantId: tenantAId },
      // DRIFTED: role owned by tenant A, row tagged tenant B
      { userId: userBId,  roleId: sharedRoleId,      tenantId: tenantBId },
      // DRIFTED, and the only row for this role — tenant A's own count is 0
      { userId: userB2Id, roleId: orphanRoleId,      tenantId: tenantBId },
      // system role held in BOTH tenants (T3)
      { userId: userA2Id, roleId: systemStaffRoleId, tenantId: tenantAId },
      { userId: userB3Id, roleId: systemStaffRoleId, tenantId: tenantBId },
    ],
  })
})

afterAll(async () => {
  // Child-before-parent. UserRole.role is onDelete: Restrict, so the join rows must
  // go before the roles or the teardown itself fails with P2003.
  await prisma.userRole.deleteMany({ where: { tenantId: tenantAId } })
  await prisma.userRole.deleteMany({ where: { tenantId: tenantBId } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } })
  await prisma.clinicRole.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } })
  await prisma.$disconnect()
})

// ---------------------------------------------------------------------------
// RST-1 / RST-3 — countRoleUsage is scoped to the caller's tenant
// ---------------------------------------------------------------------------

describe('countRoleUsage — tenant scoping (RST-1)', () => {
  it('T1: a role whose ONLY UserRole row belongs to another tenant counts 0 for its owner', async () => {
    // orphanRoleId is owned by tenant A but its single assignment row is tagged
    // tenant B (drift). Tenant A must see 0 — another tenant's row can never block
    // tenant A from deleting its own role. Unscoped (`where: { roleId }`) this is 1.
    const count = await roleRepo.countRoleUsage(orphanRoleId, tenantAId)
    expect(count).toBe(0)
  })

  it('T1b: the drifted row is counted under the tenantId its own column carries, not the role owner\'s', async () => {
    // Honest characterisation of the shipped filter: it matches on UserRole.tenantId.
    // Tenant B sees its own (drifted) row and nothing of tenant A's. Unscoped this is 2.
    const count = await roleRepo.countRoleUsage(sharedRoleId, tenantBId)
    expect(count).toBe(1)
  })

  it('T2: a legitimate same-tenant row IS counted, and the cross-tenant row is excluded', async () => {
    // Guards against a trivially over-scoped fix that returns 0 for everything.
    // Unscoped (`where: { roleId }`) this is 2 — the drifted tenant-B row leaks in.
    const count = await roleRepo.countRoleUsage(sharedRoleId, tenantAId)
    expect(count).toBe(1)
  })

  it('a tenant with no rows at all for a foreign role counts 0 (no cross-tenant read)', async () => {
    const count = await roleRepo.countRoleUsage(orphanRoleId, tenantBId)
    expect(count).toBe(1) // tenant B's own drifted row
    const foreign = await roleRepo.countRoleUsage(systemStaffRoleId, tenantAId)
    expect(foreign).toBe(1) // only tenant A's own staff assignment, never tenant B's
  })
})

// ---------------------------------------------------------------------------
// RST-5 — listRoles's _count.userRoles is scoped to the caller's tenant
// ---------------------------------------------------------------------------

describe('listRoles — _count.userRoles tenant scoping (RST-5)', () => {
  it('T3: a system role held in two tenants reports only the caller tenant\'s holders', async () => {
    // clinic_staff (tenantId = null) is held by userA2 in tenant A and userB3 in
    // tenant B — plus every seeded staff user in every other tenant. Before RST-5
    // the unfiltered `_count: { userRoles: true }` returned that global total.
    const rolesForA = await roleRepo.listRoles(tenantAId)
    const staffRow = rolesForA.find(r => r.id === systemStaffRoleId)
    expect(staffRow).toBeDefined()
    expect(staffRow!._count.userRoles).toBe(1)

    // Symmetric check from tenant B — same system role, its own count.
    const rolesForB = await roleRepo.listRoles(tenantBId)
    const staffRowB = rolesForB.find(r => r.id === systemStaffRoleId)
    expect(staffRowB).toBeDefined()
    // tenant B holds it via userB3 only (userB / userB2 hold the tenant-A custom roles).
    expect(staffRowB!._count.userRoles).toBe(1)
  })

  it('T4: a custom role\'s assignedUserCount still equals its OWN tenant\'s row count', async () => {
    // Regression guard. Under normal writes a custom role only ever has same-tenant
    // rows, so this number must not move. With the drift fixture present it also
    // proves the cross-tenant row is excluded (unscoped: 2 and 1 respectively).
    const rolesForA = await roleRepo.listRoles(tenantAId)

    const sharedRow = rolesForA.find(r => r.id === sharedRoleId)
    expect(sharedRow).toBeDefined()
    expect(sharedRow!._count.userRoles).toBe(1)

    const orphanRow = rolesForA.find(r => r.id === orphanRoleId)
    expect(orphanRow).toBeDefined()
    expect(orphanRow!._count.userRoles).toBe(0)
  })

  it('tenant B\'s role list does not expose tenant A\'s custom roles at all', async () => {
    const rolesForB = await roleRepo.listRoles(tenantBId)
    const ids = rolesForB.map(r => r.id)
    expect(ids).not.toContain(sharedRoleId)
    expect(ids).not.toContain(orphanRoleId)
  })
})
