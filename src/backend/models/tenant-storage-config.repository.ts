// src/backend/models/tenant-storage-config.repository.ts
// Prisma access for tenant_storage_config (1-to-1 with tenant, ADR-0023).
// PK is tenantId itself, so findUnique({ where: { tenantId } }) is
// inherently tenant-scoped — never a bare findFirst here.
import prisma from '../config/db'
import { encryptField } from '../utils/encryption'
import { GoogleDriveFolderIds } from '../config/google-drive-driver'

export interface StorageConfigWriteData {
  provider:                     'local' | 'custom_path' | 'google_drive'
  smbHost?:                     string | null
  smbShare?:                    string | null
  smbUsername?:                 string | null
  smbPasswordEncrypted?:        string | null
  googleAccessTokenEncrypted?:  string | null
  googleRefreshTokenEncrypted?: string | null
  googleRootFolderId?:          string | null
  googleEmrFolderId?:           string | null
  googlePhotoFolderId?:         string | null
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

/** Persists freshly-resolved/self-healed Google Drive folder ids (google-drive-driver.ts's onFolderIdsResolved callback). */
export async function updateGoogleFolderIds(tenantId: number, ids: GoogleDriveFolderIds): Promise<void> {
  await prisma.tenantStorageConfig.update({
    where: { tenantId },
    data:  { googleRootFolderId: ids.rootFolderId, googleEmrFolderId: ids.emrFolderId, googlePhotoFolderId: ids.photoFolderId },
  })
}

/**
 * Conditional update, guarded against the disconnect race (grill N-4): an
 * in-flight operation's silent token refresh can complete AFTER the admin
 * has disconnected (row nulled by updateStorageConfig's BA-G-4b write) —
 * this WHERE clause makes that write-back a no-op instead of resurrecting
 * an encrypted token onto a row whose provider is no longer google_drive.
 * Never retried, never errored — this is a system token refresh, not an
 * admin action, and is explicitly EXEMPT from settings_audit_log (BA G-4a).
 */
export async function writeBackRefreshedGoogleAccessToken(tenantId: number, newAccessToken: string): Promise<void> {
  await prisma.tenantStorageConfig.updateMany({
    where: { tenantId, provider: 'google_drive', googleRefreshTokenEncrypted: { not: null } },
    data:  { googleAccessTokenEncrypted: encryptField(newAccessToken) },
  })
}
