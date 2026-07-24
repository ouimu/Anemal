// src/backend/config/storage-driver.ts
// Pluggable storage abstraction (ADR-0022). LocalDiskDriver is the only
// implementation now — a future BYO-cloud driver implements the same
// StorageDriver interface, and getStorageDriver() becomes the switch point.
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { AppError } from '../utils/errors'
import { resolveStorageConfig } from '../services/storage-config.service'
import { SmbShareDriver } from './smb-share-driver'
import { GoogleDriveDriver } from './google-drive-driver'
import { OneDriveDriver } from './onedrive-driver'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'

export interface StorageDriver {
  save(key: string, body: Buffer, contentType: string): Promise<void>
  read(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

export class StorageKeyError extends AppError {
  constructor(key: string) {
    super(400, `Invalid storage key: ${key}`, 'INVALID_STORAGE_KEY_PATH')
  }
}

// Grill finding #3: exists()/read() must distinguish "genuinely missing"
// from "any other failure" — a network blip must never read the same as
// data loss (clinic staff mid-consult would otherwise think a file was
// deleted). Every driver throws one of these two, never a bare boolean
// swallow, from read()/exists() failure paths.
export class StorageNotFoundError extends AppError {
  constructor(key: string) {
    super(404, `Storage file not found: ${key}`, 'STORAGE_FILE_NOT_FOUND')
  }
}

export class StorageUnavailableError extends AppError {
  constructor(cause: unknown) {
    super(503, 'เข้าถึงที่เก็บไฟล์ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง', 'STORAGE_UNAVAILABLE', { cause: String(cause) })
  }
}

// Trust-boundary check (do not simplify away): resolves the key against
// baseDir and asserts the result stays inside baseDir. Catches both `..`
// relative traversal and absolute-path keys (path.relative to a
// different-drive/root absolute path returns an absolute string itself,
// which the isAbsolute check below also rejects).
function resolveSafePath(baseDir: string, key: string): string {
  const resolvedBase = path.resolve(baseDir)
  const resolvedTarget = path.resolve(resolvedBase, key)
  const relative = path.relative(resolvedBase, resolvedTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new StorageKeyError(key)
  }
  return resolvedTarget
}

export class LocalDiskDriver implements StorageDriver {
  private readonly baseDir: string

  constructor(baseDir: string = process.env.ATTACHMENT_DIR || './attachments') {
    this.baseDir = baseDir
  }

  async save(key: string, body: Buffer, _contentType: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    // Grill finding #2: write to a temp name in the same directory, then
    // rename over the final key. A connection/process drop mid-write leaves
    // the temp file orphaned, never the previous good file truncated —
    // critical for pet-photo overwrite-in-place.
    const tempTarget = `${target}.tmp-${randomUUID()}`
    await fs.writeFile(tempTarget, body)
    await fs.rename(tempTarget, target)
  }

  async read(key: string): Promise<Buffer> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      return await fs.readFile(target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageNotFoundError(key)
      throw new StorageUnavailableError(err)
    }
  }

  async delete(key: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.unlink(target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new StorageUnavailableError(err)
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.access(target)
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw new StorageUnavailableError(err)
    }
  }
}

/**
 * Resolves the StorageDriver a tenant's storage operations should use.
 * Async — does a per-tenant DB lookup (no caching, by design: one point-read
 * per storage operation) and, for `custom_path`, decrypts the stored
 * credential. Resolve once per service operation and reuse the instance for
 * every subsequent driver call in that operation — never re-resolve
 * mid-operation (see pet.service.ts/emr-attachment.service.ts call sites).
 */
export async function getStorageDriver(tenantId: number): Promise<StorageDriver> {
  const resolved = await resolveStorageConfig(tenantId)

  if (resolved.provider === 'onedrive') {
    // ONEDRIVE_OAUTH_CLIENT_ID/SECRET checked lazily here, not at boot
    // (I-13, mirrors GDrive's N-6) — a tenant that connected OneDrive while
    // the env vars were set still needs them present at read/write time.
    return new OneDriveDriver(
      tenantId,
      {
        clientId:     process.env.ONEDRIVE_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.ONEDRIVE_OAUTH_CLIENT_SECRET ?? '',
        accessToken:  resolved.accessToken,
        refreshToken: resolved.refreshToken,
      },
      (tokens) => tenantStorageConfigRepo.writeBackRefreshedOneDriveTokens(tenantId, tokens),
    )
  }

  if (resolved.provider === 'google_drive') {
    // GOOGLE_OAUTH_CLIENT_ID/SECRET are checked lazily here, not at boot
    // (grill N-6) — a tenant that connected Drive while the env vars were
    // set still needs them present at read/write time to refresh tokens.
    return new GoogleDriveDriver(
      tenantId,
      {
        clientId:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        accessToken:  resolved.accessToken,
        refreshToken: resolved.refreshToken,
      },
      { rootFolderId: resolved.rootFolderId, emrFolderId: resolved.emrFolderId, photoFolderId: resolved.photoFolderId },
      (ids) => tenantStorageConfigRepo.updateGoogleFolderIds(tenantId, ids),
      (newAccessToken) => tenantStorageConfigRepo.writeBackRefreshedGoogleAccessToken(tenantId, newAccessToken),
    )
  }

  if (resolved.provider === 'custom_path') {
    return new SmbShareDriver({
      host: resolved.host, share: resolved.share, username: resolved.username, password: resolved.password,
    })
  }
  return new LocalDiskDriver()
}
