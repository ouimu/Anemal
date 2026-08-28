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
      _count: { select: { userRoles: { where: { tenantId } } } },
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
export async function createRole(
  tenantId: number,
  name: string,
  permCodes: string[],
  sourceRoleId?: number | null,
) {
  // key is a slug: lowercase, spaces→underscores, non-alphanumeric stripped, prefixed with tenant id
  const key = `tenant_${tenantId}_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`
  return prisma.clinicRole.create({
    data: {
      tenantId,
      key,
      name,
      isSystem:     false,
      permVersion:  1,
      sourceRoleId: sourceRoleId ?? null,
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
  tenantId: number,
  roleId:   number,
  add:      string[],
  remove:   string[],
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

    // Scope the write to the owning tenant (custom roles only — system roles are blocked upstream).
    await tx.clinicRole.updateMany({
      where: { id: roleId, tenantId },
      data:  { permVersion: { increment: 1 } },
    })

    return tx.clinicRole.findFirst({
      where:   { id: roleId, tenantId },
      include: { permissions: { select: { permissionCode: true } } },
    })
  })
}

/**
 * Delete a custom role row (permissions cascade via FK).
 * Scoped to tenantId — system roles (tenantId = null) are never matched.
 *
 * @param tenantId - Owning tenant scope; prevents cross-tenant deletes.
 * @param roleId   - Role to remove.
 */
export function deleteRole(tenantId: number, roleId: number) {
  return prisma.clinicRole.deleteMany({ where: { id: roleId, tenantId } })
}

/**
 * Count how many UserRole rows reference a given role, within the caller's own tenant.
 * Used to guard against deleting a role that is still in use.
 *
 * NOTE: this narrows the check to the caller's tenant — it does NOT catch a
 * cross-tenant "drift" UserRole row (same roleId, a different tenantId; DB-insertable,
 * app-unreachable via normal writes). If such a row exists, this returns 0 even though
 * the FKs onto `roles` will still refuse `roleRepo.deleteRole`. Two FKs reference a
 * role, BOTH onDelete: Restrict in the live dev/test DB: `user_roles_roleId_fkey`
 * (UserRole.role) and `users_roleId_fkey` (User.roleRef). (The migration chain declares
 * the latter SET NULL and it has drifted to Restrict in the running DB — see qa-signoff
 * §9 R3-F1; either way the delete is refused.) That is exactly why `role.service.ts`'s
 * `deleteRole` wraps the delete in a try/catch for `PrismaClientKnownRequestError` P2003.
 * Do not remove that catch on the assumption this count already covers it.
 *
 * @param roleId   - Role to check.
 * @param tenantId - Caller's tenant — narrows the count to this tenant's own assignments.
 */
export function countRoleUsage(roleId: number, tenantId: number) {
  return prisma.userRole.count({ where: { roleId, tenantId } })
}

// ---------------------------------------------------------------------------
// User-role assignment
// ---------------------------------------------------------------------------

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
