/**
 * Role repository — all Prisma access for clinic roles, role permissions, and user-role assignments.
 *
 * @db-agent: every write is scoped by tenantId; system roles (tenantId=null) are read-only
 * via this repository. No raw SQL — all queries via Prisma client.
 *
 * @module role.repository
 */

import prisma from '../config/db'

// ---------------------------------------------------------------------------
// Role queries
// ---------------------------------------------------------------------------

/**
 * List all roles visible to a tenant: system roles (tenantId IS NULL) + the
 * tenant's own custom roles. Each role includes its permission codes.
 *
 * @param tenantId - The caller's tenant ID.
 */
export function listRoles(tenantId: number) {
  return prisma.clinicRole.findMany({
    where: {
      OR: [
        { tenantId: null },
        { tenantId },
      ],
    },
    include: {
      permissions: { select: { permissionCode: true } },
      _count: { select: { userRoles: true } },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
}

/**
 * Find a single role by ID, including its permission codes.
 *
 * @param roleId - Primary key of the ClinicRole row.
 */
export function findRoleById(roleId: number) {
  return prisma.clinicRole.findUnique({
    where: { id: roleId },
    include: { permissions: { select: { permissionCode: true } } },
  })
}

/**
 * Find a role by name within a specific scope (system or tenant).
 *
 * @param name     - Role name to search.
 * @param tenantId - Tenant scope; pass `null` for system roles.
 */
export function findRoleByName(name: string, tenantId: number | null) {
  return prisma.clinicRole.findFirst({ where: { name, tenantId } })
}

/**
 * Find a system-seeded clinic role by its stable key (e.g. `clinic_admin`,
 * `doctor`, `clinic_staff`). System roles have `tenantId = NULL` and
 * `isSystem = true`.
 *
 * @param key - The immutable role key set during seeding.
 */
export function findSystemRoleByKey(key: string) {
  return prisma.clinicRole.findFirst({ where: { key, tenantId: null, isSystem: true } })
}

/**
 * Create a new custom role for a tenant with an initial set of permission codes.
 *
 * @param tenantId  - Owning tenant.
 * @param name      - Display name for the role.
 * @param permCodes - Permission codes to assign immediately.
 */
export async function createRole(tenantId: number, name: string, permCodes: string[]) {
  // key is a slug: lowercase, spaces→underscores, non-alphanumeric stripped, prefixed with tenant id
  const key = `tenant_${tenantId}_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`
  return prisma.clinicRole.create({
    data: {
      tenantId,
      key,
      name,
      isSystem:    false,
      permVersion: 1,
      permissions: {
        create: permCodes.map(code => ({ permissionCode: code })),
      },
    },
    include: { permissions: { select: { permissionCode: true } } },
  })
}

/**
 * Update a custom role's permission set in a single transaction.
 * Increments permVersion so that cached permission sets are invalidated.
 *
 * @param roleId - The custom role to modify.
 * @param add    - Permission codes to grant.
 * @param remove - Permission codes to revoke.
 */
export async function updateRolePermissions(
  roleId: number,
  add:    string[],
  remove: string[],
) {
  return prisma.$transaction(async (tx) => {
    if (remove.length > 0) {
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
          permissionCode: { in: remove },
        },
      })
    }

    if (add.length > 0) {
      await tx.rolePermission.createMany({
        data:            add.map(code => ({ roleId, permissionCode: code })),
        skipDuplicates:  true,
      })
    }

    return tx.clinicRole.update({
      where: { id: roleId },
      data:  { permVersion: { increment: 1 } },
      include: { permissions: { select: { permissionCode: true } } },
    })
  })
}

/**
 * Delete a custom role row (permissions cascade via FK).
 *
 * @param roleId - Role to remove.
 */
export function deleteRole(roleId: number) {
  return prisma.clinicRole.delete({ where: { id: roleId } })
}

/**
 * Count how many UserRole rows reference a given role.
 * Used to guard against deleting a role that is still in use.
 *
 * @param roleId - Role to check.
 */
export function countRoleUsage(roleId: number) {
  return prisma.userRole.count({ where: { roleId } })
}

// ---------------------------------------------------------------------------
// User-role assignment
// ---------------------------------------------------------------------------

/**
 * Find a user by ID scoped to a specific tenant.
 * Returns null if the user does not exist or belongs to a different tenant.
 *
 * @param userId   - Target user's primary key.
 * @param tenantId - Required tenant scope for isolation.
 */
export function findUserInTenant(userId: number, tenantId: number) {
  return prisma.user.findFirst({ where: { id: userId, tenantId } })
}

/**
 * Assign a role to a user within a tenant.
 *
 * @param userId   - Target user.
 * @param roleId   - Role to assign.
 * @param tenantId - Tenant scope for the assignment.
 */
export function assignRoleToUser(userId: number, roleId: number, tenantId: number) {
  return prisma.userRole.create({ data: { userId, roleId, tenantId } })
}

/**
 * Remove a specific role from a user within a tenant.
 *
 * @param userId   - Target user.
 * @param roleId   - Role to revoke.
 * @param tenantId - Tenant scope (required for isolation).
 */
export function removeRoleFromUser(userId: number, roleId: number, tenantId: number) {
  return prisma.userRole.deleteMany({ where: { userId, roleId, tenantId } })
}

/**
 * Count the number of active role assignments for a user within a tenant.
 * Used to guard against removing the last role.
 *
 * @param userId   - Target user.
 * @param tenantId - Tenant scope.
 */
export function countUserRoles(userId: number, tenantId: number) {
  return prisma.userRole.count({ where: { userId, tenantId } })
}

/**
 * Return the IDs of every user currently assigned a given role within a tenant.
 * Used to enumerate who must have their permission cache invalidated when the
 * role's permission set changes.
 *
 * @param roleId   - The role whose members are needed.
 * @param tenantId - Tenant scope (required for isolation).
 */
export async function findUserIdsByRole(roleId: number, tenantId: number): Promise<number[]> {
  const rows = await prisma.userRole.findMany({
    where:  { roleId, tenantId },
    select: { userId: true },
  })
  return rows.map(r => r.userId)
}

/**
 * Return the IDs of every role assigned to a user within a tenant, read from
 * the user_roles join table (not the legacy users.role FK).
 *
 * @param userId   - Target user.
 * @param tenantId - Tenant scope (required for isolation).
 */
export async function findUserRoleIds(userId: number, tenantId: number): Promise<number[]> {
  const rows = await prisma.userRole.findMany({
    where:  { userId, tenantId },
    select: { roleId: true },
  })
  return rows.map(r => r.roleId)
}
