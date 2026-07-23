// src/backend/__tests__/tenant-storage-config.repository.test.ts
// Real-DB test — the grill-N-4 race-safety guarantee is a DB-level
// conditional UPDATE, not something a mocked Prisma client can prove.
import prisma from '../config/db'
import { decryptField } from '../utils/encryption'
import { upsertStorageConfig, writeBackRefreshedGoogleAccessToken } from '../models/tenant-storage-config.repository'

const TENANT_ID = 900002

let tenantCreated = false

beforeEach(async () => {
  if (!tenantCreated) {
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      create: { id: TENANT_ID, name: 'Repo Token Writeback Test', subdomain: 'repo-token-writeback' },
      update: {},
    })
    tenantCreated = true
  }
})

afterEach(async () => {
  await prisma.tenantStorageConfig.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
  await prisma.$disconnect()
})

describe('writeBackRefreshedGoogleAccessToken', () => {
  test('provider=google_drive with a stored refresh token → the new access token is encrypted and persisted', async () => {
    await upsertStorageConfig(TENANT_ID, {
      provider: 'google_drive', googleAccessTokenEncrypted: 'old', googleRefreshTokenEncrypted: 'enc:v1:aaaa:bbbb:cccc',
    })
    await writeBackRefreshedGoogleAccessToken(TENANT_ID, 'brand-new-access-token')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: TENANT_ID } })
    expect(row?.googleAccessTokenEncrypted).toMatch(/^enc:v1:/)
    expect(decryptField(row!.googleAccessTokenEncrypted!)).toBe('brand-new-access-token')
  })

  test('grill N-4: a refresh that completes AFTER a disconnect does not resurrect an encrypted token on the now-local row', async () => {
    await upsertStorageConfig(TENANT_ID, { provider: 'google_drive', googleRefreshTokenEncrypted: 'enc:v1:aaaa:bbbb:cccc' })
    // Simulate the disconnect race: the row switches to local (nulling
    // google columns) BEFORE the in-flight refresh's write-back arrives.
    await upsertStorageConfig(TENANT_ID, {
      provider: 'local', googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null,
    })
    await writeBackRefreshedGoogleAccessToken(TENANT_ID, 'stale-refreshed-token')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: TENANT_ID } })
    expect(row?.provider).toBe('local')
    expect(row?.googleAccessTokenEncrypted).toBeNull() // NOT resurrected
  })

  test('a row with provider=google_drive but a null refresh token (mid-disconnect edge case) is also left untouched', async () => {
    await upsertStorageConfig(TENANT_ID, { provider: 'google_drive', googleAccessTokenEncrypted: 'old', googleRefreshTokenEncrypted: null })
    await writeBackRefreshedGoogleAccessToken(TENANT_ID, 'should-not-land')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: TENANT_ID } })
    expect(row?.googleAccessTokenEncrypted).toBe('old') // untouched, not overwritten
  })
})
