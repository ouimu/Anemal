// src/backend/__tests__/helpers/fakeSmbClient.ts
// In-memory stand-in for SmbClient — used by every SmbShareDriver unit test
// (Task 5) so none of them touch a real network share.
import { SmbClient, SmbHostUnreachableError, SmbShareNotFoundError, SmbAuthRejectedError } from '../../config/smb-client'

export interface FakeSmbClientOptions {
  failConnectAs?: 'unreachable' | 'share-not-found' | 'auth-rejected'
}

export class FakeSmbClient implements SmbClient {
  private files = new Map<string, Buffer>()
  private connected = false

  constructor(private opts: FakeSmbClientOptions = {}) {}

  async connect(): Promise<void> {
    if (this.opts.failConnectAs === 'unreachable') throw new SmbHostUnreachableError('fake-host')
    if (this.opts.failConnectAs === 'share-not-found') throw new SmbShareNotFoundError('fake-share')
    if (this.opts.failConnectAs === 'auth-rejected') throw new SmbAuthRejectedError()
    this.connected = true
  }

  private assertConnected() {
    if (!this.connected) throw new Error('FakeSmbClient: not connected — call connect() first')
  }

  async writeFile(remotePath: string, body: Buffer): Promise<void> {
    this.assertConnected()
    this.files.set(remotePath, Buffer.from(body))
  }

  async readFile(remotePath: string): Promise<Buffer> {
    this.assertConnected()
    const buf = this.files.get(remotePath)
    if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return buf
  }

  async unlink(remotePath: string): Promise<void> {
    this.assertConnected()
    this.files.delete(remotePath)
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    this.assertConnected()
    const buf = this.files.get(fromPath)
    if (!buf) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    this.files.set(toPath, buf)
    this.files.delete(fromPath)
  }

  async exists(remotePath: string): Promise<boolean> {
    this.assertConnected()
    return this.files.has(remotePath)
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }
}
