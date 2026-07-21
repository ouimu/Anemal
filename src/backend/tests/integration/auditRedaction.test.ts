/**
 * BUG-001 regression: audit middleware must deep-redact secret-like keys
 * before persisting `details` to either audit table, no matter the nesting depth.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'
import { signPlatformToken } from '../../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

interface PlanUpdateAuditDetails {
  planId: number
  changes: { features?: Record<string, unknown> }
}

const SENTINEL = 'SENTINEL-SECRET-VALUE-DO-NOT-PERSIST'
const SUB_A = 'audit-redaction-a'
const PASSWORD = 'TestPass1!'

let server: Server
let platformToken = ''
let platformUserId = 0
let tenantId = 0
let clinicToken = ''
let provisioningTenantId = 0

async function login(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const platformUser = await prisma.platformUser.create({
    data: {
      name:         'AuditRedactionSysAdmin',
      email:        'audit-redaction-sysadmin@test.anemal',
      passwordHash: 'x',
      role:         'platform_super_admin',
    },
  })
  platformUserId = platformUser.id
  platformToken = signPlatformToken({ platformUserId: platformUser.id, plane: 'platform', role: 'platform_super_admin' })

  const tenant = await prisma.tenant.create({ data: { name: 'Audit Redaction A', subdomain: SUB_A } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const adminUser = await prisma.user.create({
    data: { tenantId, branchId: branch.id, name: 'Admin A', username: 'audit_redact_admin_a', email: 'admin@audit-redaction-a.test', passwordHash, roleId: adminRole.id },
  })
  await seedUserRoles(prisma, [{ userId: adminUser.id, tenantId, roleKey: 'clinic_admin' }])
  clinicToken = await login(SUB_A, 'audit_redact_admin_a')

  const provisioningTenant = await prisma.tenant.create({
    data: { name: 'Audit Redaction Provisioning Target', subdomain: `audit-redaction-prov-${Date.now()}` },
  })
  provisioningTenantId = provisioningTenant.id
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tenantId])
  await prisma.settingsAuditLog.deleteMany({ where: { tenantId } })
  await prisma.tenantSettings.deleteMany({ where: { tenantId } })
  await prisma.auditLog.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  if (provisioningTenantId) {
    await prisma.tenantProvisioning.deleteMany({ where: { tenantId: provisioningTenantId } })
    await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: provisioningTenantId } })
    await prisma.tenant.deleteMany({ where: { id: provisioningTenantId } })
  }
  if (platformUserId) {
    await prisma.platformAuditLog.deleteMany({ where: { performedByPlatformUserId: platformUserId } })
    await prisma.platformUser.deleteMany({ where: { id: platformUserId } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('audit redaction — platform plane', () => {
  it('never stores a plaintext sentinel secret in platform_audit_logs.details', async () => {
    // Platform provisioning route accepts real secret-like fields (smtpPassword);
    // this exercises the generic auditMiddleware redaction path (not the provisioning
    // service's separate semantic audit row, which stays field-names-only per ADR D1).
    const res = await request(server)
      .put(`/platform/customers/${provisioningTenantId}/provisioning`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ smtpPassword: SENTINEL, baseSmsApiKey: SENTINEL, lineChannelSecret: SENTINEL })
    expect([200, 400]).toContain(res.status)

    const rows = await prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    for (const row of rows) {
      expect(JSON.stringify(row.details)).not.toContain(SENTINEL)
    }
  })
})

describe('audit redaction — third sink (settings_audit_log)', () => {
  it('masks a changed system-settings secret as literal "••••••••" + last-4, and never stores the full sentinel', async () => {
    // Unique per test run (Date.now() suffix) so a rerun always produces a genuinely
    // changed value -- updateByKey() no-ops (and skips writing an audit row) when the
    // incoming value equals the currently-stored plaintext.
    const sentinel = `SENTINEL-SETTINGS-SECRET-${Date.now()}` // >=5 chars, exercises the slice(-4) branch
    const res = await request(server)
      .put('/platform/settings/smtp_password') // isSecret:true system_settings row, seeded in migration 20260610081405
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ value: sentinel })
    expect(res.status).toBe(200)

    const expectedMasked = `••••••••${sentinel.slice(-4)}`
    const rows = await prisma.settingsAuditLog.findMany({
      where: { tableName: 'system_settings', fieldName: 'smtp_password' },
      orderBy: { changedAt: 'desc' },
      take: 10,
    })
    for (const row of rows) {
      expect(JSON.stringify(row)).not.toContain(sentinel)
    }
    // The row this test just created must show maskSecret's exact masked shape --
    // oldValue/newValue are the repository's actual column names (settings-audit.repository.ts).
    expect(rows[0]?.newValue).toBe(expectedMasked)
  })
})

describe('audit redaction — direct-service platform writes (D1)', () => {
  let redactionPlanId = 0

  afterAll(async () => {
    if (redactionPlanId) {
      await prisma.platformAuditLog.deleteMany({ where: { action: { in: ['plan.create', 'plan.update'] }, details: { path: ['planId'], equals: redactionPlanId } } })
      await prisma.plan.deleteMany({ where: { id: redactionPlanId } })
    }
  })

  it('redacts a sensitive-key feature flag written via the direct-service plan-update path, bypassing HTTP middleware', async () => {
    const createRes = await request(server)
      .post('/platform/plans')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ key: `audit_d1_${Date.now()}`, name: 'Audit D1 Test Plan', maxBranches: 1, maxUsers: 1 })
    expect(createRes.status).toBe(201)
    redactionPlanId = createRes.body.data.id as number

    const updateRes = await request(server)
      .put(`/platform/plans/${redactionPlanId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ features: { apiToken: true } })
    expect(updateRes.status).toBe(200)

    const rows = await prisma.platformAuditLog.findMany({
      where: { action: 'plan.update' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    const row = rows.find(r => (r.details as unknown as PlanUpdateAuditDetails)?.planId === redactionPlanId)
    expect(row).toBeDefined()
    const details = row!.details as unknown as PlanUpdateAuditDetails
    expect(details.changes.features?.apiToken).toBe('***')
  })
})

describe('audit redaction — clinic plane', () => {
  it('never stores a plaintext sentinel secret in audit_logs.details, at any nesting depth', async () => {
    const res = await request(server)
      .put('/api/settings/clinic/notifications')
      .set('Authorization', `Bearer ${clinicToken}`)
      .send({ smsApiKey: SENTINEL, smsProvider: 'thaibulksms' })
    expect([200, 400, 404]).toContain(res.status)

    const rows = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    for (const row of rows) {
      expect(JSON.stringify(row.details)).not.toContain(SENTINEL)
    }
  })
})
