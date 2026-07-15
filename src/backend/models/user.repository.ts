// User repository — all Prisma access for the users table.
// @db-agent: every read is scoped by tenantId; writes are guarded by a prior
// tenant-scoped existence check in the service.

import prisma from '../config/db'
import type { CreateUserRequest, UpdateUserRequest } from '../types'

/** Shape of data accepted by the transactional user+role create. */
export interface CreateUserData {
  name:         string
  username:     string            // D-2-02: required unique login handle
  email:        string | null     // D-2-02: nullable; at least email or phone required
  phone:        string | null     // D-2-02: optional contact field
  passwordHash: string
  role:         CreateUserRequest['role']
}

export function findUsers(tenantId: number) {
  return prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } })
}

export function findUserById(tenantId: number, userId: number) {
  return prisma.user.findFirst({ where: { id: userId, tenantId } })
}

export function createUser(
  tenantId: number,
  data: { name: string; username: string; email: string | null; passwordHash: string; role: CreateUserRequest['role'] },
) {
  return prisma.user.create({ data: { tenantId, ...data } })
}

/**
 * Create a User row and the corresponding UserRole join row atomically.
 * If either write fails the entire transaction is rolled back, ensuring
 * every new user satisfies BR-3 (≥ 1 role at all times).
 *
 * @param tenantId - Owning tenant (multi-tenancy scope).
 * @param data     - User fields (no password — pass passwordHash).
 * @param roleId   - The system or custom ClinicRole ID to assign.
 */
export async function createUserWithRole(
  tenantId: number,
  data: CreateUserData,
  roleId: number,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { tenantId, ...data, roleId },
    })
    await tx.userRole.create({
      data: { userId: user.id, roleId, tenantId },
    })
    return user
  })
}

export async function updateUser(tenantId: number, userId: number, data: UpdateUserRequest) {
  await prisma.user.updateMany({ where: { id: userId, tenantId }, data })
  return prisma.user.findFirst({ where: { id: userId, tenantId } })
}

export async function setActive(tenantId: number, userId: number, isActive: boolean) {
  await prisma.user.updateMany({ where: { id: userId, tenantId }, data: { isActive } })
}

/**
 * Set a new password hash for a user, tenant-scoped (`updateMany`, BOLA
 * guard — mirrors `setActive`/`updateUserBranch`). Used by both
 * self-service change (PWD-1) and admin reset (PWD-2).
 *
 * @param tenantId     - Tenant scope (multi-tenancy isolation).
 * @param userId       - Target user's primary key.
 * @param passwordHash - New bcrypt hash.
 * @returns Number of rows updated (0 = not found in this tenant).
 */
export async function setPasswordHash(
  tenantId: number,
  userId: number,
  passwordHash: string,
): Promise<number> {
  const result = await prisma.user.updateMany({ where: { id: userId, tenantId }, data: { passwordHash } })
  return result.count
}

/**
 * Replace all existing user_roles rows for a user (within a tenant) with a
 * single new role assignment, and update the legacy `roleId` FK on the User
 * row — all in one transaction.
 *
 * BR-3 is guaranteed: the new row is created before the old ones are deleted,
 * so there is never a moment with zero roles.
 *
 * @param tenantId - Tenant scope (multi-tenancy isolation).
 * @param userId   - Target user.
 * @param roleId   - The ClinicRole ID to assign as the sole role.
 */
export async function replaceUserRole(
  tenantId: number,
  userId:   number,
  roleId:   number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Insert new role first (satisfies BR-3 at every point in the transaction).
    await tx.userRole.upsert({
      where:  { userId_roleId: { userId, roleId } },
      create: { userId, roleId, tenantId },
      update: {},
    })
    // Remove all other roles for this user in this tenant.
    await tx.userRole.deleteMany({
      where: { userId, tenantId, roleId: { not: roleId } },
    })
    // Keep the legacy roleId FK in sync.
    await tx.user.updateMany({ where: { id: userId, tenantId }, data: { roleId } })
  })
}

/**
 * Return all roles assigned to a user within a tenant, including the role's
 * permission codes and aggregate user count. Used by the user-roles endpoint.
 *
 * @param tenantId - Tenant scope (required for isolation).
 * @param userId   - Target user's primary key.
 */
export function findUserRolesWithDetails(tenantId: number, userId: number) {
  return prisma.userRole.findMany({
    where: { userId, tenantId },
    include: {
      role: {
        include: {
          permissions: { select: { permissionCode: true } },
          _count:       { select: { userRoles: true } },
        },
      },
    },
  })
}

/**
 * Update the branchId for a user within a tenant.
 *
 * Uses updateMany (tenant-scoped) to keep the write isolated to the correct
 * tenant. Returns null when no row matched (user not found in this tenant).
 *
 * @param tenantId - Owning tenant (multi-tenancy scope).
 * @param userId   - Target user's primary key.
 * @param branchId - Branch to assign, or null to clear the assignment.
 */
export async function updateUserBranch(
  tenantId: number,
  userId:   number,
  branchId: number | null,
): Promise<{ id: number; tenantId: number; name: string; username: string; email: string | null; phone: string | null; role: string; branchId: number | null; isActive: boolean; createdAt: Date } | null> {
  const count = await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data:  { branchId },
  })
  if (count.count === 0) return null
  return prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true, tenantId: true, name: true, username: true,
      email: true, phone: true, role: true,
      branchId: true, isActive: true, createdAt: true,
    },
  }) as Promise<{ id: number; tenantId: number; name: string; username: string; email: string | null; phone: string | null; role: string; branchId: number | null; isActive: boolean; createdAt: Date } | null>
}

// ─── Multi-branch assignment ────────────────────────────────────────────────

/**
 * Return all branches currently assigned to a user within a tenant, ordered
 * alphabetically by branch name.
 *
 * @param tenantId - Owning tenant (multi-tenancy scope).
 * @param userId   - Target user's primary key.
 */
export async function getUserBranches(
  tenantId: number,
  userId: number,
): Promise<{ id: number; name: string }[]> {
  const rows = await prisma.userBranch.findMany({
    where:   { tenantId, userId },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: { branch: { name: 'asc' } },
  })
  return rows.map(r => r.branch)
}

/**
 * Atomically replace all branch assignments for a user within a tenant.
 * Also keeps the legacy `branchId` FK on the User row in sync by setting it
 * to the first branch in the new list (or null when the list is empty).
 *
 * @param tenantId  - Owning tenant (multi-tenancy scope).
 * @param userId    - Target user's primary key.
 * @param branchIds - Ordered list of branch IDs to assign; pass [] to clear.
 */
export async function replaceUserBranches(
  tenantId: number,
  userId: number,
  branchIds: number[],
): Promise<void> {
  await prisma.$transaction([
    prisma.userBranch.deleteMany({ where: { tenantId, userId } }),
    ...(branchIds.length > 0
      ? [prisma.userBranch.createMany({
          data: branchIds.map(branchId => ({ tenantId, userId, branchId })),
          skipDuplicates: true,
        })]
      : []),
    // Keep users.branchId in sync: set to first assigned branch (or null).
    prisma.user.update({
      where: { id: userId, tenantId },
      data:  { branchId: branchIds[0] ?? null },
    }),
  ])
}

// Phase 1.5-B — personal preferences (language, default calendar view, theme)
export function getPreferences(tenantId: number, userId: number) {
  return prisma.user.findFirst({
    where:  { id: userId, tenantId },
    select: { language: true, defaultCalendarView: true, theme: true },
  })
}

export function updatePreferences(
  tenantId: number,
  userId: number,
  data: { language?: string; defaultCalendarView?: string; theme?: string },
) {
  // updateMany keeps the write tenant-scoped (plain update matches by id alone)
  return prisma.user.updateMany({ where: { id: userId, tenantId }, data })
}

/**
 * Return the lowest-id user with legacy `role = 'admin'` for a tenant — the
 * tenant's "primary admin" (ADR-0016 D-1). Returns null if the tenant has no
 * such user. Tenant-scoped `findFirst` (BOLA-safe by construction).
 *
 * @param tenantId - Tenant scope (multi-tenancy isolation).
 */
export async function findPrimaryAdminId(tenantId: number): Promise<number | null> {
  const admin = await prisma.user.findFirst({
    where:   { tenantId, role: 'admin' },
    orderBy: { id: 'asc' },
    select:  { id: true },
  })
  return admin?.id ?? null
}
