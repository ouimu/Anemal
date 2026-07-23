// src/backend/config/storage-driver.ts
// Pluggable storage abstraction (ADR-0022). LocalDiskDriver is the only
// implementation now — a future BYO-cloud driver implements the same
// StorageDriver interface, and getStorageDriver() becomes the switch point.
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { AppError } from '../utils/errors'

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

export function getStorageDriver(): StorageDriver {
  return new LocalDiskDriver()
}
