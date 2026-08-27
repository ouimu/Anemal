/**
 * Shared fixture helpers for role.repository.test.ts / role.service.test.ts.
 * Both files build the same tenant-pair + system-role-lookup + Restrict-safe
 * teardown shape; keep it in one place so a schema change updates once.
 */

import prisma from '../../../config/db'

export interface TenantPair {
  tenantAId: number
  tenantBId: number
}

/** Create two isolated tenants for a drift fixture, named `${label} A/B`, subdomain `${slug}-a/b-${stamp}`. */
export async function createTenantPair(label: string, slug: string, stamp: number): Promise<TenantPair> {
  const [tenantA, tenantB] = await Promise.all([
    prisma.tenant.create({ data: { name: `${label} A`, subdomain: `${slug}-a-${stamp}` } }),
    prisma.tenant.create({ data: { name: `${label} B`, subdomain: `${slug}-b-${stamp}` } }),
  ])
  return { tenantAId: tenantA.id, tenantBId: tenantB.id }
}

/** Look up the seeded system `clinic_staff` role (tenantId = null, isSystem = true). */
export async function findSystemStaffRoleId(): Promise<number> {
  const staffRole = await prisma.clinicRole.findFirstOrThrow({
    where: { key: 'clinic_staff', tenantId: null, isSystem: true },
  })
  return staffRole.id
}

/**
 * Child-before-parent teardown for role-tenant fixtures: UserRole -> User -> ClinicRole -> Tenant.
 * Required because UserRole.role is onDelete: Restrict.
 */
export async function teardownRoleTenantFixtures(tenantIds: number[]): Promise<void> {
  await prisma.userRole.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.clinicRole.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  await prisma.$disconnect()
}
