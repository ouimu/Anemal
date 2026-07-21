// @qa-agent — Integration tests: two-step login (POST /auth/login + POST /auth/select-branch)
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'

// Admin users bypass branch selection and receive a full JWT directly.
const ADMIN_A  = { subdomain: 'dev-clinic',  username: 'admin_a',  password: 'AdminPass1!' }
const ADMIN_B  = { subdomain: 'test-clinic', username: 'admin_b',  password: 'AdminPass2!' }

// Non-admin users still go through the two-step branch-selection flow.
const STAFF_A  = { subdomain: 'dev-clinic',  username: 'staff_a',  password: 'StaffPass1!' }

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /auth/login — admin bypass', () => {
  it('✅ returns full JWT with branchId null for admin user', async () => {
    const res = await request(server).post('/auth/login').send(ADMIN_A)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(false)
    expect(res.body.data.branchId).toBeNull()
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.role).toBe('admin')
    expect(res.body.data.companyName).toBeTruthy()
    // No pending-token fields
    expect(res.body.data.pendingToken).toBeUndefined()
    expect(res.body.data.branches).toBeUndefined()
  })

  it('✅ Tenant A and Tenant B admins get different tokens', async () => {
    const [resA, resB] = await Promise.all([
      request(server).post('/auth/login').send(ADMIN_A),
      request(server).post('/auth/login').send(ADMIN_B),
    ])
    expect(resA.body.data.token).not.toBe(resB.body.data.token)
  })

  it('❌ returns 401 for wrong password', async () => {
    const res = await request(server).post('/auth/login').send({ ...ADMIN_A, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('❌ returns 401 for unknown subdomain', async () => {
    const res = await request(server).post('/auth/login').send({ ...ADMIN_A, subdomain: 'ghost-clinic' })
    expect(res.status).toBe(401)
  })

  it('❌ returns 400 for missing username field', async () => {
    const res = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', password: 'pass' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/login — step 1: non-admin branch selection prompt', () => {
  it('✅ returns requiresBranchSelection=true + pendingToken + branches list for staff', async () => {
    const res = await request(server).post('/auth/login').send(STAFF_A)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.pendingToken).toBeTruthy()
    expect(Array.isArray(res.body.data.branches)).toBe(true)
    expect(res.body.data.branches.length).toBeGreaterThan(0)
    // No full token yet
    expect(res.body.data.token).toBeUndefined()
  })
})

describe('POST /auth/select-branch — step 2: branch selection', () => {
  let pendingToken: string
  let branchId:     number

  beforeAll(async () => {
    // Staff user goes through two-step flow
    const res = await request(server).post('/auth/login').send(STAFF_A)
    pendingToken = res.body.data.pendingToken
    branchId     = res.body.data.branches[0].id
  })

  it('✅ returns full token + refreshToken on valid pendingToken + branchId', async () => {
    const res = await request(server).post('/auth/select-branch').send({ pendingToken, branchId })
    expect(res.status).toBe(200)
    expect(res.body.data.requiresBranchSelection).toBe(false)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.refreshToken).toBeTruthy()
    expect(res.body.data.branchId).toBe(branchId)
    expect(res.body.data.role).toBe('staff')
    // Verify JWT payload
    const [, b64] = (res.body.data.token as string).split('.')
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString())
    expect(payload.tenantId).toBeDefined()
    expect(payload.branchId).toBe(branchId)
    expect(payload.role).toBe('staff')
    expect(payload.exp).toBeDefined()
    expect(payload.scope).toBeUndefined()   // scope only on pending tokens
  })

  it('❌ returns 401 for invalid pendingToken', async () => {
    const res = await request(server).post('/auth/select-branch').send({ pendingToken: 'bad.token.here', branchId })
    expect(res.status).toBe(401)
  })

  it('❌ returns 400 for missing branchId', async () => {
    const res = await request(server).post('/auth/select-branch').send({ pendingToken })
    expect(res.status).toBe(400)
  })

  it('✅ select-branch response includes companyName', async () => {
    // Step 1: login as staff to get pendingToken
    const loginRes = await request(server).post('/auth/login').send(STAFF_A)
    expect(loginRes.body.data.requiresBranchSelection).toBe(true)
    const { pendingToken: pt, branches } = loginRes.body.data

    // Step 2: select branch
    const res = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken: pt, branchId: branches[0].id })
    expect(res.status).toBe(200)
    expect(typeof res.body.data.companyName).toBe('string')
    expect(res.body.data.companyName.length).toBeGreaterThan(0)
  })
})

describe('GET /auth/me', () => {
  let tokenAdmin: string
  let tokenStaff: string

  beforeAll(async () => {
    // Admin gets token directly from login
    const adminRes = await request(server).post('/auth/login').send(ADMIN_A)
    tokenAdmin = adminRes.body.data.token

    // Staff must complete both steps to get a real token
    const step1 = await request(server).post('/auth/login').send(STAFF_A)
    const { pendingToken, branches } = step1.body.data
    const step2 = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken, branchId: branches[0].id })
    tokenStaff = step2.body.data.token
  })

  it('✅ admin: returns current clinic identity with roleIds + permissions', async () => {
    const res = await request(server).get('/auth/me').set('Authorization', `Bearer ${tokenAdmin}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.username).toBe(ADMIN_A.username)
    expect(res.body.data.tenantId).toBeDefined()
    expect(Array.isArray(res.body.data.roleIds)).toBe(true)
    expect(Array.isArray(res.body.data.permissions)).toBe(true)
    expect(res.body.data.passwordHash).toBeUndefined()
  })

  it('✅ staff: returns current clinic identity with roleIds + permissions', async () => {
    const res = await request(server).get('/auth/me').set('Authorization', `Bearer ${tokenStaff}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.username).toBe(STAFF_A.username)
    expect(res.body.data.tenantId).toBeDefined()
    expect(Array.isArray(res.body.data.roleIds)).toBe(true)
    expect(Array.isArray(res.body.data.permissions)).toBe(true)
    expect(res.body.data.passwordHash).toBeUndefined()
  })

  it('❌ returns 401 without a token', async () => {
    const res = await request(server).get('/auth/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /auth/switch-branch — null support', () => {
  let adminToken: string
  let staffToken: string

  beforeAll(async () => {
    const adminRes = await request(server).post('/auth/login').send(ADMIN_A)
    adminToken = adminRes.body.data.token

    const step1 = await request(server).post('/auth/login').send(STAFF_A)
    const { pendingToken, branches } = step1.body.data
    const step2 = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken, branchId: branches[0].id })
    staffToken = step2.body.data.token
  })

  it('✅ allows admin to reset to all-branches (branchId: null)', async () => {
    const res = await request(server)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: null })

    expect(res.status).toBe(200)
    expect(res.body.data.token).toBeTruthy()
    expect(res.body.data.branchId).toBeNull()
  })

  it('❌ returns 403 when non-admin sends branchId: null', async () => {
    const res = await request(server)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ branchId: null })

    expect(res.status).toBe(403)
  })
})

describe('POST /auth/login — legacy role-claim mapping for custom roles (ADR-0019/D-8)', () => {
  it('a custom-role user cloned from Doctor logs in with mapped claim "staff" and routes non-admin', async () => {
    const staffUser = await prisma.user.findFirstOrThrow({
      where: { username: STAFF_A.username },
      include: { tenant: true },
    })
    const doctorSystemRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const clonedRole = await prisma.clinicRole.create({
      data: {
        tenantId: staffUser.tenantId, key: `tenant_${staffUser.tenantId}_senior_vet_auth_${Date.now()}`,
        name: 'Senior Vet', isSystem: false, permVersion: 1, sourceRoleId: doctorSystemRole.id,
      },
    })

    await prisma.user.update({ where: { id: staffUser.id }, data: { roleId: clonedRole.id } })
    await prisma.userRole.deleteMany({ where: { userId: staffUser.id } })
    await prisma.userRole.create({ data: { userId: staffUser.id, roleId: clonedRole.id, tenantId: staffUser.tenantId } })

    try {
      const res = await request(server).post('/auth/login').send(STAFF_A)
      expect(res.status).toBe(200)
      expect(res.body.data.requiresBranchSelection).toBe(true)
      const [, b64] = (res.body.data.pendingToken as string).split('.')
      const decoded = JSON.parse(Buffer.from(b64, 'base64').toString())
      expect(decoded.role).toBe('staff')
    } finally {
      // Restore original role so later tests in this file (and this suite's own
      // earlier describe blocks, if re-run) keep seeing STAFF_A as a system-staff user.
      await prisma.userRole.deleteMany({ where: { userId: staffUser.id } })
      await prisma.userRole.create({ data: { userId: staffUser.id, roleId: staffUser.roleId, tenantId: staffUser.tenantId } })
      await prisma.user.update({ where: { id: staffUser.id }, data: { roleId: staffUser.roleId } })
      await prisma.clinicRole.delete({ where: { id: clonedRole.id } })
    }
  })
})
