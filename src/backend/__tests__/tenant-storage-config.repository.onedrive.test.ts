import { writeBackRefreshedOneDriveTokens } from '../models/tenant-storage-config.repository'
import prisma from '../config/db'

jest.mock('../config/db', () => ({ tenantStorageConfig: { updateMany: jest.fn() } }))

describe('writeBackRefreshedOneDriveTokens', () => {
  test('conditional update — WHERE provider=onedrive AND oneDriveRefreshTokenEncrypted IS NOT NULL (N-4 analog, extended to both rotating tokens, M-2)', async () => {
    (prisma.tenantStorageConfig.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    const expiresAt = new Date('2026-08-01T00:00:00Z')
    await writeBackRefreshedOneDriveTokens(1, { accessToken: 'new-at', refreshToken: 'new-rt', expiresAt })
    expect(prisma.tenantStorageConfig.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 1, provider: 'onedrive', oneDriveRefreshTokenEncrypted: { not: null } },
      data: expect.objectContaining({ oneDriveTokenExpiresAt: expiresAt }),
    })
  })

  test('a refresh completing after disconnect writes nothing (zero rows matched, silently dropped)', async () => {
    (prisma.tenantStorageConfig.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    await expect(writeBackRefreshedOneDriveTokens(1, { accessToken: 'x', refreshToken: 'y', expiresAt: new Date() })).resolves.toBeUndefined()
  })
})
