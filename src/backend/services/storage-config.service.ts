// src/backend/services/storage-config.service.ts
// Resolves what storage provider/credentials a tenant should use (ADR-0023).
// Write-path (validate/connect-test/persist/audit) lands in Sub-PR B — this
// file covers only the read/resolve side that getStorageDriver() needs.
import * as repo from '../models/tenant-storage-config.repository'
import { decryptField } from '../utils/encryption'

export type ResolvedStorageConfig =
  | { provider: 'local' }
  | { provider: 'custom_path'; host: string; share: string; username: string; password: string }

/**
 * Resolves what driver a tenant should use. Absence of a row and an
 * explicit provider='local' row are equivalent — both mean "use the
 * operator's LocalDiskDriver default" (BA sign-off §3.3, no backfill needed).
 */
export async function resolveStorageConfig(tenantId: number): Promise<ResolvedStorageConfig> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local' }

  return {
    provider: 'custom_path',
    host:     row.smbHost ?? '',
    share:    row.smbShare ?? '',
    username: row.smbUsername ?? '',
    password: row.smbPasswordEncrypted ? decryptField(row.smbPasswordEncrypted) : '',
  }
}
