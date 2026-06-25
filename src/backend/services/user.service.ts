// @dev-agent — User management service
// @db-agent reviewed — ALL queries include tenantId; no cross-tenant access possible
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { AppError } from '../utils/errors'
import { config } from '../config/env'
import prisma from '../config/db'
import * as userRepo from '../models/user.repository'
import * as roleRepo from '../models/role.repository'
import * as subscriptionService from './subscription.service'
import type { CreateUserRequest, UpdateUserRequest, UserResponse } from '../types'

/**
 * Maps the legacy API role strings accepted by the public endpoint to the
 * stable `key` values used in the `clinic_roles` table for system roles.
 */
const LEGACY_ROLE_TO_SYSTEM_KEY: Record<string, string> = {
  admin:  'clinic_admin',
  doctor: 'doctor',
  staff:  'clinic_staff',
} as const

function safe(user: {
  id: number; tenantId: number; name: string; username: string
  email: string | null; phone?: string | null
  passwordHash?: string; role: string; isActive: boolean; createdAt: Date
}): UserResponse {
  const { passwordHash: _pw, ...rest } = user
  return {
    ...rest,
    role:      String(rest.role),
    email:     rest.email ?? null,
    phone:     rest.phone ?? null,
    createdAt: rest.createdAt.toISOString(),
  }
}

export async function listUsers(tenantId: number): Promise<UserResponse[]> {
  const users = await userRepo.findUsers(tenantId)
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

  const systemKey = LEGACY_ROLE_TO_SYSTEM_KEY[body.role]
  if (!systemKey) throw new UserError(`Unknown role: ${body.role}`, 400)

  const roleRow = await roleRepo.findSystemRoleByKey(systemKey)
  if (!roleRow) throw new UserError(`System role '${systemKey}' not seeded`, 500)

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
        role:     body.role,
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

  if (body.role !== undefined) {
    const systemKey = LEGACY_ROLE_TO_SYSTEM_KEY[body.role]
    if (!systemKey) throw new UserError(`Unknown role: ${body.role}`, 400)

    const roleRow = await roleRepo.findSystemRoleByKey(systemKey)
    if (!roleRow) throw new UserError(`System role '${systemKey}' not seeded`, 500)

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
    role:             user.role,
    assignedBranches,
  }
}

export async function deactivateUser(tenantId: number, userId: number): Promise<void> {
  const existing = await userRepo.findUserById(tenantId, userId)
  if (!existing) throw new UserError('User not found', 404)
  await userRepo.setActive(tenantId, userId, false)
}

export class UserError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'USER_ERROR')
  }
}
