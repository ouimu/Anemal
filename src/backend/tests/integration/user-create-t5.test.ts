/**
 * T5 — user_roles created transactionally on user create/update.
 *
 * Verifies that:
 *  1. POST /clinic/users creates a User row AND a user_roles row atomically.
 *  2. The user_roles row references the correct system role for every accepted
 *     legacy role string (doctor, staff).  admin is excluded from POST create
 *     per the createUserSchema enum.
 *  3. PUT /clinic/users/:id (role change) replaces the user_roles row and keeps
 *     the legacy User.role FK in sync.
 *  4. Duplicate email → 409 (no orphaned user_roles).
 *
 * Does NOT test admin-role creation via POST because the createUserSchema only
 * accepts 'doctor' | 'staff'. admin is only allowed in PUT (updateUserSchema).
 */

import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { clearPermCache } from '../../services/permission.service'

const SUBDOMAIN = 't5-user-create'
const PASSWORD = 'TestPass1!'

let server: Server
let tid = 0
let adminToken = ''
let adminUserId = 0
let adminRoleId = 0

/** System role IDs — resolved once in beforeAll */
let doctorRoleId = 0
let staffRoleId = 0

async function login(username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: SUBDOMAIN, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const passwordHash = await bcrypt.hash(PASSWORD, 4)

  const tenant = await prisma.tenant.create({ data: { name: 'T5 User Create', subdomain: SUBDOMAIN } })
  tid = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId: tid, name: 'Main' } })

  const [adminRole, doctorRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])
  adminRoleId  = adminRole.id
  doctorRoleId = doctorRole.id
  staffRoleId  = staffRole.id

  const uAdmin = await prisma.user.create({
    data: { tenantId: tid, branchId: branch.id, name: 'Admin T5', username: 'admin_t5', email: 'admin@t5.test', passwordHash, role: 'admin', roleId: adminRoleId },
  })
  adminUserId = uAdmin.id
  await prisma.userRole.create({ data: { userId: adminUserId, roleId: adminRoleId, tenantId: tid } })

  adminToken = await login('admin_t5')
})

afterAll(async () => {
  clearPermCache()

  // Tear down in FK-safe order.
  await prisma.userRole.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()

  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30_000)

// ---------------------------------------------------------------------------
// POST /clinic/users — create user + user_roles row
// ---------------------------------------------------------------------------
describe('POST /clinic/users — transactional user_roles creation', () => {
  let createdDoctorId = 0

  it('creates a doctor user → 201 and user_roles row exists with correct roleId', async () => {
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr New', username: 'dr_new_t5', email: 'dr.new@t5.test', password: 'SecurePass1!', role: 'doctor' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)

    const userId: number = res.body.data.id
    createdDoctorId = userId
    expect(userId).toBeGreaterThan(0)

    // The user_roles join row must exist and reference the doctor system role.
    const roleRow = await prisma.userRole.findFirst({ where: { userId, tenantId: tid } })
    expect(roleRow).not.toBeNull()
    expect(roleRow!.roleId).toBe(doctorRoleId)
  })

  it('creates a staff user → 201 and user_roles row references clinic_staff role', async () => {
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Staff New', username: 'staff_new_t5', email: 'staff.new@t5.test', password: 'SecurePass1!', role: 'staff' })

    expect(res.status).toBe(201)

    const userId: number = res.body.data.id
    const roleRow = await prisma.userRole.findFirst({ where: { userId, tenantId: tid } })
    expect(roleRow).not.toBeNull()
    expect(roleRow!.roleId).toBe(staffRoleId)
  })

  it('duplicate email → 409 and no orphaned user_roles rows', async () => {
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dr Dup', username: 'dr_new_t5', email: 'dr.dup@t5.test', password: 'SecurePass1!', role: 'doctor' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)

    // Only the original user_roles row should exist for this email — not two.
    const count = await prisma.userRole.count({
      where: { userId: createdDoctorId, tenantId: tid },
    })
    expect(count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// PUT /clinic/users/:id — role change replaces user_roles row atomically
// ---------------------------------------------------------------------------
describe('PUT /users/:id — role update replaces user_roles row', () => {
  let targetUserId = 0

  beforeAll(async () => {
    // Create a fresh staff user to mutate.
    const res = await request(server)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Role Mutable', username: 'mutable_t5', email: 'mutable@t5.test', password: 'SecurePass1!', role: 'staff' })
    expect(res.status).toBe(201)
    targetUserId = res.body.data.id
  })

  it('changing role from staff → doctor replaces user_roles row and keeps legacy FK in sync', async () => {
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'doctor' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // user_roles must reference doctorRole now.
    const rows = await prisma.userRole.findMany({ where: { userId: targetUserId, tenantId: tid } })
    expect(rows).toHaveLength(1)
    expect(rows[0].roleId).toBe(doctorRoleId)

    // Legacy User.roleId FK must also be updated.
    const user = await prisma.user.findFirst({ where: { id: targetUserId, tenantId: tid } })
    expect(user!.roleId).toBe(doctorRoleId)
  })

  it('user still has exactly one role after replacement (no orphan, no gap)', async () => {
    const count = await prisma.userRole.count({ where: { userId: targetUserId, tenantId: tid } })
    expect(count).toBe(1)
  })
})
