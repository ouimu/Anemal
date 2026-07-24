// src/backend/utils/account-id-hash.ts
// Shared HMAC-SHA256 hashing + cross-tenant duplicate-account detection for
// BOTH cloud providers (ADR-0023, sub-project 3, M-11). Uses an HKDF-derived
// key from SETTINGS_ENCRYPTION_KEY with a DISTINCT info string from
// oauth-state.ts's own (round-2 grill finding 7) — purpose separation, the
// same reasoning that motivated HKDF for state-signing (grill N-5) applies
// here: a bug in one derived key must never affect the other.
import crypto from 'crypto'
import { config } from '../config/env'
import type { PrismaClient } from '@prisma/client'

const HKDF_INFO = 'account-id-hash-v1'

function deriveHashKey(): Buffer {
  const masterKey = Buffer.from(config.settingsEncryptionKey, 'hex')
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(HKDF_INFO), 32))
}

/** Not reversible; never stores the raw account ID/email — nothing PII-shaped at rest. */
export function hashAccountId(rawAccountId: string): string {
  return crypto.createHmac('sha256', deriveHashKey()).update(rawAccountId).digest('hex')
}

export interface DuplicateAccountCheckResult {
  duplicate: boolean
}

/**
 * Cross-tenant duplicate-account check (M-11). Predicate is explicit
 * provider + hash + tenantId-exclusion — NOT hash-alone (round-2 grill
 * finding 5) — this doubly guards against a stale hash left on an unrelated
 * row surviving a disconnect/switch that should have nulled it (Task 8/10's
 * column-hygiene tasks are what actually prevent that; this predicate is
 * defense in depth on top). Returns existence-only — never the matched
 * tenant's id or any identifying detail (same discipline as the
 * ADR-0019/0014 404-not-403 precedent).
 */
export async function checkDuplicateAccount(
  prisma: PrismaClient,
  provider: 'google_drive' | 'onedrive',
  hash: string,
  excludeTenantId: number,
): Promise<DuplicateAccountCheckResult> {
  const hashColumn = provider === 'google_drive' ? 'googleAccountIdHash' : 'oneDriveAccountIdHash'
  const match = await prisma.tenantStorageConfig.findFirst({
    where: { provider, [hashColumn]: hash, tenantId: { not: excludeTenantId } },
  })
  return { duplicate: !!match }
}
