/**
 * Platform-auth repository — Prisma access for platform_users table.
 *
 * Platform users are NOT tenant-scoped; there is no tenantId column.
 * Every function is intentionally limited to lookups needed for authentication.
 *
 * @module platform-auth.repository
 */

import prisma from '../config/db'

/**
 * Find a platform user by email address.
 * Returns null when no matching user exists.
 *
 * @param email - The email address to look up.
 */
export function findPlatformUserByEmail(email: string) {
  return prisma.platformUser.findUnique({ where: { email } })
}

/**
 * Record the last-login timestamp for a platform user.
 *
 * @param id - The platform user's primary key.
 */
export function touchPlatformUserLastLogin(id: number) {
  return prisma.platformUser.update({
    where: { id },
    data:  { lastLoginAt: new Date() },
  })
}

/**
 * Upsert a platform super-admin by email.
 * Used by the seed script to create the initial operator account.
 *
 * @param email        - Unique email address for the account.
 * @param name         - Display name.
 * @param passwordHash - Pre-hashed bcrypt password.
 */
export function upsertPlatformSuperAdmin(
  email: string,
  name: string,
  passwordHash: string,
) {
  return prisma.platformUser.upsert({
    where:  { email },
    update: {},
    create: { email, name, passwordHash, role: 'platform_super_admin', isActive: true },
  })
}
