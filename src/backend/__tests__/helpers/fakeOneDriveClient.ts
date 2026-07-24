// src/backend/__tests__/helpers/fakeOneDriveClient.ts
// In-memory stand-in for OneDriveClient — used by every OneDriveDriver unit
// test (Task 4) so none touch a real Microsoft account. Mirrors
// FakeGoogleDriveClient/FakeSmbClient's shape.
import {
  OneDriveClient, OneDriveItem, OneDriveAuthInvalidError, OneDriveInsufficientScopeError,
} from '../../config/onedrive-client'

export interface FakeOneDriveClientOptions {
  failAuthInvalid?: boolean
  failInsufficientScope?: boolean
  pingAccountId?: string
  /** Simulates a mid-chunk failure on the >4MB upload-session path (M-13). */
  failUploadSessionOnChunk?: number
}

interface StoredFile { body: Buffer; contentType: string }

export class FakeOneDriveClient implements OneDriveClient {
  private files = new Map<string, StoredFile>()
  private folders = new Set<string>()
  private uploadSessions = new Map<string, { path: string; chunks: Buffer[]; aborted: boolean }>()
  private nextSessionId = 1
  saveCallCount = 0

  constructor(private opts: FakeOneDriveClientOptions = {}) {}

  private guard(): void {
    if (this.opts.failAuthInvalid) throw new OneDriveAuthInvalidError()
    if (this.opts.failInsufficientScope) throw new OneDriveInsufficientScopeError()
  }

  async findByPath(path: string): Promise<OneDriveItem | null> {
    this.guard()
    return this.files.has(path) ? { path } : null
  }

  async putSmall(path: string, body: Buffer, contentType: string): Promise<void> {
    this.guard()
    this.saveCallCount++
    this.files.set(path, { body: Buffer.from(body), contentType }) // overwrite-in-place — M-4's core guarantee
  }

  async createUploadSession(path: string): Promise<{ uploadUrl: string }> {
    this.guard()
    const uploadUrl = `fake-session-${this.nextSessionId++}`
    this.uploadSessions.set(uploadUrl, { path, chunks: [], aborted: false })
    return { uploadUrl }
  }

  async uploadChunk(uploadUrl: string, chunk: Buffer, _rangeStart: number, _totalSize: number): Promise<boolean> {
    const session = this.uploadSessions.get(uploadUrl)
    if (!session) throw new Error('unknown upload session')
    if (this.opts.failUploadSessionOnChunk !== undefined && session.chunks.length === this.opts.failUploadSessionOnChunk) {
      throw new Error('simulated mid-chunk network failure')
    }
    session.chunks.push(chunk)
    const isFinal = Buffer.concat(session.chunks).length >= _totalSize
    if (isFinal) {
      this.saveCallCount++
      this.files.set(session.path, { body: Buffer.concat(session.chunks), contentType: 'application/octet-stream' })
    }
    return isFinal
  }

  async abortUploadSession(uploadUrl: string): Promise<void> {
    const session = this.uploadSessions.get(uploadUrl)
    if (session) session.aborted = true
  }

  wasSessionAborted(uploadUrl: string): boolean {
    return this.uploadSessions.get(uploadUrl)?.aborted ?? false
  }

  async readFile(path: string): Promise<Buffer> {
    this.guard()
    const f = this.files.get(path)
    if (!f) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return f.body
  }

  async deleteByPath(path: string): Promise<void> {
    this.guard()
    this.files.delete(path) // idempotent — matches real client's 404-is-success
  }

  async ensureFolder(parentPath: string, name: string): Promise<void> {
    this.guard()
    this.folders.add(`${parentPath}/${name}`)
  }

  async ping(): Promise<{ accountId: string }> {
    this.guard()
    return { accountId: this.opts.pingAccountId ?? 'fake-ms-account-id' }
  }

  /** Test helper — counts files at exactly one path (detects an accidental
   *  duplicate-write bug; path-based PUT makes this structurally hard to
   *  fail, but the guarantee is still asserted, design §9). */
  countFilesAt(path: string): number {
    return this.files.has(path) ? 1 : 0
  }
}
