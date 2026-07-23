// src/backend/config/smb-share-driver.ts
// StorageDriver backed by a per-tenant authenticated SMB share (ADR-0023).
// Opens and closes its own connection per operation — no pooling (accepted
// latency cost, revisit only if measured to matter).
import { randomUUID } from 'crypto'
import { StorageDriver, StorageNotFoundError, StorageUnavailableError } from './storage-driver'
import { SmbClient, SmbClientConfig, createSmbClient } from './smb-client'

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}

export class SmbShareDriver implements StorageDriver {
  constructor(
    private readonly config: SmbClientConfig,
    private readonly clientFactory: (config: SmbClientConfig) => SmbClient = createSmbClient,
  ) {}

  // Every non-not-found failure (connect refused, share missing, credential
  // rejected, mid-operation drop) normalizes to StorageUnavailableError here
  // — grill finding #3 parity with LocalDiskDriver: callers of the resolved
  // StorageDriver (pet.service/emr-attachment.service via getStorageDriver)
  // only ever need "missing" vs. "unreachable, retry," never the specific
  // Smb* connect-time reason. The specific SmbHostUnreachableError /
  // SmbShareNotFoundError / SmbAuthRejectedError classes exist for Sub-PR
  // B's connect-test-write validation (Task 8), which calls createSmbClient
  // directly rather than through this driver — see the test file's
  // "PLAN DEVIATION" note for why those two call paths must diverge here.
  private async withClient<T>(op: (client: SmbClient) => Promise<T>): Promise<T> {
    const client = this.clientFactory(this.config)
    try {
      await client.connect()
      return await op(client)
    } catch (err) {
      if (isNotFound(err)) throw err
      throw new StorageUnavailableError(err)
    } finally {
      await client.disconnect().catch(() => undefined)
    }
  }

  async save(key: string, body: Buffer, _contentType: string): Promise<void> {
    // Grill finding #2: temp-then-rename, same principle as LocalDiskDriver.
    const tempKey = `${key}.tmp-${randomUUID()}`
    await this.withClient(async (client) => {
      await client.writeFile(tempKey, body)
      await client.rename(tempKey, key)
    })
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await this.withClient((client) => client.readFile(key))
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(key)
      throw err
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.withClient((client) => client.unlink(key))
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.withClient((client) => client.exists(key))
  }
}
