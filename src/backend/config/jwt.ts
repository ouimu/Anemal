import jwt from 'jsonwebtoken'
import { config } from './env'
import type { JwtPayload } from '../types'

/** Platform-plane token payload shape (T-5C-02). */
interface PlatformTokenPayload {
  platformUserId: number
  plane:          'platform'
  role:           string
}

/**
 * Sign a clinic-plane JWT token.
 *
 * @param payload - All required clinic token fields (iat/exp added by jwt.sign).
 */
export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions)
}

/**
 * Sign a platform-plane JWT token.
 * The signed payload intentionally omits userId and tenantId — those fields
 * do not exist on platform tokens; requirePlane('clinic') blocks before they
 * would ever be read.
 *
 * @param payload - Platform token fields: platformUserId, plane, role.
 */
export function signPlatformToken(payload: PlatformTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions)
}

/**
 * Verify and decode any Anemal JWT (clinic or platform).
 *
 * @param token - Bearer token string.
 * @returns Decoded payload cast to JwtPayload.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload
}
