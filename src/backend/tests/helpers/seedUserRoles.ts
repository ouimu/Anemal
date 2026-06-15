/**
 * Test helper — seed UserRole join-table rows for test users.
 *
 * After T-5B-01 route enforcement, `requirePermission()` queries the
 * `user_roles` table via `resolvePermissions()`. Tests that create users
 * directly (without going through the seed script) must call this helper
 * in their `beforeAll` to ensure the join-table rows exist; otherwise
 * every protected request returns 403.
 *
 * Usage:
 *   import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'
 *
 *   beforeAll(async () => {
 *     // ... create tenants + users ...
 *     await seedUserRoles(prisma, [
 *       { userId: adminId,  tenantId: tid, roleKey: 'clinic_admin' },
 *       { userId: doctorId, tenantId: tid, roleKey: 'doctor'       },
 *       { userId: staffId,  tenantId: tid, roleKey: 'clinic_staff' },
 *     ])
 *   })
 *
 *   afterAll(async () => {
 *     await cleanupUserRoles(prisma, [tid, tid2])
 *   })
 *
 * @module tests/helpers/seedUserRoles
 */

import { PrismaClient } from '@prisma/client'

/** Valid system role keys for the clinic plane. */
export type SystemRoleKey = 'clinic_admin' | 'doctor' | 'clinic_staff'

/** Maps a legacy role string to the system ClinicRole key. */
export const LEGACY_TO_CLINIC_ROLE: Record<string, SystemRoleKey> = {
  admin:  'clinic_admin',
  doctor: 'doctor',
  staff:  'clinic_staff',
}

export interface UserRoleSeed {
  userId:   number
  tenantId: number
  roleKey:  SystemRoleKey
}

/**
 * Resolve system ClinicRole IDs (once per test run) and create UserRole rows.
 *
 * @param prisma   - Prisma client instance (the test's own import).
 * @param entries  - List of { userId, tenantId, roleKey } to seed.
 */
export async function seedUserRoles(
  prisma: PrismaClient,
  entries: UserRoleSeed[],
): Promise<void> {
  // Collect distinct role keys needed
  const keys = [...new Set(entries.map(e => e.roleKey))]
  const clinicRoles = await prisma.clinicRole.findMany({
    where: { key: { in: keys }, tenantId: null },
  })
  const roleMap = new Map(clinicRoles.map(r => [r.key, r.id]))

  const data = entries
    .filter(e => roleMap.has(e.roleKey))
    .map(e => ({
      userId:   e.userId,
      roleId:   roleMap.get(e.roleKey)!,
      tenantId: e.tenantId,
    }))

  if (data.length > 0) {
    await prisma.userRole.createMany({ data, skipDuplicates: true })
  }
}

/**
 * Delete all UserRole rows for the given tenant IDs.
 * Call in `afterAll` before deleting users.
 *
 * @param prisma    - Prisma client instance.
 * @param tenantIds - Tenant IDs to clean up.
 */
export async function cleanupUserRoles(
  prisma: PrismaClient,
  tenantIds: number[],
): Promise<void> {
  await prisma.userRole.deleteMany({ where: { tenantId: { in: tenantIds } } })
}
