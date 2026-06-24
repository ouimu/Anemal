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
    const tenant   = await prisma.tenant.findFirst()
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant!.id }, take: 2 })
    const user     = await prisma.user.findFirst({ where: { tenantId: tenant!.id } })
    expect(tenant).toBeTruthy()
    expect(branches.length).toBeGreaterThan(0)
    expect(user).toBeTruthy()

    // If two branches exist: seed a different branch first, then replace with
    // branches[0] to verify the prior assignment is removed.
    if (branches.length >= 2) {
      await userRepo.replaceUserBranches(tenant!.id, user!.id, [branches[1].id])
    }

    await userRepo.replaceUserBranches(tenant!.id, user!.id, [branches[0].id])
    const after = await userRepo.getUserBranches(tenant!.id, user!.id)
    expect(after.map((b: { id: number; name: string }) => b.id)).toEqual([branches[0].id])

    // Verify branches[1] is no longer present after the replace (two-branch case only).
    if (branches.length >= 2) {
      expect(after.map((b: { id: number; name: string }) => b.id)).not.toContain(branches[1].id)
    }
  })
})
