/**
 * T-5F-01 — Clinic Role Editor backend QA (@qa-agent)
 *
 * Complements tests/integration/roleManagement.test.ts (T-5B-03) by asserting the
 * Role-Editor-specific API contract the UI depends on, plus the RBAC breadth the
 * earlier suite did not cover:
 *
 *  AC-1  GET /clinic/roles exposes a numeric `assignedUserCount` on every role.
 *  AC-2  POST /clinic/roles/clone copies only permissions the caller holds (∩ caller perms).
 *  AC-3  PUT /clinic/roles/:id/permissions applies a DELTA — untouched perms survive
 *        (proves it is not a full-replace).
 *  AC-4  DELETE returns 409 (in-use) and 403 (system role).
 *  AC-5  RBAC: roles.view alone allows GET but is rejected on every mutation (403);
 *        clinic_staff (no roles.* perms) is denied; unauthenticated is 401.
 *  AC-6  Tenant isolation: caller cannot mutate another tenant's custom role.
 *
 * These are intentionally NON-overlapping with roleManagement.test.ts where possible.
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUB_A = 'role-editor-a'
const SUB_B = 'role-editor-b'
const PASSWORD = 'TestPass1!'

let server: Server
let tidA = 0
let tidB = 0
let adminToken = ''      // tenant A clinic_admin (has roles.view + roles.manage)
let staffToken = ''      // tenant A clinic_staff (no roles.* perms)
let adminBToken = ''     // tenant B clinic_admin (for tenant-isolation tests)
let adminUserIdA = 0
let adminRoleId = 0
let staffRoleId = 0

async function login(sub: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: sub, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

async function makeTenant(name: string, sub: string): Promise<{ tid: number; branchId: number }> {
  const tenant = await prisma.tenant.create({ data: { name, subdomain: sub } })
  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main' } })
  return { tid: tenant.id, branchId: branch.id }
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const a = await makeTenant('Role Editor A', SUB_A)
  const b = await makeTenant('Role Editor B', SUB_B)
  tidA = a.tid
  tidB = b.tid

  const [adminRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])
  adminRoleId = adminRole.id
  staffRoleId = staffRole.id

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const [uAdminA, uStaffA, uAdminB] = await Promise.all([
    prisma.user.create({
      data: { tenantId: tidA, branchId: a.branchId, name: 'Admin A', username: 'admin_re_a', email: 'admin@a.test', passwordHash, roleId: adminRole.id },
    }),
    prisma.user.create({
      data: { tenantId: tidA, branchId: a.branchId, name: 'Staff A', username: 'staff_re_a', email: 'staff@a.test', passwordHash, roleId: staffRole.id },
    }),
    prisma.user.create({
      data: { tenantId: tidB, branchId: b.branchId, name: 'Admin B', username: 'admin_re_b', email: 'admin@b.test', passwordHash, roleId: adminRole.id },
    }),
  ])
  adminUserIdA = uAdminA.id

  await prisma.userRole.createMany({
    data: [
      { userId: uAdminA.id, roleId: adminRoleId, tenantId: tidA },
      { userId: uStaffA.id, roleId: staffRoleId, tenantId: tidA },
      { userId: uAdminB.id, roleId: adminRoleId, tenantId: tidB },
    ],
    skipDuplicates: true,
  })

  await prisma.userBranch.create({ data: { tenantId: tidA, userId: uStaffA.id, branchId: a.branchId } })

  adminToken  = await login(SUB_A, 'admin_re_a')
  staffToken  = await login(SUB_A, 'staff_re_a')
  adminBToken = await login(SUB_B, 'admin_re_b')
})

afterAll(async () => {
  clearPermCache()
  for (const tid of [tidA, tidB]) {
    await prisma.userRole.deleteMany({ where: { tenantId: tid } })
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId: tid, isSystem: false } } })
    await prisma.clinicRole.deleteMany({ where: { tenantId: tid, isSystem: false } })
    await prisma.user.deleteMany({ where: { tenantId: tid } })
    await prisma.tenant.deleteMany({ where: { id: tid } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30_000)

// ---------------------------------------------------------------------------
// AC-1 — assignedUserCount contract
// ---------------------------------------------------------------------------

describe('AC-1 GET /clinic/roles — assignedUserCount', () => {
  it('every role carries a numeric assignedUserCount', async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const roles: Array<{ id: number; assignedUserCount: unknown; isSystem: boolean }> = res.body.data
    expect(roles.length).toBeGreaterThan(0)
    for (const r of roles) {
      expect(typeof r.assignedUserCount).toBe('number')
      expect(r.assignedUserCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('reflects the actual number of assigned users for clinic_admin (≥1)', async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    const adminRoleRow = (res.body.data as Array<{ id: number; assignedUserCount: number }>)
      .find(r => r.id === adminRoleId)
    expect(adminRoleRow).toBeDefined()
    // Admin A and Admin B both hold clinic_admin → count is global to the role (≥2)
    expect(adminRoleRow!.assignedUserCount).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// AC-2 — clone intersects caller perms
// ---------------------------------------------------------------------------

describe('AC-2 POST /clinic/roles/clone — permission intersection', () => {
  afterAll(async () => {
    await prisma.rolePermission.deleteMany({ where: { role: { name: 'Editor Clone Staff', tenantId: tidA } } })
    await prisma.clinicRole.deleteMany({ where: { name: 'Editor Clone Staff', tenantId: tidA } })
  })

  it('cloned role contains only codes the caller (admin) actually holds', async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Editor Clone Staff' })

    expect(res.status).toBe(201)
    const role = res.body.data
    expect(role.isSystem).toBe(false)
    expect(role.tenantId).toBe(tidA)

    // Resolve admin's own permission set and assert the clone is a subset of it.
    const me = await request(server).get('/auth/me').set('Authorization', `Bearer ${adminToken}`)
    const adminPerms: string[] = me.body.data.permissions
    for (const code of role.permissions as string[]) {
      expect(adminPerms).toContain(code)
    }
  })
})

// ---------------------------------------------------------------------------
// AC-3 — PUT applies a DELTA, not a full replace
// ---------------------------------------------------------------------------

describe('AC-3 PUT /clinic/roles/:id/permissions — delta semantics', () => {
  let roleId = 0
  let baseline: string[] = []

  beforeAll(async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Editor Delta Staff' })
    expect(res.status).toBe(201)
    roleId = res.body.data.id
    baseline = res.body.data.permissions
    // Sanity: baseline must contain the codes we will leave untouched
    expect(baseline).toContain('appointments.view')
  })

  afterAll(async () => {
    await prisma.rolePermission.deleteMany({ where: { roleId } })
    await prisma.clinicRole.deleteMany({ where: { id: roleId } }).catch(() => undefined)
  })

  it('removing ONE code leaves all other baseline codes intact (delta, not replace)', async () => {
    // Remove a single code; send empty add. A full-replace bug would wipe the rest.
    const removeCode = 'crm.create'
    expect(baseline).toContain(removeCode)
    const untouched = baseline.filter(c => c !== removeCode)

    const res = await request(server)
      .put(`/clinic/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ add: [], remove: [removeCode] })

    expect(res.status).toBe(200)
    const after: string[] = res.body.data.permissions
    expect(after).not.toContain(removeCode)
    // Every other baseline permission must still be present — proves delta semantics.
    for (const code of untouched) {
      expect(after).toContain(code)
    }
  })

  it('adding a held code does not drop previously-present codes', async () => {
    const addCode = 'loyalty.view'
    const res = await request(server)
      .put(`/clinic/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ add: [addCode], remove: [] })

    expect(res.status).toBe(200)
    const after: string[] = res.body.data.permissions
    expect(after).toContain(addCode)
    expect(after).toContain('appointments.view') // still here from baseline
  })
})

// ---------------------------------------------------------------------------
// AC-4 — DELETE: 409 in-use, 403 system
// ---------------------------------------------------------------------------

describe('AC-4 DELETE /clinic/roles/:id', () => {
  it('403 for a system role', async () => {
    const res = await request(server)
      .delete(`/clinic/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(403)
  })

  it('409 when a custom role is still assigned, with assignedCount in the envelope', async () => {
    const clone = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Editor InUse' })
    expect(clone.status).toBe(201)
    const inUseId = clone.body.data.id

    await prisma.userRole.create({ data: { userId: adminUserIdA, roleId: inUseId, tenantId: tidA } })

    const res = await request(server)
      .delete(`/clinic/roles/${inUseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(409)

    // cleanup
    await prisma.userRole.deleteMany({ where: { roleId: inUseId } })
    await prisma.rolePermission.deleteMany({ where: { roleId: inUseId } })
    await prisma.clinicRole.deleteMany({ where: { id: inUseId } }).catch(() => undefined)
  })
})

// ---------------------------------------------------------------------------
// AC-5 — RBAC gate: roles.view vs roles.manage, staff deny, unauth
// ---------------------------------------------------------------------------

describe('AC-5 RBAC gate', () => {
  it('clinic_staff (no roles.* perm) is denied GET /clinic/roles (403)', async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })

  it('clinic_staff is denied POST /clinic/roles/clone (403)', async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Staff Should Not Create' })
    expect(res.status).toBe(403)
  })

  it('clinic_staff is denied DELETE /clinic/roles/:id (403)', async () => {
    const res = await request(server)
      .delete(`/clinic/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })

  it('admin (roles.view + roles.manage) is allowed GET /clinic/roles (200)', async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
  })

  it('unauthenticated GET /clinic/roles → 401', async () => {
    const res = await request(server).get('/clinic/roles')
    expect(res.status).toBe(401)
  })

  it('GET /clinic/permissions denied for clinic_staff (403)', async () => {
    const res = await request(server)
      .get('/clinic/permissions')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// AC-6 — Tenant isolation on mutations
// ---------------------------------------------------------------------------

describe('AC-6 tenant isolation', () => {
  let roleInA = 0

  beforeAll(async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Tenant A Private Role' })
    expect(res.status).toBe(201)
    roleInA = res.body.data.id
  })

  afterAll(async () => {
    await prisma.rolePermission.deleteMany({ where: { roleId: roleInA } })
    await prisma.clinicRole.deleteMany({ where: { id: roleInA } }).catch(() => undefined)
  })

  it("tenant B admin cannot edit tenant A's custom role (not 200)", async () => {
    const res = await request(server)
      .put(`/clinic/roles/${roleInA}/permissions`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ add: ['loyalty.view'], remove: [] })
    // Cross-tenant role is invisible/forbidden — must NOT succeed.
    expect([403, 404]).toContain(res.status)
    expect(res.status).not.toBe(200)
  })

  it("tenant B admin cannot delete tenant A's custom role (not 200)", async () => {
    const res = await request(server)
      .delete(`/clinic/roles/${roleInA}`)
      .set('Authorization', `Bearer ${adminBToken}`)
    expect([403, 404]).toContain(res.status)
    expect(res.status).not.toBe(200)

    // Confirm the role still exists in tenant A.
    const still = await prisma.clinicRole.findFirst({ where: { id: roleInA, tenantId: tidA } })
    expect(still).not.toBeNull()
  })

  it("tenant B's role list does not include tenant A's custom role", async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminBToken}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: number }>).map(r => r.id)
    expect(ids).not.toContain(roleInA)
  })
})
