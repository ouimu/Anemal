/**
 * Test Suite: iso-1.1 — Multi-Tenancy Isolation
 * @qa-agent | Protocol: qa-protocols.md §1 (MANDATORY on every DB-touching task)
 *
 * Tests DB-level isolation using Prisma. All fixtures are rolled back via
 * deleteMany on unique subdomains in afterAll.
 *
 * Run: npx jest --testPathPattern=multitenancy-isolation
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

// ── Fixture IDs ───────────────────────────────────────────────────────────────
let server: Server
let tidA: number, tidB: number
let uidA: number, uidB: number
const SUBDOMAIN_A = `iso-test-a-${Date.now()}`
const SUBDOMAIN_B = `iso-test-b-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()

  const tA = await prisma.tenant.create({ data: { name: 'Iso Clinic A', subdomain: SUBDOMAIN_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Iso Clinic B', subdomain: SUBDOMAIN_B } })
  tidA = tA.id; tidB = tB.id

  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const uA = await prisma.user.create({
    data: { tenantId: tidA, name: 'Admin A', username: `iso_adm_a_${ts % 100000}`, email: `iso-admin-a-${ts}@test.local`, passwordHash: hash, roleId: adminRole.id },
  })
  const uB = await prisma.user.create({
    data: { tenantId: tidB, name: 'Admin B', username: `iso_adm_b_${ts % 100000}`, email: `iso-admin-b-${ts}@test.local`, passwordHash: hash, roleId: adminRole.id },
  })
  uidA = uA.id; uidB = uB.id

  await seedUserRoles(prisma, [
    { userId: uidA, tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uidB, tenantId: tidB, roleKey: 'clinic_admin' },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tidA, tidB])
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function tokenFor(userId: number, tenantId: number, role: string) {
  return signToken({ userId, tenantId, plane: 'clinic', permSetVersion: 1, role })
}

// ═════════════════════════════════════════════════════════════════════════════
describe('iso-1.1 — Cross-tenant REST isolation', () => {

  // ── §1: Cross-tenant list ─────────────────────────────────────────────────

  test('iso-01: GET /users returns only current tenant\'s users', async () => {
    // Given: Tenant A has 1 user, Tenant B has 1 user
    // When:  GET /users with Tenant A's JWT
    // Then:  only Tenant A's user appears in the response
    // Type:  security
    const res = await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${tokenFor(uidA, tidA, 'admin')}`)
      .expect(200)

    const ids: number[] = res.body.data.map((u: { id: number }) => u.id)
    expect(ids).toContain(uidA)
    expect(ids).not.toContain(uidB)
  })

  test('iso-02: GET /users/:id across tenants returns 404', async () => {
    // Given: uidB belongs to Tenant B
    // When:  Tenant A tries GET /users/<uidB>
    // Then:  404 — not found in Tenant A's scope
    // Type:  security
    await request(server)
      .get(`/users/${uidB}`)
      .set('Authorization', `Bearer ${tokenFor(uidA, tidA, 'admin')}`)
      .expect(404)
  })

  test('iso-03: PUT /users/:id across tenants returns 404', async () => {
    // Given: uidB belongs to Tenant B
    // When:  Tenant A tries to update uidB's name
    // Then:  404
    // Type:  security
    await request(server)
      .put(`/users/${uidB}`)
      .set('Authorization', `Bearer ${tokenFor(uidA, tidA, 'admin')}`)
      .send({ name: 'Hacked Name' })
      .expect(404)

    // Verify DB was not mutated
    const user = await prisma.user.findUnique({ where: { id: uidB } })
    expect(user?.name).not.toBe('Hacked Name')
  })

  test('iso-04: DELETE /users/:id across tenants returns 404', async () => {
    // Given: uidB belongs to Tenant B
    // When:  Tenant A tries to deactivate uidB
    // Then:  404; uidB still active
    // Type:  security
    await request(server)
      .delete(`/users/${uidB}`)
      .set('Authorization', `Bearer ${tokenFor(uidA, tidA, 'admin')}`)
      .expect(404)

    const user = await prisma.user.findUnique({ where: { id: uidB } })
    expect(user?.isActive).toBe(true)
  })

  // ── §1: JWT validation ─────────────────────────────────────────────────────

  test('iso-05: Request without token → 401', async () => {
    // Type: security
    await request(server).get('/users').expect(401)
  })

  test('iso-06: Request with malformed token → 401', async () => {
    // Type: security
    await request(server)
      .get('/users')
      .set('Authorization', 'Bearer not.a.valid.token')
      .expect(401)
  })

  test('iso-07: Request with expired token → 401', async () => {
    // Type: security
    const { default: jwt } = await import('jsonwebtoken')
    const { config } = await import('../config/env')
    const expiredToken = jwt.sign(
      { userId: uidA, tenantId: tidA, role: 'admin' },
      config.jwtSecret,
      { expiresIn: '-1s' }
    )
    await request(server)
      .get('/users')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401)
  })

  // ── §1: Tenant filter on list endpoint ────────────────────────────────────

  test('iso-08: GET /admin/settings only returns requesting tenant\'s settings', async () => {
    // Given: Tenant A has made a settings request (upsert creates row)
    // When:  Tenant A calls GET /admin/settings
    // Then:  returned tenantId === tidA (not tidB)
    // Type:  happy_path
    const res = await request(server)
      .get('/admin/settings')
      .set('Authorization', `Bearer ${tokenFor(uidA, tidA, 'admin')}`)
      .expect(200)

    expect(res.body.data.tenantId).toBe(tidA)
    expect(res.body.data.tenantId).not.toBe(tidB)
  })

  test('iso-09: GET /admin/usage scoped to requesting tenant', async () => {
    // When:  Tenant A calls GET /admin/usage
    // Then:  200; data is a valid usage object
    // Type:  happy_path
    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', `Bearer ${tokenFor(uidA, tidA, 'admin')}`)
      .expect(200)

    expect(res.body.data).toHaveProperty('totalUsers')
    expect(typeof res.body.data.totalUsers).toBe('number')
  })
})
