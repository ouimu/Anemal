// src/backend/services/storage-config.service.ts
// Resolves what storage provider/credentials a tenant should use (ADR-0023).
import * as repo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { decryptField, encryptField } from '../utils/encryption'
import { createSmbClient } from '../config/smb-client'
import { revokeGoogleToken, createGoogleDriveClient, GoogleDriveAuthInvalidError } from '../config/google-drive-client'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

export type ResolvedStorageConfig =
  | { provider: 'local' }
  | { provider: 'custom_path'; host: string; share: string; username: string; password: string }
  | { provider: 'google_drive'; accessToken: string; refreshToken: string; rootFolderId: string | null; emrFolderId: string | null; photoFolderId: string | null }

/**
 * Resolves what driver a tenant should use. Absence of a row and an
 * explicit provider='local' row are equivalent — both mean "use the
 * operator's LocalDiskDriver default" (BA sign-off §3.3, no backfill needed).
 */
export async function resolveStorageConfig(tenantId: number): Promise<ResolvedStorageConfig> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local' }

  if (row.provider === 'google_drive') {
    return {
      provider:      'google_drive',
      accessToken:   row.googleAccessTokenEncrypted ? decryptField(row.googleAccessTokenEncrypted) : '',
      refreshToken:  row.googleRefreshTokenEncrypted ? decryptField(row.googleRefreshTokenEncrypted) : '',
      rootFolderId:  row.googleRootFolderId,
      emrFolderId:   row.googleEmrFolderId,
      photoFolderId: row.googlePhotoFolderId,
    }
  }

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
  connected?:   boolean
  smbHost?:     string
  smbShare?:    string
  smbUsername?: string
}

async function checkGoogleDriveConnected(row: { googleAccessTokenEncrypted: string | null; googleRefreshTokenEncrypted: string | null }): Promise<boolean> {
  if (!row.googleAccessTokenEncrypted || !row.googleRefreshTokenEncrypted) return false
  const client = createGoogleDriveClient({
    clientId:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    accessToken:  decryptField(row.googleAccessTokenEncrypted),
    refreshToken: decryptField(row.googleRefreshTokenEncrypted),
  })
  try {
    await client.ping()
    return true
  } catch (err) {
    if (err instanceof GoogleDriveAuthInvalidError) return false
    // Transient failure — "don't read a blip as data loss" (design's status-
    // check principle, applied here) — the check is simply skipped/logged,
    // never falsely tells the admin to reconnect over a network hiccup.
    logger.warn({ err: String(err) }, 'Google Drive live status check failed transiently — connected stays true')
    return true
  }
}

/** Never includes the password/tokens — a "configured" boolean stands in for them. */
export async function getStorageConfigForDisplay(tenantId: number): Promise<StorageConfigDisplay> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local', configured: false }
  if (row.provider === 'google_drive') {
    const connected = await checkGoogleDriveConnected(row)
    return { provider: 'google_drive', configured: true, connected }
  }
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
// local vs custom_path (BA sign-off §2.3 note, generalized). A google_drive
// row is always its own base — switching away from it (to local OR to a
// different custom_path) is always a base change requiring confirmation.
function effectiveBaseKey(row: { provider: string; smbHost?: string | null; smbShare?: string | null } | null): string {
  if (!row || row.provider === 'local') return 'local'
  if (row.provider === 'google_drive') return 'google_drive'
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

  // BA G-4b: switching AWAY from google_drive (to local or to a different
  // custom_path) revokes the stored refresh token at Google (best-effort,
  // logged on failure, never blocks the switch — matches the existing
  // SMB-failure posture) and nulls the token+folder-ID columns in the SAME
  // write as the new provider, so a stale encrypted refresh token never
  // survives a confirmed disconnect.
  const disconnectingFromGoogle = current?.provider === 'google_drive'
  if (disconnectingFromGoogle && current?.googleRefreshTokenEncrypted) {
    await revokeGoogleToken(decryptField(current.googleRefreshTokenEncrypted)).catch((revokeErr) => {
      logger.warn({ tenantId, revokeErr: String(revokeErr) }, 'Google Drive disconnect: best-effort token revoke failed')
    })
  }
  const googleColumnResets = disconnectingFromGoogle
    ? { googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null, googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null }
    : {}

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
      ...googleColumnResets,
    })
  } else {
    await repo.upsertStorageConfig(tenantId, {
      provider: 'local', smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null,
      ...googleColumnResets,
    })
  }

  await auditRepo.createMany([{
    tenantId, changedBy: userId, tableName: 'tenant_storage_config',
    fieldName: 'provider', oldValue: current?.provider ?? 'local', newValue: input.provider,
  }])
}
