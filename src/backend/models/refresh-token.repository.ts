/**
 * Refresh-token repository — all Prisma access for the refresh_tokens table.
 *
 * Raw tokens are never stored. All storage and lookup is done via SHA-256 hash.
 * Family-based rotation lets replay detection revoke the entire lineage.
 *
 * @module refresh-token.repository
 */

import crypto from 'crypto'
import { RefreshToken } from '@prisma/client'
import prisma from '../config/db'

/** SHA-256 hash of a raw opaque token string. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** Data required to create a new refresh token row. */
export interface CreateRefreshTokenData {
  tokenHash:       string
  familyId:        string
  userId?:         number
  platformUserId?: number
  tenantId?:       number
  branchId?:       number | null   // clinic plane only; NULL for platform tokens or admin all-branches
  plane:           string
  expiresAt:       Date
}

/**
 * Persist a new refresh token row.
 *
 * @param data - Token fields; tokenHash must already be SHA-256 hashed.
 */
export function create(data: CreateRefreshTokenData): Promise<RefreshToken> {
  return prisma.refreshToken.create({ data })
}

/**
 * Look up a refresh token by its SHA-256 hash.
 *
 * @param tokenHash - SHA-256 hash of the raw opaque token.
 * @returns The matching row or null if not found.
 */
export function findByHash(tokenHash: string): Promise<RefreshToken | null> {
  return prisma.refreshToken.findUnique({ where: { tokenHash } })
}

/**
 * Rotate a refresh token: atomically claim the old row (rotatedAt = now,
 * only if still unrotated/unrevoked/unexpired) and create a new row in the
 * same family.
 *
 * The claim uses a conditional `updateMany` + row-count check inside the
 * same transaction as the read and the create, so two concurrent callers
 * racing on the same `oldId` can never both succeed — only one produces a
 * descendant. This closes the replay window described in HI-04: without the
 * conditional claim, two requests can both observe `rotatedAt: null` and
 * each mint a valid descendant token.
 *
 * @param oldId      - PK of the token being consumed.
 * @param newHash    - SHA-256 hash for the new token.
 * @param newFamilyId - Family lineage identifier (same as parent).
 * @param expiresAt  - Expiry for the new token.
 * @returns The newly created refresh token row, or `null` if the old token
 *   was already rotated, revoked, expired, or not found (caller must treat
 *   this as an invalid/replayed token).
 */
export async function rotateToken(
  oldId:      string,
  newHash:    string,
  newFamilyId: string,
  expiresAt:  Date,
): Promise<RefreshToken | null> {
  return prisma.$transaction(async (tx) => {
    const old = await tx.refreshToken.findUnique({ where: { id: oldId } })
    if (!old) return null

    const claimed = await tx.refreshToken.updateMany({
      where: {
        id:        oldId,
        rotatedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { rotatedAt: new Date() },
    })
    if (claimed.count !== 1) return null

    return tx.refreshToken.create({
      data: {
        tokenHash:      newHash,
        familyId:       newFamilyId,
        userId:         old.userId,
        platformUserId: old.platformUserId,
        tenantId:       old.tenantId,
        branchId:       old.branchId,
        plane:          old.plane,
        expiresAt,
      },
    })
  })
}

/**
 * Revoke every token in a family (replay detection or explicit logout).
 *
 * @param familyId - Family identifier shared by all rotation lineage members.
 */
export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data:  { revokedAt: new Date() },
  })
}

/**
 * Revoke a single token by its primary key.
 *
 * @param id - PK of the refresh token row.
 */
export async function revokeById(id: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { id },
    data:  { revokedAt: new Date() },
  })
}

/**
 * Revoke every non-revoked refresh token belonging to a clinic user, across
 * all families. Used after any password change or reset (B-1/B-2/platform
 * reset) so a stolen or forgotten-but-valid 30-day refresh token can no
 * longer mint new access tokens (PWD-3, gap analysis §6).
 *
 * Existing 8h access JWTs are NOT invalidated by this call — accepted
 * residual (Q-G3, brainstorm §4.3), matches the deactivation residual.
 *
 * @param userId - Clinic `users.id` whose tokens should all be revoked.
 */
export async function revokeAllForUser(userId: number): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date() },
  })
}
