/**
 * Platform-auth service — business logic for platform-plane authentication.
 *
 * Platform users authenticate separately from clinic users:
 *   - No subdomain / tenantId required
 *   - JWT payload carries { platformUserId, plane: 'platform', role }
 *   - Inactive accounts → 401 (same message as wrong password to prevent enumeration)
 *
 * @module platform-auth.service
 */

import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import { signPlatformToken } from '../config/jwt'
import * as platformAuthRepo from '../models/platform-auth.repository'
import * as refreshTokenRepo from '../models/refresh-token.repository'
import { resolvePlatformPermissions } from './permission.service'
import type { PlatformLoginResponse, PlatformMeResponse, RefreshResponse } from '../types'

/** TTL for refresh tokens: 30 days in milliseconds. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000

/** JWT access token duration in seconds (8 hours). */
const JWT_EXPIRES_IN_SECONDS = 8 * 60 * 60

/** Generic error message — prevents oracle attacks on token validity. */
const INVALID_TOKEN_MSG = 'Invalid or expired token'

/** Thrown for any authentication failure on the platform plane. */
export class PlatformAuthError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'PLATFORM_AUTH_ERROR')
  }
}

/** Shared 401 message — prevents user enumeration via distinct error text. */
const INVALID_CREDENTIALS = 'Invalid credentials'

/**
 * Sentinel hash: always run bcrypt.compare even when user not found or inactive,
 * so response time is constant regardless of whether the email exists or is active.
 * This prevents timing-based user enumeration attacks.
 */
const DUMMY_HASH = '$2b$10$invalid.hash.to.prevent.timing.based.user.enumeration.x'

/**
 * Authenticate a platform user by email + password.
 *
 * @param email    - Platform user email.
 * @param password - Plain-text password to verify.
 * @returns Signed JWT and public user fields on success.
 * @throws PlatformAuthError (401) on any credential failure.
 */
export async function platformLogin(
  email: string,
  password: string,
): Promise<PlatformLoginResponse> {
  const user = await platformAuthRepo.findPlatformUserByEmail(email)

  const hashToCompare = user?.passwordHash ?? DUMMY_HASH
  const passwordMatch = await bcrypt.compare(password, hashToCompare)

  if (!user || !user.isActive || !passwordMatch) {
    throw new PlatformAuthError(INVALID_CREDENTIALS, 401)
  }

  await platformAuthRepo.touchPlatformUserLastLogin(user.id)

  const token = signPlatformToken({
    platformUserId: user.id,
    plane:          'platform',
    role:           user.role,
  })

  // Issue refresh token — store SHA-256 hash, return raw token to caller
  const rawRefreshToken = crypto.randomBytes(32).toString('hex')
  const familyId        = crypto.randomUUID()
  await refreshTokenRepo.create({
    tokenHash:      refreshTokenRepo.hashToken(rawRefreshToken),
    familyId,
    platformUserId: user.id,
    plane:          'platform',
    expiresAt:      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  })

  return {
    token,
    refreshToken: rawRefreshToken,
    user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    },
  }
}

/**
 * Resolve the current platform user's identity from their JWT context.
 *
 * Permissions are resolved statically from the user's platform role enum
 * (platform_super_admin → all codes; platform_support → read-only codes).
 * No DB query is needed for permission resolution since the platform plane
 * uses a role enum rather than join-table RBAC.
 *
 * @param platformUserId - From the verified platform JWT.
 * @throws PlatformAuthError (401) when the user no longer exists or is inactive.
 */
export async function platformGetMe(platformUserId: number): Promise<PlatformMeResponse> {
  const user = await platformAuthRepo.findPlatformUserById(platformUserId)
  if (!user || !user.isActive) {
    throw new PlatformAuthError(INVALID_CREDENTIALS, 401)
  }

  const permissions = Array.from(resolvePlatformPermissions(user.role))

  return {
    platformUserId: user.id,
    name:           user.name,
    email:          user.email,
    role:           user.role,
    permissions,
  }
}

/**
 * Exchange a valid platform-plane refresh token for a new access + refresh token pair.
 *
 * Security invariants enforced:
 * - Token must exist, not be expired, not rotated, not revoked, and have plane === 'platform'.
 * - If `rotatedAt` is already set the token was already consumed — replay detected.
 *   The entire family is revoked and a 401 is returned.
 * - Platform user must still be active.
 *
 * @param rawRefreshToken - The opaque token string sent by the client.
 * @throws PlatformAuthError(401) on any validation failure.
 */
export async function refreshPlatformToken(rawRefreshToken: string): Promise<RefreshResponse> {
  const hash   = refreshTokenRepo.hashToken(rawRefreshToken)
  const record = await refreshTokenRepo.findByHash(hash)

  if (!record || record.plane !== 'platform') {
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  if (record.revokedAt) {
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  if (record.expiresAt < new Date()) {
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  if (record.rotatedAt) {
    // Replay attack — revoke entire family
    await refreshTokenRepo.revokeFamily(record.familyId)
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  if (!record.platformUserId) {
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  const user = await platformAuthRepo.findPlatformUserById(record.platformUserId)
  if (!user || !user.isActive) {
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  const newToken = signPlatformToken({
    platformUserId: user.id,
    plane:          'platform',
    role:           user.role,
  })

  const newRaw       = crypto.randomBytes(32).toString('hex')
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  const rotated = await refreshTokenRepo.rotateToken(
    record.id, refreshTokenRepo.hashToken(newRaw), record.familyId, newExpiresAt,
  )
  if (!rotated) {
    // Lost the atomic claim race to a concurrent refresh — treat as replay.
    throw new PlatformAuthError(INVALID_TOKEN_MSG, 401)
  }

  return { token: newToken, refreshToken: newRaw, expiresIn: JWT_EXPIRES_IN_SECONDS }
}

/**
 * Revoke the entire refresh token family for a platform user (logout).
 * Idempotent: not-found is silently ignored.
 *
 * @param rawRefreshToken - The opaque token string sent by the client.
 */
export async function revokePlatformToken(rawRefreshToken: string): Promise<void> {
  const hash   = refreshTokenRepo.hashToken(rawRefreshToken)
  const record = await refreshTokenRepo.findByHash(hash)
  if (!record) return
  await refreshTokenRepo.revokeFamily(record.familyId)
}
