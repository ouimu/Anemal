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
 * M-7: atomic single-statement consume, now ALSO predicated on provider —
 * closes a cross-flow replay class once two providers share this table (a
 * state minted for the Google flow must not verify at the OneDrive callback
 * and vice versa). Still UPDATE ... WHERE ... consumedAt IS NULL, checked
 * by affected-row count — never a separate verify-then-mark (N-3, unchanged).
 */
export async function consumeNonce(rawNonce: string, provider: string): Promise<boolean> {
  const nonceHash = hashNonce(rawNonce)
  const result = await prisma.oAuthConnectNonce.updateMany({
    where: { nonceHash, provider, consumedAt: null },
    data:  { consumedAt: new Date() },
  })
  return result.count === 1
}
