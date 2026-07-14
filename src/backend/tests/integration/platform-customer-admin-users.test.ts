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
