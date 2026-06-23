// @dev-agent — User management service
// @db-agent reviewed — ALL queries include tenantId; no cross-tenant access possible
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { AppError } from '../utils/errors'
import { config } from '../config/env'
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
  id: number; tenantId: number; name: string; email: string
  passwordHash?: string; role: string; isActive: boolean; createdAt: Date
}): UserResponse {
  const { passwordHash: _pw, ...rest } = user
  return { ...rest, role: String(rest.role), createdAt: rest.createdAt.toISOString() }
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
  await subscriptionService.assertCanAddUser(tenantId)

  const systemKey = LEGACY_ROLE_TO_SYSTEM_KEY[body.role]
  if (!systemKey) throw new UserError(`Unknown role: ${body.role}`, 400)

  const roleRow = await roleRepo.findSystemRoleByKey(systemKey)
  if (!roleRow) throw new UserError(`System role '${systemKey}' not seeded`, 500)

  const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds)
  try {
    const user = await userRepo.createUserWithRole(
      tenantId,
      { name: body.name, email: body.email, passwordHash, role: body.role },
      roleRow.id,
    )
    return safe(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Email already in use within this clinic', 409)
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
