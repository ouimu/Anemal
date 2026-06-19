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

import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import { signPlatformToken } from '../config/jwt'
import * as platformAuthRepo from '../models/platform-auth.repository'
import type { PlatformLoginResponse, PlatformMeResponse } from '../types'

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

  return {
    token,
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
 * `permissions` is a deliberate stub ([]) — the platform-plane RBAC permission
 * model is not yet implemented (known gap). The role string is authoritative
 * for now.
 *
 * @param platformUserId - From the verified platform JWT.
 * @throws PlatformAuthError (401) when the user no longer exists or is inactive.
 */
export async function platformGetMe(platformUserId: number): Promise<PlatformMeResponse> {
  const user = await platformAuthRepo.findPlatformUserById(platformUserId)
  if (!user || !user.isActive) {
    throw new PlatformAuthError(INVALID_CREDENTIALS, 401)
  }

  return {
    platformUserId: user.id,
    name:           user.name,
    email:          user.email,
    role:           user.role,
    permissions:    [],
  }
}
