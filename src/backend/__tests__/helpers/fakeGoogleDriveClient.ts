// src/backend/__tests__/helpers/fakeGoogleDriveClient.ts
// In-memory stand-in for GoogleDriveClient — used by every GoogleDriveDriver
// unit test (Task 3) so none of them touch a real Drive account. Mirrors
// FakeSmbClient's shape (sub-project 1).
import {
  GoogleDriveClient, GoogleDriveClientConfig, GoogleDriveFile, GoogleDriveAuthInvalidError,
} from '../../config/google-drive-client'

export interface FakeGoogleDriveClientOptions {
  failAuthInvalid?: boolean
  /** Simulates google-auth-library's silent refresh firing on this client's first call. */
  refreshAccessTokenOnFirstCall?: string
}

interface StoredEntry {
  id:       string
  name:     string
  parentId: string
  isFolder: boolean
  body:     Buffer
  mimeType: string
}

export class FakeGoogleDriveClient implements GoogleDriveClient {
  private entries = new Map<string, StoredEntry>()
  private nextId = 1
  private boundConfig?: GoogleDriveClientConfig
  private hasRefreshed = false

  constructor(private opts: FakeGoogleDriveClientOptions = {}) {}

  /** Called by a test's factory function on every driver.clientFactory(config) invocation
   *  — real per-operation config (incl. onAccessTokenRefreshed) flows through here. */
  bindConfig(config: GoogleDriveClientConfig): this {
    this.boundConfig = config
    return this
  }

  private guard(): void {
    if (this.opts.failAuthInvalid) throw new GoogleDriveAuthInvalidError()
    if (this.opts.refreshAccessTokenOnFirstCall && !this.hasRefreshed) {
      this.hasRefreshed = true
      this.boundConfig?.onAccessTokenRefreshed?.(this.opts.refreshAccessTokenOnFirstCall)
    }
  }

  async findByName(parentId: string, name: string): Promise<GoogleDriveFile | null> {
    this.guard()
    for (const e of this.entries.values()) {
      if (e.parentId === parentId && e.name === name) return { id: e.id, name: e.name }
    }
    return null
  }

  async createFolder(parentId: string, name: string): Promise<GoogleDriveFile> {
    this.guard()
    const id = `folder-${this.nextId++}`
    this.entries.set(id, { id, name, parentId, isFolder: true, body: Buffer.alloc(0), mimeType: 'application/vnd.google-apps.folder' })
    return { id, name }
  }

  async createFile(parentId: string, name: string, body: Buffer, mimeType: string): Promise<GoogleDriveFile> {
    this.guard()
    const id = `file-${this.nextId++}`
    this.entries.set(id, { id, name, parentId, isFolder: false, body: Buffer.from(body), mimeType })
    return { id, name }
  }

  async updateFile(fileId: string, body: Buffer, mimeType: string): Promise<void> {
    this.guard()
    const e = this.entries.get(fileId)
    if (!e) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    e.body = Buffer.from(body)
    e.mimeType = mimeType
  }

  async readFile(fileId: string): Promise<Buffer> {
    this.guard()
    const e = this.entries.get(fileId)
    if (!e) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return e.body
  }

  async deleteFile(fileId: string): Promise<void> {
    this.guard()
    if (!this.entries.has(fileId)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    this.entries.delete(fileId)
  }

  async folderExists(folderId: string): Promise<boolean> {
    this.guard()
    const e = this.entries.get(folderId)
    return !!e && e.isFolder
  }

  async ping(): Promise<void> {
    this.guard()
  }

  /** Test helper — counts non-folder entries with a given name (detects an
   *  accidental duplicate files.create instead of files.update, grill N-1). */
  countFilesNamed(name: string): number {
    let count = 0
    for (const e of this.entries.values()) if (e.name === name && !e.isFolder) count++
    return count
  }
}
