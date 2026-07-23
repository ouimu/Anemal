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
 * First-pass write-back for a silently-refreshed Google access token.
 * Task 10 hardens this to the grill-N-4 race-safe conditional update
 * (WHERE provider = 'google_drive' AND googleRefreshTokenEncrypted IS NOT
 * NULL) — this version exists so Task 4's getStorageDriver wiring compiles
 * and passes its own tests; Task 10 adds the specific race test this naive
 * version fails.
 */
export async function writeBackRefreshedGoogleAccessToken(tenantId: number, newAccessToken: string): Promise<void> {
  await prisma.tenantStorageConfig.update({
    where: { tenantId },
    data:  { googleAccessTokenEncrypted: encryptField(newAccessToken) },
  })
}
