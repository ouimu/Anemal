/**
 * Clinic-plane password management (PWD-1/PWD-2/PWD-3, brainstorm §4).
 *
 *   PWD-1  POST  /auth/change-password              (self-service)
 *   PWD-2  PATCH /users/:id/password                 (admin resets staff/doctor/peer-admin)
 *   PWD-3  refresh-token revocation on both flows above (platform-reset retrofit
 *          is asserted in platform-customer-admin-users.test.ts, same file as CO-5)
 */
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'
import app from '../../app'

const prisma = new PrismaClient()
let server: Server

const SFX = `pw${Date.now().toString(36)}`
const createdTenantIds: number[] = []

async function makeTenantWithAdmin(subdomainSuffix: string, adminPassword: string) {
  const tenant = await prisma.tenant.create({ data: { name: `PW Test ${subdomainSuffix}`, subdomain: `pw-test-${subdomainSuffix}-${SFX}` } })
  createdTenantIds.push(tenant.id)
  // PROV-1 parity: real Platform-Console tenants always have a Branch now.
  // This fixture creates the tenant directly (bypassing createCustomer()), so
  // it must create one too, or PWD-2's makeStaffUser (which assigns a staff
  // user to a branch for two-step login) has nothing to assign to.
  await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main Branch' } })
  const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const passwordHash = await bcrypt.hash(adminPassword, 4)
  const admin = await prisma.user.create({
    data: { tenantId: tenant.id, username: 'pwadmin', name: 'PW Admin', passwordHash, roleId: clinicAdminRole.id, isActive: true },
  })
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: admin.id, roleId: clinicAdminRole.id } })
  return { tenant, admin }
}

async function loginAdmin(subdomain: string, password: string) {
  const res = await request(server).post('/auth/login').send({ subdomain, username: 'pwadmin', password })
  expect(res.status).toBe(200)
  return { token: res.body.data.token as string, refreshToken: res.body.data.refreshToken as string }
}

let platformToken: string

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  const platformRes = await request(server).post('/platform/auth/login').send({
    email: process.env.PLATFORM_ADMIN_EMAIL || 'admin@anemal.app',
    password: process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!',
  })
  platformToken = platformRes.body.data?.token
})

afterAll(async () => {
  if (createdTenantIds.length) {
    await prisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.userBranch.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.refreshToken.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.branch.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// ─────────────────────────────────────────────────────────────────────────────
// PWD-1 — POST /auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
describe('PWD-1: POST /auth/change-password', () => {
  it('✅ correct current password → 204; new password works on next login; old refresh token rejected', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1a', 'OldPass1!')
    const { token, refreshToken } = await loginAdmin(tenant.subdomain, 'OldPass1!')

    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPass1!', newPassword: 'NewPass1!' })
    expect(res.status).toBe(204)

    const relogin = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'pwadmin', password: 'NewPass1!' })
    expect(relogin.status).toBe(200)

    const refreshAttempt = await request(server).post('/auth/refresh').send({ refreshToken })
    expect(refreshAttempt.status).toBe(401)
  })

  it('❌ wrong current password → 401; hash unchanged (old password still logs in)', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1b', 'OldPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'OldPass1!')

    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass1!', newPassword: 'NewPass1!' })
    expect(res.status).toBe(401)

    const stillWorks = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'pwadmin', password: 'OldPass1!' })
    expect(stillWorks.status).toBe(200)
  })

  it('❌ 422 when newPassword is shorter than 8 characters', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1c', 'OldPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'OldPass1!')

    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPass1!', newPassword: 'short1' })
    expect(res.status).toBe(422)
  })

  it('❌ 403 with a platform-plane token (plane guard)', async () => {
    const res = await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ currentPassword: 'x', newPassword: 'NewPass1!' })
    expect(res.status).toBe(403)
  })

  it('❌ 401 with no token', async () => {
    const res = await request(server).post('/auth/change-password').send({ currentPassword: 'x', newPassword: 'NewPass1!' })
    expect(res.status).toBe(401)
  })

  it('never logs the plaintext password on a failed attempt', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd1d', 'OldPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'OldPass1!')
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPass1!', newPassword: 'SuperSecretNew1!' })

    const loggedText = consoleSpy.mock.calls.flat().map(String).join('\n')
    expect(loggedText).not.toContain('SuperSecretNew1!')
    consoleSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PWD-2 — PATCH /users/:id/password
// ─────────────────────────────────────────────────────────────────────────────
describe('PWD-2: PATCH /users/:id/password', () => {
  async function makeStaffUser(tenantId: number, username: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 4)
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    const staff = await prisma.user.create({ data: { tenantId, username, name: 'Staffer', passwordHash, roleId: staffRole.id, isActive: true } })
    await prisma.userRole.create({ data: { tenantId, userId: staff.id, roleId: staffRole.id } })
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    await prisma.userBranch.create({ data: { tenantId, userId: staff.id, branchId: branch.id } })
    return staff
  }

  it('✅ admin resets a staff password; target refresh tokens revoked; staff logs in with new password', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd2a', 'AdminPass1!')
    const { token: adminToken } = await loginAdmin(tenant.subdomain, 'AdminPass1!')
    const staff = await makeStaffUser(tenant.id, 'staffer2a', 'StaffOld1!')

    // Log staff in first to get a refresh token to prove revocation.
    const staffLogin1 = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'staffer2a', password: 'StaffOld1!' })
    const staffBranchId = staffLogin1.body.data.branches[0].id
    const staffStep2 = await request(server).post('/auth/select-branch').send({ pendingToken: staffLogin1.body.data.pendingToken, branchId: staffBranchId })
    const staffRefreshToken = staffStep2.body.data.refreshToken

    const res = await request(server)
      .patch(`/users/${staff.id}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'StaffNew1!' })
    expect(res.status).toBe(204)

    const refreshAttempt = await request(server).post('/auth/refresh').send({ refreshToken: staffRefreshToken })
    expect(refreshAttempt.status).toBe(401)

    const relogin = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'staffer2a', password: 'StaffNew1!' })
    expect(relogin.status).toBe(200)
  })

  it('✅ admin resets ANOTHER clinic_admin (peer) — Q-G1 allow', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd2b', 'AdminAPass1!')
    const { token: adminAToken } = await loginAdmin(tenant.subdomain, 'AdminAPass1!')

    const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
    const passwordHash = await bcrypt.hash('AdminBPass1!', 4)
    const adminB = await prisma.user.create({ data: { tenantId: tenant.id, username: 'peeradmin', name: 'Peer Admin', passwordHash, roleId: clinicAdminRole.id, isActive: true } })
    await prisma.userRole.create({ data: { tenantId: tenant.id, userId: adminB.id, roleId: clinicAdminRole.id } })

    const res = await request(server)
      .patch(`/users/${adminB.id}/password`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ newPassword: 'AdminBNew1!' })
    expect(res.status).toBe(204)
  })

  it('✅ admin resets own password via this route (Q-G2 — no current-password check)', async () => {
    const { tenant, admin } = await makeTenantWithAdmin('pwd2c', 'SelfOld1!')
    const { token } = await loginAdmin(tenant.subdomain, 'SelfOld1!')

    const res = await request(server)
      .patch(`/users/${admin.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'SelfNew1!' })
    expect(res.status).toBe(204)
  })

  it('❌ 404 when :id belongs to a different tenant (BOLA — ADR-0014 precedent, not 403)', async () => {
    const { tenant: tenantA } = await makeTenantWithAdmin('pwd2d1', 'AdminAPass1!')
    const { admin: adminB } = await makeTenantWithAdmin('pwd2d2', 'AdminBPass1!')
    const { token: tokenA } = await loginAdmin(tenantA.subdomain, 'AdminAPass1!')

    const res = await request(server)
      .patch(`/users/${adminB.id}/password`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ newPassword: 'CrossTenant1!' })
    expect(res.status).toBe(404)
  })

  it('❌ 403 when caller lacks staff.manage (a staff-role token)', async () => {
    const { tenant } = await makeTenantWithAdmin('pwd2e', 'AdminPass1!')
    const staff = await makeStaffUser(tenant.id, 'staffer2e', 'StaffPass1!')
    const staffLogin1 = await request(server).post('/auth/login').send({ subdomain: tenant.subdomain, username: 'staffer2e', password: 'StaffPass1!' })
    const staffStep2 = await request(server).post('/auth/select-branch').send({ pendingToken: staffLogin1.body.data.pendingToken, branchId: staffLogin1.body.data.branches[0].id })
    const staffToken = staffStep2.body.data.token

    const res = await request(server)
      .patch(`/users/${staff.id}/password`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ newPassword: 'ShouldFail1!' })
    expect(res.status).toBe(403)
  })

  it('❌ 403 with a platform-plane token (plane guard)', async () => {
    const { admin } = await makeTenantWithAdmin('pwd2f', 'AdminPass1!')
    const res = await request(server)
      .patch(`/users/${admin.id}/password`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ newPassword: 'ShouldFail1!' })
    expect(res.status).toBe(403)
  })

  it('❌ 422 when newPassword is shorter than 8 characters', async () => {
    const { tenant, admin } = await makeTenantWithAdmin('pwd2g', 'AdminPass1!')
    const { token } = await loginAdmin(tenant.subdomain, 'AdminPass1!')
    const res = await request(server)
      .patch(`/users/${admin.id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'short1' })
    expect(res.status).toBe(422)
  })
})
