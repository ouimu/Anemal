// src/backend/__tests__/storage-config.service.test.ts
import { encryptField } from '../utils/encryption'

jest.mock('../models/tenant-storage-config.repository')
import * as repo from '../models/tenant-storage-config.repository'
import { resolveStorageConfig } from '../services/storage-config.service'

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
