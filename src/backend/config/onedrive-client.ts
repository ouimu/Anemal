// src/backend/config/onedrive-client.ts
// Thin seam between OneDriveDriver (and the OAuth callback) and Microsoft
// Graph — plain `fetch`, ZERO new runtime dependency (M-6; MSAL's
// serialized-token-cache model is incompatible with our per-tenant
// encrypted-columns-in-Postgres storage pattern, same reasoning that
// rejected `googleapis`'s heavier footprint on the Ponytail note carried
// forward from the GDrive sub-project). Mirrors google-drive-client.ts's
// seam shape (ADR-0023, sub-project 3).
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_ENDPOINT = (audience: string) => `https://login.microsoftonline.com/${audience}/oauth2/v2.0/token`

export interface OneDriveClientConfig {
  clientId:     string
  clientSecret: string
  accessToken:  string
  refreshToken: string
  /** Fired whenever this client proactively or reactively refreshes tokens — Microsoft ROTATES refresh tokens (M-2), so both must be captured, not just the access token. */
  onTokensRefreshed?: (tokens: { accessToken: string; refreshToken: string; expiresAt: Date }) => void
}

export interface OneDriveItem {
  path: string
}

export interface OneDriveClient {
  findByPath(path: string): Promise<OneDriveItem | null>
  /** ≤4 MB simple upload (M-5). Path-based PUT is inherently overwrite-in-place. */
  putSmall(path: string, body: Buffer, contentType: string): Promise<void>
  /** >4 MB path (M-5) — returns an uploadUrl for sequential uploadChunk calls. */
  createUploadSession(path: string): Promise<{ uploadUrl: string }>
  uploadChunk(uploadUrl: string, chunk: Buffer, rangeStart: number, totalSize: number): Promise<boolean /* true = final chunk committed */>
  /** Best-effort cleanup of an abandoned upload session (round-2 grill finding 6). */
  abortUploadSession(uploadUrl: string): Promise<void>
  readFile(path: string): Promise<Buffer>
  deleteByPath(path: string): Promise<void>
  /** POST .../children with conflictBehavior:"fail"; 409 nameAlreadyExists treated as success (M-4 — idempotent ensure). */
  ensureFolder(parentPath: string, name: string): Promise<void>
  /** Cheapest authenticated probe — used by the live status check (Sub-PR B Task 10/11). Path/response shape depends on the OD-13 spike result. */
  ping(): Promise<{ accountId: string }>
}

/** M-9: token invalid/revoked — flips `connected: false`, StorageUnavailableError at the operation layer. */
export class OneDriveAuthInvalidError extends Error {
  constructor() { super('OneDrive credentials invalid or revoked'); this.name = 'OneDriveAuthInvalidError' }
}

/** M-9, round-2 grill finding 3: insufficient scope (403) is classified distinctly from both "not found" and generic "unavailable" — must never be silently treated as a transient blip on the status-ping/account-hash calls. */
export class OneDriveInsufficientScopeError extends Error {
  constructor() { super('OneDrive token lacks the required scope for this call'); this.name = 'OneDriveInsufficientScopeError' }
}

function classify(status: number, body: unknown): Error | null {
  if (status === 404) return Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  const errorCode = (body as { error?: { code?: string } })?.error?.code
  if (status === 401 || errorCode === 'InvalidAuthenticationToken') return new OneDriveAuthInvalidError()
  if (status === 403) return new OneDriveInsufficientScopeError()
  if (status >= 200 && status < 300) return null
  return new Error(`OneDrive Graph call failed: ${status} ${JSON.stringify(body)}`)
}

async function graphFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } })
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

function appRootPath(path: string): string {
  // path is e.g. "tenant-1/photo/pet-1.jpg" — addressed under the app's
  // private folder (Q2 = a). Colon-delimited path addressing per Graph's
  // driveItem-by-path convention.
  return `/me/drive/special/approot:/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function createOneDriveClient(cfg: OneDriveClientConfig): OneDriveClient {
  // Proactive refresh + reactive retry-once-on-401 both funnel through this
  // one function so every method gets both without duplicating the logic
  // (M-2). Mutated in place per-instance — one client is built per operation
  // (buildClient() pattern in OneDriveDriver, Task 4), so this is safe.
  let accessToken = cfg.accessToken
  let refreshToken = cfg.refreshToken

  async function refresh(): Promise<void> {
    const res = await fetch(TOKEN_ENDPOINT('common'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId, client_secret: cfg.clientSecret,
        grant_type: 'refresh_token', refresh_token: refreshToken,
        scope: 'offline_access Files.ReadWrite.AppFolder',
      }),
    })
    if (!res.ok) throw new OneDriveAuthInvalidError()
    const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    accessToken = json.access_token
    refreshToken = json.refresh_token // Microsoft ROTATES — always take the new one (M-2)
    const expiresAt = new Date(Date.now() + json.expires_in * 1000)
    cfg.onTokensRefreshed?.({ accessToken, refreshToken, expiresAt })
  }

  async function callWithRefresh(fn: () => Promise<{ status: number; body: unknown }>): Promise<{ status: number; body: unknown }> {
    let result = await fn()
    if (result.status === 401) {
      await refresh() // reactive retry-once (M-2)
      result = await fn()
    }
    return result
  }

  return {
    async findByPath(path) {
      const { status, body } = await callWithRefresh(() => graphFetch(`${GRAPH_BASE}${appRootPath(path)}`, accessToken))
      const err = classify(status, body)
      if (err && (err as { code?: string }).code === 'ENOENT') return null
      if (err) throw err
      return { path }
    },

    async putSmall(path, body, contentType) {
      const { status, body: respBody } = await callWithRefresh(() =>
        graphFetch(`${GRAPH_BASE}${appRootPath(path)}:/content`, accessToken, { method: 'PUT', headers: { 'Content-Type': contentType }, body }))
      const err = classify(status, respBody)
      if (err) throw err
    },

    async createUploadSession(path) {
      const { status, body } = await callWithRefresh(() =>
        graphFetch(`${GRAPH_BASE}${appRootPath(path)}:/createUploadSession`, accessToken, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
        }))
      const err = classify(status, body)
      if (err) throw err
      return { uploadUrl: (body as { uploadUrl: string }).uploadUrl }
    },

    async uploadChunk(uploadUrl, chunk, rangeStart, totalSize) {
      const rangeEnd = rangeStart + chunk.length - 1
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Length': String(chunk.length), 'Content-Range': `bytes ${rangeStart}-${rangeEnd}/${totalSize}` },
        body: chunk,
      })
      if (!res.ok && res.status !== 202) throw new Error(`OneDrive chunk upload failed: ${res.status}`)
      return res.status === 200 || res.status === 201 // final chunk commits with 200/201, intermediate with 202
    },

    async abortUploadSession(uploadUrl) {
      // Best-effort cleanup on a failed multi-chunk upload (round-2 grill
      // finding 6) — never surfaces its own failure, the session self-
      // expires at Microsoft after some days regardless.
      await fetch(uploadUrl, { method: 'DELETE' }).catch(() => undefined)
    },

    async readFile(path) {
      const res = await fetch(`${GRAPH_BASE}${appRootPath(path)}:/content`, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (res.status === 404) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      if (res.status === 401) { await refresh(); return this.readFile(path) }
      if (!res.ok) throw new Error(`OneDrive readFile failed: ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    },

    async deleteByPath(path) {
      const { status, body } = await callWithRefresh(() =>
        graphFetch(`${GRAPH_BASE}${appRootPath(path)}`, accessToken, { method: 'DELETE' }))
      if (status === 404) return // idempotent
      const err = classify(status, body)
      if (err) throw err
    },

    async ensureFolder(parentPath, name) {
      const parent = parentPath ? appRootPath(parentPath) : '/me/drive/special/approot'
      const { status, body } = await callWithRefresh(() =>
        graphFetch(`${GRAPH_BASE}${parent}:/children`, accessToken, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
        }))
      // M-4: 409 nameAlreadyExists is treated as SUCCESS — idempotent ensure,
      // race-safe by construction (two racers converge on one folder).
      if (status === 409) return
      const err = classify(status, body)
      if (err) throw err
    },

    async ping() {
      // OD-13 PRIMARY variant (see Task 0's outcome record). If the spike
      // recorded the FALLBACK result instead, swap this call to
      // `/me/drive/special/approot` and read `parentReference.driveId`
      // instead of `owner.user.id` — search this file for "OD-13 fallback".
      const { status, body } = await callWithRefresh(() => graphFetch(`${GRAPH_BASE}/me/drive`, accessToken))
      const err = classify(status, body)
      if (err) throw err
      const accountId = (body as { owner?: { user?: { id?: string } } })?.owner?.user?.id
      if (!accountId) throw new Error('OneDrive ping succeeded but returned no owner.user.id — check OD-13 spike result, may need the approot fallback')
      return { accountId }
      // OD-13 fallback variant (only if Task 0 recorded the fallback result):
      //   const { status, body } = await callWithRefresh(() => graphFetch(`${GRAPH_BASE}/me/drive/special/approot`, accessToken))
      //   const err = classify(status, body); if (err) throw err
      //   const accountId = (body as { parentReference?: { driveId?: string } })?.parentReference?.driveId
      //   if (!accountId) throw new Error('...')
      //   return { accountId }
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
  expiresAt:    Date
}

/** Used only by the OAuth callback (Task 10, Sub-PR B) — exchanges the one-time `code` for tokens. */
export async function exchangeCodeForTokens(params: ExchangeCodeParams): Promise<ExchangedTokens> {
  const res = await fetch(TOKEN_ENDPOINT('common'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: params.clientId, client_secret: params.clientSecret,
      grant_type: 'authorization_code', code: params.code, redirect_uri: params.redirectUri,
      scope: 'offline_access Files.ReadWrite.AppFolder',
    }),
  })
  if (!res.ok) throw new Error(`OneDrive token exchange failed: ${res.status} ${await res.text()}`)
  const json = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  if (!json.access_token || !json.refresh_token) throw new Error('Microsoft did not return both an access token and a refresh token')
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + json.expires_in * 1000) }
}

// M-3: no revokeOneDriveToken export exists — Microsoft provides no API for
// an app to revoke its own delegated grant (revokeSignInSessions kills ALL
// the user's sessions everywhere, an unacceptable side effect). Disconnect
// is null-tokens-only (Task 6/Sub-PR B Task 10's disconnect wiring) — the
// absence of this function is deliberate, not an oversight.
