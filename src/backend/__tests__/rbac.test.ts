/**
 * Test Suite: rbac-1.3 — Auth & RBAC Middleware Matrix
 * @qa-agent | Protocol: qa-protocols.md §2 (RBAC on every protected endpoint)
 *
 * Validates the full RBAC matrix:
 *   - No token   → 401
 *   - Expired    → 401
 *   - Wrong role → 403
 *   - Admin      → 200/201
 *   - Doctor/Staff on admin routes → 403
 *
 * Run: npx jest --testPathPattern=rbac.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import bcrypt from 'bcrypt'
import { signToken } from '../config/jwt'
import { config } from '../config/env'
import jwt from 'jsonwebtoken'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

// ── Fixtures ──────────────────────────────────────────────────────────────────
let server: Server
let tidA: number
let adminId: number, doctorId: number, staffId: number

const SUBDOMAIN = `rbac-test-${Date.now()}`

// Token factory
function tok(userId: number, tenantId: number, role: 'admin' | 'doctor' | 'staff') {
  return `Bearer ${signToken({ userId, tenantId, plane: 'clinic', permSetVersion: 1, role })}`
}

function expiredTok(userId: number, tenantId: number, role: 'admin' | 'doctor' | 'staff') {
  return `Bearer ${jwt.sign({ userId, tenantId, role }, config.jwtSecret, { expiresIn: '-1s' })}`
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const tenant = await prisma.tenant.create({ data: { name: 'RBAC Test', subdomain: SUBDOMAIN } })
  tidA = tenant.id

  const ts = Date.now()
  const [admin, doctor, staff] = await Promise.all([
    prisma.user.create({ data: { tenantId: tidA, name: 'Admin',  username: `rbac_admin_${ts % 100000}`,  email: `admin-${ts}@rbac.local`,  passwordHash: hash, role: 'admin' } }),
    prisma.user.create({ data: { tenantId: tidA, name: 'Doctor', username: `rbac_doctor_${ts % 100000}`, email: `doctor-${ts}@rbac.local`, passwordHash: hash, role: 'doctor' } }),
    prisma.user.create({ data: { tenantId: tidA, name: 'Staff',  username: `rbac_staff_${ts % 100000}`,  email: `staff-${ts}@rbac.local`,  passwordHash: hash, role: 'staff' } }),
  ])
  adminId = admin.id; doctorId = doctor.id; staffId = staff.id

  await seedUserRoles(prisma, [
    { userId: adminId,  tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: doctorId, tenantId: tidA, roleKey: 'doctor'       },
    { userId: staffId,  tenantId: tidA, roleKey: 'clinic_staff' },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tidA])
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('rbac-1.3 — /admin/* endpoint matrix', () => {

  // ── No token ──────────────────────────────────────────────────────────────
  test('rbac-01: No token on GET /admin/settings → 401', async () => {
    await request(server).get('/admin/settings').expect(401)
  })
  test('rbac-02: No token on GET /admin/usage → 401', async () => {
    await request(server).get('/admin/usage').expect(401)
  })
  test('rbac-03: No token on GET /users → 401', async () => {
    await request(server).get('/users').expect(401)
  })

  // ── Expired token ─────────────────────────────────────────────────────────
  test('rbac-04: Expired token on GET /admin/settings → 401', async () => {
    await request(server)
      .get('/admin/settings')
      .set('Authorization', expiredTok(adminId, tidA, 'admin'))
      .expect(401)
  })
  test('rbac-05: Expired token on GET /users → 401', async () => {
    await request(server)
      .get('/users')
      .set('Authorization', expiredTok(adminId, tidA, 'admin'))
      .expect(401)
  })

  // ── Doctor role on read-only admin routes → 200 (clinic.profile.view granted to all) ──────
  test('rbac-06: Doctor on GET /admin/settings → 200 (clinic.profile.view is view-all)', async () => {
    await request(server)
      .get('/admin/settings')
      .set('Authorization', tok(doctorId, tidA, 'doctor'))
      .expect(200)
  })
  test('rbac-07: Doctor on GET /admin/usage → 200 (clinic.profile.view is view-all)', async () => {
    await request(server)
      .get('/admin/usage')
      .set('Authorization', tok(doctorId, tidA, 'doctor'))
      .expect(200)
  })
  test('rbac-08: Doctor on GET /users → 403', async () => {
    await request(server)
      .get('/users')
      .set('Authorization', tok(doctorId, tidA, 'doctor'))
      .expect(403)
  })
  test('rbac-09: Doctor on POST /users → 403', async () => {
    await request(server)
      .post('/users')
      .set('Authorization', tok(doctorId, tidA, 'doctor'))
      .send({ name: 'X', email: 'x@x.com', password: 'XxPass1!', role: 'staff' })
      .expect(403)
  })

  // ── Staff role on read-only admin routes → 200 (clinic.profile.view granted to all) ────────
  test('rbac-10: Staff on GET /admin/settings → 200 (clinic.profile.view is view-all)', async () => {
    await request(server)
      .get('/admin/settings')
      .set('Authorization', tok(staffId, tidA, 'staff'))
      .expect(200)
  })
  test('rbac-11: Staff on PUT /admin/settings → 403', async () => {
    await request(server)
      .put('/admin/settings')
      .set('Authorization', tok(staffId, tidA, 'staff'))
      .send({ phone: '0000000000' })
      .expect(403)
  })
  test('rbac-12: Staff on DELETE /users/:id → 403', async () => {
    await request(server)
      .delete(`/users/${doctorId}`)
      .set('Authorization', tok(staffId, tidA, 'staff'))
      .expect(403)
  })

  // ── Admin role → success ──────────────────────────────────────────────────
  test('rbac-13: Admin on GET /admin/settings → 200', async () => {
    await request(server)
      .get('/admin/settings')
      .set('Authorization', tok(adminId, tidA, 'admin'))
      .expect(200)
  })
  test('rbac-14: Admin on GET /admin/usage → 200', async () => {
    await request(server)
      .get('/admin/usage')
      .set('Authorization', tok(adminId, tidA, 'admin'))
      .expect(200)
  })
  test('rbac-15: Admin on GET /users → 200', async () => {
    await request(server)
      .get('/users')
      .set('Authorization', tok(adminId, tidA, 'admin'))
      .expect(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('rbac-1.3 — Health check (public endpoint)', () => {
  test('rbac-16: GET /health returns 200 without token', async () => {
    // Type: happy_path
    await request(server).get('/health').expect(200)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('rbac-1.3 — Unknown route', () => {
  test('rbac-17: Unknown route returns 404 without token', async () => {
    await request(server).get('/this-does-not-exist').expect(404)
  })
})
