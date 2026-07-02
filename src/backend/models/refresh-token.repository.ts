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
 * Rotate a refresh token: mark the old row consumed (rotatedAt = now) and
 * create a new row in the same family.
 *
 * @param oldId      - PK of the token being consumed.
 * @param newHash    - SHA-256 hash for the new token.
 * @param newFamilyId - Family lineage identifier (same as parent).
 * @param expiresAt  - Expiry for the new token.
 * @returns The newly created refresh token row.
 */
export async function rotateToken(
  oldId:      string,
  newHash:    string,
  newFamilyId: string,
  expiresAt:  Date,
): Promise<RefreshToken> {
  const old = await prisma.refreshToken.findUnique({ where: { id: oldId } })
  if (!old) throw new Error('Token not found for rotation')

  const [, created] = await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: oldId },
      data:  { rotatedAt: new Date() },
    }),
    prisma.refreshToken.create({
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
    }),
  ])
  return created
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
