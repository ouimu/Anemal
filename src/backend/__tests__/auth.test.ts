/**
 * Test Suite: auth-1.2 — JWT Authentication (two-step login)
 * @qa-agent | Protocol: qa-protocols.md §1 + §3 + §4
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'

let server: Server
let tenantId:       number
let branchId:       number
let adminUsername:  string
let doctorUsername: string
let staffUsername:  string
const SUBDOMAIN = `auth-test-${Date.now()}`

/** Two-step login helper. Returns the full access token. */
async function fullLogin(username: string, password = 'ValidPass1!'): Promise<{ token: string; refreshToken: string; branchId: number }> {
  const step1 = await request(server)
    .post('/auth/login')
    .send({ subdomain: SUBDOMAIN, username, password })
  expect(step1.status).toBe(200)
  expect(step1.body.data.requiresBranchSelection).toBe(true)
  const { pendingToken, branches } = step1.body.data
  const selectedBranchId = branches[0]?.id ?? branchId

  const step2 = await request(server)
    .post('/auth/select-branch')
    .send({ pendingToken, branchId: selectedBranchId })
  expect(step2.status).toBe(200)
  return { token: step2.body.data.token, refreshToken: step2.body.data.refreshToken, branchId: selectedBranchId }
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash   = await bcrypt.hash('ValidPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'Auth Test Clinic', subdomain: SUBDOMAIN } })
  tenantId = tenant.id

  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main Branch' } })
  branchId = branch.id

  const ts = Date.now() % 100000
  adminUsername  = `admin_${ts}`
  doctorUsername = `doctor_${ts}`
  staffUsername  = `staff_${ts}`

  const [adminRole, doctorRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])

  const [, doctor, staff] = await Promise.all([
    prisma.user.create({ data: { tenantId, name: 'Auth Admin',  username: adminUsername,  email: `admin-${ts}@auth.local`,  passwordHash: hash, roleId: adminRole.id  } }),
    prisma.user.create({ data: { tenantId, name: 'Auth Doctor', username: doctorUsername, email: `doctor-${ts}@auth.local`, passwordHash: hash, roleId: doctorRole.id } }),
    prisma.user.create({ data: { tenantId, name: 'Auth Staff',  username: staffUsername,  email: `staff-${ts}@auth.local`,  passwordHash: hash, roleId: staffRole.id  } }),
  ])

  // staff and doctor need user_branches rows to log in
  await prisma.userBranch.createMany({
    data: [
      { tenantId, userId: doctor.id, branchId },
      { tenantId, userId: staff.id,  branchId },
    ],
    skipDuplicates: true,
  })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await prisma.userBranch.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

describe('auth-1.2 — POST /auth/login (step 1)', () => {
  test('auth-01: Admin login bypasses branch selection — returns full JWT directly', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(false)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.branchId).toBeNull()
    expect(res.body.data.pendingToken).toBeUndefined()
  })

  test('auth-01b: Staff login step 1 returns requiresBranchSelection=true + pendingToken', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: staffUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.pendingToken).toBeTruthy()
    expect(Array.isArray(res.body.data.branches)).toBe(true)
  })

  test('auth-02: Doctor login step 1 shows only assigned branches', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: doctorUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.branches).toHaveLength(1)
    expect(res.body.data.branches[0].id).toBe(branchId)
  })

  test('auth-03: Staff login step 1 shows only assigned branches', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: staffUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.branches).toHaveLength(1)
  })

  test('auth-04: Full JWT after select-branch has correct payload', async () => {
    const { token } = await fullLogin(doctorUsername)
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>
    expect(decoded.tenantId).toBe(tenantId)
    expect(decoded.role).toBe('doctor')
    expect(decoded.branchId).toBe(branchId)
    expect(decoded.scope).toBeUndefined()   // scope only on pending tokens
    expect(decoded.exp).toBeDefined()
  })

  test('auth-05: Full JWT expires in ~8 hours', async () => {
    const { token } = await fullLogin(doctorUsername)
    const decoded = jwt.decode(token) as { iat: number; exp: number }
    const diffHours = (decoded.exp - decoded.iat) / 3600
    expect(diffHours).toBeCloseTo(8, 0)
  })

  test('auth-06: Wrong password → 401', async () => {
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'WrongPass!' })
      .expect(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/invalid credentials/i)
  })

  test('auth-07: Non-existent username → 401 (no user enumeration)', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: 'nobody_user', password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-08: Unknown subdomain → 401', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: 'does-not-exist', username: adminUsername, password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-09: Deactivated user → 401', async () => {
    const hash = await bcrypt.hash('ValidPass1!', 10)
    const ts   = Date.now() % 100000
    const uname = `inactive_${ts}`
    const inactiveStaffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    await prisma.user.create({
      data: { tenantId, name: 'Inactive', username: uname, email: `inactive-${ts}@auth.local`, passwordHash: hash, roleId: inactiveStaffRole.id, isActive: false },
    })
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: uname, password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-10: Missing username field → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-11: Missing password field → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername })
      .expect(400)
  })

  test('auth-12: Username too short → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: 'ab', password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-13: Missing subdomain → 400', async () => {
    await request(server)
      .post('/auth/login')
      .send({ username: adminUsername, password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-14: Inactive tenant → 401', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } })
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
      .expect(401)
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } })
  })
})
