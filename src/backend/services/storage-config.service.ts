// src/backend/services/storage-config.service.ts
// Resolves what storage provider/credentials a tenant should use (ADR-0023).
import * as repo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { decryptField, encryptField } from '../utils/encryption'
import { createSmbClient } from '../config/smb-client'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

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

export class StorageConfigSwitchConfirmationRequiredError extends AppError {
  constructor() {
    super(409, 'Changing the storage location requires confirmation — existing files will not move automatically', 'STORAGE_SWITCH_CONFIRMATION_REQUIRED')
  }
}

export interface StorageConfigDisplay {
  provider:     string
  configured:   boolean
  smbHost?:     string
  smbShare?:    string
  smbUsername?: string
}

/** Never includes the password — a "configured" boolean stands in for it (design §"Address format"). */
export async function getStorageConfigForDisplay(tenantId: number): Promise<StorageConfigDisplay> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local', configured: false }
  return {
    provider:    row.provider,
    configured:  true,
    smbHost:     row.smbHost ?? undefined,
    smbShare:    row.smbShare ?? undefined,
    smbUsername: row.smbUsername ?? undefined,
  }
}

export interface UpdateStorageConfigInput {
  provider:           'local' | 'custom_path'
  smbHost?:           string
  smbShare?:          string
  smbUsername?:       string
  smbPassword?:       string
  confirmBaseChange?: boolean
}

// The "effective base" a tenant's files resolve against. Two custom_path
// configs with different host/share are a different base too, not just
// local vs custom_path (BA sign-off §2.3 note, generalized).
function effectiveBaseKey(row: { provider: string; smbHost?: string | null; smbShare?: string | null } | null): string {
  if (!row || row.provider === 'local') return 'local'
  return `custom_path:${row.smbHost}:${row.smbShare}`
}

export async function updateStorageConfig(
  tenantId: number,
  userId: number,
  input: UpdateStorageConfigInput,
): Promise<void> {
  const current = await repo.getStorageConfig(tenantId)
  const currentBase = effectiveBaseKey(current)
  const nextBase = effectiveBaseKey(
    input.provider === 'custom_path'
      ? { provider: 'custom_path', smbHost: input.smbHost, smbShare: input.smbShare }
      : { provider: 'local' },
  )

  if (currentBase !== nextBase && !input.confirmBaseChange) {
    throw new StorageConfigSwitchConfirmationRequiredError()
  }

  if (input.provider === 'custom_path') {
    // Connect-and-test-write BEFORE persisting anything (decision 5) — calls
    // createSmbClient directly (not via SmbShareDriver) specifically so a
    // connect-time failure surfaces as its distinct SmbHostUnreachableError /
    // SmbShareNotFoundError / SmbAuthRejectedError rather than the generic
    // StorageUnavailableError SmbShareDriver normalizes to for its normal
    // read/write/delete/exists callers (see smb-share-driver.ts's own
    // "PLAN DEVIATION" note — those two call paths deliberately diverge).
    const client = createSmbClient({
      host: input.smbHost ?? '', share: input.smbShare ?? '',
      username: input.smbUsername ?? '', password: input.smbPassword ?? '',
    })
    const testKey = `tenants/${tenantId}/.storage-config-test`
    await client.connect()
    try {
      await client.writeFile(testKey, Buffer.from('test-write'))
      // Best-effort cleanup — logged, never allowed to block the config save
      // that follows a successful test-write.
      await client.unlink(testKey).catch((deleteErr: unknown) => {
        logger.warn({ tenantId, testKey, deleteErr: String(deleteErr) }, 'storage-config test-write marker cleanup failed — harmless orphan, ignored')
      })
    } finally {
      await client.disconnect().catch(() => undefined)
    }

    await repo.upsertStorageConfig(tenantId, {
      provider: 'custom_path',
      smbHost: input.smbHost, smbShare: input.smbShare, smbUsername: input.smbUsername,
      smbPasswordEncrypted: input.smbPassword ? encryptField(input.smbPassword) : current?.smbPasswordEncrypted,
    })
  } else {
    await repo.upsertStorageConfig(tenantId, { provider: 'local', smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null })
  }

  await auditRepo.createMany([{
    tenantId, changedBy: userId, tableName: 'tenant_storage_config',
    fieldName: 'provider', oldValue: current?.provider ?? 'local', newValue: input.provider,
  }])
}
