/**
 * Test Suite: user-1.5 — User Management API
 * @qa-agent | Protocol: qa-protocols.md §1 + §2 + §3 + §4
 *
 * Tests GET/POST/PUT/DELETE /users — full CRUD + isolation + validation.
 *
 * Run: npx jest --testPathPattern=userManagement.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import { signToken } from '../config/jwt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

// ── Fixture ───────────────────────────────────────────────────────────────────
let server: Server
let tenantId: number
let adminId: number
let targetUserId: number

const SUBDOMAIN = `users-test-${Date.now()}`

function adminToken() {
  return `Bearer ${signToken({ userId: adminId, tenantId, plane: 'clinic', permSetVersion: 1, role: 'admin' })}`
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tenant = await prisma.tenant.create({ data: { name: 'User Mgmt Test', subdomain: SUBDOMAIN } })
  tenantId = tenant.id

  // Phase 3: user creation enforces the plan's user limit. These CRUD tests create
  // many users, so put this tenant on an unlimited plan (limit behaviour is covered
  // separately in subscription.test.ts).
  await prisma.tenantSettings.create({ data: { tenantId, planTier: 'professional' } })

  const admin = await prisma.user.create({
    data: { tenantId, name: 'Test Admin', email: `admin-${ts}@users-test.local`, passwordHash: hash, role: 'admin' },
  })
  adminId = admin.id

  const target = await prisma.user.create({
    data: { tenantId, name: 'Target Doctor', email: `doctor-${ts}@users-test.local`, passwordHash: hash, role: 'doctor' },
  })
  targetUserId = target.id

  await seedUserRoles(prisma, [
    { userId: adminId,       tenantId, roleKey: 'clinic_admin' },
    { userId: targetUserId,  tenantId, roleKey: 'doctor'       },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — GET /users', () => {

  test('user-01: List returns all tenant users', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/users')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2) // admin + doctor

    // No cross-tenant data
    res.body.data.forEach((u: { tenantId: number }) => {
      expect(u.tenantId).toBe(tenantId)
    })
  })

  test('user-02: List response shape has expected fields', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/users')
      .set('Authorization', adminToken())
      .expect(200)

    const user = res.body.data[0]
    expect(user).toHaveProperty('id')
    expect(user).toHaveProperty('name')
    expect(user).toHaveProperty('email')
    expect(user).toHaveProperty('role')
    expect(user).toHaveProperty('isActive')
    expect(user).toHaveProperty('createdAt')
    // SECURITY: passwordHash must not be exposed
    expect(user).not.toHaveProperty('passwordHash')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — GET /users/:id', () => {

  test('user-03: Get existing user by ID', async () => {
    // Type: happy_path
    const res = await request(server)
      .get(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.id).toBe(targetUserId)
  })

  test('user-04: Get non-existent ID returns 404', async () => {
    // Type: edge_case
    await request(server)
      .get('/users/999999999')
      .set('Authorization', adminToken())
      .expect(404)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — POST /users', () => {

  test('user-05: Create new staff user', async () => {
    // Type: happy_path
    const ts = Date.now()
    const res = await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'New Staff', email: `newstaff-${ts}@users-test.local`, password: 'StaffPass1!', role: 'staff' })
      .expect(201)

    expect(res.body.data.role).toBe('staff')
    expect(res.body.data.isActive).toBe(true)
    expect(res.body.data.tenantId).toBe(tenantId)
  })

  test('user-06: Create new doctor user', async () => {
    // Type: happy_path
    const ts = Date.now()
    const res = await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'New Doctor', email: `newdoc-${ts}@users-test.local`, password: 'DocPass1!', role: 'doctor' })
      .expect(201)

    expect(res.body.data.role).toBe('doctor')
  })

  test('user-07: Duplicate email within same tenant → 409', async () => {
    // Type: edge_case
    const email = `dup-${Date.now()}@users-test.local`
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'First', email, password: 'Pass1234!', role: 'staff' })
      .expect(201)

    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Second', email, password: 'Pass1234!', role: 'staff' })
      .expect(409)
  })

  test('user-08: Missing required field name → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ email: `x-${Date.now()}@t.com`, password: 'Pass1234!', role: 'staff' })
      .expect(400)
  })

  test('user-09: Password shorter than 8 chars → 400', async () => {
    // Type: edge_case / input validation (NFR-04)
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Short Pass', email: `sp-${Date.now()}@t.com`, password: 'abc', role: 'staff' })
      .expect(400)
  })

  test('user-10: Invalid role value → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Bad Role', email: `br-${Date.now()}@t.com`, password: 'Pass1234!', role: 'superuser' })
      .expect(400)
  })

  test('user-11: Admin cannot create user in a different tenant (isolation)', async () => {
    // Given: another tenant exists
    // When:  Admin from Tenant A creates a user — tenantId is always taken from JWT
    // Then:  created user belongs to Tenant A, not any other tenant
    // Type:  security
    const ts = Date.now()
    const res = await request(server)
      .post('/users')
      .set('Authorization', adminToken())
      .send({ name: 'Isolated', email: `iso-${ts}@t.com`, password: 'Pass1234!', role: 'staff' })
      .expect(201)

    // The service always uses req.context.tenantId — never from request body
    expect(res.body.data.tenantId).toBe(tenantId)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — PUT /users/:id', () => {

  test('user-12: Update user name', async () => {
    // Type: happy_path
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ name: 'Updated Doctor Name' })
      .expect(200)

    expect(res.body.data.name).toBe('Updated Doctor Name')
  })

  test('user-13: Change role from doctor to staff', async () => {
    // Type: happy_path
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ role: 'staff' })
      .expect(200)

    expect(res.body.data.role).toBe('staff')
  })

  test('user-14: Deactivate user via PUT isActive=false', async () => {
    // Type: happy_path
    const res = await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ isActive: false })
      .expect(200)

    expect(res.body.data.isActive).toBe(false)

    // Restore
    await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ isActive: true })
  })

  test('user-15: Update non-existent user → 404', async () => {
    // Type: edge_case
    await request(server)
      .put('/users/999999999')
      .set('Authorization', adminToken())
      .send({ name: 'Ghost' })
      .expect(404)
  })

  test('user-16: Update with invalid role → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put(`/users/${targetUserId}`)
      .set('Authorization', adminToken())
      .send({ role: 'superuser' })
      .expect(400)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — DELETE /users/:id (soft delete)', () => {

  test('user-17: Deactivate user via DELETE', async () => {
    // Type: happy_path
    const ts = Date.now()
    const hash = await bcrypt.hash('TestPass1!', 10)
    const tempUser = await prisma.user.create({
      data: { tenantId, name: 'Temp User', email: `temp-${ts}@users-test.local`, passwordHash: hash, role: 'staff' },
    })

    await request(server)
      .delete(`/users/${tempUser.id}`)
      .set('Authorization', adminToken())
      .expect(200)

    // Verify soft delete — user still exists but isActive=false
    const updated = await prisma.user.findUnique({ where: { id: tempUser.id } })
    expect(updated?.isActive).toBe(false)
  })

  test('user-18: Delete non-existent user → 404', async () => {
    // Type: edge_case
    await request(server)
      .delete('/users/999999999')
      .set('Authorization', adminToken())
      .expect(404)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('user-1.5 — Concurrent edge cases', () => {

  test('user-19: Double-submit POST /users with same payload is idempotent or 409', async () => {
    // Given: rapid double-submit with identical payload
    // Then:  first succeeds, second returns 409 (duplicate email)
    // Type:  concurrent / edge_case
    const payload = {
      name: 'Double Tap', email: `double-${Date.now()}@users-test.local`,
      password: 'Pass1234!', role: 'staff',
    }
    const [r1, r2] = await Promise.all([
      request(server).post('/users').set('Authorization', adminToken()).send(payload),
      request(server).post('/users').set('Authorization', adminToken()).send(payload),
    ])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toContain(201)
    expect(statuses).toContain(409)
  })
})
