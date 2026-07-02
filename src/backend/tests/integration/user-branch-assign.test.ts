/**
 * Task 3 — PATCH /users/:userId/branch multi-branch assignment
 *
 * Verifies that:
 *  1. Sending { branchIds: [id1, id2] } assigns multiple branches and returns
 *     the correct shape: { id, name, username, role, assignedBranches[] }.
 *  2. Sending { branchIds: [] } is allowed for an admin user.
 *  3. Sending { branchIds: [] } for a non-admin returns 422.
 *  4. A branchId that belongs to a different tenant returns 404.
 *  5. Missing branchIds field (old schema) returns 422 (Zod validation failure).
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUB = 'branch-assign-t3'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let adminToken = ''
let staffToken = ''
let adminUserId = 0
let staffUserId = 0
let branch1Id = 0
let branch2Id = 0

async function login(username: string): Promise<string> {
  // Step 1: credentials
  const step1 = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUB, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  expect(step1.body.data.requiresBranchSelection).toBe(true)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  // Step 2: select first available branch
  const step2 = await request(server)
    .post('/auth/select-branch')
    .send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tenant = await prisma.tenant.create({
    data: { name: 'Branch Assign T3', subdomain: SUB },
  })
  tid = tenant.id

  const [b1, b2] = await Promise.all([
    prisma.branch.create({ data: { tenantId: tid, name: 'Branch Alpha' } }),
    prisma.branch.create({ data: { tenantId: tid, name: 'Branch Beta' } }),
  ])
  branch1Id = b1.id
  branch2Id = b2.id

  const [adminRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const uAdmin = await prisma.user.create({
    data: {
      tenantId:     tid,
      branchId:     b1.id,
      name:         'Admin T3',
      username:     'admin_t3',
      email:        'admin@t3.test',
      passwordHash,
      role:         'admin',
      roleId:       adminRole.id,
    },
  })
  adminUserId = uAdmin.id
  await prisma.userRole.create({ data: { userId: adminUserId, roleId: adminRole.id, tenantId: tid } })

  const uStaff = await prisma.user.create({
    data: {
      tenantId:     tid,
      branchId:     b1.id,
      name:         'Staff T3',
      username:     'staff_t3',
      email:        'staff@t3.test',
      passwordHash,
      role:         'staff',
      roleId:       staffRole.id,
    },
  })
  staffUserId = uStaff.id
  await prisma.userRole.create({ data: { userId: staffUserId, roleId: staffRole.id, tenantId: tid } })

  // staff_t3 must have a user_branches row to log in
  await prisma.userBranch.create({
    data: { tenantId: tid, userId: staffUserId, branchId: branch1Id },
  })

  adminToken = await login('admin_t3')
  staffToken = await login('staff_t3')
})

afterAll(async () => {
  clearPermCache()
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()

  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30_000)

// ---------------------------------------------------------------------------
// PATCH /users/:userId/branch — multi-branch assignment
// ---------------------------------------------------------------------------
describe('PATCH /users/:userId/branch — multi-branch assignment', () => {
  it('assigns multiple branches and returns correct shape', async () => {
    const res = await request(server)
      .patch(`/users/${staffUserId}/branch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchIds: [branch1Id, branch2Id] })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(staffUserId)
    expect(typeof res.body.data.name).toBe('string')
    expect(typeof res.body.data.username).toBe('string')
    expect(typeof res.body.data.role).toBe('string')
    expect(res.body.data.assignedBranches).toHaveLength(2)

    const ids = (res.body.data.assignedBranches as { id: number; name: string }[]).map(b => b.id)
    expect(ids).toContain(branch1Id)
    expect(ids).toContain(branch2Id)
  })

  it('assigns a single branch and returns assignedBranches with one entry', async () => {
    const res = await request(server)
      .patch(`/users/${staffUserId}/branch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchIds: [branch1Id] })

    expect(res.status).toBe(200)
    expect(res.body.data.assignedBranches).toHaveLength(1)
    expect(res.body.data.assignedBranches[0].id).toBe(branch1Id)
  })

  it('allows admin user to have zero branches (branchIds: [])', async () => {
    const res = await request(server)
      .patch(`/users/${adminUserId}/branch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchIds: [] })

    expect(res.status).toBe(200)
    expect(res.body.data.assignedBranches).toHaveLength(0)
  })

  it('returns 422 when staff/doctor assigned zero branches', async () => {
    const res = await request(server)
      .patch(`/users/${staffUserId}/branch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchIds: [] })

    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it('returns 404 when branchId belongs to a different tenant', async () => {
    const otherBranch = await prisma.branch.create({
      data: { tenantId: (await prisma.tenant.create({ data: { name: 'Other T3', subdomain: 'other-t3-branch' } })).id, name: 'Foreign Branch' },
    })
    try {
      const res = await request(server)
        .patch(`/users/${staffUserId}/branch`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ branchIds: [otherBranch.id] })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    } finally {
      await prisma.branch.delete({ where: { id: otherBranch.id } })
      await prisma.tenant.delete({ where: { subdomain: 'other-t3-branch' } })
    }
  })

  it('returns 400 when branchIds field is missing (Zod validation)', async () => {
    const res = await request(server)
      .patch(`/users/${staffUserId}/branch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1Id })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when a non-admin staff user calls the endpoint', async () => {
    const res = await request(server)
      .patch(`/users/${staffUserId}/branch`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchIds: [branch1Id] })

    expect(res.status).toBe(403)
  })

  it('GET /users/:id/branches returns the user\'s assigned branches', async () => {
    await request(server)
      .patch(`/users/${staffUserId}/branch`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchIds: [branch1Id] })

    const res = await request(server)
      .get(`/users/${staffUserId}/branches`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const ids = (res.body.data as { id: number }[]).map(b => b.id)
    expect(ids).toContain(branch1Id)
  })

  it('GET /users/:id/branches returns 403 for non-admin', async () => {
    const res = await request(server)
      .get(`/users/${staffUserId}/branches`)
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })
})
