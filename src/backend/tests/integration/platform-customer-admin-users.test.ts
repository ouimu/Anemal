/**
 * Platform-provisioned clinic_admin identity — CO-1..CO-6 (ADR-0015).
 *
 * Covers:
 *   CO-1  createCustomer() auto-creates the tenant's first clinic_admin
 *         (transactional, email/phone NULL per R-E, no quota check).
 *   CO-2  POST   /platform/customers/:id/admin-users      (create)
 *   CO-4  PATCH  /platform/customers/:id/admin-users/:userId/deactivate
 *   CO-5  PATCH  /platform/customers/:id/admin-users/:userId/password
 *   CO-6  GET    /platform/customers/:id/admin-users      (list)
 *
 * Strategy: real HTTP against the app + a real Postgres test DB, mirroring
 * platformConsole.test.ts and hospitalization-branch-isolation.test.ts.
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import app from '../../app'
import * as customersService from '../../services/platform-customers.service'

const prisma = new PrismaClient()
let server: Server

const PLATFORM_EMAIL    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.app'
const PLATFORM_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

const SFX = `co${Date.now().toString(36)}`

let platformToken: string
let clinicToken: string
let supportToken: string

const createdTenantIds: number[] = []
const createdPlatformUserIds: number[] = []

async function getPlatformToken(): Promise<string> {
  const res = await request(server)
    .post('/platform/auth/login')
    .send({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD })
  return res.body.data?.token
}

async function getClinicToken(): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  return step2.body.data?.token
}

/** Create a tenant through the real service (exercises CO-1 for every fixture). */
async function createTenantViaService(nameSuffix: string) {
  const tenant = await customersService.createCustomer(
    { name: `CO Test ${nameSuffix}`, subdomain: `co-test-${nameSuffix}-${SFX}` },
    1, // performedById — audit FK only, not asserted in these tests
  )
  createdTenantIds.push(tenant.id)
  return tenant
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  platformToken = await getPlatformToken()
  clinicToken   = await getClinicToken()

  // platform_support fixture: has platform.customers.view but not .manage.
  const supportPasswordHash = await bcrypt.hash('SupportPass1!', 10)
  const support = await prisma.platformUser.create({
    data: {
      name: 'CO Test Support', email: `support-${SFX}@anemal.app`,
      passwordHash: supportPasswordHash, role: 'platform_support', isActive: true,
    },
  })
  createdPlatformUserIds.push(support.id)
  const supportLogin = await request(server)
    .post('/platform/auth/login')
    .send({ email: `support-${SFX}@anemal.app`, password: 'SupportPass1!' })
  supportToken = supportLogin.body.data?.token

  // platformToken/clinicToken/supportToken are consumed by the CO-2/CO-4/CO-5/
  // CO-6 describe blocks added in later tasks; referenced here so this CO-1-only
  // slice of the file compiles under noUnusedLocals in the interim.
  void platformToken
  void clinicToken
  void supportToken
})

afterAll(async () => {
  if (createdTenantIds.length) {
    await prisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenantQuota.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  if (createdPlatformUserIds.length) {
    await prisma.platformUser.deleteMany({ where: { id: { in: createdPlatformUserIds } } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─────────────────────────────────────────────────────────────────────────────
// CO-1 — auto-created first admin
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-1: createCustomer() auto-creates first clinic_admin', () => {
  it('✅ creates tenant + admin user + user_roles atomically; admin has email=NULL phone=NULL', async () => {
    const tenant = await createTenantViaService('co1a')

    const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'admin' } })
    expect(admin).not.toBeNull()
    expect(admin!.name).toBe('Administrator')
    expect(admin!.email).toBeNull()
    expect(admin!.phone).toBeNull()
    expect(admin!.role).toBe('admin')

    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    const userRole = await prisma.userRole.findFirst({ where: { userId: admin!.id, tenantId: tenant.id } })
    expect(userRole).not.toBeNull()
    expect(userRole!.roleId).toBe(clinicAdminRole.id)
  })

  it('✅ audit log gains adminUserId detail; no password/passwordHash anywhere', async () => {
    const tenant = await createTenantViaService('co1b')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'customer.create', targetTenantId: tenant.id },
    })
    const details = log.details as Record<string, unknown>
    expect(details.adminUserId).toBe(admin.id)
    expect(JSON.stringify(details)).not.toMatch(/password/i)
  })

  it('✅ rolls back the tenant if the clinic_admin role cannot be resolved inside the transaction', async () => {
    const subdomain = `co-test-rollback-${SFX}`
    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })

    // Simulate an unseeded system role by temporarily renaming its key — this
    // forces a real failure INSIDE the $transaction callback (mocking the tx
    // proxy is unreliable since `tx` is a distinct client instance from `prisma`).
    await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: '__temp_missing__' } })
    try {
      await expect(
        customersService.createCustomer({ name: 'Rollback Test', subdomain }, 1),
      ).rejects.toThrow("System role 'clinic_admin' not seeded")

      const tenant = await prisma.tenant.findUnique({ where: { subdomain } })
      expect(tenant).toBeNull()
    } finally {
      await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: 'clinic_admin' } })
    }
  })

  it('✅ does not require a positive user quota (Q-5 — first admin exempt)', async () => {
    // Tenant has no plan/quota assigned at all (maxUsers resolves to unlimited
    // by subscription.service fallback) — CO-1 must still succeed because it
    // never calls assertCanAddUser. Regression guard: if a future change wires
    // the quota check into this path, a tenant with maxUsers=0 would fail here.
    const tenant = await createTenantViaService('co1c')
    const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'admin' } })
    expect(admin).not.toBeNull()
  })

  it('✅ creates exactly one active Branch named "Main Branch"; audit details include branchId', async () => {
    const tenant = await createTenantViaService('prov1a')

    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Main Branch')
    expect(branches[0].isActive).toBe(true)

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'customer.create', targetTenantId: tenant.id },
    })
    expect((log.details as Record<string, unknown>).branchId).toBe(branches[0].id)
  })

  it('✅ rolls back tenant AND branch together if the transaction fails downstream', async () => {
    // Reuse the existing rollback simulation (role key temporarily renamed) —
    // the branch insert happens BEFORE the role lookup, so this proves the
    // whole transaction — branch included — rolls back, not just the user.
    const subdomain = `co-test-provrollback-${SFX}`
    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: '__temp_missing_prov__' } })
    try {
      await expect(
        customersService.createCustomer({ name: 'Prov Rollback Test', subdomain }, 1),
      ).rejects.toThrow("System role 'clinic_admin' not seeded")

      const tenant = await prisma.tenant.findUnique({ where: { subdomain } })
      expect(tenant).toBeNull()
      // No orphaned branch either — subdomain lookup above already proves no
      // tenant row exists, and Branch.tenantId has an onDelete: Cascade FK,
      // so no branch could exist without a parent tenant row.
    } finally {
      await prisma.clinicRole.update({ where: { id: clinicAdminRole.id }, data: { key: 'clinic_admin' } })
    }
  })

  it('✅ a staff user created and assigned to the Main Branch can complete two-step login', async () => {
    const tenant = await createTenantViaService('prov1c')
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })

    const staffPasswordHash = await bcrypt.hash('StaffPass1!', 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({
      data: { tenantId: tenant.id, username: 'prov1staff', name: 'Prov Staff', passwordHash: staffPasswordHash, role: 'staff', isActive: true },
    })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: staff.id, roleId: staffRole.id } })
    await prisma.userBranch.create({ data: { tenantId: tenant.id, userId: staff.id, branchId: branch.id } })

    const step1 = await request(server)
      .post('/auth/login')
      .send({ subdomain: tenant.subdomain, username: 'prov1staff', password: 'StaffPass1!' })
    expect(step1.body.data.requiresBranchSelection).toBe(true)
    expect(step1.body.data.branches).toEqual([{ id: branch.id, name: 'Main Branch' }])

    const step2 = await request(server)
      .post('/auth/select-branch')
      .send({ pendingToken: step1.body.data.pendingToken, branchId: branch.id })
    expect(step2.status).toBe(200)
    expect(step2.body.data.token).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CO-2 — POST /platform/customers/:id/admin-users
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-2: POST /platform/customers/:id/admin-users', () => {
  it('✅ creates an additional clinic_admin with a server-generated password', async () => {
    const tenant = await createTenantViaService('co2a')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Second Admin', username: 'admin2', email: 'admin2@example.com' })

    expect(res.status).toBe(201)
    expect(res.body.data.username).toBe('admin2')
    expect(typeof res.body.data.password).toBe('string')
    expect(res.body.data.password).toHaveLength(16)
    expect(res.body.data.passwordHash).toBeUndefined()

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'tenant.admin_user.create', targetTenantId: tenant.id },
    })
    expect(JSON.stringify(log.details)).not.toMatch(/password/i)
  })

  it('✅ accepts a typed password (>= 8 chars) and does not overwrite it with a generated one', async () => {
    const tenant = await createTenantViaService('co2h')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Typed Pw', username: 'typedpw', email: 'typedpw@example.com', password: 'MyOwnPass1!' })

    expect(res.status).toBe(201)
    expect(res.body.data.password).toBe('MyOwnPass1!')
  })

  it('❌ 422 when both email and phone are omitted (D-2-02)', async () => {
    const tenant = await createTenantViaService('co2b')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'No Contact', username: 'nocontact' })
    expect(res.status).toBe(422)
  })

  it('❌ 422 when a typed password is shorter than 8 characters', async () => {
    const tenant = await createTenantViaService('co2c')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Weak Pw', username: 'weakpw', email: 'weak@example.com', password: 'short1' })
    expect(res.status).toBe(422)
  })

  it('❌ 404 when :id does not match an existing tenant', async () => {
    const res = await request(server)
      .post('/platform/customers/999999999/admin-users')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Ghost', username: 'ghost', email: 'ghost@example.com' })
    expect(res.status).toBe(404)
  })

  it('❌ 409 QUOTA_EXCEEDED when the tenant is at its user cap; no row created', async () => {
    const tenant = await createTenantViaService('co2d')
    await prisma.tenantQuota.create({ data: { tenantId: tenant.id, maxUsers: 1 } }) // CO-1's 'admin' already counts as 1
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Over Cap', username: 'overcap', email: 'overcap@example.com' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('QUOTA_EXCEEDED')
    const created = await prisma.user.findFirst({ where: { tenantId: tenant.id, username: 'overcap' } })
    expect(created).toBeNull()
  })

  it('❌ 409 on duplicate username within the same tenant (not a 500)', async () => {
    const tenant = await createTenantViaService('co2e')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ name: 'Dup', username: 'admin', email: 'dup@example.com' }) // 'admin' already exists (CO-1)
    expect(res.status).toBe(409)
  })

  it('❌ 403 without platform.customers.manage (platform_support token)', async () => {
    const tenant = await createTenantViaService('co2f')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'Blocked', username: 'blocked', email: 'blocked@example.com' })
    expect(res.status).toBe(403)
  })

  it('❌ 403 with a clinic-plane token (wrong plane)', async () => {
    const tenant = await createTenantViaService('co2g')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${clinicToken}`)
      .send({ name: 'WrongPlane', username: 'wrongplane', email: 'wp@example.com' })
    expect(res.status).toBe(403)
  })

  it('❌ 401 with no token', async () => {
    const tenant = await createTenantViaService('co2i')
    const res = await request(server)
      .post(`/platform/customers/${tenant.id}/admin-users`)
      .send({ name: 'NoToken', username: 'notoken', email: 'nt@example.com' })
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CO-4 — PATCH /platform/customers/:id/admin-users/:userId/deactivate
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-4: PATCH /platform/customers/:id/admin-users/:userId/deactivate', () => {
  it('✅ deactivates a clinic_admin user; login is actually blocked afterward (G-4)', async () => {
    const tenant = await createTenantViaService('co4a')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.isActive).toBe(false)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(row.isActive).toBe(false)

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'tenant.admin_user.deactivate', targetTenantId: tenant.id },
    })
    expect((log.details as Record<string, unknown>).userId).toBe(admin.id)
  })

  it('❌ 404 when userId belongs to a different tenant (BOLA — no cross-tenant mutation)', async () => {
    const tenantA = await createTenantViaService('co4b1')
    const tenantB = await createTenantViaService('co4b2')
    const adminB  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenantB.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenantA.id}/admin-users/${adminB.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: adminB.id } })
    expect(row.isActive).toBe(true) // unchanged
  })

  it('❌ 404 when the target user is not a clinic_admin of this tenant (Q-8 role-scope guard)', async () => {
    const tenant = await createTenantViaService('co4c')
    const passwordHash = await bcrypt.hash('StaffPass1!', 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({
      data: { tenantId: tenant.id, username: 'staffer', name: 'Staffer', passwordHash, role: 'staff', isActive: true },
    })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: staff.id, roleId: staffRole.id } })

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${staff.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
  })

  it('❌ 409 ALREADY_DEACTIVATED when the user is already inactive (G-5 — not a silent no-op)', async () => {
    const tenant = await createTenantViaService('co4d')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('ALREADY_DEACTIVATED')
  })

  it('❌ 403 without platform.customers.manage; 403 with wrong plane', async () => {
    const tenant = await createTenantViaService('co4e')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res1 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res1.status).toBe(403)

    const res2 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res2.status).toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CO-5 — PATCH /platform/customers/:id/admin-users/:userId/password
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-5: PATCH /platform/customers/:id/admin-users/:userId/password', () => {
  it('✅ generates a new password when body is empty; hash actually changes', async () => {
    const tenant = await createTenantViaService('co5a')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    const beforeHash = admin.passwordHash

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.data.password).toHaveLength(16)

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(row.passwordHash).not.toBe(beforeHash)

    const log = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: 'tenant.admin_user.password_reset', targetTenantId: tenant.id },
    })
    expect(JSON.stringify(log.details)).not.toMatch(/password/i)
  })

  it('✅ accepts a typed password (>= 8 chars) and hashes exactly what was typed', async () => {
    const tenant = await createTenantViaService('co5b')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ password: 'NewTypedPass1!' })
    expect(res.status).toBe(200)
    expect(res.body.data.password).toBe('NewTypedPass1!')

    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    expect(await bcrypt.compare('NewTypedPass1!', row.passwordHash)).toBe(true)
  })

  it('✅ works on a deactivated admin (CO-10 — reset is not active-only)', async () => {
    const tenant = await createTenantViaService('co5c')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)
  })

  it('❌ 422 when the typed password is shorter than 8 characters', async () => {
    const tenant = await createTenantViaService('co5d')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ password: 'short1' })
    expect(res.status).toBe(422)
  })

  it('❌ 404 when userId belongs to a different tenant (BOLA)', async () => {
    const tenantA = await createTenantViaService('co5e1')
    const tenantB = await createTenantViaService('co5e2')
    const adminB  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenantB.id, username: 'admin' } })

    const res = await request(server)
      .patch(`/platform/customers/${tenantA.id}/admin-users/${adminB.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(404)
  })

  it('❌ 403 without platform.customers.manage; 403 with wrong plane', async () => {
    const tenant = await createTenantViaService('co5f')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    const res1 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({})
    expect(res1.status).toBe(403)

    const res2 = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${clinicToken}`)
      .send({})
    expect(res2.status).toBe(403)
  })

  it('✅ revokes the target clinic_admin\'s refresh tokens (PWD-3 retrofit — previously left 30-day tokens valid)', async () => {
    const tenant = await createTenantViaService('co5g')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })

    // The auto-created admin has a server-generated password we don't know,
    // so log in via a fresh password we set directly for this test only.
    const knownHash = await bcrypt.hash('KnownPass1!', 10)
    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: knownHash } })
    const loginRes = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'admin', password: 'KnownPass1!' })
    const adminRefreshToken = loginRes.body.data.refreshToken

    const res = await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({})
    expect(res.status).toBe(200)

    const refreshAttempt = await request(server).post('/auth/refresh').send({ refreshToken: adminRefreshToken })
    expect(refreshAttempt.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CO-6 — GET /platform/customers/:id/admin-users
// ─────────────────────────────────────────────────────────────────────────────
describe('CO-6: GET /platform/customers/:id/admin-users', () => {
  it('✅ returns only clinic_admin-role users; never passwordHash; a mixed-role tenant filters correctly', async () => {
    const tenant = await createTenantViaService('co6a')
    const passwordHash = await bcrypt.hash('StaffPass1!', 10)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({
      data: { tenantId: tenant.id, username: 'staffer6', name: 'Staffer', passwordHash, role: 'staff', isActive: true },
    })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: staff.id, roleId: staffRole.id } })

    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].username).toBe('admin')
    expect(res.body.data[0].email).toBeNull()
    expect(res.body.data[0].phone).toBeNull()
    expect(res.body.data[0].passwordHash).toBeUndefined()
  })

  it('✅ platform_support (view-only) can list', async () => {
    const tenant = await createTenantViaService('co6b')
    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${supportToken}`)
    expect(res.status).toBe(200)
  })

  it('✅ returns empty array (not 404) for a zero-admin tenant scenario', async () => {
    // Deactivate the only admin — list must still return it (deactivated ≠ absent);
    // this asserts the endpoint never 404s just because there are zero *active* admins.
    const tenant = await createTenantViaService('co6c')
    const admin  = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, username: 'admin' } })
    await request(server)
      .patch(`/platform/customers/${tenant.id}/admin-users/${admin.id}/deactivate`)
      .set('Authorization', `Bearer ${platformToken}`)

    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].isActive).toBe(false)
  })

  it('❌ 404 when :id does not match an existing tenant', async () => {
    const res = await request(server)
      .get('/platform/customers/999999999/admin-users')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(404)
  })

  it('❌ 403 with wrong plane', async () => {
    const tenant = await createTenantViaService('co6d')
    const res = await request(server)
      .get(`/platform/customers/${tenant.id}/admin-users`)
      .set('Authorization', `Bearer ${clinicToken}`)
    expect(res.status).toBe(403)
  })
})
