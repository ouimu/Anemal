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

    const result = await backfillMainBranch()

    expect(result.inserted).toBeGreaterThanOrEqual(1)
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Main Branch')
  })

  it('✅ skips a tenant that already has a branch (any isActive value)', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Skip', subdomain: `bf-skip-${Date.now()}` } })
    createdTenantIds.push(tenant.id)
    await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Existing Branch', isActive: false } })

    await backfillMainBranch()

    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(branches[0].name).toBe('Existing Branch')
  })

  it('✅ idempotent: second run against the same DB state inserts 0 rows', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Backfill Idempotent', subdomain: `bf-idem-${Date.now()}` } })
    createdTenantIds.push(tenant.id)

    await backfillMainBranch()
    const second = await backfillMainBranch()

    // second run must not touch the tenant created above nor re-insert anywhere
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id } })
    expect(branches).toHaveLength(1)
    expect(second.inserted).toBe(0)
  })
})
