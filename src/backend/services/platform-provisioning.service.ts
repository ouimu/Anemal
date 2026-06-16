/**
 * Platform-provisioning service — business logic for per-tenant integration
 * credentials on the platform plane.
 *
 * Secret fields (baseSmsApiKey, smtpPassword, lineChannelSecret) are encrypted
 * at rest using AES-256-GCM. On read, secrets are decrypted then immediately
 * masked before returning to the caller — plaintext never leaves this layer.
 *
 * @module platform-provisioning.service
 */

import * as repo from '../models/platform-provisioning.repository'
import type { ProvisioningUpdateData, TenantProvisioning } from '../models/platform-provisioning.repository'
import { encryptField, decryptField, maskSecret } from '../utils/encryption'
import { NotFoundError } from '../utils/errors'
import { logger } from '../utils/logger'
import prisma from '../config/db'

export type { ProvisioningUpdateData }

/** The mask token used in place of a plaintext secret in API responses. */
const MASK = '••••'

/** Names of fields that hold encrypted secrets. */
const SECRET_FIELDS = ['baseSmsApiKey', 'smtpPassword', 'lineChannelSecret'] as const
type SecretField = typeof SECRET_FIELDS[number]

/**
 * Safely decrypt a stored value, logging a warning on corrupt ciphertext.
 * Returns an empty string instead of throwing so one bad field does not
 * block the entire response.
 */
function safeDecrypt(stored: string, fieldName: string): string {
  try {
    return decryptField(stored)
  } catch {
    logger.warn({ fieldName }, 'Corrupted provisioning ciphertext — treating as empty')
    return ''
  }
}

/**
 * Return a copy of the provisioning row with all secret fields masked.
 * Non-secret fields are passed through unchanged.
 */
function maskSecrets(row: TenantProvisioning): TenantProvisioning {
  const masked = { ...row }
  for (const field of SECRET_FIELDS) {
    const value = row[field]
    if (value) {
      const plain = safeDecrypt(value, field)
      masked[field] = plain ? maskSecret(plain) : MASK
    }
  }
  return masked
}

/**
 * Encrypt secret fields in the supplied update data.
 * Fields that are undefined or null are passed through unmodified.
 * Skips re-encryption when the caller echoes an already-masked value back
 * (starts with '••••') to avoid double-encrypting the mask token.
 */
function encryptSecrets(data: ProvisioningUpdateData): ProvisioningUpdateData {
  const result = { ...data }
  for (const field of SECRET_FIELDS as readonly SecretField[]) {
    const value = result[field]
    if (typeof value === 'string' && !value.startsWith(MASK)) {
      result[field] = encryptField(value)
    }
  }
  return result
}

/**
 * Fetch the provisioning configuration for a tenant.
 * Secret fields are decrypted internally and masked before returning.
 * Returns null when no provisioning row exists yet.
 *
 * @param tenantId - Tenant primary key.
 */
export async function getProvisioning(tenantId: number): Promise<TenantProvisioning | null> {
  const row = await repo.getProvisioning(tenantId)
  if (!row) return null
  return maskSecrets(row)
}

/**
 * Create or update the provisioning configuration for a tenant.
 *
 * Secret fields in `data` are encrypted before being persisted. An entry is
 * written to `platform_audit_logs` recording the change. The returned row has
 * secrets masked (same contract as getProvisioning).
 *
 * @param tenantId       - Tenant primary key.
 * @param data           - Partial provisioning update (only supplied fields are written).
 * @param performedById  - Platform user performing the change.
 */
export async function updateProvisioning(
  tenantId: number,
  data: ProvisioningUpdateData,
  performedById: number,
): Promise<TenantProvisioning> {
  // Verify tenant exists before writing provisioning data.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  })
  if (!tenant) throw new NotFoundError('Tenant')

  const encrypted = encryptSecrets(data)
  const updated = await repo.upsertProvisioning(tenantId, encrypted, performedById)

  await prisma.platformAuditLog.create({
    data: {
      action: 'provisioning.update',
      targetTenantId: tenantId,
      performedByPlatformUserId: performedById,
      details: { updatedFields: Object.keys(data).filter(k => data[k as keyof ProvisioningUpdateData] !== undefined) },
    },
  })

  return maskSecrets(updated)
}
