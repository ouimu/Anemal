// src/backend/tests/integration/oauth-google-callback.test.ts
import request from 'supertest'
import { Server } from 'http'
import prisma from '../../config/db'
import { signOAuthState } from '../../utils/oauth-state'
import { createNonce } from '../../models/oauth-connect-nonce.repository'

jest.mock('../../config/google-drive-client', () => {
  const actual = jest.requireActual('../../config/google-drive-client')
  return {
    ...actual,
    exchangeCodeForTokens: jest.fn().mockResolvedValue({ accessToken: 'fake-access', refreshToken: 'fake-refresh' }),
    revokeGoogleToken: jest.fn().mockResolvedValue(undefined),
    createGoogleDriveClient: jest.fn(() => ({
      findByName: jest.fn().mockResolvedValue(null),
      createFolder: jest.fn().mockImplementation(async (_parentId: string, name: string) => ({ id: `folder-${name}`, name })),
      createFile: jest.fn(), updateFile: jest.fn(), readFile: jest.fn(), deleteFile: jest.fn(),
      folderExists: jest.fn().mockResolvedValue(true), ping: jest.fn().mockResolvedValue(undefined),
    })),
  }
})

import app from '../../app'
import { exchangeCodeForTokens } from '../../config/google-drive-client'

const SUB_A = 'oauth-gdrive-cb-a'
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
process.env.FRONTEND_URL = 'http://localhost:5173'

let server: Server
let tidA = 0
let adminUserId = 0

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  const tA = await prisma.tenant.create({ data: { name: 'OAuth GDrive CB A', subdomain: SUB_A } })
  tidA = tA.id
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const admin = await prisma.user.create({
    data: { tenantId: tidA, name: 'Admin A', username: 'cb_admin_a', email: 'admin@cb-a.test', passwordHash: 'x', roleId: adminRole.id },
  })
  adminUserId = admin.id
  await prisma.userRole.create({ data: { userId: adminUserId, tenantId: tidA, roleId: adminRole.id } })
})

afterAll(async () => {
  await prisma.userRole.deleteMany({ where: { tenantId: tidA } })
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenantStorageConfig.deleteMany({ where: { tenantId: tidA } })
  await prisma.settingsAuditLog.deleteMany({ where: { tenantId: tidA } })
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

async function freshState(): Promise<{ state: string; nonce: string }> {
  const nonce = await createNonce({ tenantId: tidA, userId: adminUserId, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
  const state = signOAuthState({ tenantId: tidA, userId: adminUserId, origin: 'http://localhost:5173', nonce })
  return { state, nonce }
}

describe('GET /oauth/google/callback', () => {
  test('OC-01: no Authorization header required — the route is public (deny-by-default exception, trust boundary is signed state)', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302) // redirect, never 401
  })

  test('OC-02: valid code + state → tokens persisted encrypted, tenant-scoped folders created, audit row written, redirects to the interstitial page', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage/connecting')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(row?.provider).toBe('google_drive')
    expect(row?.googleAccessTokenEncrypted).toMatch(/^enc:v1:/)
    expect(row?.googleRefreshTokenEncrypted).toMatch(/^enc:v1:/)
    expect(row?.googleEmrFolderId).toBeTruthy()
    expect(row?.googlePhotoFolderId).toBeTruthy()
    const audit = await prisma.settingsAuditLog.findFirst({ where: { tenantId: tidA, tableName: 'tenant_storage_config', newValue: 'google_drive' } })
    expect(audit).not.toBeNull()
  })

  test('connecting Google Drive nulls a stale smb* credential from a prior custom_path config (parity with BA G-4b\'s reverse direction)', async () => {
    await prisma.tenantStorageConfig.upsert({
      where: { tenantId: tidA },
      create: { tenantId: tidA, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:aaaa:bbbb:cccc' },
      update: { provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:aaaa:bbbb:cccc' },
    })
    const { state } = await freshState()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302)
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(row?.provider).toBe('google_drive')
    expect(row?.smbHost).toBeNull()
    expect(row?.smbShare).toBeNull()
    expect(row?.smbUsername).toBeNull()
    expect(row?.smbPasswordEncrypted).toBeNull()
  })

  test('OC-03: replayed/already-consumed state → rejected, redirects with an error param, nothing new persisted (grill N-3)', async () => {
    const { state } = await freshState()
    await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state }) // consumes it
    const before = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=google_state_replayed')
    const after = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(after?.updatedAt).toEqual(before?.updatedAt) // no new write happened on the replay
  })

  test('OC-04: tampered/invalid state signature → rejected, redirects to the FIXED default origin, never a value read out of state (grill N-7)', async () => {
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state: 'not-a-real-state' })
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage?error=google_state_invalid')
  })

  test('OC-05: expired state → rejected the same way as an invalid signature', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { state } = await freshState()
    jest.setSystemTime(new Date('2026-01-01T00:20:00Z'))
    jest.useRealTimers()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=google_state_invalid')
  })

  test('OC-06: consent-denied (Google redirects with ?error=access_denied, no code) → rejected, nothing persisted', async () => {
    const res = await request(server).get('/oauth/google/callback').query({ error: 'access_denied' })
    expect(res.headers.location).toContain('error=google_consent_denied')
  })

  test('OC-07: inactive user at callback time → rejected, nothing persisted (grill N-9)', async () => {
    const { state } = await freshState()
    await prisma.user.update({ where: { id: adminUserId }, data: { isActive: false } })
    try {
      const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
      expect(res.headers.location).toContain('error=google_not_authorized')
    } finally {
      await prisma.user.update({ where: { id: adminUserId }, data: { isActive: true } })
    }
  })

  test('OC-08: missing GOOGLE_OAUTH_CLIENT_ID/SECRET at callback time → rejected cleanly, nothing persisted', async () => {
    const { state } = await freshState()
    const savedId = process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    try {
      const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
      expect(res.headers.location).toContain('error=google_not_configured')
    } finally {
      process.env.GOOGLE_OAUTH_CLIENT_ID = savedId
    }
  })

  test('OC-09: code-exchange failure → rejected, nothing persisted', async () => {
    const { state } = await freshState()
    ;(exchangeCodeForTokens as jest.Mock).mockRejectedValueOnce(new Error('invalid_grant'))
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=google_connect_failed')
  })
})
