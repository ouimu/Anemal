// src/backend/models/tenant-storage-config.repository.ts
// Prisma access for tenant_storage_config (1-to-1 with tenant, ADR-0023).
// PK is tenantId itself, so findUnique({ where: { tenantId } }) is
// inherently tenant-scoped — never a bare findFirst here.
import prisma from '../config/db'

export interface StorageConfigWriteData {
  provider:              'local' | 'custom_path'
  smbHost?:              string | null
  smbShare?:             string | null
  smbUsername?:          string | null
  smbPasswordEncrypted?: string | null
}

/** Fetches the tenant's storage config row, or null if none exists (default local). */
export function getStorageConfig(tenantId: number) {
  return prisma.tenantStorageConfig.findUnique({ where: { tenantId } })
}

/** Creates or replaces the tenant's storage config row. */
export function upsertStorageConfig(tenantId: number, data: StorageConfigWriteData) {
  return prisma.tenantStorageConfig.upsert({
    where:  { tenantId },
    create: { tenantId, ...data },
    update: data,
  })
}
