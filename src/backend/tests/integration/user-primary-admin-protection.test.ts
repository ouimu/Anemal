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
  await login('second_admin_t1')
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
