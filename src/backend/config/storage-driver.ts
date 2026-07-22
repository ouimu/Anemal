// src/backend/config/storage-driver.ts
// Pluggable storage abstraction (ADR-0022). LocalDiskDriver is the only
// implementation now — a future BYO-cloud driver implements the same
// StorageDriver interface, and getStorageDriver() becomes the switch point.
import { promises as fs } from 'fs'
import path from 'path'
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
    await fs.writeFile(target, body)
  }

  async read(key: string): Promise<Buffer> {
    const target = resolveSafePath(this.baseDir, key)
    return fs.readFile(target)
  }

  async delete(key: string): Promise<void> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.unlink(target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async exists(key: string): Promise<boolean> {
    const target = resolveSafePath(this.baseDir, key)
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }
}

export function getStorageDriver(): StorageDriver {
  return new LocalDiskDriver()
}
