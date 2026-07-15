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
  const clinicAdminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const passwordHash = await bcrypt.hash(adminPassword, 10)
  const admin = await prisma.user.create({
    data: { tenantId: tenant.id, username: 'pwadmin', name: 'PW Admin', passwordHash, role: 'admin', isActive: true },
  })
  await prisma.userRole.create({ data: { tenantId: tenant.id, userId: admin.id, roleId: clinicAdminRole.id } })
  return { tenant, admin }
}

async function loginAdmin(subdomain: string, password: string) {
  const res = await request(server).post('/auth/login').send({ subdomain, username: 'pwadmin', password })
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
    await prisma.refreshToken.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.user.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
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
