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
})

describe('getStorageConfigForDisplay', () => {
  test('no row → { provider: "local", configured: false }, no password field present', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await getStorageConfigForDisplay(1)
    expect(result).toEqual({ provider: 'local', configured: false })
    expect(result).not.toHaveProperty('smbPassword')
    expect(result).not.toHaveProperty('smbPasswordEncrypted')
  })

  test('custom_path row → configured: true, host/share/username present, no password field', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPasswordEncrypted: 'enc:v1:...',
    })
    const result = await getStorageConfigForDisplay(1)
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
