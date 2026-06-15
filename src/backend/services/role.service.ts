/**
 * Role management service — business rules for clinic role CRUD and user-role assignment.
 *
 * Business rules enforced here:
 *  - Only custom roles (isSystem=false) can be edited or deleted.
 *  - No permission escalation: callers may only grant permissions they themselves hold.
 *  - Deleting a role in use → 409 CONFLICT.
 *  - Removing the last role from a user → 409 CONFLICT.
 *  - Editing a role bumps permVersion → forces permission cache miss on next request.
 *
 * @module role.service
 */

import * as roleRepo from '../models/role.repository'
import { invalidatePermCache } from './permission.service'
import {
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors'

/** Shape returned for a single role in list/get responses. */
export interface RoleDto {
  id:          number
  name:        string
  isSystem:    boolean
  tenantId:    number | null
  permVersion: number
  permissions: string[]
}

/** Convert a Prisma ClinicRole row (with permissions included) into a RoleDto. */
function toDto(role: {
  id:          number
  name:        string
  isSystem:    boolean
  tenantId:    number | null
  permVersion: number
  permissions: { permissionCode: string }[]
}): RoleDto {
  return {
    id:          role.id,
    name:        role.name,
    isSystem:    role.isSystem,
    tenantId:    role.tenantId,
    permVersion: role.permVersion,
    permissions: role.permissions.map(p => p.permissionCode),
  }
}

/**
 * List system roles and the caller's tenant custom roles, each with permissions[].
 *
 * @param tenantId - The calling user's tenant ID.
 */
export async function listRoles(tenantId: number): Promise<RoleDto[]> {
  const roles = await roleRepo.listRoles(tenantId)
  return roles.map(toDto)
}

/**
 * Clone a system role into a tenant-scoped custom role.
 * Only permissions the caller already holds are copied (no escalation).
 *
 * @param tenantId        - Owning tenant for the new role.
 * @param sourceRoleName  - Name of the system role to clone.
 * @param newName         - Name for the new custom role.
 * @param callerPerms     - Full permission set held by the calling user.
 */
export async function cloneRole(
  tenantId:       number,
  sourceRoleName: string,
  newName:        string,
  callerPerms:    Set<string>,
): Promise<RoleDto> {
  const sourceRole = await roleRepo.findRoleByName(sourceRoleName, null)
  if (!sourceRole) {
    throw new NotFoundError(`System role '${sourceRoleName}'`)
  }

  const existing = await roleRepo.findRoleByName(newName, tenantId)
  if (existing) {
    throw new ConflictError(`A role named '${newName}' already exists for this tenant`)
  }

  const sourceWithPerms = await roleRepo.findRoleById(sourceRole.id)
  if (!sourceWithPerms) {
    throw new NotFoundError(`System role '${sourceRoleName}'`)
  }

  const allowedPerms = sourceWithPerms.permissions
    .map(p => p.permissionCode)
    .filter(code => callerPerms.has(code))

  const created = await roleRepo.createRole(tenantId, newName, allowedPerms)
  // createRole returns a ClinicRole with permissions included
  const createdWithPerms = await roleRepo.findRoleById(created.id)
  if (!createdWithPerms) {
    throw new NotFoundError('Newly created role')
  }
  return toDto(createdWithPerms)
}

/**
 * Modify the permission set of a custom role.
 * System roles are immutable — returns 403.
 * Caller cannot grant permissions they do not hold (no escalation).
 * Bumps permVersion and invalidates permission cache for all affected users.
 *
 * @param tenantId    - Caller's tenant scope.
 * @param roleId      - Role to modify.
 * @param add         - Permission codes to add.
 * @param remove      - Permission codes to remove.
 * @param callerPerms - Full permission set held by the calling user.
 */
export async function updateRolePermissions(
  tenantId:    number,
  roleId:      number,
  add:         string[],
  remove:      string[],
  callerPerms: Set<string>,
): Promise<RoleDto> {
  const role = await roleRepo.findRoleById(roleId)
  if (!role) {
    throw new NotFoundError('Role')
  }
  if (role.isSystem) {
    throw new ForbiddenError('System roles are read-only')
  }
  if (role.tenantId !== tenantId) {
    throw new ForbiddenError('Role does not belong to your tenant')
  }

  const escalations = add.filter(code => !callerPerms.has(code))
  if (escalations.length > 0) {
    throw new ForbiddenError(
      `Cannot grant permissions you do not hold: ${escalations.join(', ')}`,
    )
  }

  const updated = await roleRepo.updateRolePermissions(roleId, add, remove)
  return toDto(updated)
}

/**
 * Delete a custom role.
 * Returns 403 for system roles.
 * Returns 409 if the role is currently assigned to any user.
 *
 * @param tenantId - Caller's tenant scope.
 * @param roleId   - Role to delete.
 */
export async function deleteRole(tenantId: number, roleId: number): Promise<void> {
  const role = await roleRepo.findRoleById(roleId)
  if (!role) {
    throw new NotFoundError('Role')
  }
  if (role.isSystem) {
    throw new ForbiddenError('System roles cannot be deleted')
  }
  if (role.tenantId !== tenantId) {
    throw new ForbiddenError('Role does not belong to your tenant')
  }

  const usageCount = await roleRepo.countRoleUsage(roleId)
  if (usageCount > 0) {
    throw new ConflictError('Cannot delete a role that is currently assigned to users')
  }

  await roleRepo.deleteRole(roleId)
}

/**
 * Assign a role to a user within the caller's tenant.
 * No escalation: caller cannot assign a role whose permissions exceed their own.
 *
 * @param tenantId    - Caller's tenant scope; validates role ownership.
 * @param targetUserId - User who will receive the role.
 * @param roleId       - Role to assign.
 * @param callerPerms  - Full permission set held by the calling user.
 */
export async function assignRoleToUser(
  tenantId:      number,
  targetUserId:  number,
  roleId:        number,
  callerPerms:   Set<string>,
): Promise<void> {
  const role = await roleRepo.findRoleById(roleId)
  if (!role) {
    throw new NotFoundError('Role')
  }

  // Role must be either a system role or belong to this tenant
  if (!role.isSystem && role.tenantId !== tenantId) {
    throw new ForbiddenError('Role does not belong to your tenant')
  }

  // No escalation: every permission in the role must be held by the caller
  const escalations = role.permissions
    .map(p => p.permissionCode)
    .filter(code => !callerPerms.has(code))

  if (escalations.length > 0) {
    throw new ForbiddenError(
      `Cannot assign a role whose permissions exceed your own: ${escalations.join(', ')}`,
    )
  }

  try {
    await roleRepo.assignRoleToUser(targetUserId, roleId, tenantId)
  } catch (err: unknown) {
    // Prisma unique constraint — already assigned
    if (isPrismaUniqueConstraintError(err)) {
      throw new ValidationError('User already has this role assigned')
    }
    throw err
  }

  invalidatePermCache(targetUserId, tenantId)
}

/**
 * Remove a role from a user.
 * Returns 409 if removing this role would leave the user with no roles.
 *
 * @param tenantId     - Caller's tenant scope.
 * @param targetUserId - User whose role is being removed.
 * @param roleId       - Role to revoke.
 */
export async function removeRoleFromUser(
  tenantId:      number,
  targetUserId:  number,
  roleId:        number,
): Promise<void> {
  const remaining = await roleRepo.countUserRoles(targetUserId, tenantId)
  if (remaining <= 1) {
    throw new ConflictError('Cannot remove the last role from a user')
  }

  await roleRepo.removeRoleFromUser(targetUserId, roleId, tenantId)
  invalidatePermCache(targetUserId, tenantId)
}

/** Narrow type guard for Prisma P2002 unique constraint violation. */
function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  )
}
