// src/backend/__tests__/storage-config.service.test.ts
import { encryptField } from '../utils/encryption'

jest.mock('../models/tenant-storage-config.repository')
jest.mock('../models/settings-audit.repository')
jest.mock('../config/smb-client')
import * as repo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { createSmbClient, SmbHostUnreachableError } from '../config/smb-client'

function fakeClient(overrides: Partial<Record<'connect' | 'writeFile' | 'unlink' | 'disconnect', jest.Mock>> = {}) {
  return {
    connect:    overrides.connect    ?? jest.fn().mockResolvedValue(undefined),
    writeFile:  overrides.writeFile  ?? jest.fn().mockResolvedValue(undefined),
    readFile:   jest.fn(),
    unlink:     overrides.unlink     ?? jest.fn().mockResolvedValue(undefined),
    rename:     jest.fn(),
    exists:     jest.fn(),
    disconnect: overrides.disconnect ?? jest.fn().mockResolvedValue(undefined),
  }
}
import {
  resolveStorageConfig,
  getStorageConfigForDisplay,
  updateStorageConfig,
  StorageConfigSwitchConfirmationRequiredError,
} from '../services/storage-config.service'

describe('resolveStorageConfig', () => {
  test('no config row → { provider: "local" }', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({ provider: 'local' })
  })

  test('provider="local" row → { provider: "local" } (explicit revert, not just absence)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({ provider: 'local' })
  })

  test('provider="custom_path" row → decrypts the stored password before returning', async () => {
    const encrypted = encryptField('supersecret')
    ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'custom_path',
      smbHost: '10.0.0.5', smbShare: 'vetfiles', smbUsername: 'clinicuser',
      smbPasswordEncrypted: encrypted,
    })
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({
      provider: 'custom_path', host: '10.0.0.5', share: 'vetfiles', username: 'clinicuser', password: 'supersecret',
    })
  })

  test('provider="google_drive" row → decrypts both tokens and passes through folder ids', async () => {
    const encryptedAccess = encryptField('access-token-value')
    const encryptedRefresh = encryptField('refresh-token-value')
    ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptedAccess, googleRefreshTokenEncrypted: encryptedRefresh,
      googleRootFolderId: 'root-1', googleEmrFolderId: 'emr-1', googlePhotoFolderId: 'photo-1',
    })
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({
      provider: 'google_drive', accessToken: 'access-token-value', refreshToken: 'refresh-token-value',
      rootFolderId: 'root-1', emrFolderId: 'emr-1', photoFolderId: 'photo-1',
    })
  })

  test('provider="onedrive" row → decrypts both tokens and passes through expiry', async () => {
    const encryptedAccess = encryptField('od-access-token')
    const encryptedRefresh = encryptField('od-refresh-token')
    const expiresAt = new Date('2026-08-01T00:00:00Z')
    ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'onedrive',
      oneDriveAccessTokenEncrypted: encryptedAccess, oneDriveRefreshTokenEncrypted: encryptedRefresh,
      oneDriveTokenExpiresAt: expiresAt,
    })
    const result = await resolveStorageConfig(1)
    expect(result).toEqual({ provider: 'onedrive', accessToken: 'od-access-token', refreshToken: 'od-refresh-token', tokenExpiresAt: expiresAt })
  })
})

describe('getStorageConfigForDisplay', () => {
  test('no row → { provider: "local", configured: false }, no password field present', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await getStorageConfigForDisplay(1, false)
    expect(result).toEqual({ provider: 'local', configured: false })
    expect(result).not.toHaveProperty('smbPassword')
    expect(result).not.toHaveProperty('smbPasswordEncrypted')
  })

  test('custom_path row → configured: true, host/share/username present, no password field', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:...',
    })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result).toEqual({ provider: 'custom_path', configured: true, smbHost: 'h', smbShare: 's', smbUsername: 'u' })
  })
})

describe('updateStorageConfig', () => {
  beforeEach(() => jest.clearAllMocks())

  test('switching local → custom_path without confirmBaseChange throws the confirmation-required error, persists nothing', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null) // currently local (no row)
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p',
    })).rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })

  test('connect-and-test-write failure (host unreachable) → rejects with the specific error, persists nothing', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    ;(createSmbClient as jest.Mock).mockReturnValue(fakeClient({
      connect: jest.fn().mockRejectedValue(new SmbHostUnreachableError('h')),
    }))
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true,
    })).rejects.toBeInstanceOf(SmbHostUnreachableError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })

  test('happy path (with confirmation) — encrypts password, persists, writes an audit entry, cleans up the test-write marker', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const unlinkSpy = jest.fn().mockResolvedValue(undefined)
    ;(createSmbClient as jest.Mock).mockReturnValue(fakeClient({ unlink: unlinkSpy }))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path' })
    await updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true,
    })
    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u',
      smbPasswordEncrypted: expect.stringMatching(/^enc:v1:/),
    }))
    expect(auditRepo.createMany).toHaveBeenCalledWith([expect.objectContaining({
      tenantId: 1, changedBy: 42, tableName: 'tenant_storage_config',
    })])
    // Resolved open question: the test-write marker is deleted, not left as a residual file.
    expect(unlinkSpy).toHaveBeenCalledWith(`tenants/1/.storage-config-test`)
  })

  test('test-write marker cleanup failure is swallowed (logged, not thrown) — a transient delete failure must not block the config save that already succeeded its connect-test', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    ;(createSmbClient as jest.Mock).mockReturnValue(fakeClient({
      unlink: jest.fn().mockRejectedValue(new Error('share blip')),
    }))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path' })
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true,
    })).resolves.toBeUndefined()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })

  test('reverting custom_path → local does not require a connect-test (nothing to test-write against) and still requires confirmation', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:x' })
    await expect(updateStorageConfig(1, 42, { provider: 'local' }))
      .rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
  })
})

jest.mock('../config/google-drive-client')
import { revokeGoogleToken, createGoogleDriveClient, GoogleDriveAuthInvalidError } from '../config/google-drive-client'

describe('updateStorageConfig — disconnecting from google_drive (BA G-4b)', () => {
  beforeEach(() => jest.clearAllMocks())

  test('switching google_drive → local revokes the stored refresh token at Google and nulls all google* columns in the same write', async () => {
    const encryptedRefresh = encryptField('stored-refresh-token')
    ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptedRefresh,
      googleRootFolderId: 'r1', googleEmrFolderId: 'e1', googlePhotoFolderId: 'p1',
    })
    ;(revokeGoogleToken as jest.Mock).mockResolvedValue(undefined)
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })

    await updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })

    expect(revokeGoogleToken).toHaveBeenCalledWith('stored-refresh-token')
    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      provider: 'local',
      googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null,
    }))
  })

  test('a failed Google revoke is logged, never blocks the switch (best-effort, matches the existing SMB-failure pattern)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(revokeGoogleToken as jest.Mock).mockRejectedValue(new Error('Google revoke endpoint down'))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })

    await expect(updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })).resolves.toBeUndefined()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })

  test('switching google_drive → custom_path (not just → local) also nulls the google* columns', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(revokeGoogleToken as jest.Mock).mockResolvedValue(undefined)
    ;(createSmbClient as jest.Mock).mockReturnValue(fakeClient())
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path' })

    await updateStorageConfig(1, 42, { provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true })

    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null,
    }))
  })

  test('a currently google_drive row is always treated as a base change — switching away without confirmBaseChange throws', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: null })
    await expect(updateStorageConfig(1, 42, { provider: 'local' })).rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })

  test('no stored refresh token (edge case: connected then row was already partially cleared) — revoke is skipped, switch still succeeds', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: null })
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })
    await updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })
    expect(revokeGoogleToken).not.toHaveBeenCalled()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })
})

describe('getStorageConfigForDisplay — google_drive live status check (design §"Status check")', () => {
  beforeEach(() => jest.clearAllMocks())

  test('a valid connection → connected: true', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(createGoogleDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue(undefined) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result).toEqual({ provider: 'google_drive', configured: true, connected: true })
  })

  test('a revoked/invalid token → connected: false', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(createGoogleDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new GoogleDriveAuthInvalidError()) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result.connected).toBe(false)
  })

  test('a transient failure (network blip) does NOT flip connected to false — "a blip must not read as data loss"', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(createGoogleDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result.connected).toBe(true)
  })

  test('local/custom_path responses never include a connected field', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await getStorageConfigForDisplay(1, false)
    expect(result).not.toHaveProperty('connected')
  })
})

jest.mock('../config/onedrive-client')
import { createOneDriveClient, OneDriveAuthInvalidError, OneDriveInsufficientScopeError } from '../config/onedrive-client'
jest.mock('../utils/account-id-hash')
import { checkDuplicateAccount } from '../utils/account-id-hash'

describe('updateStorageConfig — disconnect from onedrive', () => {
  beforeEach(() => jest.clearAllMocks())

  test('switching away from onedrive nulls all FOUR oneDrive* columns (incl. oneDriveAccountIdHash, round-2 grill finding 2) in the disconnect write', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'onedrive',
      oneDriveAccessTokenEncrypted: encryptField('at'), oneDriveRefreshTokenEncrypted: encryptField('rt'),
      oneDriveTokenExpiresAt: new Date(), oneDriveAccountIdHash: 'hash-abc',
    })
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })

    await updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })

    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      provider: 'local',
      oneDriveAccessTokenEncrypted: null, oneDriveRefreshTokenEncrypted: null,
      oneDriveTokenExpiresAt: null, oneDriveAccountIdHash: null,
    }))
  })

  test('no revoke call is attempted for OneDrive (M-3 — assert the absence, mirroring the Google-side revoke-attempted assertion)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'onedrive', oneDriveRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })

    await updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })

    expect(revokeGoogleToken).not.toHaveBeenCalled()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })

  test('switching FROM onedrive TO custom_path requires confirmBaseChange (effectiveBaseKey treats onedrive as its own base)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'onedrive', oneDriveRefreshTokenEncrypted: null })
    await expect(updateStorageConfig(1, 42, {
      provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p',
    })).rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })
})

describe('getStorageConfigForDisplay — onedrive status + duplicate-account gating', () => {
  beforeEach(() => jest.clearAllMocks())

  function onedriveRow(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: 1, provider: 'onedrive',
      oneDriveAccessTokenEncrypted: encryptField('at'), oneDriveRefreshTokenEncrypted: encryptField('rt'),
      oneDriveAccountIdHash: null,
      ...overrides,
    }
  }

  test('connected:true on a valid ping', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow());
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue({ accountId: 'x' }) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result).toEqual({ provider: 'onedrive', configured: true, connected: true })
  })

  test('connected:false on an auth-invalid ping (401/invalid_grant)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow());
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new OneDriveAuthInvalidError()) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result.connected).toBe(false)
  })

  test('a transient ping failure does NOT flip connected to false (I-16 "don\'t read a blip as data loss")', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow());
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result.connected).toBe(true)
  })

  test('a 403 (insufficient scope) on the ping is classified as auth-invalid, NOT transient — flips connected:false with distinct reconnect copy (round-2 grill finding 3, M-9)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow());
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new OneDriveInsufficientScopeError()) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result.connected).toBe(false)
  })

  test('duplicateAccountWarning:true when another tenant holds the same oneDriveAccountIdHash, for a clinic.integrations.edit caller', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow({ oneDriveAccountIdHash: 'hash-abc' }));
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue({ accountId: 'x' }) });
    (checkDuplicateAccount as jest.Mock).mockResolvedValue({ duplicate: true })
    const result = await getStorageConfigForDisplay(1, true)
    expect(checkDuplicateAccount).toHaveBeenCalledWith(expect.anything(), 'onedrive', 'hash-abc', 1)
    expect(result.duplicateAccountWarning).toBe(true)
  })

  test('duplicateAccountWarning is ABSENT from the response for a clinic.profile.view-only caller (round-2 grill finding 5 — doctor/staff still get configured/connected, not this field)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow({ oneDriveAccountIdHash: 'hash-abc' }));
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue({ accountId: 'x' }) })
    const result = await getStorageConfigForDisplay(1, false)
    expect(result).not.toHaveProperty('duplicateAccountWarning')
    expect(checkDuplicateAccount).not.toHaveBeenCalled()
  })

  test('two branches of the same tenant do not trigger duplicateAccountWarning against each other (tenantId != ? predicate)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow({ oneDriveAccountIdHash: 'hash-abc' }));
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue({ accountId: 'x' }) });
    (checkDuplicateAccount as jest.Mock).mockResolvedValue({ duplicate: false })
    const result = await getStorageConfigForDisplay(1, true)
    expect(checkDuplicateAccount).toHaveBeenCalledWith(expect.anything(), 'onedrive', 'hash-abc', 1)
    expect(result.duplicateAccountWarning).toBe(false)
  })

  test('a disconnected tenant\'s hash is NULL and no longer triggers warnings for other tenants (recomputed per read, not stale)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(onedriveRow({ oneDriveAccountIdHash: null }));
    (createOneDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue({ accountId: 'x' }) })
    const result = await getStorageConfigForDisplay(1, true)
    expect(result).not.toHaveProperty('duplicateAccountWarning')
    expect(checkDuplicateAccount).not.toHaveBeenCalled()
  })
})
