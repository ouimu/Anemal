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
 * TRANSITIONAL — maps a role's stable `key` to the legacy 3-value role
 * string that UserResponse.role has always returned, now that the
 * User.role column is gone (ADR-0019/D-7). Deliberately duplicates the same
 * mapping shape as auth.service.ts's toLegacyRoleString (D-8) — that one is
 * module-private to auth.service.ts by design (D-8 confines it there for
 * the JWT claim specifically), so this is a small, intentional, temporary
 * duplication for the response-shape boundary, not drift.
 *
 * REMOVED in the frontend companion PR (Plan B, task "safe() gains
 * role-object + isPrimaryAdmin") once UserManagementTab.tsx/AdminBranches.tsx
 * are updated to consume the full role object atomically with that change.
 */
function toLegacyRoleStringTransitional(roleKey: string): 'admin' | 'doctor' | 'staff' {
  if (roleKey === 'clinic_admin') return 'admin'
  if (roleKey === 'doctor') return 'doctor'
  return 'staff'
}

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
}): UserResponse {
  const { passwordHash: _pw, roleRef, ...rest } = user
  if (!roleRef) throw new UserError('User has no role assigned — data integrity error', 500)
  return {
    ...rest,
    role:      toLegacyRoleStringTransitional(roleRef.key),
    email:     rest.email ?? null,
    phone:     rest.phone ?? null,
    createdAt: rest.createdAt.toISOString(),
  }
}

export async function listUsers(tenantId: number, branchId?: number | null): Promise<UserResponse[]> {
  const users = await userRepo.findUsers(tenantId, branchId)
  return users.map(safe)
}

export async function getUserById(tenantId: number, userId: number): Promise<UserResponse> {
  const user = await userRepo.findUserById(tenantId, userId)
  if (!user) throw new UserError('User not found', 404)
  return safe(user)
}

export async function createUser(tenantId: number, body: CreateUserRequest): Promise<UserResponse> {
  // D-2-02: at least one contact method required
  if (!body.email && !body.phone) {
    throw new UserError('At least one contact (email or phone) is required', 422)
  }

  await subscriptionService.assertCanAddUser(tenantId)

  const roleRow = await roleRepo.findRoleById(body.roleId)
  if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

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
    return safe(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Username or email already in use within this clinic', 409)
    }
    throw err
  }
}

export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest
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
    const roleRow = await roleRepo.findRoleById(body.roleId)
    if (!roleRow) throw new UserError(`Unknown role: ${body.roleId}`, 400)

    await userRepo.replaceUserRole(tenantId, userId, roleRow.id)
  }

  const user = await userRepo.updateUser(tenantId, userId, body)
  if (!user) throw new UserError('User not found', 404)
  return safe(user)
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
  return safe(updated)
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
    role:             user.roleRef ? toLegacyRoleStringTransitional(user.roleRef.key) : 'staff',
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
