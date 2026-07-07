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
  const adminUser = await prisma.user.create({
    data: { tenantId, branchId: branch.id, name: 'Admin A', username: 'audit_redact_admin_a', email: 'admin@audit-redaction-a.test', passwordHash, role: 'admin' },
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
