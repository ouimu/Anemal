// @qa-agent — Integration tests: two-step login (POST /auth/login + POST /auth/select-branch)
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

// These tests use seed users admin_a / admin_b who are clinic_admin (role='admin').
// Admin sees ALL branches for tenant; both seed tenants must have at least one branch.
const TENANT_A = { subdomain: 'dev-clinic',  username: 'admin_a', password: 'AdminPass1!' }
const TENANT_B = { subdomain: 'test-clinic', username: 'admin_b', password: 'AdminPass2!' }

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('POST /auth/login — step 1: credentials', () => {
  it('✅ returns requiresBranchSelection=true + pendingToken + branches list', async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.requiresBranchSelection).toBe(true)
    expect(res.body.data.pendingToken).toBeTruthy()
    expect(Array.isArray(res.body.data.branches)).toBe(true)
    expect(res.body.data.branches.length).toBeGreaterThan(0)
    // No full token yet
    expect(res.body.data.token).toBeUndefined()
  })

  it('✅ Tenant A and Tenant B get different pendingTokens (different tenant/user)', async () => {
    const [resA, resB] = await Promise.all([
      request(server).post('/auth/login').send(TENANT_A),
      request(server).post('/auth/login').send(TENANT_B),
    ])
    expect(resA.body.data.pendingToken).not.toBe(resB.body.data.pendingToken)
  })

  it('❌ returns 401 for wrong password', async () => {
    const res = await request(server).post('/auth/login').send({ ...TENANT_A, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('❌ returns 401 for unknown subdomain', async () => {
    const res = await request(server).post('/auth/login').send({ ...TENANT_A, subdomain: 'ghost-clinic' })
    expect(res.status).toBe(401)
  })

  it('❌ returns 400 for missing username field', async () => {
    const res = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', password: 'pass' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/select-branch — step 2: branch selection', () => {
  let pendingToken: string
  let branchId:     number

  beforeAll(async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
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
    expect(res.body.data.role).toBe('admin')
    // Verify JWT payload
    const [, b64] = (res.body.data.token as string).split('.')
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString())
    expect(payload.tenantId).toBeDefined()
    expect(payload.branchId).toBe(branchId)
    expect(payload.role).toBe('admin')
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
})

describe('GET /auth/me', () => {
  let token: string

  beforeAll(async () => {
    // Must complete both steps to get a real token
    const step1 = await request(server).post('/auth/login').send(TENANT_A)
    const { pendingToken, branches } = step1.body.data
    const step2 = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken, branchId: branches[0].id })
    token = step2.body.data.token
  })

  it('✅ returns current clinic identity with roleIds + permissions', async () => {
    const res = await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.username).toBe(TENANT_A.username)
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
