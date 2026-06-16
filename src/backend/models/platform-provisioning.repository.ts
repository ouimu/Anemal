/**
 * Platform-provisioning repository — Prisma access for `tenant_provisioning`.
 *
 * Manages per-tenant integration credentials (S3, SMTP, SMS, LINE) from the
 * platform plane. Encryption/decryption of secret fields is handled in the
 * service layer; this repository stores and retrieves raw (possibly encrypted)
 * values only.
 *
 * @module platform-provisioning.repository
 */

import prisma from '../config/db'
import type { TenantProvisioning } from '@prisma/client'

export type { TenantProvisioning }

/**
 * All provisioning fields that callers may supply on an update.
 * Only defined (non-undefined) fields are written to the database.
 */
export interface ProvisioningUpdateData {
  /** S3 bucket name for this tenant's file storage. */
  s3Bucket?: string | null
  /** Key prefix inside the S3 bucket. */
  s3Prefix?: string | null
  /** AWS region for the S3 bucket. */
  s3Region?: string | null
  /** Base SMS provider identifier (e.g. 'twilio'). */
  baseSmsProvider?: string | null
  /** Encrypted API key for the base SMS provider. */
  baseSmsApiKey?: string | null
  /** SMTP hostname override for this tenant. */
  smtpHost?: string | null
  /** SMTP port override. */
  smtpPort?: number | null
  /** SMTP username. */
  smtpUser?: string | null
  /** Encrypted SMTP password. */
  smtpPassword?: string | null
  /** LINE channel ID for platform-provisioned integration. */
  lineChannelId?: string | null
  /** Encrypted LINE channel secret. */
  lineChannelSecret?: string | null
}

/**
 * Fetch the provisioning row for a tenant.
 * Returns null when no row exists yet.
 *
 * @param tenantId - Tenant primary key.
 */
export function getProvisioning(tenantId: number): Promise<TenantProvisioning | null> {
  return prisma.tenantProvisioning.findUnique({ where: { tenantId } })
}

/**
 * Create or update the provisioning row for a tenant in one operation.
 * Undefined fields are omitted so callers can do partial updates without
 * accidentally clearing unrelated columns.
 *
 * @param tenantId        - Tenant primary key.
 * @param data            - Fields to write (secrets must already be encrypted).
 * @param performedById   - Platform user performing the change (audit trail).
 */
export function upsertProvisioning(
  tenantId: number,
  data: ProvisioningUpdateData,
  performedById: number,
): Promise<TenantProvisioning> {
  const payload = { ...data, updatedByPlatformUserId: performedById }
  return prisma.tenantProvisioning.upsert({
    where:  { tenantId },
    update: payload,
    create: { tenantId, ...payload },
  })
}
