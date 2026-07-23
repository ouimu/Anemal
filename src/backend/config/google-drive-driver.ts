// src/backend/config/google-drive-driver.ts
// StorageDriver backed by a tenant's own Google Drive via OAuth (ADR-0023,
// sub-project 2). Opens a fresh client per operation — no persistent
// connection, same per-operation contract as SmbShareDriver.
import {
  GoogleDriveClient, GoogleDriveClientConfig, GoogleDriveFile, createGoogleDriveClient,
} from './google-drive-client'
import { StorageDriver, StorageKeyError, StorageNotFoundError, StorageUnavailableError } from './storage-driver'

export interface GoogleDriveFolderIds {
  rootFolderId:  string | null
  emrFolderId:   string | null
  photoFolderId: string | null
}

export interface GoogleDriveCredentials {
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

// Storage keys stay server-built only (ADR-0022) — this driver only
// translates the existing tenants/{tenantId}/{emr|photo}/... shape into a
// Drive folder path, it never changes key construction itself. A key for a
// DIFFERENT tenant (or any other shape) is rejected rather than silently
// resolved — defense in depth, callers always pass this tenant's own keys.
function parseKey(tenantId: number, key: string): ParsedKey {
  const prefix = `tenants/${tenantId}/`
  if (!key.startsWith(prefix)) throw new StorageKeyError(key)
  const rest = key.slice(prefix.length).split('/')
  if (rest[0] === 'photo' && rest.length === 2 && rest[1]) return { category: 'photo', fileName: rest[1] }
  if (rest[0] === 'emr' && rest.length === 3 && rest[1] && rest[2]) return { category: 'emr', recordId: rest[1], fileName: rest[2] }
  throw new StorageKeyError(key)
}

/**
 * Finds a child by name under parentId, creating it as a folder if absent.
 * Grill finding N-8 (accepted, documented — not fixed): not atomic, so two
 * near-simultaneous first-uploads to the same not-yet-created folder can
 * each miss the check and both create it. Low-likelihood (each folder is
 * created at most once per its lifetime, not a hot path) — not fixed with
 * locking here, same not-fatal posture as the self-heal case below.
 */
export async function findOrCreateFolder(client: GoogleDriveClient, parentId: string, name: string): Promise<GoogleDriveFile> {
  const existing = await client.findByName(parentId, name)
  if (existing) return existing
  return client.createFolder(parentId, name)
}

/**
 * Resolves (creating if needed) the Anemal/tenant-{id}/emr and .../photo
 * folder tree for a tenant. Called once at OAuth-connect time (Task 8's
 * controller persists the returned IDs) and again by GoogleDriveDriver
 * itself whenever a cached ID no longer resolves (self-heal, below).
 * Grill N-2: the tenant-{id} segment is required even though each tenant
 * has its own OAuth connection — nothing stops the same Google account
 * being connected to two different Anemal tenants.
 */
export async function bootstrapTenantFolders(tenantId: number, client: GoogleDriveClient): Promise<GoogleDriveFolderIds> {
  const anemalRoot = await findOrCreateFolder(client, 'root', 'Anemal')
  const tenantRoot = await findOrCreateFolder(client, anemalRoot.id, `tenant-${tenantId}`)
  const emrFolder = await findOrCreateFolder(client, tenantRoot.id, 'emr')
  const photoFolder = await findOrCreateFolder(client, tenantRoot.id, 'photo')
  return { rootFolderId: tenantRoot.id, emrFolderId: emrFolder.id, photoFolderId: photoFolder.id }
}

export class GoogleDriveDriver implements StorageDriver {
  constructor(
    private readonly tenantId: number,
    private readonly credentials: GoogleDriveCredentials,
    private folderIds: GoogleDriveFolderIds,
    private readonly onFolderIdsResolved: (ids: GoogleDriveFolderIds) => Promise<void>,
    private readonly onAccessTokenRefreshed: (newAccessToken: string) => Promise<void>,
    private readonly clientFactory: (config: GoogleDriveClientConfig) => GoogleDriveClient = createGoogleDriveClient,
  ) {}

  private buildClient(): GoogleDriveClient {
    return this.clientFactory({
      clientId:     this.credentials.clientId,
      clientSecret: this.credentials.clientSecret,
      accessToken:  this.credentials.accessToken,
      refreshToken: this.credentials.refreshToken,
      // google-auth-library refreshes access tokens silently; the write-back
      // to TenantStorageConfig is a conditional update wired in by Task 10
      // via getStorageDriver's construction of this driver (Task 4).
      onAccessTokenRefreshed: (token) => { this.onAccessTokenRefreshed(token).catch(() => undefined) },
    })
  }

  /**
   * Resolves the Drive folder id a category's files live under, using the
   * cached id if it still resolves. Error handling section (design doc):
   * "a cached folder ID that Drive no longer recognizes is treated as not
   * found, not fatal" — self-heals by re-running bootstrapTenantFolders and
   * persisting the fresh ids via onFolderIdsResolved.
   */
  private async ensureCategoryFolder(client: GoogleDriveClient, category: 'emr' | 'photo'): Promise<string> {
    const cachedId = category === 'emr' ? this.folderIds.emrFolderId : this.folderIds.photoFolderId
    if (cachedId && (await client.folderExists(cachedId))) return cachedId

    const fresh = await bootstrapTenantFolders(this.tenantId, client)
    this.folderIds = fresh
    await this.onFolderIdsResolved(fresh)
    return category === 'emr' ? fresh.emrFolderId! : fresh.photoFolderId!
  }

  private async resolveParentFolderId(client: GoogleDriveClient, parsed: ParsedKey): Promise<string> {
    const categoryFolderId = await this.ensureCategoryFolder(client, parsed.category)
    if (parsed.category === 'photo') return categoryFolderId
    const recordFolder = await findOrCreateFolder(client, categoryFolderId, parsed.recordId!)
    return recordFolder.id
  }

  private wrapError(err: unknown): Error {
    if (err instanceof StorageNotFoundError || err instanceof StorageUnavailableError || err instanceof StorageKeyError) return err
    return new StorageUnavailableError(err)
  }

  async save(key: string, body: Buffer, contentType: string): Promise<void> {
    const client = this.buildClient()
    try {
      const parsed = parseKey(this.tenantId, key)
      const parentId = await this.resolveParentFolderId(client, parsed)
      // Grill finding N-1: Drive allows duplicate same-named files and
      // files.create never replaces — list-by-name then files.update on the
      // same file id if found, else files.create. This is Drive's
      // atomicity story in place of temp-then-rename (no analog exists).
      const existing = await client.findByName(parentId, parsed.fileName)
      if (existing) await client.updateFile(existing.id, body, contentType)
      else await client.createFile(parentId, parsed.fileName, body, contentType)
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async read(key: string): Promise<Buffer> {
    const client = this.buildClient()
    try {
      const parsed = parseKey(this.tenantId, key)
      const parentId = await this.resolveParentFolderId(client, parsed)
      const existing = await client.findByName(parentId, parsed.fileName)
      if (!existing) throw new StorageNotFoundError(key)
      return await client.readFile(existing.id)
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async delete(key: string): Promise<void> {
    const client = this.buildClient()
    try {
      const parsed = parseKey(this.tenantId, key)
      const parentId = await this.resolveParentFolderId(client, parsed)
      const existing = await client.findByName(parentId, parsed.fileName)
      if (!existing) return // idempotent — same contract as LocalDiskDriver/SmbShareDriver
      await client.deleteFile(existing.id)
    } catch (err) {
      throw this.wrapError(err)
    }
  }

  async exists(key: string): Promise<boolean> {
    const client = this.buildClient()
    try {
      const parsed = parseKey(this.tenantId, key)
      const parentId = await this.resolveParentFolderId(client, parsed)
      return (await client.findByName(parentId, parsed.fileName)) !== null
    } catch (err) {
      throw this.wrapError(err)
    }
  }
}
