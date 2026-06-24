// @dev-agent — Business logic only; no direct DB calls from controller
// @db-agent reviewed — tenantId resolved from subdomain before any user lookup
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import { signToken } from '../config/jwt'
import * as authRepo from '../models/auth.repository'
import * as refreshTokenRepo from '../models/refresh-token.repository'
import { findUserRoleIds } from '../models/role.repository'
import { computePermSetVersion, resolvePermissions } from './permission.service'
import type { JwtPayload, LoginRequest, LoginResponse, MeResponse, RefreshResponse } from '../types'

/** TTL for refresh tokens: 30 days in milliseconds. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000

/** JWT access token duration in seconds (8 hours). */
const JWT_EXPIRES_IN_SECONDS = 8 * 60 * 60

/** Generic error message for all refresh token failures (prevents oracle attacks). */
const INVALID_TOKEN_MSG = 'Invalid or expired token'

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

  // 2. Find user scoped to this tenant (D-2-01: username-based lookup)
  const user = await authRepo.findUserByTenantUsername(tenant.id, body.username)
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

  // 5. Sign JWT — tenantId + branchId + plane + permSetVersion embedded
  const permSetVersion = await computePermSetVersion(user.id, tenant.id)
  const token = signToken({
    userId:         user.id,
    tenantId:       tenant.id,
    branchId:       user.branchId ?? undefined,
    plane:          'clinic',
    permSetVersion,
    role:           user.role,
  })

  // 6. Issue refresh token — store SHA-256 hash, return raw token to caller
  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const familyId        = crypto.randomUUID()
  await refreshTokenRepo.create({
    tokenHash: refreshTokenRepo.hashToken(rawRefreshToken),
    familyId,
    userId:    user.id,
    tenantId:  tenant.id,
    plane:     'clinic',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  })

  return {
    token,
    refreshToken: rawRefreshToken,
    userId:       user.id,
    tenantId:     tenant.id,
    branchId:     user.branchId,
    role:         user.role,
    name:         user.name,
  }
}

/** Minimal response shape for branch-switch (no new refresh token issued). */
interface SwitchBranchResponse {
  token:    string
  userId:   number
  tenantId: number
  branchId: number
  role:     string
  name:     string
}

// Re-issue a token scoped to a different branch within the same tenant.
export async function switchBranch(
  tenantId: number, userId: number, role: JwtPayload['role'], targetBranchId: number,
): Promise<SwitchBranchResponse> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  const branch = await authRepo.findBranchById(tenantId, targetBranchId)
  if (!branch) throw new AuthError('Branch not found', 404)

  const permSetVersion = await computePermSetVersion(userId, tenantId)
  const token = signToken({ userId, tenantId, branchId: targetBranchId, plane: 'clinic', permSetVersion, role })
  return { token, userId, tenantId, branchId: targetBranchId, role, name: user.name }
}

// Resolve the current clinic user's identity from their JWT context.
// roleIds come from the user_roles join table; permissions are resolved through
// the user_roles → roles → role_permissions chain.
export async function getMe(tenantId: number, userId: number, branchId: number | undefined): Promise<MeResponse> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  const [roleIds, perms] = await Promise.all([
    findUserRoleIds(userId, tenantId),
    resolvePermissions(userId, tenantId),
  ])

  return {
    userId:      user.id,
    tenantId,
    branchId:    branchId ?? user.branchId,
    name:        user.name,
    username:    user.username,
    email:       user.email,
    roleIds,
    permissions: [...perms],
  }
}

/**
 * Exchange a valid clinic-plane refresh token for a new access + refresh token pair.
 *
 * Security invariants enforced:
 * - Token must exist, not be expired, not rotated, not revoked, and have plane === 'clinic'.
 * - If `rotatedAt` is already set the token was already consumed — replay detected.
 *   The entire family is revoked and a 401 is returned.
 * - Tenant must still be active (clinic may have been suspended since last login).
 *
 * @param rawRefreshToken - The opaque token string sent by the client.
 * @throws AuthError(401) on any validation failure.
 */
export async function refreshClinicToken(rawRefreshToken: string): Promise<RefreshResponse> {
  const hash   = refreshTokenRepo.hashToken(rawRefreshToken)
  const record = await refreshTokenRepo.findByHash(hash)

  if (!record || record.plane !== 'clinic') {
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  if (record.revokedAt) {
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  if (record.expiresAt < new Date()) {
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  if (record.rotatedAt) {
    // Replay attack — token already consumed. Revoke entire family.
    await refreshTokenRepo.revokeFamily(record.familyId)
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  // Re-derive fresh JWT claims from DB
  if (!record.userId || !record.tenantId) {
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  const tenant = await authRepo.findTenantById(record.tenantId)
  if (!tenant || !tenant.isActive) {
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  const user = await authRepo.findUserById(record.tenantId, record.userId)
  if (!user || !user.isActive) {
    throw new AuthError(INVALID_TOKEN_MSG, 401)
  }

  const permSetVersion = await computePermSetVersion(record.userId, record.tenantId)
  const newToken = signToken({
    userId:         record.userId,
    tenantId:       record.tenantId,
    branchId:       user.branchId ?? undefined,
    plane:          'clinic',
    permSetVersion,
    role:           user.role,
  })

  const newRaw      = crypto.randomBytes(32).toString('hex')
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  await refreshTokenRepo.rotateToken(record.id, refreshTokenRepo.hashToken(newRaw), record.familyId, newExpiresAt)

  return { token: newToken, refreshToken: newRaw, expiresIn: JWT_EXPIRES_IN_SECONDS }
}

/**
 * Revoke the entire refresh token family for a clinic user (logout).
 * Idempotent: not-found is silently ignored.
 *
 * @param rawRefreshToken - The opaque token string sent by the client.
 */
export async function revokeClinicToken(rawRefreshToken: string): Promise<void> {
  const hash   = refreshTokenRepo.hashToken(rawRefreshToken)
  const record = await refreshTokenRepo.findByHash(hash)
  if (!record) return
  await refreshTokenRepo.revokeFamily(record.familyId)
}

