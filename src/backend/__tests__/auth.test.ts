/**
 * Test Suite: auth-1.2 — JWT Authentication
 * @qa-agent | Protocol: qa-protocols.md §1 + §3 + §4
 *
 * Tests POST /auth/login — credential validation, JWT payload, role embed.
 * D-2: login now uses username (not email). /platform/auth/login still uses email.
 *
 * Run: npx jest --testPathPattern=auth.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'

// ── Fixture ───────────────────────────────────────────────────────────────────
let server: Server
let tenantId: number
let adminUsername: string
let doctorUsername: string
let staffUsername: string
const SUBDOMAIN = `auth-test-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('ValidPass1!', 10)
  const tenant = await prisma.tenant.create({
    data: { name: 'Auth Test Clinic', subdomain: SUBDOMAIN },
  })
  tenantId = tenant.id

  const ts = Date.now() % 100000
  adminUsername  = `admin_${ts}`
  doctorUsername = `doctor_${ts}`
  staffUsername  = `staff_${ts}`

  await prisma.user.createMany({
    data: [
      { tenantId, name: 'Auth Admin',  username: adminUsername,  email: `admin-${ts}@auth-test.local`,  passwordHash: hash, role: 'admin' },
      { tenantId, name: 'Auth Doctor', username: doctorUsername, email: `doctor-${ts}@auth-test.local`, passwordHash: hash, role: 'doctor' },
      { tenantId, name: 'Auth Staff',  username: staffUsername,  email: `staff-${ts}@auth-test.local`,  passwordHash: hash, role: 'staff' },
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
    // When:  POST /auth/login with username
    // Then:  200 + token + correct payload
    // Type:  happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
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
      .send({ subdomain: SUBDOMAIN, username: doctorUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.role).toBe('doctor')
    const decoded = jwt.verify(res.body.data.token, config.jwtSecret) as Record<string, unknown>
    expect(decoded.role).toBe('doctor')
  })

  test('auth-03: Staff login returns role=staff in JWT', async () => {
    // Type: happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: staffUsername, password: 'ValidPass1!' })
      .expect(200)

    expect(res.body.data.role).toBe('staff')
  })

  test('auth-04: JWT expires in ~8 hours', async () => {
    // Given: valid login
    // Then:  exp - iat ≈ 8h (within 60s tolerance)
    // Type:  happy_path
    const res = await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
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
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'WrongPass!' })
      .expect(401)

    expect(res.body.success).toBe(false)
    // SECURITY: must not reveal whether the username or password is wrong
    expect(res.body.error).toMatch(/invalid credentials/i)
  })

  test('auth-06: Non-existent username → 401 (not 404)', async () => {
    // Type: security (no user enumeration)
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: 'nobody_user', password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-07: Unknown subdomain → 401', async () => {
    // Type: security
    await request(server)
      .post('/auth/login')
      .send({ subdomain: 'clinic-does-not-exist', username: adminUsername, password: 'ValidPass1!' })
      .expect(401)
  })

  test('auth-08: Deactivated user cannot log in → 401', async () => {
    // Given: user with isActive=false
    // When:  POST /auth/login
    // Then:  401
    // Type:  edge_case
    const hash = await bcrypt.hash('ValidPass1!', 10)
    const ts = Date.now() % 100000
    const inactiveUsername = `inactive_${ts}`
    await prisma.user.create({
      data: { tenantId, name: 'Inactive', username: inactiveUsername, email: `inactive-${ts}@auth-test.local`, passwordHash: hash, role: 'staff', isActive: false },
    })

    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: inactiveUsername, password: 'ValidPass1!' })
      .expect(401)
  })

  // ── Input validation ──────────────────────────────────────────────────────

  test('auth-09: Missing username field → 400', async () => {
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
      .send({ subdomain: SUBDOMAIN, username: adminUsername })
      .expect(400)
  })

  test('auth-11: Username too short (< 3 chars) → 400', async () => {
    // Type: edge_case — schema enforces min(3)
    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: 'ab', password: 'ValidPass1!' })
      .expect(400)
  })

  test('auth-12: Missing subdomain → 400', async () => {
    // Type: edge_case
    await request(server)
      .post('/auth/login')
      .send({ username: adminUsername, password: 'ValidPass1!' })
      .expect(400)
  })

  // ── Edge case: inactive tenant ─────────────────────────────────────────────

  test('auth-13: Inactive tenant → 401', async () => {
    // Given: tenant.isActive = false
    // Type:  edge_case
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } })

    await request(server)
      .post('/auth/login')
      .send({ subdomain: SUBDOMAIN, username: adminUsername, password: 'ValidPass1!' })
      .expect(401)

    // Restore
    await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } })
  })
})
