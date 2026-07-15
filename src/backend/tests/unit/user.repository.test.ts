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

describe('findPrimaryAdminId', () => {
  it('returns the lowest-id role=admin user for the tenant', async () => {
    const admin1 = await prisma.user.create({
      data: {
        tenantId: tid, name: 'Primary Admin', username: `pa_${Date.now()}`,
        email: `pa-${Date.now()}@example.com`, passwordHash: 'x', role: 'admin', isActive: true,
      },
    })
    const admin2 = await prisma.user.create({
      data: {
        tenantId: tid, name: 'Second Admin', username: `sa_${Date.now()}`,
        email: `sa-${Date.now()}@example.com`, passwordHash: 'x', role: 'admin', isActive: true,
      },
    })
    const result = await userRepo.findPrimaryAdminId(tid)
    expect(result).toBe(admin1.id)
    expect(result).not.toBe(admin2.id)
  })

  it('returns null when the tenant has no role=admin user', async () => {
    const emptyTenant = await prisma.tenant.create({
      data: { name: 'No Admin Tenant', subdomain: `no-admin-${Date.now()}` },
    })
    try {
      const result = await userRepo.findPrimaryAdminId(emptyTenant.id)
      expect(result).toBeNull()
    } finally {
      await prisma.tenant.delete({ where: { id: emptyTenant.id } })
    }
  })

  it('is tenant-isolated: an admin in another tenant never affects this tenant\'s result', async () => {
    const otherTenant = await prisma.tenant.create({
      data: { name: 'Other Admin Tenant', subdomain: `other-admin-${Date.now()}` },
    })
    try {
      const foreignAdmin = await prisma.user.create({
        data: {
          tenantId: otherTenant.id, name: 'Foreign Admin', username: `fa_${Date.now()}`,
          email: `fa-${Date.now()}@example.com`, passwordHash: 'x', role: 'admin', isActive: true,
        },
      })
      const resultForThisTenant = await userRepo.findPrimaryAdminId(tid)
      const resultForOtherTenant = await userRepo.findPrimaryAdminId(otherTenant.id)
      expect(resultForThisTenant).not.toBe(foreignAdmin.id)
      expect(resultForOtherTenant).toBe(foreignAdmin.id)
    } finally {
      await prisma.user.deleteMany({ where: { tenantId: otherTenant.id } })
      await prisma.tenant.delete({ where: { id: otherTenant.id } })
    }
  })
})
