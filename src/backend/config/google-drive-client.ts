// src/backend/config/google-drive-client.ts
// Thin seam between GoogleDriveDriver (and the OAuth callback's folder
// bootstrap) and the googleapis library. Every consumer depends on this
// interface, never on googleapis directly — mirrors smb-client.ts exactly
// (ADR-0023, sub-project 2).
import { google } from 'googleapis'
import { Readable } from 'stream'

export interface GoogleDriveFile {
  id:   string
  name: string
}

export interface GoogleDriveClientConfig {
  clientId:     string
  clientSecret: string
  accessToken:  string
  refreshToken: string
  /** Fired by google-auth-library whenever it silently refreshes the access token. */
  onAccessTokenRefreshed?: (newAccessToken: string) => void
}

export interface GoogleDriveClient {
  findByName(parentId: string, name: string): Promise<GoogleDriveFile | null>
  createFolder(parentId: string, name: string): Promise<GoogleDriveFile>
  createFile(parentId: string, name: string, body: Buffer, mimeType: string): Promise<GoogleDriveFile>
  updateFile(fileId: string, body: Buffer, mimeType: string): Promise<void>
  readFile(fileId: string): Promise<Buffer>
  deleteFile(fileId: string): Promise<void>
  /** false on a genuine 404/trashed; any other failure propagates (a network
   *  blip must not read as "folder gone" — same principle as StorageUnavailableError). */
  folderExists(folderId: string): Promise<boolean>
  /** Cheapest authenticated call — used by the live connected-status check (Task 11). */
  ping(): Promise<void>
}

/**
 * Distinguishes "token invalid/revoked" from any other Drive failure. The
 * live status check (Task 11) needs this specific classification to flip
 * `connected` to false — every other Drive failure (network blip, quota)
 * must NOT flip it ("don't read a blip as data loss", applied at the
 * status-check level, same principle as StorageUnavailableError).
 */
export class GoogleDriveAuthInvalidError extends Error {
  constructor() {
    super('Google Drive credentials invalid or revoked')
    this.name = 'GoogleDriveAuthInvalidError'
  }
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Maps googleapis' native HTTP-status errors onto: a normalized
// ENOENT-coded error (so GoogleDriveDriver's not-found handling matches
// SmbShareDriver's isNotFound() convention), GoogleDriveAuthInvalidError,
// or the original error (left for GoogleDriveDriver to wrap as
// StorageUnavailableError).
function classify(err: unknown): Error {
  const httpStatus = (err as { code?: number })?.code ?? (err as { response?: { status?: number } })?.response?.status
  const gError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  if (httpStatus === 404) return Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  if (httpStatus === 401 || gError === 'invalid_grant') return new GoogleDriveAuthInvalidError()
  return err instanceof Error ? err : new Error(String(err))
}

function buildOAuth2Client(config: GoogleDriveClientConfig) {
  const oAuth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret)
  oAuth2Client.setCredentials({ access_token: config.accessToken, refresh_token: config.refreshToken })
  if (config.onAccessTokenRefreshed) {
    oAuth2Client.on('tokens', (tokens) => {
      if (tokens.access_token) config.onAccessTokenRefreshed!(tokens.access_token)
    })
  }
  return oAuth2Client
}

/**
 * Real Drive v3 client factory — the one place `googleapis` is imported for
 * per-tenant Drive operations (swap it here only, same precedent as
 * SmbClient/@marsaud/smb2). Every method maps googleapis' errors through
 * classify() above.
 */
export function createGoogleDriveClient(config: GoogleDriveClientConfig): GoogleDriveClient {
  const auth = buildOAuth2Client(config)
  const drive = google.drive({ version: 'v3', auth })

  return {
    async findByName(parentId, name) {
      try {
        const res = await drive.files.list({
          q: `'${parentId}' in parents and name = '${escapeQueryValue(name)}' and trashed = false`,
          fields: 'files(id, name)',
          pageSize: 1,
          spaces: 'drive',
        })
        const file = res.data.files?.[0]
        return file?.id && file.name ? { id: file.id, name: file.name } : null
      } catch (err) { throw classify(err) }
    },

    async createFolder(parentId, name) {
      try {
        const res = await drive.files.create({
          requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
          fields: 'id, name',
        })
        return { id: res.data.id!, name: res.data.name! }
      } catch (err) { throw classify(err) }
    },

    async createFile(parentId, name, body, mimeType) {
      try {
        const res = await drive.files.create({
          requestBody: { name, parents: [parentId] },
          media: { mimeType, body: Readable.from(body) },
          fields: 'id, name',
        })
        return { id: res.data.id!, name: res.data.name! }
      } catch (err) { throw classify(err) }
    },

    async updateFile(fileId, body, mimeType) {
      try {
        await drive.files.update({ fileId, media: { mimeType, body: Readable.from(body) } })
      } catch (err) { throw classify(err) }
    },

    async readFile(fileId) {
      try {
        const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        return Buffer.from(res.data as ArrayBuffer)
      } catch (err) { throw classify(err) }
    },

    async deleteFile(fileId) {
      try {
        await drive.files.delete({ fileId })
      } catch (err) { throw classify(err) }
    },

    async folderExists(folderId) {
      try {
        const res = await drive.files.get({ fileId: folderId, fields: 'id, trashed' })
        return res.data.trashed !== true
      } catch (err) {
        const classified = classify(err)
        if ((classified as { code?: string }).code === 'ENOENT') return false
        throw classified
      }
    },

    async ping() {
      try {
        await drive.files.list({ pageSize: 1, fields: 'files(id)' })
      } catch (err) { throw classify(err) }
    },
  }
}

export interface ExchangeCodeParams {
  clientId:     string
  clientSecret: string
  redirectUri:  string
  code:         string
}

export interface ExchangedTokens {
  accessToken:  string
  refreshToken: string
}

/** Used only by the OAuth callback (Task 8) — exchanges the one-time `code` for tokens. */
export async function exchangeCodeForTokens(params: ExchangeCodeParams): Promise<ExchangedTokens> {
  const oAuth2Client = new google.auth.OAuth2(params.clientId, params.clientSecret, params.redirectUri)
  const { tokens } = await oAuth2Client.getToken(params.code)
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return both an access token and a refresh token (missing prompt=consent on a repeat authorization?)')
  }
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token }
}

/** Best-effort revoke — used on disconnect (Task 9) and reconnect-over-existing (Task 8, grill N-10). */
export async function revokeGoogleToken(token: string): Promise<void> {
  const oAuth2Client = new google.auth.OAuth2()
  await oAuth2Client.revokeToken(token)
}
