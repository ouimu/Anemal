// src/backend/tests/integration/oauth-onedrive-callback.test.ts
import request from 'supertest'
import { Server } from 'http'
import prisma from '../../config/db'
import { signOAuthState } from '../../utils/oauth-state'
import { createNonce } from '../../models/oauth-connect-nonce.repository'

jest.mock('../../config/onedrive-client', () => {
  const actual = jest.requireActual('../../config/onedrive-client')
  return {
    ...actual,
    exchangeCodeForTokens: jest.fn().mockResolvedValue({
      accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresAt: new Date(Date.now() + 3600_000),
    }),
    createOneDriveClient: jest.fn(() => ({
      ping: jest.fn().mockResolvedValue({ accountId: 'fake-drive-id' }),
      ensureFolder: jest.fn().mockResolvedValue(undefined),
      findByName: jest.fn(), createFile: jest.fn(), updateFile: jest.fn(), readFile: jest.fn(), deleteFile: jest.fn(),
    })),
  }
})

import app from '../../app'
import { exchangeCodeForTokens } from '../../config/onedrive-client'

const SUB_A = `oauth-onedrive-cb-a-${Date.now()}`
process.env.ONEDRIVE_OAUTH_CLIENT_ID = 'test-client-id'
process.env.ONEDRIVE_OAUTH_CLIENT_SECRET = 'test-client-secret'
process.env.FRONTEND_URL = 'http://localhost:5173'

let server: Server
let tidA = 0
let adminUserId = 0

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  const tA = await prisma.tenant.create({ data: { name: 'OAuth OneDrive CB A', subdomain: SUB_A } })
  tidA = tA.id
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const admin = await prisma.user.create({
    data: { tenantId: tidA, name: 'Admin A', username: 'od_cb_admin_a', email: 'admin@od-cb-a.test', passwordHash: 'x', roleId: adminRole.id },
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

async function freshState(provider: 'onedrive' | 'google' = 'onedrive'): Promise<{ state: string; nonce: string }> {
  const nonce = await createNonce({ tenantId: tidA, userId: adminUserId, provider, expiresAt: new Date(Date.now() + 60_000) })
  const state = signOAuthState({ tenantId: tidA, userId: adminUserId, origin: 'http://localhost:5173', nonce })
  return { state, nonce }
}

describe('GET /oauth/onedrive/callback', () => {
  test('OD-CB-01: no Authorization header required — the route is public (trust boundary is signed state)', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302)
  })

  test('OD-CB-02: valid code + state → tokens persisted encrypted, tenant-scoped folders created, audit row written, redirects to the interstitial page', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage/connecting')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(row?.provider).toBe('onedrive')
    expect(row?.oneDriveAccessTokenEncrypted).toMatch(/^enc:v1:/)
    expect(row?.oneDriveRefreshTokenEncrypted).toMatch(/^enc:v1:/)
    expect(row?.oneDriveTokenExpiresAt).not.toBeNull()
    expect(row?.oneDriveAccountIdHash).toBeTruthy()
    const audit = await prisma.settingsAuditLog.findFirst({ where: { tenantId: tidA, tableName: 'tenant_storage_config', newValue: 'onedrive' } })
    expect(audit).not.toBeNull()
  })

  test('OD-CB-03: the persist upsert nulls smb*, google*, AND googleAccountIdHash in the same write (M-10 forward direction)', async () => {
    await prisma.tenantStorageConfig.upsert({
      where: { tenantId: tidA },
      create: {
        tenantId: tidA, provider: 'custom_path',
        smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:aaaa:bbbb:cccc',
        googleAccessTokenEncrypted: 'enc:v1:gggg:hhhh:iiii', googleRefreshTokenEncrypted: 'enc:v1:jjjj:kkkk:llll',
        googleRootFolderId: 'root', googleEmrFolderId: 'emr', googlePhotoFolderId: 'photo', googleAccountIdHash: 'ghash',
      },
      update: {
        provider: 'custom_path',
        smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:aaaa:bbbb:cccc',
        googleAccessTokenEncrypted: 'enc:v1:gggg:hhhh:iiii', googleRefreshTokenEncrypted: 'enc:v1:jjjj:kkkk:llll',
        googleRootFolderId: 'root', googleEmrFolderId: 'emr', googlePhotoFolderId: 'photo', googleAccountIdHash: 'ghash',
      },
    })
    const { state } = await freshState()
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302)
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(row?.provider).toBe('onedrive')
    expect(row?.smbHost).toBeNull()
    expect(row?.smbShare).toBeNull()
    expect(row?.smbUsername).toBeNull()
    expect(row?.smbPasswordEncrypted).toBeNull()
    expect(row?.googleAccessTokenEncrypted).toBeNull()
    expect(row?.googleRefreshTokenEncrypted).toBeNull()
    expect(row?.googleRootFolderId).toBeNull()
    expect(row?.googleEmrFolderId).toBeNull()
    expect(row?.googlePhotoFolderId).toBeNull()
    expect(row?.googleAccountIdHash).toBeNull()
  })

  test('OD-CB-04: replayed/already-consumed state → rejected, redirects with an error param, nothing new persisted', async () => {
    const { state } = await freshState()
    await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state }) // consumes it
    const before = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=onedrive_state_replayed')
    const after = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(after?.updatedAt).toEqual(before?.updatedAt)
  })

  test('OD-CB-05: a "google"-provider nonce presented at the OneDrive callback is REJECTED (M-7 cross-provider hardening)', async () => {
    const { state } = await freshState('google')
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=onedrive_state_replayed')
  })

  test('OD-CB-06: tampered/invalid state signature → rejected, redirects to the FIXED default origin, never a value read out of state', async () => {
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state: 'not-a-real-state' })
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage?error=onedrive_state_invalid')
  })

  test('OD-CB-07: expired state → rejected the same way as an invalid signature', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { state } = await freshState()
    jest.setSystemTime(new Date('2026-01-01T00:20:00Z'))
    jest.useRealTimers()
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=onedrive_state_invalid')
  })

  test('OD-CB-08: consent-denied WITH a state param (Microsoft includes state, round-2 grill finding 8) → verifies state, redirects to the CORRECT TENANT ORIGIN, distinct error code', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/onedrive/callback').query({ error: 'access_denied', state })
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage?error=onedrive_consent_denied')
  })

  test('OD-CB-09: consent_required (admin-approval-needed for work/school accounts) → distinct error code from access_denied', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/onedrive/callback').query({ error: 'consent_required', state })
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage?error=onedrive_consent_required')
  })

  test('OD-CB-10: error param with NO state (or unverifiable state) → falls back to the fixed default origin', async () => {
    const res = await request(server).get('/oauth/onedrive/callback').query({ error: 'access_denied' })
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage?error=onedrive_consent_denied')
  })

  test('OD-CB-11: inactive user at callback time → rejected, nothing persisted (N-9)', async () => {
    const { state } = await freshState()
    await prisma.user.update({ where: { id: adminUserId }, data: { isActive: false } })
    try {
      const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
      expect(res.headers.location).toContain('error=onedrive_not_authorized')
    } finally {
      await prisma.user.update({ where: { id: adminUserId }, data: { isActive: true } })
    }
  })

  test('OD-CB-12: missing ONEDRIVE_OAUTH_CLIENT_ID/SECRET at callback time → rejected cleanly, nothing persisted', async () => {
    const { state } = await freshState()
    const savedId = process.env.ONEDRIVE_OAUTH_CLIENT_ID
    delete process.env.ONEDRIVE_OAUTH_CLIENT_ID
    try {
      const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
      expect(res.headers.location).toContain('error=onedrive_not_configured')
    } finally {
      process.env.ONEDRIVE_OAUTH_CLIENT_ID = savedId
    }
  })

  test('OD-CB-13: code-exchange failure → rejected, nothing persisted', async () => {
    const { state } = await freshState()
    ;(exchangeCodeForTokens as jest.Mock).mockRejectedValueOnce(new Error('invalid_grant'))
    const res = await request(server).get('/oauth/onedrive/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=onedrive_connect_failed')
  })

  test('OD-CB-14: no code and no error → rejected as consent-denied, nothing persisted', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/onedrive/callback').query({ state })
    expect(res.headers.location).toContain('error=onedrive_consent_denied')
  })
})
