/**
 * user.repository.test.ts — Unit/integration tests for user repository functions.
 *
 * Uses the real Prisma client against the test DB (same pattern as other
 * integration tests in this suite). Tenant data is seeded from whatever the
 * test DB already contains — tests fail visibly if fixture rows are missing.
 */

import prisma from '../../config/db'
import * as userRepo from '../../models/user.repository'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('getUserBranches', () => {
  it('returns branches assigned to user', async () => {
    const tenant = await prisma.tenant.findFirst()
    const branch = await prisma.branch.findFirst({ where: { tenantId: tenant!.id } })
    const user   = await prisma.user.findFirst({ where: { tenantId: tenant!.id } })
    expect(tenant).toBeTruthy()
    expect(branch).toBeTruthy()
    expect(user).toBeTruthy()

    await prisma.userBranch.upsert({
      where:  { tenantId_userId_branchId: { tenantId: tenant!.id, userId: user!.id, branchId: branch!.id } },
      update: {},
      create: { tenantId: tenant!.id, userId: user!.id, branchId: branch!.id },
    })

    const result = await userRepo.getUserBranches(tenant!.id, user!.id)
    expect(result.some((b: { id: number; name: string }) => b.id === branch!.id)).toBe(true)
  })
})

describe('replaceUserBranches', () => {
  it('replaces all branch assignments', async () => {
    const tenant = await prisma.tenant.findFirst()
    const user   = await prisma.user.findFirst({ where: { tenantId: tenant!.id } })
    expect(tenant).toBeTruthy()
    expect(user).toBeTruthy()

    // Create two branches explicitly so the deletion check always runs.
    const branchA = await prisma.branch.create({
      data: { tenantId: tenant!.id, name: '__test_branchA__', isActive: true },
    })
    const branchB = await prisma.branch.create({
      data: { tenantId: tenant!.id, name: '__test_branchB__', isActive: true },
    })

    try {
      // Assign branchB first, then replace with branchA.
      await userRepo.replaceUserBranches(tenant!.id, user!.id, [branchB.id])
      await userRepo.replaceUserBranches(tenant!.id, user!.id, [branchA.id])

      const after = await userRepo.getUserBranches(tenant!.id, user!.id)
      const ids = after.map((b: { id: number; name: string }) => b.id)
      expect(ids).toContain(branchA.id)
      expect(ids).not.toContain(branchB.id)
    } finally {
      // Cleanup: clear assignments then delete test branches.
      await prisma.userBranch.deleteMany({ where: { tenantId: tenant!.id, branchId: { in: [branchA.id, branchB.id] } } })
      await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } })
    }
  })
})
