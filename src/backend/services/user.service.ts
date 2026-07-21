// @dev-agent — User management service
// @db-agent reviewed — ALL queries include tenantId; no cross-tenant access possible
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { AppError } from '../utils/errors'
import { config } from '../config/env'
import prisma from '../config/db'
import * as userRepo from '../models/user.repository'
import * as roleRepo from '../models/role.repository'
import * as refreshTokenRepo from '../models/refresh-token.repository'
import * as subscriptionService from './subscription.service'
import type { CreateUserRequest, UpdateUserRequest, UserResponse } from '../types'

/**
 * Guards against lockout-equivalent actions on the tenant's primary admin
 * (ADR-0016). The primary admin is the lowest-id `role='admin'` user in the
 * tenant (userRepo.findPrimaryAdminId). Throws 403 when the target user IS
 * the primary admin AND the requested change would either:
 *   (a) set isActive to false (deactivation), or
 *   (b) set role to anything other than 'admin' (role-demotion bypass, D-5).
 * Reactivation, non-role/non-isActive edits (name, password) are unaffected.
 *
 * // ponytail: no pessimistic lock (SELECT...FOR UPDATE) on
 * // findPrimaryAdminId — accepted TOCTOU risk (ADR-0016 D-8). A missed race
 * // fails closed (a rare spurious 403 that a retry resolves), never open.
 *
 * Deliberately NOT called from platform-customers.service.ts
 * deactivateTenantAdminUser (CO-4) — that path is the platform operator's
 * audited recovery mechanism for a locked-out tenant (ADR-0016 D-7).
 */
async function assertNotPrimaryAdminDeactivation(
  tenantId: number,
  userId: number,
  change: { isActive?: boolean; roleId?: number },
): Promise<void> {
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  if (primaryAdminId === null || userId !== primaryAdminId) return

  if (change.isActive === false) {
    throw new UserError('Cannot deactivate the primary clinic admin', 403)
  }
  if (change.roleId !== undefined) {
    const targetRole = await roleRepo.findRoleById(change.roleId)
    if (!targetRole || targetRole.key !== 'clinic_admin') {
      throw new UserError("Cannot change the primary clinic admin's role", 403)
    }
  }
}

function safe(user: {
  id: number; tenantId: number; name: string; username: string
  email: string | null; phone?: string | null
  passwordHash?: string; isActive: boolean; createdAt: Date
  roleRef: { id: number; name: string; key: string; isSystem: boolean } | null
}, isPrimaryAdmin: boolean): UserResponse {
  const { passwordHash: _pw, roleRef, ...rest } = user
  if (!roleRef) throw new UserError('User has no role assigned — data integrity error', 500)
  return {
    ...rest,
    role: { id: roleRef.id, name: roleRef.name, key: roleRef.key, isSystem: roleRef.isSystem },
    email:     rest.email ?? null,
    phone:     rest.phone ?? null,
    createdAt: rest.createdAt.toISOString(),
    isPrimaryAdmin,
  }
}

export async function listUsers(tenantId: number, branchId?: number | null): Promise<UserResponse[]> {
  const [users, primaryAdminId] = await Promise.all([
    userRepo.findUsers(tenantId, branchId),
    userRepo.findPrimaryAdminId(tenantId),
  ])
  return users.map(u => safe(u, u.id === primaryAdminId))
}

export async function getUserById(tenantId: number, userId: number): Promise<UserResponse> {
  const [user, primaryAdminId] = await Promise.all([
    userRepo.findUserById(tenantId, userId),
    userRepo.findPrimaryAdminId(tenantId),
  ])
  if (!user) throw new UserError('User not found', 404)
  return safe(user, user.id === primaryAdminId)
}

/**
 * No-escalation guard (CORR-3/T-URA-2.7): the role being assigned must not
 * hold a permission the caller doesn't already have — UNLESS the caller
 * holds `roles.manage`.
 *
 * The `roles.manage` exemption is required, not optional: the BA sign-off's
 * own CORR-3 acceptance test states plainly "the same assignment by a
 * clinic_admin → 200". The actual seeded permission matrix
 * (prisma/seed-rbac.ts) intentionally withholds several clinical-only codes
 * from `clinic_admin` (e.g. `vaccination.create`, `emr.create`,
 * `prescriptions.create` — segregation of clinical duties, not a privilege
 * tier), so a literal subset check blocks `clinic_admin` from creating a
 * `doctor` or `clinic_staff` user — a basic, previously-working admin
 * action, and a regression this migration must not ship. A caller holding
 * `roles.manage` can already edit any role's permission set directly, so a
 * subset check is moot for them; exempting on that code (rather than
 * hardcoding the `clinic_admin` key) keeps the rule general for any
 * tenant-custom role a clinic later grants equivalent authority.
 *
 * @param roleRow     - The target role, with its permission codes.
 * @param callerPerms - The caller's own resolved permission set.
 */
function assertNoRoleEscalation(
  roleRow: { key: string; permissions: { permissionCode: string }[] },
  callerPerms: Set<string>,
): void {
  const escalations = roleRow.permissions
    .map(p => p.permissionCode)
    .filter(code => !callerPerms.has(code))

  // D-4: clinic_admin is sealed — the roles.manage exemption below must
  // NEVER apply to it, or a custom role merely granted roles.manage (without
  // actually holding every clinic_admin permission) could assign the real
  // Admin role to itself/anyone, recreating exactly the escalation path D-4's
  // clone-rejection (role.service.ts cloneRole) closes on the clone side.
  // A caller who already holds every clinic_admin permission (i.e. is
  // already admin-equivalent) has no escalations here and passes normally.
  if (roleRow.key === 'clinic_admin') {
    if (escalations.length > 0) {
      throw new UserError(`Cannot assign a role whose permissions exceed your own: ${escalations.join(', ')}`, 403)
    }
    return
  }

  if (callerPerms.has('roles.manage')) return

  if (escalations.length > 0) {
    throw new UserError(`Cannot assign a role whose permissions exceed your own: ${escalations.join(', ')}`, 403)
  }
}

/**
 * Tenant-isolation guard for role assignment (multi-tenancy ABSOLUTE rule,
 * CLAUDE.md). `findRoleById` is a global, non-tenant-scoped lookup — system
 * roles (`isSystem: true`, `tenantId: null`) are assignable by any tenant,
 * but a tenant-custom role must belong to the caller's own tenant. Without
 * this, a caller could pass another tenant's custom `roleId` by number and
 * assign it, since `assertNoRoleEscalation`'s `roles.manage` exemption never
 * blocks on tenant ownership. Mirrors the ownership check that existed on
 * the now-removed `role.service.ts assignRoleToUser` path.
 *
 * 404, not 403: a 403 would confirm to the caller that a role with this ID
 * exists in some other tenant (BOLA existence-leak, ADR-0014 precedent) — the
 * same reasoning `findRoleById` callers already apply for `Unknown role`.
 */
function assertRoleBelongsToCallerTenant(
  roleRow: { isSystem: boolean; tenantId: number | null },
  tenantId: number,
): void {
  if (roleRow.isSystem) return
  if (roleRow.tenantId !== tenantId) {
    throw new UserError('Role not found', 404)
  }
}

export async function createUser(
  tenantId: number,
  body: CreateUserRequest,
  callerPerms: Set<string>,
  hasAssignRole: boolean,
): Promise<UserResponse> {
  // D-2-02: at least one contact method required
  if (!body.email && !body.phone) {
    throw new UserError('At least one contact (email or phone) is required', 422)
  }

  await subscriptionService.assertCanAddUser(tenantId)

  if (!hasAssignRole) {
    throw new UserError('Assigning a role requires the staff.assign_role permission', 403)
  }

  const roleRow = await roleRepo.findRoleById(body.roleId)
  if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

  assertRoleBelongsToCallerTenant(roleRow, tenantId)
  assertNoRoleEscalation(roleRow, callerPerms)

  const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds)
  try {
    const user = await userRepo.createUserWithRole(
      tenantId,
      {
        name:     body.name,
        username: body.username,
        email:    body.email ?? null,
        phone:    body.phone ?? null,
        passwordHash,
      },
      roleRow.id,
    )
    const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
    return safe(user, user.id === primaryAdminId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Username or email already in use within this clinic', 409)
    }
    throw err
  }
}

export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest,
  callerPerms: Set<string>, hasAssignRole: boolean,
): Promise<UserResponse> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)

  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: body.isActive, roleId: body.roleId })

  // ADR-0016 D-6: restoring a deactivated user must re-check the seat quota,
  // same as createUser — restore should not be a quota-enforcement bypass.
  if (body.isActive === true && existing.isActive === false) {
    await subscriptionService.assertCanAddUser(tenantId)
  }

  if (body.roleId !== undefined) {
    if (!hasAssignRole) {
      throw new UserError('Assigning a role requires the staff.assign_role permission', 403)
    }

    const roleRow = await roleRepo.findRoleById(body.roleId)
    if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

    assertRoleBelongsToCallerTenant(roleRow, tenantId)
    assertNoRoleEscalation(roleRow, callerPerms)

    await userRepo.replaceUserRole(tenantId, userId, roleRow.id)
  }

  const user = await userRepo.updateUser(tenantId, userId, body)
  if (!user) throw new UserError('User not found', 404)
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  return safe(user, user.id === primaryAdminId)
}

/** Shape returned for a single role in user-roles responses. */
export interface UserRoleDto {
  id:                number
  name:              string
  isSystem:          boolean
  permissions:       string[]
  assignedUserCount: number
}

/**
 * Return the roles assigned to a user within a tenant, each with permission
 * codes and assignedUserCount.
 *
 * @param tenantId - Tenant scope (required for isolation).
 * @param userId   - Target user's primary key.
 */
export async function getUserRoles(tenantId: number, userId: number): Promise<UserRoleDto[]> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)

  const rows = await userRepo.findUserRolesWithDetails(tenantId, userId)
  return rows.map(ur => ({
    id:                ur.role.id,
    name:              ur.role.name,
    isSystem:          ur.role.isSystem,
    permissions:       ur.role.permissions.map(p => p.permissionCode),
    assignedUserCount: ur.role._count.userRoles,
  }))
}

/** Return the branches assigned to a user (for the admin assignment UI). */
export async function getUserBranches(tenantId: number, userId: number): Promise<{ id: number; name: string }[]> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)
  return userRepo.getUserBranches(tenantId, userId)
}

/**
 * Assign (or clear) the branch for a staff or doctor user.
 *
 * @deprecated Use assignUserBranches instead (supports multiple branches).
 *
 * @param tenantId - Tenant scope (required for isolation).
 * @param userId   - Target user's primary key.
 * @param branchId - Branch to assign, or null to clear the assignment.
 */
export async function assignUserBranch(
  tenantId: number,
  userId:   number,
  branchId: number | null,
): Promise<UserResponse> {
  const user = await userRepo.findUserById(tenantId, userId)
  if (!user) throw new UserError('User not found', 404)

  if (branchId !== null) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId } })
    if (!branch) throw new UserError('Branch not found in this tenant', 404)
  }

  // Determine if any of the user's roles are admin-level
  const userRoleRows = await userRepo.findUserRolesWithDetails(tenantId, userId)
  const isAdmin = userRoleRows.some(ur => ur.role.key?.includes('admin'))

  if (!isAdmin && branchId === null) {
    throw new UserError('Staff and Doctor must be assigned to a branch', 422)
  }

  const updated = await userRepo.updateUserBranch(tenantId, userId, branchId)
  if (!updated) throw new UserError('User not found', 404)
  const primaryAdminId = await userRepo.findPrimaryAdminId(tenantId)
  return safe(updated, updated.id === primaryAdminId)
}

/** Shape returned by assignUserBranches. */
export interface AssignBranchesResponse {
  id:               number
  name:             string
  username:         string
  role:             string
  assignedBranches: { id: number; name: string }[]
}

/**
 * Atomically replace all branch assignments for a user, validating that every
 * supplied branch ID belongs to the same tenant.
 *
 * Business rules:
 * 1. All branch IDs must belong to the caller's tenant (404 if any mismatch).
 * 2. Staff and doctors must have at least one branch (422 if empty array).
 * 3. Admins (roles whose key contains 'admin') may have zero branches.
 *
 * @param tenantId  - Tenant scope (required for isolation).
 * @param userId    - Target user's primary key.
 * @param branchIds - Ordered list of branch IDs to assign; [] to clear (admin only).
 */
export async function assignUserBranches(
  tenantId:  number,
  userId:    number,
  branchIds: number[],
): Promise<AssignBranchesResponse> {
  const user = await userRepo.findUserById(tenantId, userId)
  if (!user) throw new UserError('User not found', 404)

  if (branchIds.length > 0) {
    const validBranches = await prisma.branch.findMany({
      where:  { id: { in: branchIds }, tenantId },
      select: { id: true },
    })
    if (validBranches.length !== branchIds.length) {
      throw new UserError('One or more branches not found in this tenant', 404)
    }
  }

  const userRoleRows = await userRepo.findUserRolesWithDetails(tenantId, userId)
  const isAdmin = userRoleRows.some(ur => ur.role.key?.includes('admin'))

  if (!isAdmin && branchIds.length === 0) {
    throw new UserError('Staff and Doctor must be assigned to at least one branch', 422)
  }

  await userRepo.replaceUserBranches(tenantId, userId, branchIds)

  const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
  return {
    id:               user.id,
    name:             user.name,
    username:         user.username,
    // Plan B (T-URA-2.3): AssignBranchesResponse deliberately keeps the
    // legacy 3-value string shape — nothing in src/frontend reads this
    // response body (confirmed by grep), so it is out of scope for the
    // role-object migration; this inline map replaces the now-deleted
    // toLegacyRoleStringTransitional helper for this one call site only.
    role: user.roleRef?.key === 'clinic_admin' ? 'admin' : user.roleRef?.key === 'doctor' ? 'doctor' : 'staff',
    assignedBranches,
  }
}

export async function deactivateUser(tenantId: number, userId: number): Promise<void> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)
  await assertNotPrimaryAdminDeactivation(tenantId, userId, { isActive: false })
  await userRepo.setActive(tenantId, userId, false)
}

/**
 * Admin resets another clinic user's password (PWD-2, brainstorm §4.2 B-2).
 * No current-password check (that is the point of an admin reset — Q-G2
 * also allows self-targeting via this same route). Tenant-scoped
 * `updateMany` (user.repository.ts `setPasswordHash`) means a cross-tenant
 * `userId` affects 0 rows → 404, never 403 (ADR-0014 BOLA precedent).
 *
 * The 8-char minimum is enforced here (422) rather than via zod .min(8) in
 * the controller schema — this codebase's shared `validate()` middleware
 * always maps zod failures to 400 (see auth.service.ts changePassword() for
 * the identical reasoning), and the established WeakPasswordError precedent
 * in platform-customers.service.ts treats "password too short" as a
 * business-rule violation (422), not a malformed request.
 *
 * @param tenantId    - Caller's tenant (req.context, never from body/params).
 * @param userId      - Target user's primary key (path param).
 * @param newPassword - New password; validated >= 8 chars here.
 */
export async function resetUserPassword(
  tenantId: number,
  userId: number,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new UserError('Password must be at least 8 characters', 422)
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
  const updated = await userRepo.setPasswordHash(tenantId, userId, passwordHash)
  if (updated === 0) throw new UserError('User not found', 404)
  await refreshTokenRepo.revokeAllForUser(userId)
}

export class UserError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'USER_ERROR')
  }
}
