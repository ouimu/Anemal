// @dev-agent — Business logic only; no direct DB calls from controller
// @db-agent reviewed — tenantId resolved from subdomain before any user lookup
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import { config } from '../config/env'
import { signToken, signPendingToken, verifyPendingToken } from '../config/jwt'
import * as authRepo from '../models/auth.repository'
import * as refreshTokenRepo from '../models/refresh-token.repository'
import * as userRepo from '../models/user.repository'
import { findUserRoleIds } from '../models/role.repository'
import { computePermSetVersion, resolvePermissions } from './permission.service'
import type { JwtPayload, LoginRequest, LoginResponse, SelectBranchResponse, MeResponse, RefreshResponse } from '../types'

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

/**
 * Map a role's stable `key` to the legacy 3-value role string the JWT `role`
 * claim and frontend consumers still expect (D-8, option (a) — BA sign-off
 * F-1, confined to this file). Every custom/cloned role (including
 * `clinic_staff` itself) maps to `'staff'`.
 *
 * NOT exported — deliberately private to this file.
 */
function toLegacyRoleString(roleKey: string): 'admin' | 'doctor' | 'staff' {
  if (roleKey === 'clinic_admin') return 'admin'
  if (roleKey === 'doctor') return 'doctor'
  return 'staff'
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

  // 5. Compute permission version and check role
  const permSetVersion = await computePermSetVersion(user.id, tenant.id)
  const legacyRole = toLegacyRoleString(user.roleRef!.key)
  const isAdmin = legacyRole === 'admin'

  // Admin bypass — skip branch selection, issue full JWT immediately
  if (isAdmin) {
    const token = signToken({
      userId:         user.id,
      tenantId:       tenant.id,
      branchId:       undefined,   // null in JWT = all-branches scope
      plane:          'clinic',
      permSetVersion,
      role:           legacyRole,
    })
    const rawRefreshToken = crypto.randomBytes(32).toString('hex')
    const familyId        = crypto.randomUUID()
    await refreshTokenRepo.create({
      tokenHash: refreshTokenRepo.hashToken(rawRefreshToken),
      familyId,
      userId:    user.id,
      tenantId:  tenant.id,
      branchId:  null,
      plane:     'clinic',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    return {
      requiresBranchSelection: false as const,
      token,
      refreshToken: rawRefreshToken,
      userId:       user.id,
      tenantId:     tenant.id,
      branchId:     null,
      role:         legacyRole,
      name:         user.name,
      companyName:  tenant.name,
    }
  }

  // Non-admin: two-step flow — assigned branches only
  const branches = await userRepo.getUserBranches(tenant.id, user.id)
  if (branches.length === 0) {
    throw new AuthError('You are not assigned to any branch. Contact your administrator.', 403)
  }

  const pendingToken = signPendingToken({
    userId:         user.id,
    tenantId:       tenant.id,
    plane:          'clinic',
    permSetVersion,
    role:           legacyRole,
    scope:          'branch_select',
  })

  return { requiresBranchSelection: true as const, pendingToken, branches }
}

/**
 * Step 2 of two-step login: exchange a pending token + chosen branchId for a full JWT.
 * clinic_admin: any active branch in tenant allowed.
 * staff/doctor: branchId must be in user_branches for this user.
 */
export async function selectBranch(
  pendingToken: string,
  branchId:     number,
): Promise<SelectBranchResponse> {
  let payload: JwtPayload
  try {
    payload = verifyPendingToken(pendingToken)
  } catch {
    throw new AuthError('Invalid or expired session. Please log in again.', 401)
  }

  const { userId, tenantId, role, permSetVersion } = payload

  // Verify user still active
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found or inactive.', 401)
  const legacyRole = toLegacyRoleString(user.roleRef!.key)

  // Verify branch exists and is active in this tenant
  const branch = await authRepo.findBranchById(tenantId, branchId)
  if (!branch) throw new AuthError('Branch not found or inactive.', 404)

  const tenant = await authRepo.findTenantById(tenantId)
  const companyName = tenant?.name ?? ''

  // Non-admin: verify branchId is in user_branches
  if (role !== 'admin') {
    const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
    if (!assignedBranches.some(b => b.id === branchId)) {
      throw new AuthError('You are not assigned to this branch.', 403)
    }
  }

  const token = signToken({ userId, tenantId, branchId, plane: 'clinic', permSetVersion, role })

  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const familyId        = crypto.randomUUID()
  await refreshTokenRepo.create({
    tokenHash: refreshTokenRepo.hashToken(rawRefreshToken),
    familyId,
    userId,
    tenantId,
    branchId,
    plane:     'clinic',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  })

  return {
    requiresBranchSelection: false as const,
    token,
    refreshToken: rawRefreshToken,
    userId,
    tenantId,
    branchId,
    role:  legacyRole,
    name:  user.name,
    companyName,
  }
}

/** Minimal response shape for branch-switch (no new refresh token issued). */
interface SwitchBranchResponse {
  token:       string
  userId:      number
  tenantId:    number
  branchId:    number | null
  role:        string
  name:        string
  companyName: string
}

// Re-issue a token scoped to a different branch (or null = all-branches for admins).
export async function switchBranch(
  tenantId: number, userId: number, role: JwtPayload['role'], targetBranchId: number | null,
): Promise<SwitchBranchResponse> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)
  const legacyRole = toLegacyRoleString(user.roleRef!.key)

  // null = reset to all-branches (admin only)
  if (targetBranchId === null) {
    if (role !== 'admin') throw new AuthError('Only admins may switch to all-branches scope.', 403)
    const tenant = await authRepo.findTenantById(tenantId)
    const companyName = tenant?.name ?? ''
    const permSetVersion = await computePermSetVersion(userId, tenantId)
    const token = signToken({ userId, tenantId, branchId: undefined, plane: 'clinic', permSetVersion, role })
    return { token, userId, tenantId, branchId: null, role: legacyRole, name: user.name, companyName }
  }

  const branch = await authRepo.findBranchById(tenantId, targetBranchId)
  if (!branch) throw new AuthError('Branch not found', 404)

  // Non-admin: verify target branch is in user's assigned branches
  if (role !== 'admin') {
    const assignedBranches = await userRepo.getUserBranches(tenantId, userId)
    if (!assignedBranches.some(b => b.id === targetBranchId)) {
      throw new AuthError('You are not assigned to this branch.', 403)
    }
  }

  const tenant = await authRepo.findTenantById(tenantId)
  const companyName = tenant?.name ?? ''

  const permSetVersion = await computePermSetVersion(userId, tenantId)
  const token = signToken({ userId, tenantId, branchId: targetBranchId, plane: 'clinic', permSetVersion, role })
  return { token, userId, tenantId, branchId: targetBranchId, role, name: user.name, companyName }
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
    branchId:       record.branchId ?? user.branchId ?? undefined,
    plane:          'clinic',
    permSetVersion,
    role:           toLegacyRoleString(user.roleRef!.key),
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

/**
 * Self-service password change (PWD-1, brainstorm §4.2 B-1). The caller can
 * only ever act on their own row — userId/tenantId come from the verified
 * JWT context, never from the request body, so BOLA is structurally
 * impossible here (there is no target-user parameter).
 *
 * On success, ALL of the caller's refresh-token families are revoked
 * (PWD-3) so a stolen 30-day refresh token stops working immediately. The
 * 8h access JWT already in the caller's hand keeps working until it expires
 * (Q-G3, accepted residual).
 *
 * @param tenantId        - From req.context (JWT), never trusted from body.
 * @param userId          - From req.context (JWT), never trusted from body.
 * @param currentPassword - Must match the caller's existing hash.
 * @param newPassword     - Already validated >= 8 chars by the zod schema.
 * @throws AuthError(401) if currentPassword does not match.
 */
export async function changePassword(
  tenantId: number,
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await authRepo.findUserById(tenantId, userId)
  if (!user || !user.isActive) throw new AuthError('User not found', 404)

  const matches = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!matches) throw new AuthError('Current password is incorrect', 401)

  if (newPassword.length < 8) {
    throw new AuthError('Password must be at least 8 characters', 422)
  }

  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds)
  await userRepo.setPasswordHash(tenantId, userId, passwordHash)
  await refreshTokenRepo.revokeAllForUser(userId)
}

