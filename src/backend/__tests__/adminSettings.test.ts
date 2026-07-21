/**
 * Test Suite: admin-1.4 — Admin Settings & Usage API
 * @qa-agent | Protocol: qa-protocols.md §1 + §2 + §3
 *
 * Tests GET/PUT /admin/settings and GET /admin/usage.
 *
 * Run: npx jest --testPathPattern=adminSettings.test
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

const SUBDOMAIN = `settings-test-${Date.now()}`

function adminToken() {
  return `Bearer ${signToken({ userId: adminId, tenantId, plane: 'clinic', permSetVersion: 1, role: 'admin' })}`
}
function doctorToken() {
  return `Bearer ${signToken({ userId: adminId + 1000, tenantId, plane: 'clinic', permSetVersion: 1, role: 'doctor' })}`
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })

  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tenant = await prisma.tenant.create({ data: { name: 'Settings Test', subdomain: SUBDOMAIN } })
  tenantId = tenant.id

  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const admin = await prisma.user.create({
    data: { tenantId, name: 'Admin', username: `settings_adm_${ts % 100000}`, email: `admin-${ts}@settings.local`, passwordHash: hash, roleId: adminRole.id },
  })
  adminId = admin.id

  await seedUserRoles(prisma, [
    { userId: adminId, tenantId, roleKey: 'clinic_admin' },
  ])
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.tenantSettings.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('admin-1.4 — GET /admin/settings', () => {

  test('settings-01: First call upserts and returns settings row', async () => {
    // Given: no settings row exists yet
    // When:  GET /admin/settings
    // Then:  200 + row created with correct tenantId + defaults
    // Type:  happy_path
    const res = await request(server)
      .get('/admin/settings')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.tenantId).toBe(tenantId)
    expect(res.body.data.defaultSlotMinutes).toBe(30)   // default
    expect(res.body.data.workStartTime).toBe('08:00')   // default
    expect(res.body.data.workEndTime).toBe('18:00')     // default
    expect(res.body.data.smsRemindersEnabled).toBe(true)
    expect(res.body.data.lineRemindersEnabled).toBe(true)
    expect(res.body.data.planTier).toBe('starter')      // default
  })

  test('settings-01b: Default idleTimeoutMinutes is 15', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/settings')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.idleTimeoutMinutes).toBe(15)
  })

  test('settings-02: Response includes tenant name and subdomain', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/settings')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.tenant).toHaveProperty('name')
    expect(res.body.data.tenant).toHaveProperty('subdomain')
    expect(res.body.data.tenant.subdomain).toBe(SUBDOMAIN)
  })

  test('settings-03: Doctor on GET /admin/settings → 403', async () => {
    // Type: security / RBAC
    await request(server)
      .get('/admin/settings')
      .set('Authorization', doctorToken())
      .expect(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('admin-1.4 — PUT /admin/settings', () => {

  test('settings-04: Update phone and address', async () => {
    // Type: happy_path
    const res = await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ phone: '02-123-4567', address: '123 Pet Street, Bangkok' })
      .expect(200)

    expect(res.body.data.phone).toBe('02-123-4567')
    expect(res.body.data.address).toBe('123 Pet Street, Bangkok')
  })

  test('settings-05: Update clinic name (updates tenant.name)', async () => {
    // Type: happy_path
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ name: 'Updated Clinic Name' })
      .expect(200)

    // Verify tenant name updated
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    expect(tenant?.name).toBe('Updated Clinic Name')
  })

  test('settings-06: Update appointment slot', async () => {
    // Type: happy_path
    const res = await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ defaultSlotMinutes: 45 })
      .expect(200)

    expect(res.body.data.defaultSlotMinutes).toBe(45)
  })

  test('settings-07: Toggle SMS reminders off', async () => {
    // Type: happy_path
    const res = await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ smsRemindersEnabled: false })
      .expect(200)

    expect(res.body.data.smsRemindersEnabled).toBe(false)
  })

  test('settings-08: Toggle LINE reminders off', async () => {
    // Type: happy_path
    const res = await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ lineRemindersEnabled: false })
      .expect(200)

    expect(res.body.data.lineRemindersEnabled).toBe(false)
  })

  test('settings-08b: Update idle timeout minutes', async () => {
    // Type: happy_path
    const res = await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ idleTimeoutMinutes: 30 })
      .expect(200)

    expect(res.body.data.idleTimeoutMinutes).toBe(30)
  })

  test('settings-08c: Idle timeout below 5 → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ idleTimeoutMinutes: 4 })
      .expect(400)
  })

  test('settings-08d: Idle timeout above 120 → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ idleTimeoutMinutes: 121 })
      .expect(400)
  })

  test('settings-09: Invalid slot duration (too small) → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ defaultSlotMinutes: 2 })  // min is 5
      .expect(400)
  })

  test('settings-10: Invalid time format → 400', async () => {
    // Type: edge_case / input validation
    await request(server)
      .put('/admin/settings')
      .set('Authorization', adminToken())
      .send({ workStartTime: '8:00' })  // must be HH:MM
      .expect(400)
  })

  test('settings-11: Staff on PUT /admin/settings → 403', async () => {
    // Type: security / RBAC
    const staffTok = `Bearer ${signToken({ userId: 99999, tenantId, plane: 'clinic', permSetVersion: 1, role: 'staff' })}`
    await request(server)
      .put('/admin/settings')
      .set('Authorization', staffTok)
      .send({ phone: '0000000000' })
      .expect(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('admin-1.4 — GET /admin/usage', () => {

  test('settings-12: Returns all required usage fields', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.success).toBe(true)
    const d = res.body.data
    expect(d).toHaveProperty('totalPets')
    expect(d).toHaveProperty('totalOwners')
    expect(d).toHaveProperty('totalUsers')
    expect(d).toHaveProperty('activeUsers')
    expect(d).toHaveProperty('appointmentsThisMonth')
    expect(d).toHaveProperty('appointmentsToday')
    expect(d).toHaveProperty('invoicesThisMonth')
    expect(d).toHaveProperty('planTier')
  })

  test('settings-13: totalUsers ≥ activeUsers (logical constraint)', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(res.body.data.activeUsers)
  })

  test('settings-14: Usage values are non-negative numbers', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', adminToken())
      .expect(200)

    const numericFields = ['totalPets', 'totalOwners', 'totalUsers', 'activeUsers', 'appointmentsThisMonth', 'appointmentsToday', 'invoicesThisMonth']
    numericFields.forEach(f => {
      expect(typeof res.body.data[f]).toBe('number')
      expect(res.body.data[f]).toBeGreaterThanOrEqual(0)
    })
  })

  test('settings-15: Doctor on GET /admin/usage → 403', async () => {
    // Type: security / RBAC
    await request(server)
      .get('/admin/usage')
      .set('Authorization', doctorToken())
      .expect(403)
  })

  test('settings-16: Empty resource list returns 0 counts, not null or 404', async () => {
    // Given: fresh tenant with only 1 admin user, no pets/owners/appts/invoices
    // When:  GET /admin/usage
    // Then:  counts are 0 (not null, not undefined, not 404)
    // Type:  edge_case (qa-protocols §4 "Empty list")
    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', adminToken())
      .expect(200)

    // New tenant has 0 pets, 0 owners — confirm they are numeric 0
    expect(res.body.data.totalPets).toBe(0)
    expect(res.body.data.totalOwners).toBe(0)
  })

  test('settings-17: /admin/usage returns real caps from the clinic-plane quota resolver', async () => {
    // Type: happy_path
    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data).toHaveProperty('caps')
    expect(res.body.data.caps).toHaveProperty('maxUsers')
    expect(res.body.data.caps).toHaveProperty('maxBranches')
    expect(res.body.data.caps).toHaveProperty('maxOwners')
    expect(res.body.data.caps).toHaveProperty('maxPets')
  })

  test('settings-18: /admin/usage caps reflect a tenant_quotas override, not the plan default', async () => {
    // Type: happy_path
    await prisma.tenantQuota.upsert({
      where: { tenantId },
      update: { maxUsers: 10 },
      create: { tenantId, maxUsers: 10 },
    })

    const res = await request(server)
      .get('/admin/usage')
      .set('Authorization', adminToken())
      .expect(200)

    expect(res.body.data.caps.maxUsers).toBe(10)

    await prisma.tenantQuota.delete({ where: { tenantId } }).catch(() => {})
  })
})
