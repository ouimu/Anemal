// src/backend/config/onedrive-driver.ts
// StorageDriver backed by a tenant's own Microsoft OneDrive (app-folder
// scope) via OAuth (ADR-0023, sub-project 3). Path-based addressing means
// save() is inherently overwrite-in-place (M-4) — no folder-ID cache class
// exists here, unlike GoogleDriveDriver.
import {
  OneDriveClient, OneDriveClientConfig, createOneDriveClient,
} from './onedrive-client'
import { StorageDriver, StorageKeyError, StorageNotFoundError, StorageUnavailableError } from './storage-driver'

const SIMPLE_PUT_MAX_BYTES = 4 * 1024 * 1024 // ~4 MB Graph simple-PUT limit (M-5)
const CHUNK_SIZE = 10 * 1024 * 1024 // one 10 MiB chunk covers our 25 MB max in ≤3 requests, multiple of 320 KiB

export interface OneDriveCredentials {
  clientId:     string
  clientSecret: string
  accessToken:  string
  refreshToken: string
}

interface ParsedKey {
  category:  'emr' | 'photo'
  recordId?: string
  fileName:  string
}

// Same server-built tenants/{tenantId}/{emr|photo}/... key shape as every
// other driver (ADR-0022) — maps 1:1 onto the approot-relative Graph path
// tenant-{id}/{emr/{recordId}|photo}/{fileName}.
export function parseOneDriveKey(tenantId: number, key: string): ParsedKey {
  const prefix = `tenants/${tenantId}/`
  if (!key.startsWith(prefix)) throw new StorageKeyError(key)
  const rest = key.slice(prefix.length).split('/')
  if (rest[0] === 'photo' && rest.length === 2 && rest[1]) return { category: 'photo', fileName: rest[1] }
  if (rest[0] === 'emr' && rest.length === 3 && rest[1] && rest[2]) return { category: 'emr', recordId: rest[1], fileName: rest[2] }
  throw new StorageKeyError(key)
}

function toGraphPath(tenantId: number, parsed: ParsedKey): string {
  return parsed.category === 'photo'
    ? `tenant-${tenantId}/photo/${parsed.fileName}`
    : `tenant-${tenantId}/emr/${parsed.recordId}/${parsed.fileName}`
}

export class OneDriveDriver implements StorageDriver {
  constructor(
    private readonly tenantId: number,
    private readonly credentials: OneDriveCredentials,
    private readonly onTokensRefreshed: (tokens: { accessToken: string; refreshToken: string; expiresAt: Date }) => Promise<void>,
    private readonly clientFactory: (config: OneDriveClientConfig) => OneDriveClient = createOneDriveClient,
  ) {}

  private buildClient(): OneDriveClient {
    return this.clientFactory({
      clientId:     this.credentials.clientId,
      clientSecret: this.credentials.clientSecret,
      accessToken:  this.credentials.accessToken,
      refreshToken: this.credentials.refreshToken,
      onTokensRefreshed: (tokens) => { this.onTokensRefreshed(tokens).catch(() => undefined) },
    })
  }

  private wrapError(err: unknown): Error {
    if (err instanceof StorageNotFoundError || err instanceof StorageUnavailableError || err instanceof StorageKeyError) return err
    return new StorageUnavailableError(err)
  }

  private async ensureParentChain(client: OneDriveClient, tenantId: number, parsed: ParsedKey): Promise<void> {
    // M-4: ensure the parent chain exists before PUT-by-path — Graph's
    // auto-create-intermediate-folders behavior is not assumed. 409
    // nameAlreadyExists is success (idempotent ensure, race-safe by
    // construction — two racers converge on one folder, not duplicates).
    await client.ensureFolder('', `tenant-${tenantId}`)
    await client.ensureFolder(`tenant-${tenantId}`, parsed.category)
    if (parsed.category === 'emr') {
      await client.ensureFolder(`tenant-${tenantId}/emr`, parsed.recordId!)
    }
  }

  async save(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = this.buildClient()
    try {
      const parsed = parseOneDriveKey(this.tenantId, key)
      await this.ensureParentChain(client, this.tenantId, parsed)
      const path = toGraphPath(this.tenantId, parsed)

      if (body.length <= SIMPLE_PUT_MAX_BYTES) {
        await client.putSmall(path, body, contentType) // inherently overwrite-in-place (M-4) — no list-then-update dance needed
        return
      }

      // M-5: >4 MB routes through the upload-session/chunk path.
      const { uploadUrl } = await client.createUploadSession(path)
      try {
        let offset = 0
        let committed = false
        while (offset < body.length) {
          const chunk = body.subarray(offset, Math.min(offset + CHUNK_SIZE, body.length))
          committed = await client.uploadChunk(uploadUrl, chunk, offset, body.length)
          offset += chunk.length
        }
        if (!committed) throw new Error('OneDrive upload session did not commit on the final chunk')
      } catch (uploadErr) {
        // Round-2 grill finding 6: best-effort cleanup of the abandoned
        // session on failure — cheap, never blocks surfacing the real error.
        await client.abortUploadSession(uploadUrl)
        throw uploadErr
      }
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async read(key: string): Promise<Buffer> {
    const client = this.buildClient()
    try {
      const parsed = parseOneDriveKey(this.tenantId, key)
      const path = toGraphPath(this.tenantId, parsed)
      return await client.readFile(path)
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') throw new StorageNotFoundError(key)
      throw this.wrapError(err)
    }
  }

  async delete(key: string): Promise<void> {
    const client = this.buildClient()
    try {
      const parsed = parseOneDriveKey(this.tenantId, key)
      const path = toGraphPath(this.tenantId, parsed)
      await client.deleteByPath(path) // idempotent — 404 handled inside the client
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async exists(key: string): Promise<boolean> {
    const client = this.buildClient()
    try {
      const parsed = parseOneDriveKey(this.tenantId, key)
      const path = toGraphPath(this.tenantId, parsed)
      return (await client.findByPath(path)) !== null
    } catch (err) {
      throw this.wrapError(err)
    }
  }
}
