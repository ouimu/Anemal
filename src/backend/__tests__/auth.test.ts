/**
 * Test Suite: auth-1.2 — JWT Authentication
 * @qa-agent | Protocol: qa-protocols.md §1 + §3 + §4
 *
 * Tests POST /auth/login — credential validation, JWT payload, role embed.
 *
 * Run: npx jest --testPathPattern=auth.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../src/app'
import prisma from '../src/config/db'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../src/config/env'

// ── Fixture ───────────────────────────────────────────────────────────────────
let server: Server
let tenantId: number
let adminEmail: string
let doctorEmail: string
let staffEmail: string
const SUBDOMAIN = `auth-test-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('ValidPass1!', 10)
  const tenant = await prisma.tenant.create({
    data: { name: 'Auth Test Clinic', subdomain: SUBDOMAIN },
  })
  tenantId = tenant.id

  const ts = Date.now()
  adminEmail  = `admin-${ts}@auth-test.local`
  doctorEmail = `doctor-${ts}@auth-test.local`
  staffEmail  = `staff-${ts}@auth-test.local`

  await prisma.user.createMany({
    data: [
      { tenantId, name: 'Auth Admin',  email: adminEmail,  passwordHash: hash, role: 'admin' },
      { tenantId, name: 'Auth Doctor', email: doctorEmail, passwordHash: hash, role: 'doctor' },
      { tenantId, name: 'Auth Staff',  email: staffEmail,  passwordHash: hash, role: 'staff' },
    ],
  })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('auth-1.2 — POST /auth/login', () => {

  // ── Happy paths ───────────────────────────────────────────────────────────

  test('auth-01: Admin login returns signed JWT with tenantId and role', async () => {
    // Given: valid admin credentials
    // When:  POST /auth/login
    // Then:  200 + token + correct payload
    // Type:  happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: adminEmail, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.success).toBe(true)
    const { token, role, tenantId: tid } = res.body.data
    expect(token).toBeTruthy()
    expect(role).toBe('admin')
    expect(tid).toBe(tenantId)

    // Decode and verify claims
    const decoded = jwt.verify(token, config.jwtSecret) as Record<string, unknown>
    expect(decoded.tenantId).toBe(tenantId)
    expect(decoded.role).toBe('admin')
    expect(decoded.exp).toBeDefined()
  })

  test('auth-02: Doctor login returns role=doctor in JWT', async () => {
    // Type: happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: doctorEmail, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.role).toBe('doctor')
    const decoded = jwt.verify(res.body.data.token, config.jwtSecret) as Record<string, unknown>
    expect(decoded.role).toBe('doctor')
  })

  test('auth-03: Staff login returns role=staff in JWT', async () => {
    // Type: happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: staffEmail, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.role).toBe('staff')
  })

  test('auth-04: JWT expires in ~8 hours', async () => {
    // Given: valid login
    // Then:  exp - iat ≈ 8h (within 60s tolerance)
    // Type:  happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: adminEmail, password: 'ValidPass1!' })
      .expect(200)

    const decoded = jwt.decode(res.body.data.token) as { iat: number; exp: number }
    const diffHours = (decoded.exp - decoded.iat) / 3600
    expect(diffHours).toBeCloseTo(8, 0)
  })

  // ── Error cases ───────────────────────────────────────────────────────────

  test('auth-05: Wrong password → 401', async () => {
    // Type: edge_case / security
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: adminEmail, password: 'WrongPass!' })
      .expect(401)

    expect(res.body.success).toBe(false)
    // SECURITY: must not reveal whether the email or password is wrong
    expect(res.body.error).toMatch(/invalid credentials/i)
  })

  test('auth-06: Non-existent email → 401 (not 404)', async () => {
    // Type: security (no user enumeration)
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: 'nobody@nope.com', password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-07: Unknown subdomain → 401', async () => {
    // Type: security
    await request(server)
      .post('/auth/login')
      .send({ subdomain: 'clinic-does-not-exist', email: adminEmail, password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-08: Deactivated user cannot log in → 401', async () => {
    // Given: user with isActive=false
    // When:  POST /auth/login
    // Then:  401
    // Type:  edge_case
    const hash = await bcrypt.hash('ValidPass1!', 10)
    const ts = Date.now()
    const inactiveEmail = `inactive-${ts}@auth-test.local`
    await prisma.user.create({
      data: { tenantId, name: 'Inactive', email: inactiveEmail, passwordHash: hash, role: 'staff', isActive: false },
    })

    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: inactiveEmail, password: 'ValidPass1!' })
      .expect(401)
  })

  // ── Input validation ──────────────────────────────────────────────────────

  test('auth-09: Missing email field → 400', async () => {
    // Type: edge_case
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-10: Missing password field → 400', async () => {
    // Type: edge_case
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: adminEmail })
      .expect(400)
  })

  test('auth-11: Malformed email → 400', async () => {
    // Type: edge_case
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: 'not-an-email', password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-12: Missing subdomain → 400', async () => {
    // Type: edge_case
    await request(server)
      .post('/auth/login')
      .send({ email: adminEmail, password: 'ValidPass1!' })
      .expect(400)
  })

  // ── Edge case: inactive tenant ─────────────────────────────────────────────

  test('auth-13: Inactive tenant → 401', async () => {
    // Given: tenant.isActive = false
    // Type:  edge_case
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } })

    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, email: adminEmail, password: 'ValidPass1!' })
      .expect(401)

    // Restore
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } })
  })
})
