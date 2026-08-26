/**
 * Backfill script (PROV-2): inserts a 'Main Branch' for any tenant with zero
 * Branch rows. Covers real Platform-Console tenants created between PR #23
 * and the PROV-1 fix landing (brainstorm §3.3).
 */
import { PrismaClient } from '@prisma/client'
import { backfillMainBranch } from '../../scripts/backfill-main-branch'

const prisma = new PrismaClient()
const createdTenantIds: number[] = []

afterAll(async () => {
  if (createdTenantIds.length) {
    await prisma.branch.deleteMany({ where: { tenantId: { in: createdTenantIds } } })
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } })
  }
  await prisma.$disconnect()
})

describe('backfillMainBranch', () => {
  it('✅ inserts "Main Branch" for a tenant with zero branches', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Target', subdomain: `bf-target-${Date.now()}` } })
    createdTenantIds.push(tenant.id)

    // Scoped: an unscoped sweep is a whole-database write and corrupts other
    // suites' tenants mid-construction under parallel workers (see the JSDoc on
    // backfillMainBranch). Scoping also lets this assert an exact count.
    const result = await backfillMainBranch({ tenantIds: [tenant.id] })

    expect(result.inserted).toBe(1)
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Main Branch')
  })

  it('✅ skips a tenant that already has a branch (any isActive value)', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Skip', subdomain: `bf-skip-${Date.now()}` } })
    createdTenantIds.push(tenant.id)
    await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Existing Branch', isActive: false } })

    const result = await backfillMainBranch({ tenantIds: [tenant.id] })
    expect(result.inserted).toBe(0)

    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Existing Branch')
  })

  it('✅ idempotent: second run against the same DB state inserts 0 rows', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Idempotent', subdomain: `bf-idem-${Date.now()}` } })
    createdTenantIds.push(tenant.id)

    const first = await backfillMainBranch({ tenantIds: [tenant.id] })
    expect(first.inserted).toBe(1)
    const afterFirst = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(afterFirst).toHaveLength(1)

    const second = await backfillMainBranch({ tenantIds: [tenant.id] })
    expect(second.inserted).toBe(0)
    const afterSecond = await prisma.branch.findMany({ where: { tenantId: tenant.id } })

    // `inserted` is only meaningful now because the sweep is scoped above. Left
    // unscoped it counts every branchless tenant in the database, so another
    // worker creating one between the two runs would legitimately bump it.
    // Asserting the surviving row is the SAME row is also strictly stronger than
    // a bare count of 0.
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond[0].id).toBe(afterFirst[0].id)
  })
})
