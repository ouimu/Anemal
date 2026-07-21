/**
 * T-5B-03 — Clinic Role Management API integration tests
 *
 * Covers:
 *  1. GET /clinic/roles  — admin sees system + tenant roles; doctor gets 403
 *  2. POST /clinic/roles/clone  — creates custom role with only caller's perms
 *  3. PUT /clinic/roles/:roleId/permissions  — 403 for system role; ok for custom
 *  4. DELETE /clinic/roles/:roleId  — 409 if in use; ok if unused
 *  5. Cache invalidation — permission revocation takes effect immediately
 *
 * The former multi-role assign/remove endpoints (POST/DELETE
 * /clinic/roles/users/:userId/roles[/:roleId]) were retired by ADR-0019
 * (D-7, single-role model) — see docs/superpowers/plans/2026-07-20-unify-user-role-assignment-plan-a-backend.md.
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUB = 'role-mgmt-test'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let adminToken = ''
let doctorToken = ''
let adminUserId = 0
let doctorUserId = 0
let adminRoleId = 0
let doctorRoleId = 0

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUB, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tenant = await prisma.tenant.create({
    data: { name: 'Role Mgmt Test', subdomain: SUB },
  })
  tid = tenant.id

  const branch = await prisma.branch.create({
    data: { tenantId: tid, name: 'Main Branch' },
  })

  const [adminRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
  ])
  adminRoleId  = adminRole.id
  doctorRoleId = doctorRole.id

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const [uAdmin, uDoctor] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId:     tid,
        branchId:     branch.id,
        name:         'Admin RM',
        username:     'admin_rm',
        email:        'admin@rm.test',
        passwordHash,
        roleId:       adminRole.id,
      },
    }),
    prisma.user.create({
      data: {
        tenantId:     tid,
        branchId:     branch.id,
        name:         'Doctor RM',
        username:     'doctor_rm',
        email:        'doctor@rm.test',
        passwordHash,
        roleId:       doctorRole.id,
      },
    }),
  ])
  adminUserId  = uAdmin.id
  doctorUserId = uDoctor.id

  await prisma.userRole.createMany({
    data: [
      { userId: adminUserId,  roleId: adminRoleId,  tenantId: tid },
      { userId: doctorUserId, roleId: doctorRoleId, tenantId: tid },
    ],
    skipDuplicates: true,
  })

  await prisma.userBranch.create({ data: { tenantId: tid, userId: doctorUserId, branchId: branch.id } })

  adminToken  = await login('admin_rm')
  doctorToken = await login('doctor_rm')
})

afterAll(async () => {
  clearPermCache()
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.rolePermission.deleteMany({
    where: { role: { tenantId: tid, isSystem: false } },
  })
  await prisma.clinicRole.deleteMany({ where: { tenantId: tid, isSystem: false } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30_000)

// ---------------------------------------------------------------------------
// 0. GET /clinic/permissions
// ---------------------------------------------------------------------------

describe('GET /clinic/permissions', () => {
  it('admin: returns permissions grouped by module', async () => {
    const res = await request(server)
      .get('/clinic/permissions')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const data: Record<string, string[]> = res.body.data
    expect(typeof data).toBe('object')
    expect(Object.keys(data).length).toBeGreaterThan(0)
    for (const codes of Object.values(data)) {
      expect(Array.isArray(codes)).toBe(true)
      expect(codes.every((c: unknown) => typeof c === 'string')).toBe(true)
    }
  })

  it('doctor: receives 403 (lacks roles.manage)', async () => {
    const res = await request(server)
      .get('/clinic/permissions')
      .set('Authorization', `Bearer ${doctorToken}`)

    expect(res.status).toBe(403)
  })

  it('unauthenticated: receives 401', async () => {
    const res = await request(server).get('/clinic/permissions')
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 1. GET /clinic/roles
// ---------------------------------------------------------------------------

describe('GET /clinic/roles', () => {
  it('admin: returns system roles + tenant custom roles with permissions[]', async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const roles: Array<{ id: number; isSystem: boolean; permissions: string[] }> = res.body.data
    expect(Array.isArray(roles)).toBe(true)

    // At least the three system roles must be present
    const systemRoles = roles.filter(r => r.isSystem)
    expect(systemRoles.length).toBeGreaterThanOrEqual(3)

    // Every role must expose a permissions array
    for (const role of roles) {
      expect(Array.isArray(role.permissions)).toBe(true)
    }
  })

  it('doctor: receives 403 (lacks roles.manage)', async () => {
    const res = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${doctorToken}`)

    expect(res.status).toBe(403)
  })

  it('unauthenticated: receives 401', async () => {
    const res = await request(server).get('/clinic/roles')
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 2. POST /clinic/roles/clone
// ---------------------------------------------------------------------------

describe('POST /clinic/roles/clone', () => {
  it('creates a custom role containing only permissions the caller holds', async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Custom Staff Clone' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    const role = res.body.data
    expect(role.isSystem).toBe(false)
    expect(role.tenantId).toBe(tid)
    expect(Array.isArray(role.permissions)).toBe(true)
    // Permissions must be a subset of admin's own permissions
    // (clinic_admin holds everything clinic_staff has, so all should clone)
    expect(role.permissions.length).toBeGreaterThan(0)
  })

  it('returns 409 if role name already exists for tenant', async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Clinic Staff', newName: 'Custom Staff Clone' })

    expect(res.status).toBe(409)
  })

  it('returns 400 when body is missing sourceRoleName', async () => {
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newName: 'Bad Clone' })

    expect(res.status).toBe(400)
  })

  it('sets sourceRoleId on the created role, pointing at the cloned system role', async () => {
    const doctorSystemRole = await prisma.clinicRole.findFirstOrThrow({
      where: { key: 'doctor', tenantId: null },
    })

    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Doctor', newName: 'Custom Doctor Lineage Test' })

    expect(res.status).toBe(201)

    const created = await prisma.clinicRole.findFirstOrThrow({
      where: { id: res.body.data.id },
    })
    expect(created.sourceRoleId).toBe(doctorSystemRole.id)
  })
})

// ---------------------------------------------------------------------------
// 3. PUT /clinic/roles/:roleId/permissions
// ---------------------------------------------------------------------------

describe('PUT /clinic/roles/:roleId/permissions', () => {
  let customRoleId = 0

  beforeAll(async () => {
    // Create a fresh custom role to mutate in this suite
    const res = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Doctor', newName: 'Custom Doctor Clone' })
    expect(res.status).toBe(201)
    customRoleId = res.body.data.id
  })

  it('returns 403 when attempting to modify a system role', async () => {
    const res = await request(server)
      .put(`/clinic/roles/${adminRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ add: ['dashboard.view'], remove: [] })

    expect(res.status).toBe(403)
  })

  it('succeeds for a custom role — adds and removes permissions, bumps permVersion', async () => {
    // First capture current permVersion
    const listRes = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    const before = (listRes.body.data as Array<{ id: number; permVersion: number }>)
      .find(r => r.id === customRoleId)
    const versionBefore = before?.permVersion ?? 0

    const res = await request(server)
      .put(`/clinic/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ add: ['loyalty.view'], remove: ['bloodbank.manage'] })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const updated = res.body.data
    expect(updated.permVersion).toBeGreaterThan(versionBefore)
    expect(updated.permissions).toContain('loyalty.view')
    expect(updated.permissions).not.toContain('bloodbank.manage')
  })

  it('returns 403 when caller tries to add a permission they do not hold', async () => {
    // 'prescriptions.create' is NOT in clinic_admin's permission set
    const res = await request(server)
      .put(`/clinic/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ add: ['prescriptions.create'], remove: [] })

    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// 4. DELETE /clinic/roles/:roleId
// ---------------------------------------------------------------------------

describe('DELETE /clinic/roles/:roleId', () => {
  let deleteTargetId = 0
  let inUseRoleId    = 0

  beforeAll(async () => {
    // Create two custom roles: one to delete freely, one that will be in-use
    const [freeRes, inUseRes] = await Promise.all([
      request(server)
        .post('/clinic/roles/clone')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sourceRoleName: 'Clinic Staff', newName: 'Free To Delete' }),
      request(server)
        .post('/clinic/roles/clone')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sourceRoleName: 'Clinic Staff', newName: 'In Use Role' }),
    ])
    expect(freeRes.status).toBe(201)
    expect(inUseRes.status).toBe(201)
    deleteTargetId = freeRes.body.data.id
    inUseRoleId    = inUseRes.body.data.id

    // Assign the in-use role to the admin user (admin already has adminRole, this is extra)
    await prisma.userRole.create({
      data: { userId: adminUserId, roleId: inUseRoleId, tenantId: tid },
    })
  })

  afterAll(async () => {
    // Cleanup in-use role assignment if test left it
    await prisma.userRole.deleteMany({ where: { roleId: inUseRoleId } })
    await prisma.rolePermission.deleteMany({ where: { roleId: inUseRoleId } })
    await prisma.clinicRole.deleteMany({ where: { id: inUseRoleId } }).catch(() => undefined)
  })

  it('returns 403 when attempting to delete a system role', async () => {
    const res = await request(server)
      .delete(`/clinic/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 409 when role is still assigned to a user', async () => {
    const res = await request(server)
      .delete(`/clinic/roles/${inUseRoleId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(409)
  })

  it('successfully deletes a custom role that is not in use', async () => {
    const res = await request(server)
      .delete(`/clinic/roles/${deleteTargetId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Confirm it's gone from the list
    const listRes = await request(server)
      .get('/clinic/roles')
      .set('Authorization', `Bearer ${adminToken}`)
    const ids = (listRes.body.data as Array<{ id: number }>).map(r => r.id)
    expect(ids).not.toContain(deleteTargetId)
  })
})

// ---------------------------------------------------------------------------
// 7. Cache invalidation — permission revocation takes effect immediately
// ---------------------------------------------------------------------------

describe('updateRolePermissions cache invalidation', () => {
  let targetUserId = 0
  let targetToken  = ''
  let customRoleId = 0

  beforeAll(async () => {
    // Create a custom role that has appointments.view
    const cloneRes = await request(server)
      .post('/clinic/roles/clone')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceRoleName: 'Doctor', newName: 'Cache Test Role' })
    expect(cloneRes.status).toBe(201)
    customRoleId = cloneRes.body.data.id

    // Confirm the cloned role has appointments.view
    expect(cloneRes.body.data.permissions).toContain('appointments.view')

    const passwordHash = await (await import('bcrypt')).hash(PASSWORD, 4)
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tid } })
    const user = await prisma.user.create({
      data: {
        tenantId:     tid,
        branchId:     branch.id,
        name:         'Cache Test User',
        username:     'cache_test_rm',
        email:        'cachetest@rm.test',
        passwordHash,
        roleId:       customRoleId,
      },
    })
    targetUserId = user.id

    await prisma.userRole.create({
      data: { userId: targetUserId, roleId: customRoleId, tenantId: tid },
    })

    await prisma.userBranch.create({ data: { tenantId: tid, userId: targetUserId, branchId: branch.id } })

    targetToken = await login('cache_test_rm')
  })

  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: targetUserId } })
    await prisma.user.deleteMany({ where: { id: targetUserId } })
    await prisma.rolePermission.deleteMany({ where: { roleId: customRoleId } })
    await prisma.clinicRole.deleteMany({ where: { id: customRoleId } }).catch(() => undefined)
  })

  it('revokes permission and blocks access immediately — no cache TTL delay', async () => {
    // Verify access is granted before revocation
    const beforeRes = await request(server)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${targetToken}`)
    expect(beforeRes.status).toBe(200)

    // Revoke appointments.view from the role
    const revokeRes = await request(server)
      .put(`/clinic/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ add: [], remove: ['appointments.view'] })
    expect(revokeRes.status).toBe(200)
    expect(revokeRes.body.data.permissions).not.toContain('appointments.view')

    // Same token — access must now be denied immediately (cache invalidated)
    const afterRes = await request(server)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${targetToken}`)
    expect(afterRes.status).toBe(403)
  })
})
