// Phase-1 refactor follow-up (F-1, 2026-09-09) — googleAuthorize/onedriveAuthorize
// had zero test coverage repo-wide before this file. Both handlers call
// settingsSvc.getTenantSubdomain(), the function this refactor extracted from
// an inline `prisma.tenant.findUnique(...)` — this is the first coverage that
// exercises it through a real HTTP request.
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

const SUB_A = `oauth-authorize-a-${Date.now()}`
const PASSWORD = 'TestPass1!'

let server: Server
let tidA = 0
let adminToken = ''
let staffToken = ''

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

  const tA = await prisma.tenant.create({ data: { name: 'OAuth Authorize A', subdomain: SUB_A } })
  tidA = tA.id
  const branchA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main A' } })

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const [adminRole, staffRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
  ])
  await prisma.user.createMany({
    data: [
      { tenantId: tidA, name: 'Admin A', username: 'oauthz_admin_a', email: 'admin@oauthz-a.test', passwordHash, roleId: adminRole.id },
      { tenantId: tidA, name: 'Staff A', username: 'oauthz_staff_a', email: 'staff@oauthz-a.test', passwordHash, roleId: staffRole.id },
    ],
  })
  const [uAdminA, uStaffA] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'oauthz_admin_a' } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'oauthz_staff_a' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdminA.id, tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uStaffA.id, tenantId: tidA, roleKey: 'clinic_staff' },
  ])
  await prisma.userBranch.createMany({
    data: [{ tenantId: tidA, userId: uStaffA.id, branchId: branchA.id }],
    skipDuplicates: true,
  })

  adminToken = await login(SUB_A, 'oauthz_admin_a')
  staffToken = await login(SUB_A, 'oauthz_staff_a')
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tidA])
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: tidA } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tidA } })
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.branch.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('GET /api/settings/clinic/storage-config/google/authorize', () => {
  it('no Authorization header → 401', async () => {
    const res = await request(server).get('/api/settings/clinic/storage-config/google/authorize')
    expect(res.status).toBe(401)
  })

  it('staff (no clinic.integrations.edit) → 403', async () => {
    const res = await request(server)
      .get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })

  it('GOOGLE_OAUTH_CLIENT_ID/SECRET unset → 503, not 500', async () => {
    const savedId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const savedSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    try {
      const res = await request(server)
        .get('/api/settings/clinic/storage-config/google/authorize')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(503)
      expect(res.body.code).toBe('GOOGLE_OAUTH_NOT_CONFIGURED')
    } finally {
      if (savedId) process.env.GOOGLE_OAUTH_CLIENT_ID = savedId
      if (savedSecret) process.env.GOOGLE_OAUTH_CLIENT_SECRET = savedSecret
    }
  })

  it('configured → 200 with a Google consent URL built from the tenant subdomain-derived origin (exercises getTenantSubdomain)', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    try {
      const res = await request(server)
        .get('/api/settings/clinic/storage-config/google/authorize')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const url = new URL(res.body.data.url)
      expect(url.origin).toBe('https://accounts.google.com')
      expect(url.searchParams.get('client_id')).toBe('test-client-id')
      expect(url.searchParams.get('state')).toBeTruthy()
    } finally {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    }
  })
})

describe('GET /api/settings/clinic/storage-config/onedrive/authorize', () => {
  it('no Authorization header → 401', async () => {
    const res = await request(server).get('/api/settings/clinic/storage-config/onedrive/authorize')
    expect(res.status).toBe(401)
  })

  it('staff (no clinic.integrations.edit) → 403', async () => {
    const res = await request(server)
      .get('/api/settings/clinic/storage-config/onedrive/authorize')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(res.status).toBe(403)
  })

  it('ONEDRIVE_OAUTH_CLIENT_ID/SECRET unset → 503, not 500', async () => {
    const savedId = process.env.ONEDRIVE_OAUTH_CLIENT_ID
    const savedSecret = process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
    delete process.env.ONEDRIVE_OAUTH_CLIENT_ID
    delete process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
    try {
      const res = await request(server)
        .get('/api/settings/clinic/storage-config/onedrive/authorize')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(503)
      expect(res.body.code).toBe('ONEDRIVE_OAUTH_NOT_CONFIGURED')
    } finally {
      if (savedId) process.env.ONEDRIVE_OAUTH_CLIENT_ID = savedId
      if (savedSecret) process.env.ONEDRIVE_OAUTH_CLIENT_SECRET = savedSecret
    }
  })

  it('configured → 200 with a Microsoft consent URL built from the tenant subdomain-derived origin (exercises getTenantSubdomain)', async () => {
    process.env.ONEDRIVE_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.ONEDRIVE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    try {
      const res = await request(server)
        .get('/api/settings/clinic/storage-config/onedrive/authorize')
        .set('Authorization', `Bearer ${adminToken}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const url = new URL(res.body.data.url)
      expect(url.searchParams.get('client_id')).toBe('test-client-id')
      expect(url.searchParams.get('state')).toBeTruthy()
    } finally {
      delete process.env.ONEDRIVE_OAUTH_CLIENT_ID
      delete process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
    }
  })
})
