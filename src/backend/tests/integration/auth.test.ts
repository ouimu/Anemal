// @qa-agent — Integration tests: POST /auth/login
// Uses supertest against the Express app; requires DATABASE_URL in .env.test
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

// NOTE: These tests assume the seed has been run (npm run db:seed)
// Run with: DATABASE_URL=<test-db-url> npm test

const TENANT_A = { subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }
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

describe('POST /auth/login', () => {
  it('✅ returns 200 + JWT for valid Tenant A credentials', async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeDefined()
    expect(res.body.data.tenantId).toBeDefined()
    expect(res.body.data.role).toBe('admin')
  })

  it('✅ JWT payload contains tenantId and role', async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
    const [, payloadB64] = res.body.data.token.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString())
    expect(payload.tenantId).toBeDefined()
    expect(payload.role).toBeDefined()
    expect(payload.exp).toBeDefined()
  })

  it('✅ Tenant B gets a different tenantId than Tenant A', async () => {
    const [resA, resB] = await Promise.all([
      request(server).post('/auth/login').send(TENANT_A),
      request(server).post('/auth/login').send(TENANT_B),
    ])
    expect(resA.body.data.tenantId).not.toBe(resB.body.data.tenantId)
  })

  it('❌ returns 401 for wrong password', async () => {
    const res = await request(server).post('/auth/login').send({ ...TENANT_A, password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('❌ returns 401 for unknown tenant subdomain', async () => {
    const res = await request(server).post('/auth/login').send({ ...TENANT_A, subdomain: 'ghost-clinic' })
    expect(res.status).toBe(401)
  })

  it('❌ returns 400 for missing username field', async () => {
    const res = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', password: 'pass' })
    expect(res.status).toBe(400)
  })
})

describe('GET /auth/me', () => {
  let token: string

  beforeAll(async () => {
    const res = await request(server).post('/auth/login').send(TENANT_A)
    token = res.body.data.token
  })

  it('✅ returns current clinic identity with roleIds + permissions', async () => {
    const res = await request(server).get('/auth/me').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.username).toBe(TENANT_A.username)
    expect(res.body.data.tenantId).toBeDefined()
    expect(Array.isArray(res.body.data.roleIds)).toBe(true)
    expect(Array.isArray(res.body.data.permissions)).toBe(true)
    // Never leak the password hash
    expect(res.body.data.passwordHash).toBeUndefined()
  })

  it('❌ returns 401 without a token', async () => {
    const res = await request(server).get('/auth/me')
    expect(res.status).toBe(401)
  })
})
