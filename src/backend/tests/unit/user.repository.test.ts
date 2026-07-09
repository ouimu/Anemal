/**
 * user.repository.test.ts — Unit/integration tests for user repository functions.
 *
 * Uses the real Prisma client against the test DB (same pattern as other
 * integration tests in this suite). Creates its own isolated tenant/user/branch
 * fixtures — never touches seeded dev-clinic/test-clinic data. (Previously used
 * `prisma.tenant.findFirst()`/`user.findFirst()` with no scoping, which could
 * resolve to any real seeded tenant/user — including test-clinic's doctor_b —
 * and `replaceUserBranches` would silently wipe that real user's branch
 * assignment without restoring it, causing an intermittent cross-suite failure
 * in seedCredentialSmoke.test.ts. See git history for the incident.)
 */

import prisma from '../../config/db'
import * as userRepo from '../../models/user.repository'

let tid = 0

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: 'UserRepo Unit Test', subdomain: `userrepo-unit-${Date.now()}` },
  })
  tid = tenant.id
})

afterAll(async () => {
  await prisma.userBranch.deleteMany({ where: { tenantId: tid } })
  await prisma.user.deleteMany({ where: { tenantId: tid } })
  await prisma.branch.deleteMany({ where: { tenantId: tid } })
  await prisma.tenant.deleteMany({ where: { id: tid } })
  await prisma.$disconnect()
})

describe('getUserBranches', () => {
  it('returns branches assigned to user', async () => {
    const branch = await prisma.branch.create({ data: { tenantId: tid, name: '__test_branch__', isActive: true } })
    const user = await prisma.user.create({
      data: {
        tenantId: tid, name: 'Repo Test User', username: 'ub_test_1',
        email: `repo-test-${Date.now()}@example.com`, passwordHash: 'x', role: 'staff', isActive: true,
      },
    })

    await prisma.userBranch.upsert({
      where:  { tenantId_userId_branchId: { tenantId: tid, userId: user.id, branchId: branch.id } },
      update: {},
      create: { tenantId: tid, userId: user.id, branchId: branch.id },
    })

    const result = await userRepo.getUserBranches(tid, user.id)
    expect(result.some((b: { id: number; name: string }) => b.id === branch.id)).toBe(true)
  })
})

describe('replaceUserBranches', () => {
  it('replaces all branch assignments', async () => {
    const user = await prisma.user.create({
      data: {
        tenantId: tid, name: 'Repo Test User 2', username: 'ub_test_2',
        email: `repo-test2-${Date.now()}@example.com`, passwordHash: 'x', role: 'staff', isActive: true,
      },
    })
    const branchA = await prisma.branch.create({ data: { tenantId: tid, name: '__test_branchA__', isActive: true } })
    const branchB = await prisma.branch.create({ data: { tenantId: tid, name: '__test_branchB__', isActive: true } })

    // Assign branchB first, then replace with branchA.
    await userRepo.replaceUserBranches(tid, user.id, [branchB.id])
    await userRepo.replaceUserBranches(tid, user.id, [branchA.id])

    const after = await userRepo.getUserBranches(tid, user.id)
    const ids = after.map((b: { id: number; name: string }) => b.id)
    expect(ids).toContain(branchA.id)
    expect(ids).not.toContain(branchB.id)
  })
})
