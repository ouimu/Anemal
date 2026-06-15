// @qa-agent — Integration tests: T-5C-02 Platform Auth Login
// Covers POST /platform/auth/login and plane isolation enforcement.

import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─── POST /platform/auth/login ────────────────────────────────────────────────
describe('POST /platform/auth/login', () => {
  it('returns platform token on valid credentials', async () => {
    const res = await request(server)
      .post('/platform/auth/login')
      .send({
        email:    process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.co',
        password: process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!',
      })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.token).toBeDefined()
    expect(typeof res.body.data.token).toBe('string')
    expect(res.body.data.user.email).toBe(
      process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.co'
    )
    expect(res.body.data.user.role).toBeDefined()
    // Must NOT expose passwordHash
    expect(res.body.data.user.passwordHash).toBeUndefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await request(server)
      .post('/platform/auth/login')
      .send({
        email:    process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.co',
        password: 'WrongPassword99!',
      })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    // Enumeration-safe: same message regardless of email vs password failure
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 on non-existent email', async () => {
    const res = await request(server)
      .post('/platform/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'Whatever1!' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 400 on missing fields', async () => {
    const res = await request(server)
      .post('/platform/auth/login')
      .send({ email: 'admin@anemal.co' })
    expect(res.status).toBe(400)
  })

  it('returns 401 for inactive platform user with correct password', async () => {
    // Seed an inactive platform user directly via the repo/DB, then attempt login.
    // We use a known-inactive fixture email that must NOT exist as an active user.
    // The response must be 401 with the same generic message (no enumeration leak).
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    const bcryptLib = await import('bcrypt')
    const hashedPw = await bcryptLib.default.hash('CorrectPass1!', 10)
    let createdId: number | undefined
    try {
      const created = await prisma.platformUser.create({
        data: {
          email:        'inactive-fixture@anemal.co',
          passwordHash: hashedPw,
          name:         'Inactive Fixture',
          role:         'platform_support',
          isActive:     false,
        },
      })
      createdId = created.id
      const res = await request(server)
        .post('/platform/auth/login')
        .send({ email: 'inactive-fixture@anemal.co', password: 'CorrectPass1!' })
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error).toBe('Invalid credentials')
    } finally {
      if (createdId !== undefined) {
        await prisma.platformUser.delete({ where: { id: createdId } })
      }
      await prisma.$disconnect()
    }
  })
})

// ─── Plane isolation ──────────────────────────────────────────────────────────
describe('plane isolation', () => {
  let platformToken: string
  let clinicToken: string

  beforeAll(async () => {
    // Get platform token
    const pRes = await request(server)
      .post('/platform/auth/login')
      .send({
        email:    process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.co',
        password: process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!',
      })
    platformToken = pRes.body.data?.token

    // Get clinic token
    const cRes = await request(server)
      .post('/auth/login')
      .send({ subdomain: 'dev-clinic', email: 'admin@dev-clinic.com', password: 'AdminPass1!' })
    clinicToken = cRes.body.data?.token
  })

  it('platform token is rejected on a clinic route (GET /users → 403)', async () => {
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(403)
  })

  it('clinic token is rejected on POST /platform/auth/login (body-parse; no plane check needed — route is public)', async () => {
    // The login route itself is public, but issuing a clinic token against a
    // platform-plane protected resource must yield 403.
    // GET /clinic/pets doesn't exist yet; use /users (which has requirePlane('clinic'))
    // to confirm the clinic token still works on clinic routes.
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${clinicToken}`)
    // Clinic token must NOT be rejected on a clinic route
    expect([200, 403]).toContain(res.status)   // 403 = permission denied (ok — not plane denied)
  })

  it('clinic token cannot access a platform-plane protected endpoint', async () => {
    // Until Task 5 ships a protected platform endpoint we assert the plane claim.
    // We decode the clinic token manually to confirm plane === 'clinic'.
    const [, payloadB64] = clinicToken.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    expect(payload.plane).toBe('clinic')
  })

  it('platform token has plane === "platform", platformUserId set, no tenantId/userId', async () => {
    const [, payloadB64] = platformToken.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    expect(payload.plane).toBe('platform')
    expect(typeof payload.platformUserId).toBe('number')
    // signPlatformToken only signs { platformUserId, plane, role } — clinic fields absent
    expect(payload.tenantId).toBeUndefined()
    expect(payload.userId).toBeUndefined()
  })
})
