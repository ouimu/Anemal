/**
 * BUG-008 regression: from/to date filters must be pure UTC calendar-day bounds,
 * independent of server wall-clock/local timezone. Uses injected timestamps
 * (not "today") so the test is deterministic regardless of when/where it runs.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'
import { signPlatformToken } from '../../config/jwt'

const SUB_MARKER = `utc-bounds-test-${Date.now()}`
let server: Server
let platformToken = ''
let platformUserId = 0
let tenantId = 0

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const platformUser = await prisma.platformUser.create({
    data: {
      name:         'UtcBoundsSysAdmin',
      email:        'utc-bounds-sysadmin@test.anemal',
      passwordHash: 'x',
      role:         'platform_super_admin',
    },
  })
  platformUserId = platformUser.id
  platformToken = signPlatformToken({ platformUserId: platformUser.id, plane: 'platform', role: 'platform_super_admin' })

  const tenant = await prisma.tenant.create({ data: { name: 'UTC Bounds Test', subdomain: SUB_MARKER } })
  tenantId = tenant.id

  // Insert a platform audit row with an injected createdAt right at a UTC day boundary:
  // 2026-03-10T23:30:00.000Z — this is still "2026-03-10" in UTC but would be
  // "2026-03-11" local time at UTC+7 (the bug this test targets).
  await prisma.platformAuditLog.create({
    data: {
      action: 'tenant.utc-bounds-test',
      targetTenantId: tenantId,
      performedByPlatformUserId: platformUserId,
      createdAt: new Date('2026-03-10T23:30:00.000Z'),
    },
  })
})

afterAll(async () => {
  await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  if (platformUserId) {
    await prisma.platformAuditLog.deleteMany({ where: { performedByPlatformUserId: platformUserId } })
    await prisma.platformUser.deleteMany({ where: { id: platformUserId } })
  }
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('GET /platform/audit — pure UTC date bounds (BUG-008)', () => {
  it('includes a row at 23:30 UTC when from=to=that UTC calendar day', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${tenantId}&from=2026-03-10&to=2026-03-10`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.some((r: { action: string }) => r.action === 'tenant.utc-bounds-test')).toBe(true)
  })

  it('excludes that row when from=to=the next UTC calendar day', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${tenantId}&from=2026-03-11&to=2026-03-11`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.some((r: { action: string }) => r.action === 'tenant.utc-bounds-test')).toBe(false)
  })

  it('rejects a malformed from/to param with 400', async () => {
    const res = await request(server)
      .get(`/platform/audit?from=2026-3-1&to=2026-03-10`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(400)
  })
})
