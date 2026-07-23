// src/backend/models/oauth-connect-nonce.repository.ts
// Single-use nonce repository for the OAuth connect flow (ADR-0023,
// sub-project 2), mirroring RefreshToken's tokenHash + rotation pattern —
// only a hash is ever persisted, never the raw nonce.
import crypto from 'crypto'
import prisma from '../config/db'

export function hashNonce(rawNonce: string): string {
  return crypto.createHash('sha256').update(rawNonce).digest('hex')
}

export interface CreateNonceInput {
  tenantId:  number
  userId:    number
  provider:  string
  expiresAt: Date
}

export async function createNonce(input: CreateNonceInput): Promise<string> {
  const rawNonce = crypto.randomBytes(32).toString('base64url')
  await prisma.oAuthConnectNonce.create({
    data: {
      nonceHash: hashNonce(rawNonce),
      tenantId:  input.tenantId,
      userId:    input.userId,
      provider:  input.provider,
      expiresAt: input.expiresAt,
    },
  })
  return rawNonce
}

/**
 * Grill finding N-3: atomic single-statement consume — UPDATE ... WHERE
 * consumedAt IS NULL, checked by affected-row count, never a separate
 * verify-then-mark sequence (which would let two near-simultaneous
 * callbacks with the same state both pass a check before either marks
 * consumed). Returns true iff this call consumed the row.
 */
export async function consumeNonce(rawNonce: string): Promise<boolean> {
  const nonceHash = hashNonce(rawNonce)
  const result = await prisma.oAuthConnectNonce.updateMany({
    where: { nonceHash, consumedAt: null },
    data:  { consumedAt: new Date() },
  })
  return result.count === 1
}
