import { hashAccountId, checkDuplicateAccount } from '../utils/account-id-hash'
import prisma from '../config/db'

jest.mock('../config/db', () => ({
  tenantStorageConfig: { findFirst: jest.fn() },
}))

describe('hashAccountId', () => {
  test('is deterministic for the same input', () => {
    expect(hashAccountId('microsoft-user-123')).toBe(hashAccountId('microsoft-user-123'))
  })

  test('differs for different inputs', () => {
    expect(hashAccountId('a')).not.toBe(hashAccountId('b'))
  })

  test('never contains the raw input (not reversible at a glance)', () => {
    expect(hashAccountId('microsoft-user-123')).not.toContain('microsoft-user-123')
  })
})

describe('checkDuplicateAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  test('predicate is provider + hash + tenantId != excludeTenantId — explicit, not hash-alone (round-2 grill finding 5)', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue(null)
    await checkDuplicateAccount(prisma, 'onedrive', 'hash-abc', 7)
    expect(prisma.tenantStorageConfig.findFirst).toHaveBeenCalledWith({
      where: { provider: 'onedrive', oneDriveAccountIdHash: 'hash-abc', tenantId: { not: 7 } },
    })
  })

  test('returns duplicate:true when a match exists', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue({ tenantId: 99 })
    const result = await checkDuplicateAccount(prisma, 'onedrive', 'hash-abc', 7)
    expect(result).toEqual({ duplicate: true })
  })

  test('returns duplicate:false when no match', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue(null)
    const result = await checkDuplicateAccount(prisma, 'google_drive', 'hash-xyz', 7)
    expect(result).toEqual({ duplicate: false })
  })

  test('never returns the matched tenant id or any identifying detail (existence-only signal)', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue({ tenantId: 99 })
    const result = await checkDuplicateAccount(prisma, 'onedrive', 'hash-abc', 7)
    expect(result).not.toHaveProperty('tenantId')
    expect(Object.keys(result)).toEqual(['duplicate'])
  })
})
