import prisma from '../../config/db'
import { revokeAllForUser } from '../../models/refresh-token.repository'

describe('revokeAllForUser', () => {
  afterEach(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { gte: 900000000 } } })
  })

  it('revokes every non-revoked token for the user, leaves other users untouched', async () => {
    const future = new Date(Date.now() + 60_000)
    await prisma.refreshToken.createMany({
      data: [
        { tokenHash: 'rau-a1', familyId: 'fam-a1', userId: 900000001, tenantId: 1, plane: 'clinic', expiresAt: future },
        { tokenHash: 'rau-a2', familyId: 'fam-a2', userId: 900000001, tenantId: 1, plane: 'clinic', expiresAt: future },
        { tokenHash: 'rau-b1', familyId: 'fam-b1', userId: 900000002, tenantId: 1, plane: 'clinic', expiresAt: future },
      ],
    })

    await revokeAllForUser(900000001)

    const userATokens = await prisma.refreshToken.findMany({ where: { userId: 900000001 } })
    expect(userATokens.every(t => t.revokedAt !== null)).toBe(true)

    const userBTokens = await prisma.refreshToken.findMany({ where: { userId: 900000002 } })
    expect(userBTokens.every(t => t.revokedAt === null)).toBe(true)
  })

  it('is idempotent — re-running on already-revoked tokens is a no-op, no throw', async () => {
    await prisma.refreshToken.create({
      data: { tokenHash: 'rau-c1', familyId: 'fam-c1', userId: 900000003, tenantId: 1, plane: 'clinic', expiresAt: new Date(Date.now() + 60_000) },
    })
    await revokeAllForUser(900000003)
    await expect(revokeAllForUser(900000003)).resolves.not.toThrow()
  })
})
