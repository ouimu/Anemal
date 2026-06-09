// @dev-agent — Business logic only; no direct DB calls from controller
// @db-agent reviewed — tenantId resolved from subdomain before any user lookup
import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import { signToken } from '../config/jwt'
import * as authRepo from '../models/auth.repository'
import type { LoginRequest, LoginResponse } from '../types'

export class AuthError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'AUTH_ERROR')
  }
}

// "HH:MM" string comparison (lexicographic works for zero-padded 24h time).
function isWithinWindow(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return true
  const hhmm = now.toTimeString().slice(0, 5)
  return start <= hhmm && hhmm <= end
}

export async function login(body: LoginRequest): Promise<LoginResponse> {
  // 1. Resolve tenant from subdomain
  const tenant = await authRepo.findTenantBySubdomain(body.subdomain)
  if (!tenant || !tenant.isActive) {
    throw new AuthError('Invalid credentials', 401)
  }

  // 2. Find user scoped to this tenant
  const user = await authRepo.findUserByTenantEmail(tenant.id, body.email)
  if (!user || !user.isActive) {
    throw new AuthError('Invalid credentials', 401)
  }

  // 3. Verify password
  const passwordMatch = await bcrypt.compare(body.password, user.passwordHash)
  if (!passwordMatch) {
    throw new AuthError('Invalid credentials', 401)
  }

  // 4. Login time-window restriction (Phase 4, FR-01-06)
  if (!isWithinWindow(user.allowedStartTime, user.allowedEndTime, new Date())) {
    throw new AuthError(`Login not allowed outside ${user.allowedStartTime}–${user.allowedEndTime}`, 403)
  }

  await authRepo.touchLastLogin(user.id)

  // 5. Sign JWT — tenantId + branchId embedded
  const token = signToken({ userId: user.id, tenantId: tenant.id, branchId: user.branchId ?? undefined, role: user.role })

  return {
    token,
    userId:   user.id,
    tenantId: tenant.id,
    branchId: user.branchId,
    role:     user.role,
    name:     user.name,
  }
}

// Re-issue a token scoped to a different branch within the same tenant.
export async function switchBranch(
  tenantId: number, userId: number, role: 'admin' | 'doctor' | 'staff', targetBranchId: number,
): Promise<LoginResponse> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  const branch = await authRepo.findBranchById(tenantId, targetBranchId)
  if (!branch) throw new AuthError('Branch not found', 404)

  const token = signToken({ userId, tenantId, branchId: targetBranchId, role })
  return { token, userId, tenantId, branchId: targetBranchId, role, name: user.name }
}
