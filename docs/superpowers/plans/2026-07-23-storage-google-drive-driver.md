# Per-Tenant Storage Provider — Google Drive Driver — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Sub-project:** 2 of 3 on `feature/tenant-storage-provider` (custom-path/SMB shipped as PR #46 core + PR #47 API+UI, not yet merged to `main`; Google Drive is this plan; OneDrive follows as sub-project 3 on the same branch, per the locked build-order decision).

**Goal:** A Clinic Admin can connect their tenant's EMR attachments + pet photos to their own Google Drive via OAuth (`drive.file` scope), instead of local disk or an SMB network share. Builds on ADR-0022/0023's `StorageDriver` interface and `getStorageDriver(tenantId)` switch point (sub-project 1) — this plan adds one more driver behind that same switch point, plus the OAuth connect/disconnect flow and its own new `OAuthConnectNonce` table.

**Inputs (read in full before this plan was written):**
- Design (final, post-grill): `docs/superpowers/specs/2026-07-23-storage-google-drive-driver-design.md`
- BA sign-off: `docs/superpowers/specs/2026-07-23-storage-google-drive-driver-ba-signoff.md`
- Grill record: `docs/superpowers/specs/2026-07-23-storage-google-drive-driver-grill.md`
- ADR-0023, "Amendment (2026-07-23) — Sub-project 2" section: `docs/adr/0023-per-tenant-network-share-storage-driver.md`
- Reference plan (format/granularity mirrored throughout): `docs/superpowers/plans/2026-07-23-tenant-storage-provider-custom-path.md`
- Live source read before writing this plan: `src/backend/config/storage-driver.ts`, `src/backend/config/smb-share-driver.ts`, `src/backend/config/smb-client.ts` (incl. its `smb-share-driver.test.ts` "PLAN DEVIATION" comment), `src/backend/services/storage-config.service.ts`, `src/backend/models/tenant-storage-config.repository.ts`, `src/backend/routes/settings.routes.ts`, `src/backend/app.ts`, `src/backend/utils/encryption.ts`, `src/backend/models/settings-audit.repository.ts`, `src/backend/prisma/schema.prisma` (`TenantStorageConfig`, `RefreshToken`, `Tenant`), `src/backend/middlewares/auth.middleware.ts`, `src/backend/middlewares/permission.middleware.ts`, `src/backend/services/permission.service.ts`, `src/backend/config/env.ts`, `src/backend/utils/errors.ts`, `src/frontend/src/hooks/useStorageConfig.ts`, `src/frontend/src/views/settings/StoragePage.tsx`, `src/frontend/src/App.tsx`, `src/frontend/src/layouts/SettingsLayout.tsx`, `src/frontend/src/utils/api.ts`, `src/backend/tests/integration/storage-config.test.ts`.

**Architecture:** New `GoogleDriveDriver` (implements the existing `StorageDriver` interface) alongside `LocalDiskDriver`/`SmbShareDriver`, talking to Google only through an injectable `GoogleDriveClient` seam (`src/backend/config/google-drive-client.ts`) — mirrors `smb-client.ts` exactly: every `GoogleDriveDriver` test runs against a `FakeGoogleDriveClient`, zero real network dependency; the `googleapis` library is wired up behind one factory function (`createGoogleDriveClient`) and nowhere else. `getStorageDriver(tenantId)` (already async, sub-project 1) gains a `google_drive` branch. A new signed, single-use-nonce `state` param (HMAC over an HKDF-derived key, consumed atomically via a new `OAuthConnectNonce` table mirroring `RefreshToken`'s rotation pattern) is the trust boundary for the one unauthenticated hop in this feature — Google's redirect to a brand-new top-level `GET /oauth/google/callback` route, registered directly in `app.ts` outside `/api/settings` entirely (not a same-prefix sub-router — `settings.routes.ts`'s `router.use(authMiddleware)` is global and would 401 Google's unauthenticated redirect regardless of registration order). Everything else (connect-initiation, disconnect, status read) reuses sub-project 1's `/clinic/storage-config` infrastructure and `updateStorageConfig`/`getStorageConfigForDisplay` service functions, extended rather than replaced.

**Tech Stack:** Node/Express/TypeScript backend (Prisma/Postgres), React 18/Vite frontend, Jest/supertest (backend), Vitest/Testing Library (frontend). One new runtime dependency: `googleapis` (official Google API Node client, bundles `google-auth-library`'s `OAuth2Client`), isolated behind `GoogleDriveClient`/`createGoogleDriveClient` exactly as `@marsaud/smb2` is isolated behind `SmbClient`.

## PR Split — data point for Ponytail (Step 5 makes the actual ruling)

Following sub-project 1's precedent (which Ponytail split into Sub-PR A "core" / Sub-PR B "API+UI" after rejecting a single-PR plan on scope), my own assessment of this plan's scope:

- **New files: ~13** (`google-drive-client.ts` + `fakeGoogleDriveClient.ts`, `google-drive-driver.ts` + test, `oauth-state.ts` + test, `oauth-connect-nonce.repository.ts` + test, `oauth-google.controller.ts`, `oauth-google.routes.ts`, 2 new integration test files, 1 new frontend page `StorageConnectingPage.tsx`, 1 new migration file).
- **Modified files: ~11** (`schema.prisma`, `storage-driver.ts`, `tenant-storage-config.repository.ts`, `storage-config.service.ts`, `settings.controller.ts`, `settings.routes.ts`, `app.ts`, `package.json`, `storage-config.service.test.ts`, plus 3 frontend files: `useStorageConfig.ts`, `StoragePage.tsx`, `App.tsx`).
- **Total touched: ~24 files** — exceeds Ponytail criterion 6 (>15 new files is the literal trigger, but the combined new+modified footprint is the same shape sub-project 1 was rejected for).
- **Subsystems touched: 4** — DB/migration, backend crypto+driver core (OAuth state signing, nonce table, Drive client/driver), backend API surface (2 new endpoints on 2 different routers — one of them a brand-new top-level public router in `app.ts`), frontend. Exceeds criterion 4 (>3 subsystems).
- **New endpoints: 2** (`GET .../google/authorize`, `GET /oauth/google/callback`) plus 1 extended existing endpoint (`GET /clinic/storage-config` gains `connected`) — under criterion 7's threshold on its own, not a driver of a split.
- **New dependencies: 1** (`googleapis`) — well under criterion 5.

**My assessment: this looks like it needs the same 2-PR split as sub-project 1**, cut at the same seam (driver/crypto core vs. OAuth-endpoints+UI):
- **Sub-PR A — driver + crypto core, Tasks 1–6:** migration, `GoogleDriveClient`/`FakeGoogleDriveClient`, `GoogleDriveDriver`, the `getStorageDriver` branch + repository/service plumbing for it, the HMAC state-signing helper, the nonce repository. No user-facing surface — fully covered by unit tests against fakes, nothing depends on a live Google account.
- **Sub-PR B — OAuth endpoints + disconnect/refresh wiring + frontend, Tasks 7–13:** the `/authorize` endpoint, the `/oauth/google/callback` top-level route, disconnect-revokes-and-nulls, the token-refresh write-back's race-safe conditional update, the live `connected` status field, and the frontend (radio option, Connect button, interstitial page, Disconnect). Depends on Sub-PR A having merged.

Ponytail makes the final ruling at Step 5 — this section is the data point, not the decision.

## Global Constraints

- Every query touching `TenantStorageConfig` MUST be tenant-scoped (`WHERE tenantId = :tenantId`) — the table's PK **is** `tenantId`, so `findUnique({ where: { tenantId } })` / `upsert({ where: { tenantId }, ... })` already guarantee this; never a bare `findFirst`. Unaffected by this plan, but every new column read/write goes through the same repository functions.
- `OAuthConnectNonce` rows carry `tenantId`/`userId` but are looked up by `nonceHash` (the trust boundary is the hash + signed state, not a tenant-scoped read) — this is the one table in this plan that is *not* tenant-scoped-by-PK, by design (mirrors `RefreshToken`'s own `tokenHash`-keyed lookup pattern).
- RBAC deny-by-default: `GET .../google/authorize` requires `clinic.integrations.edit` (same class as the existing `PUT /clinic/storage-config`). `GET /oauth/google/callback` has **no** permission/plane middleware at all — its own top-level public router; the signed, single-use `state` param is the entire trust boundary, verified (signature + ≤10-min expiry + atomic nonce-consume + still-active user/tenant/permission) **before anything is read or persisted** (BA G-1, grill N-9).
- `state` is signed with `HKDF-SHA256(SETTINGS_ENCRYPTION_KEY, info: 'oauth-state-hmac-v1')`, **never** the raw `SETTINGS_ENCRYPTION_KEY` directly (grill N-5).
- The redirect origin embedded in `state` is derived **server-side** from the authenticated tenant's own record inside `/authorize` — never from a client header/param/Referer, even though the value ends up signed (BA G-2a). On a signature-invalid or expired `state` specifically, the callback redirects to a **fixed, server-configured default origin**, never a value read out of the untrusted `state` (grill N-7).
- The nonce consume step is a **single atomic statement** (`UPDATE ... WHERE nonceHash = ? AND consumedAt IS NULL`, checked by affected-row count), executed **before** the code exchange — never a separate check-then-mark (grill N-3).
- `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` are checked **lazily, at request time** in both `/authorize` and the callback — deliberately **not** added to `config/env.ts`'s boot-time required-env validation, which would brick every deployment not using Drive (grill N-6).
- The refreshed-access-token write-back is a **conditional update** (`WHERE provider = 'google_drive' AND googleRefreshTokenEncrypted IS NOT NULL`), silently dropped (never retried, never errored) if it doesn't match, and is **explicitly exempt** from the `settings_audit_log`-on-write rule (grill N-4, BA G-4a).
- Disconnecting from `google_drive` **nulls** `googleAccessTokenEncrypted`/`googleRefreshTokenEncrypted` and all three folder-ID columns in the same write as the Google-side best-effort revoke — a stale encrypted refresh token must never survive a confirmed disconnect (BA G-4b).
- Tokens are never returned by any `GET` — `configured`/`connected` booleans stand in, same rule as the SMB password.
- `save()` on an existing Drive key **must** use `files.update` on the same file ID, never a second `files.create` — this is the single most important behavioral guarantee in this plan (grill N-1); a regression here silently breaks pet-photo replace.
- Folder paths inside Drive stay **tenant-scoped** (`Anemal/tenant-{id}/emr`, `Anemal/tenant-{id}/photo`) even though each tenant has its own OAuth connection — nothing prevents the same Google account being connected to two tenants (grill N-2).
- Storage keys stay server-built only (unchanged from ADR-0022) — this plan does not touch key construction, only which driver resolves them; the existing `tenants/{tenantId}/{emr|photo}/...` key shape is translated into the Drive folder tree, never redefined.
- Layered architecture stays Route → Controller → Service/Repository → Driver; `GoogleDriveDriver`/`createGoogleDriveClient` are constructed only inside `getStorageDriver()` or the OAuth callback controller, never directly in an unrelated service.
- Cross-tenant existence checks return 404, never 403 (ADR-0014 precedent) — unaffected here, but new code must not regress it.
- TypeScript strict mode; no `any` beyond what already exists in touched files (the two spots where the Google Drive API's own types are awkward — `files.get` with `alt: 'media'` returning `unknown`-typed `data` — are cast explicitly and narrowly, not blanket-`any`'d).

---

## Task 1: Prisma migration — 5 new `google*` columns + `OAuthConnectNonce` table

**Files:**
- Modify: `src/backend/prisma/schema.prisma`
- Create: `src/backend/prisma/migrations/20260723130000_add_google_drive_storage/migration.sql`

**Interfaces:**
- Produces: 5 new nullable columns on `TenantStorageConfig` (`googleAccessTokenEncrypted`, `googleRefreshTokenEncrypted`, `googleRootFolderId`, `googleEmrFolderId`, `googlePhotoFolderId`), and a new Prisma model `OAuthConnectNonce { nonceHash String @id, tenantId Int, userId Int, provider String, expiresAt DateTime, consumedAt DateTime? }`. Consumed by Task 4 (repository), Task 6 (nonce repository), Task 8 (callback controller).

- [ ] **Step 1: Add the 5 columns to `TenantStorageConfig` in `schema.prisma`**

Replace the existing model (currently ends `@@map("tenant_storage_config")`) with:

```prisma
// Per-tenant BYO storage location (ADR-0023). One row per tenant; absence
// of a row means "use the operator's default LocalDiskDriver" — no backfill
// needed for existing tenants. provider values: 'local' | 'custom_path' |
// 'google_drive' (future: 'onedrive'). google* columns are populated only
// when provider = 'google_drive' — see ADR-0023's sub-project 2 amendment.
model TenantStorageConfig {
  tenantId             Int      @id
  provider             String   @default("local") @db.VarChar(20)
  smbHost              String?  @db.VarChar(255)
  smbShare             String?  @db.VarChar(500)
  smbUsername          String?  @db.VarChar(255)
  smbPasswordEncrypted String?
  // Google Drive (sub-project 2) — AES-256-GCM via SETTINGS_ENCRYPTION_KEY,
  // same helper/key as smbPasswordEncrypted. Folder IDs are tenant-scoped
  // (Anemal/tenant-{id}/emr, .../photo) even though each tenant has its own
  // OAuth connection (grill N-2) — nothing stops the same Google account
  // being connected to two tenants.
  googleAccessTokenEncrypted  String?
  googleRefreshTokenEncrypted String?
  googleRootFolderId          String?
  googleEmrFolderId           String?
  googlePhotoFolderId         String?
  updatedAt            DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_storage_config")
}

// Single-use nonce for the Google Drive OAuth connect flow (grill N-3),
// mirroring RefreshToken's tokenHash + rotation pattern rather than
// inventing a new mechanism. Provider-generic (not "google"-specific) —
// sub-project 3 (OneDrive) reuses this table verbatim.
model OAuthConnectNonce {
  nonceHash  String    @id
  tenantId   Int
  userId     Int
  provider   String    @db.VarChar(20)
  expiresAt  DateTime
  consumedAt DateTime?

  @@index([expiresAt])
  @@map("oauth_connect_nonce")
}
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- src/backend/prisma/migrations/20260723130000_add_google_drive_storage/migration.sql
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleAccessTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleRefreshTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleRootFolderId" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleEmrFolderId" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "googlePhotoFolderId" TEXT;

CREATE TABLE "oauth_connect_nonce" (
    "nonceHash"  TEXT NOT NULL,
    "tenantId"   INTEGER NOT NULL,
    "userId"     INTEGER NOT NULL,
    "provider"   VARCHAR(20) NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_connect_nonce_pkey" PRIMARY KEY ("nonceHash")
);

CREATE INDEX "oauth_connect_nonce_expiresAt_idx" ON "oauth_connect_nonce"("expiresAt");
```

- [ ] **Step 3: Generate + apply**

Run: `cd src/backend && npx prisma generate && npx prisma migrate dev --name add_google_drive_storage`
Expected: migration applies cleanly; `SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_storage_config';` shows the 5 new columns; `SELECT * FROM oauth_connect_nonce;` confirms the empty table exists.

- [ ] **Step 4: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations/20260723130000_add_google_drive_storage
git commit -m "feat(storage): add Google Drive columns + OAuthConnectNonce table (ADR-0023 sub-project 2)"
```

---

## Task 2: `GoogleDriveClient` seam — interface, fake test double, real `googleapis` factory

**Files:**
- Create: `src/backend/config/google-drive-client.ts`
- Create: `src/backend/__tests__/helpers/fakeGoogleDriveClient.ts`
- Modify: `src/backend/package.json` (add `googleapis`)

**Interfaces:**
- Produces: `interface GoogleDriveFile { id: string; name: string }`, `interface GoogleDriveClientConfig { clientId, clientSecret, accessToken, refreshToken, onAccessTokenRefreshed?: (token: string) => void }`, `interface GoogleDriveClient { findByName, createFolder, createFile, updateFile, readFile, deleteFile, folderExists, ping }`, `class GoogleDriveAuthInvalidError extends Error`, `function createGoogleDriveClient(config): GoogleDriveClient`, `function exchangeCodeForTokens(params): Promise<{accessToken, refreshToken}>`, `function revokeGoogleToken(token): Promise<void>`. Consumed by Task 3 (`GoogleDriveDriver`, via constructor injection), Task 4 (`getStorageDriver`'s default factory param), Task 8 (`exchangeCodeForTokens`/`revokeGoogleToken` in the callback controller), Task 9 (`revokeGoogleToken` in disconnect), Task 11 (`createGoogleDriveClient`'s `ping()` for the live status check).

- [ ] **Step 1: Install the dependency**

Run: `cd src/backend && npm install googleapis`
Expected: `package.json`'s `dependencies` gains `"googleapis": "^..."` (whatever the installed version resolves to — record the exact version `npm install` writes, do not hand-edit a guessed version number).

- [ ] **Step 2: Write `google-drive-client.ts`**

```ts
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
```

- [ ] **Step 3: Write the fake test double**

```ts
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
```

- [ ] **Step 4: Compile check (no independent test file for this task — exercised through Task 3's `GoogleDriveDriver` tests)**

Run: `cd src/backend && npx tsc --noEmit`
Expected: no new type errors from these two files.

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/google-drive-client.ts src/backend/__tests__/helpers/fakeGoogleDriveClient.ts src/backend/package.json src/backend/package-lock.json
git commit -m "feat(storage): GoogleDriveClient interface + FakeGoogleDriveClient test double (ADR-0023 sub-project 2)"
```

---

## Task 3: `GoogleDriveDriver` implements `StorageDriver`

**Files:**
- Create: `src/backend/config/google-drive-driver.ts`
- Create: `src/backend/__tests__/google-drive-driver.test.ts`

**Interfaces:**
- Consumes: `GoogleDriveClient`/`GoogleDriveClientConfig`/`createGoogleDriveClient` (Task 2), `StorageDriver`/`StorageKeyError`/`StorageNotFoundError`/`StorageUnavailableError` (existing `storage-driver.ts`).
- Produces: `interface GoogleDriveFolderIds { rootFolderId, emrFolderId, photoFolderId: string | null }`, `interface GoogleDriveCredentials { clientId, clientSecret, accessToken, refreshToken }`, `function findOrCreateFolder(client, parentId, name): Promise<GoogleDriveFile>`, `function bootstrapTenantFolders(tenantId, client): Promise<GoogleDriveFolderIds>`, `class GoogleDriveDriver implements StorageDriver` — constructor `(tenantId: number, credentials: GoogleDriveCredentials, folderIds: GoogleDriveFolderIds, onFolderIdsResolved: (ids: GoogleDriveFolderIds) => Promise<void>, onAccessTokenRefreshed: (token: string) => Promise<void>, clientFactory = createGoogleDriveClient)`. Consumed by Task 4 (`getStorageDriver`'s `google_drive` branch) and Task 8 (`bootstrapTenantFolders`, called directly by the OAuth callback controller at first-connect time).

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/google-drive-driver.test.ts
import { GoogleDriveDriver, GoogleDriveFolderIds } from '../config/google-drive-driver'
import { FakeGoogleDriveClient } from './helpers/fakeGoogleDriveClient'
import { StorageNotFoundError, StorageUnavailableError, StorageKeyError } from '../config/storage-driver'
import { GoogleDriveClientConfig } from '../config/google-drive-client'

const credentials = { clientId: 'cid', clientSecret: 'csecret', accessToken: 'at', refreshToken: 'rt' }
const emptyFolderIds: GoogleDriveFolderIds = { rootFolderId: null, emrFolderId: null, photoFolderId: null }

function makeDriver(
  client: FakeGoogleDriveClient,
  folderIds: GoogleDriveFolderIds = emptyFolderIds,
  onFolderIdsResolved: jest.Mock = jest.fn().mockResolvedValue(undefined),
  onAccessTokenRefreshed: jest.Mock = jest.fn().mockResolvedValue(undefined),
) {
  const factory = (config: GoogleDriveClientConfig) => client.bindConfig(config)
  return new GoogleDriveDriver(1, credentials, folderIds, onFolderIdsResolved, onAccessTokenRefreshed, factory)
}

describe('GoogleDriveDriver', () => {
  test('save() then read() round-trips exact bytes, auto-creating the tenant folder tree on first use', async () => {
    const client = new FakeGoogleDriveClient()
    const onFolderIdsResolved = jest.fn().mockResolvedValue(undefined)
    const driver = makeDriver(client, emptyFolderIds, onFolderIdsResolved)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('img-bytes'), 'image/jpeg')
    const buf = await driver.read('tenants/1/photo/pet-1.jpg')
    expect(buf.toString()).toBe('img-bytes')
    expect(onFolderIdsResolved).toHaveBeenCalledWith(expect.objectContaining({ photoFolderId: expect.any(String) }))
  })

  test('save() on an existing key uses files.update on the SAME file id, not a duplicate files.create (grill finding N-1 — critical, pet-photo replace depends on this)', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v1'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('v1')
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v2-longer'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('v2-longer')
    expect(client.countFilesNamed('pet-1.jpg')).toBe(1)
  })

  test('emr keys resolve into a per-record subfolder under the tenant emr folder', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/emr/42/report.pdf', Buffer.from('x'), 'application/pdf')
    expect((await driver.read('tenants/1/emr/42/report.pdf')).toString()).toBe('x')
  })

  test('exists() is false before save and true after', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(false)
    await driver.save('tenants/1/photo/never.jpg', Buffer.from('x'), 'image/jpeg')
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(true)
  })

  test('read() on a missing key throws StorageNotFoundError, not a raw Drive error', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/1/photo/ghost.jpg')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('delete() is idempotent on an already-missing key', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.delete('tenants/1/photo/nothing.jpg')).resolves.toBeUndefined()
  })

  test('a key outside the tenants/{tenantId}/{emr|photo}/... shape throws StorageKeyError', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.save('not-a-valid-key.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a key for a different tenant throws StorageKeyError (defense in depth — callers always pass this tenant\'s own keys)', async () => {
    const client = new FakeGoogleDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/999/photo/pet-1.jpg')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a revoked/invalid token surfaces as StorageUnavailableError, not a raw Drive/auth error', async () => {
    const client = new FakeGoogleDriveClient({ failAuthInvalid: true })
    const driver = makeDriver(client)
    await expect(driver.save('tenants/1/photo/a.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  test('a cached folder id Drive no longer recognizes self-heals — re-creates the tree, updates the cache, and the write still succeeds (error handling section: "not fatal")', async () => {
    const client = new FakeGoogleDriveClient()
    const staleFolderIds: GoogleDriveFolderIds = { rootFolderId: 'stale-root', emrFolderId: null, photoFolderId: 'stale-and-deleted-photo-folder' }
    const onFolderIdsResolved = jest.fn().mockResolvedValue(undefined)
    const driver = makeDriver(client, staleFolderIds, onFolderIdsResolved)
    await expect(driver.save('tenants/1/photo/b.jpg', Buffer.from('y'), 'image/jpeg')).resolves.toBeUndefined()
    expect(onFolderIdsResolved).toHaveBeenCalledWith(expect.objectContaining({ photoFolderId: expect.any(String) }))
    expect((await driver.read('tenants/1/photo/b.jpg')).toString()).toBe('y')
  })

  test('a silently-refreshed access token fires onAccessTokenRefreshed with the new token', async () => {
    const client = new FakeGoogleDriveClient({ refreshAccessTokenOnFirstCall: 'new-access-token' })
    const onAccessTokenRefreshed = jest.fn().mockResolvedValue(undefined)
    const driver = makeDriver(client, emptyFolderIds, jest.fn().mockResolvedValue(undefined), onAccessTokenRefreshed)
    await driver.exists('tenants/1/photo/a.jpg')
    expect(onAccessTokenRefreshed).toHaveBeenCalledWith('new-access-token')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest google-drive-driver.test.ts`
Expected: FAIL — `Cannot find module '../config/google-drive-driver'`.

- [ ] **Step 3: Implement `google-drive-driver.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest google-drive-driver.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/google-drive-driver.ts src/backend/__tests__/google-drive-driver.test.ts
git commit -m "feat(storage): add GoogleDriveDriver — list-then-update save, tenant-scoped folders, self-heal (ADR-0023, grill N-1/N-2/N-8)"
```

---

## Task 4: `getStorageDriver(tenantId)` gains the `google_drive` branch

**Files:**
- Modify: `src/backend/config/storage-driver.ts`
- Modify: `src/backend/models/tenant-storage-config.repository.ts`
- Modify: `src/backend/services/storage-config.service.ts`
- Modify: `src/backend/__tests__/storage-driver.test.ts`
- Modify: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Changes: `ResolvedStorageConfig` (storage-config.service.ts) gains a third union member `{ provider: 'google_drive'; accessToken; refreshToken; rootFolderId; emrFolderId; photoFolderId }`. `StorageConfigWriteData` (repository) widens `provider` to `'local' | 'custom_path' | 'google_drive'` and gains the 5 optional `google*` fields. Repository gains `updateGoogleFolderIds(tenantId, ids: GoogleDriveFolderIds): Promise<void>` and a first-pass `writeBackRefreshedGoogleAccessToken(tenantId, token): Promise<void>` (hardened to the race-safe conditional update in Task 10 — this task wires the call, Task 10 proves the guarantee). Consumed by Task 8 (upsert with `provider: 'google_drive'`), Task 9 (disconnect nulling), Task 10 (the race-safety test), Task 11 (`getStorageConfigForDisplay`'s `connected` check).

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/storage-driver.test.ts`:

```ts
import { GoogleDriveDriver } from '../config/google-drive-driver'

describe('getStorageDriver(tenantId) — google_drive branch', () => {
  test('provider="google_drive" row → resolves a GoogleDriveDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({
      provider: 'google_drive', accessToken: 'at', refreshToken: 'rt',
      rootFolderId: 'root-1', emrFolderId: 'emr-1', photoFolderId: 'photo-1',
    })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(GoogleDriveDriver)
  })
})
```

(This file already has `jest.mock('../services/storage-config.service')` and the `storageConfigSvc` import from Task 7 of the reference plan — add to the existing mock block, do not duplicate the `jest.mock` call.)

Append to `src/backend/__tests__/storage-config.service.test.ts`, inside the existing `describe('resolveStorageConfig', ...)` block:

```ts
test('provider="google_drive" row → decrypts both tokens and passes through folder ids', async () => {
  const encryptedAccess = encryptField('access-token-value')
  const encryptedRefresh = encryptField('refresh-token-value')
  ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
    tenantId: 1, provider: 'google_drive',
    googleAccessTokenEncrypted: encryptedAccess, googleRefreshTokenEncrypted: encryptedRefresh,
    googleRootFolderId: 'root-1', googleEmrFolderId: 'emr-1', googlePhotoFolderId: 'photo-1',
  })
  const result = await resolveStorageConfig(1)
  expect(result).toEqual({
    provider: 'google_drive', accessToken: 'access-token-value', refreshToken: 'refresh-token-value',
    rootFolderId: 'root-1', emrFolderId: 'emr-1', photoFolderId: 'photo-1',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-driver.test.ts storage-config.service.test.ts`
Expected: FAIL — `resolveStorageConfig` doesn't return a `google_drive` shape yet; `getStorageDriver` has no such branch.

- [ ] **Step 3: Implement**

`src/backend/models/tenant-storage-config.repository.ts` — widen the write-data type and add the two new functions:

```ts
// src/backend/models/tenant-storage-config.repository.ts
// Prisma access for tenant_storage_config (1-to-1 with tenant, ADR-0023).
// PK is tenantId itself, so findUnique({ where: { tenantId } }) is
// inherently tenant-scoped — never a bare findFirst here.
import prisma from '../config/db'
import { encryptField } from '../utils/encryption'
import { GoogleDriveFolderIds } from '../config/google-drive-driver'

export interface StorageConfigWriteData {
  provider:                     'local' | 'custom_path' | 'google_drive'
  smbHost?:                     string | null
  smbShare?:                    string | null
  smbUsername?:                 string | null
  smbPasswordEncrypted?:        string | null
  googleAccessTokenEncrypted?:  string | null
  googleRefreshTokenEncrypted?: string | null
  googleRootFolderId?:          string | null
  googleEmrFolderId?:           string | null
  googlePhotoFolderId?:         string | null
}

/** Fetches the tenant's storage config row, or null if none exists (default local). */
export function getStorageConfig(tenantId: number) {
  return prisma.tenantStorageConfig.findUnique({ where: { tenantId } })
}

/** Creates or replaces the tenant's storage config row. */
export function upsertStorageConfig(tenantId: number, data: StorageConfigWriteData) {
  return prisma.tenantStorageConfig.upsert({
    where:  { tenantId },
    create: { tenantId, ...data },
    update: data,
  })
}

/** Persists freshly-resolved/self-healed Google Drive folder ids (google-drive-driver.ts's onFolderIdsResolved callback). */
export async function updateGoogleFolderIds(tenantId: number, ids: GoogleDriveFolderIds): Promise<void> {
  await prisma.tenantStorageConfig.update({
    where: { tenantId },
    data:  { googleRootFolderId: ids.rootFolderId, googleEmrFolderId: ids.emrFolderId, googlePhotoFolderId: ids.photoFolderId },
  })
}

/**
 * First-pass write-back for a silently-refreshed Google access token.
 * Task 10 hardens this to the grill-N-4 race-safe conditional update
 * (WHERE provider = 'google_drive' AND googleRefreshTokenEncrypted IS NOT
 * NULL) — this version exists so Task 4's getStorageDriver wiring compiles
 * and passes its own tests; Task 10 adds the specific race test this naive
 * version fails.
 */
export async function writeBackRefreshedGoogleAccessToken(tenantId: number, newAccessToken: string): Promise<void> {
  await prisma.tenantStorageConfig.update({
    where: { tenantId },
    data:  { googleAccessTokenEncrypted: encryptField(newAccessToken) },
  })
}
```

`src/backend/services/storage-config.service.ts` — widen `ResolvedStorageConfig` and `resolveStorageConfig`:

```ts
export type ResolvedStorageConfig =
  | { provider: 'local' }
  | { provider: 'custom_path'; host: string; share: string; username: string; password: string }
  | { provider: 'google_drive'; accessToken: string; refreshToken: string; rootFolderId: string | null; emrFolderId: string | null; photoFolderId: string | null }

export async function resolveStorageConfig(tenantId: number): Promise<ResolvedStorageConfig> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local' }

  if (row.provider === 'google_drive') {
    return {
      provider:      'google_drive',
      accessToken:   row.googleAccessTokenEncrypted ? decryptField(row.googleAccessTokenEncrypted) : '',
      refreshToken:  row.googleRefreshTokenEncrypted ? decryptField(row.googleRefreshTokenEncrypted) : '',
      rootFolderId:  row.googleRootFolderId,
      emrFolderId:   row.googleEmrFolderId,
      photoFolderId: row.googlePhotoFolderId,
    }
  }

  return {
    provider: 'custom_path',
    host:     row.smbHost ?? '',
    share:    row.smbShare ?? '',
    username: row.smbUsername ?? '',
    password: row.smbPasswordEncrypted ? decryptField(row.smbPasswordEncrypted) : '',
  }
}
```

`src/backend/config/storage-driver.ts` — add the branch to `getStorageDriver`:

```ts
import { GoogleDriveDriver } from './google-drive-driver'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'

export async function getStorageDriver(tenantId: number): Promise<StorageDriver> {
  const resolved = await resolveStorageConfig(tenantId)

  if (resolved.provider === 'google_drive') {
    // GOOGLE_OAUTH_CLIENT_ID/SECRET are checked lazily here, not at boot
    // (grill N-6) — a tenant that connected Drive while the env vars were
    // set still needs them present at read/write time to refresh tokens.
    return new GoogleDriveDriver(
      tenantId,
      {
        clientId:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        accessToken:  resolved.accessToken,
        refreshToken: resolved.refreshToken,
      },
      { rootFolderId: resolved.rootFolderId, emrFolderId: resolved.emrFolderId, photoFolderId: resolved.photoFolderId },
      (ids) => tenantStorageConfigRepo.updateGoogleFolderIds(tenantId, ids),
      (newAccessToken) => tenantStorageConfigRepo.writeBackRefreshedGoogleAccessToken(tenantId, newAccessToken),
    )
  }

  if (resolved.provider === 'custom_path') {
    return new SmbShareDriver({
      host: resolved.host, share: resolved.share, username: resolved.username, password: resolved.password,
    })
  }
  return new LocalDiskDriver()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-driver.test.ts storage-config.service.test.ts`
Expected: PASS — all prior tests plus the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/storage-driver.ts src/backend/models/tenant-storage-config.repository.ts src/backend/services/storage-config.service.ts src/backend/__tests__/storage-driver.test.ts src/backend/__tests__/storage-config.service.test.ts
git commit -m "feat(storage): getStorageDriver resolves GoogleDriveDriver for provider=google_drive (ADR-0023)"
```

---

## Task 5: HMAC `state`-signing helper (HKDF-derived key)

**Files:**
- Create: `src/backend/utils/oauth-state.ts`
- Create: `src/backend/__tests__/oauth-state.test.ts`

**Interfaces:**
- Produces: `interface OAuthState { tenantId: number; userId: number; origin: string; nonce: string; iat: number }`, `function signOAuthState(payload: Omit<OAuthState, 'iat'>): string`, `function verifyOAuthState(token: string): OAuthState | null` (returns `null` on any tamper/expiry/malformed-input — never throws, so the callback's "invalid state" branch is a single falsy check). Consumed by Task 7 (`/authorize` signs), Task 8 (`/callback` verifies).

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/oauth-state.test.ts
import { signOAuthState, verifyOAuthState } from '../utils/oauth-state'

const payload = { tenantId: 1, userId: 42, origin: 'http://localhost:5173', nonce: 'abc123' }

describe('signOAuthState / verifyOAuthState', () => {
  test('a freshly signed state verifies and round-trips the exact payload', () => {
    const token = signOAuthState(payload)
    const verified = verifyOAuthState(token)
    expect(verified).toMatchObject(payload)
    expect(typeof verified?.iat).toBe('number')
  })

  test('a tampered payload (any single byte changed) fails verification (grill N-5: HKDF-derived key, not the raw SETTINGS_ENCRYPTION_KEY)', () => {
    const token = signOAuthState(payload)
    const [body, sig] = token.split('.')
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, tenantId: 999, iat: Math.floor(Date.now() / 1000) }), 'utf8').toString('base64url')
    expect(verifyOAuthState(`${tamperedBody}.${sig}`)).toBeNull()
  })

  test('a tampered signature fails verification', () => {
    const token = signOAuthState(payload)
    const [body] = token.split('.')
    expect(verifyOAuthState(`${body}.not-a-real-signature`)).toBeNull()
  })

  test('an expired state (iat > 10 minutes old) fails verification', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-23T10:00:00Z'))
    const token = signOAuthState(payload)
    jest.setSystemTime(new Date('2026-07-23T10:10:01Z')) // 10 min 1 sec later
    expect(verifyOAuthState(token)).toBeNull()
    jest.useRealTimers()
  })

  test('a state exactly at the 10-minute boundary still verifies', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-23T10:00:00Z'))
    const token = signOAuthState(payload)
    jest.setSystemTime(new Date('2026-07-23T10:10:00Z')) // exactly 10 min later
    expect(verifyOAuthState(token)).not.toBeNull()
    jest.useRealTimers()
  })

  test('malformed input (no dot separator, garbage base64) returns null, never throws', () => {
    expect(verifyOAuthState('garbage-not-a-token')).toBeNull()
    expect(verifyOAuthState('')).toBeNull()
    expect(verifyOAuthState('a.b.c')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest oauth-state.test.ts`
Expected: FAIL — `Cannot find module '../utils/oauth-state'`.

- [ ] **Step 3: Implement**

```ts
// src/backend/utils/oauth-state.ts
// Signed, single-use-nonce `state` param for the Google Drive OAuth connect
// flow (ADR-0023, sub-project 2). Signed with an HKDF-derived key, NOT the
// raw SETTINGS_ENCRYPTION_KEY directly (grill N-5) — keeps OAuth-state
// signing cryptographically separate from the AES-256-GCM data-at-rest key;
// a bug in one path can't touch the other, and the two rotate independently.
import crypto from 'crypto'
import { config } from '../config/env'

export interface OAuthState {
  tenantId: number
  userId:   number
  origin:   string
  nonce:    string
  iat:      number // unix seconds
}

const STATE_TTL_SECONDS = 10 * 60
const HKDF_INFO = 'oauth-state-hmac-v1'

function deriveSigningKey(): Buffer {
  const masterKey = Buffer.from(config.settingsEncryptionKey, 'hex')
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(HKDF_INFO), 32))
}

export function signOAuthState(payload: Omit<OAuthState, 'iat'>): string {
  const state: OAuthState = { ...payload, iat: Math.floor(Date.now() / 1000) }
  const body = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', deriveSigningKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyOAuthState(token: string): OAuthState | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (!body || !sig) return null

  const expectedSig = crypto.createHmac('sha256', deriveSigningKey()).update(body).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

  let state: OAuthState
  try {
    state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof state.iat !== 'number') return null

  const ageSeconds = Math.floor(Date.now() / 1000) - state.iat
  if (ageSeconds < 0 || ageSeconds > STATE_TTL_SECONDS) return null

  return state
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest oauth-state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/utils/oauth-state.ts src/backend/__tests__/oauth-state.test.ts
git commit -m "feat(storage): signOAuthState/verifyOAuthState — HKDF-derived HMAC, 10-min TTL (ADR-0023, grill N-5)"
```

---

## Task 6: `OAuthConnectNonce` repository — atomic single-use consume

**Files:**
- Create: `src/backend/models/oauth-connect-nonce.repository.ts`
- Create: `src/backend/__tests__/oauth-connect-nonce.repository.test.ts`

**Interfaces:**
- Produces: `function hashNonce(rawNonce: string): string`, `function createNonce(input: { tenantId, userId, provider, expiresAt }): Promise<string>` (returns the raw nonce — only the hash is ever stored, mirrors `RefreshToken.tokenHash`), `function consumeNonce(rawNonce: string): Promise<boolean>` (`true` iff exactly one row was atomically consumed). Consumed by Task 7 (`createNonce` in `/authorize`), Task 8 (`consumeNonce` in `/callback`, grill N-3).

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/oauth-connect-nonce.repository.test.ts
// Real-DB test (Prisma against the test Postgres instance) — the
// grill-N-3 guarantee is a DB-level atomic UPDATE, not something a mocked
// Prisma client can prove.
import prisma from '../config/db'
import { createNonce, consumeNonce } from '../models/oauth-connect-nonce.repository'

const TENANT_ID = 900001
const USER_ID = 1

afterEach(async () => {
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('createNonce / consumeNonce', () => {
  test('a freshly created nonce consumes exactly once', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    expect(await consumeNonce(rawNonce)).toBe(true)
  })

  test('consuming the same nonce twice — the second call fails (grill N-3: replay rejected)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    expect(await consumeNonce(rawNonce)).toBe(true)
    expect(await consumeNonce(rawNonce)).toBe(false)
  })

  test('consuming a nonce that was never created fails', async () => {
    expect(await consumeNonce('never-existed-nonce')).toBe(false)
  })

  test('two concurrent consume attempts on the same nonce — exactly one succeeds (grill N-3: atomic single statement, not verify-then-mark)', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    const [first, second] = await Promise.all([consumeNonce(rawNonce), consumeNonce(rawNonce)])
    const successCount = [first, second].filter(Boolean).length
    expect(successCount).toBe(1)
  })

  test('the raw nonce is never stored in plaintext — only its hash', async () => {
    const rawNonce = await createNonce({ tenantId: TENANT_ID, userId: USER_ID, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
    const row = await prisma.oAuthConnectNonce.findFirst({ where: { tenantId: TENANT_ID } })
    expect(row?.nonceHash).not.toBe(rawNonce)
    expect(row?.nonceHash).toHaveLength(64) // sha256 hex
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest oauth-connect-nonce.repository.test.ts`
Expected: FAIL — `Cannot find module '../models/oauth-connect-nonce.repository'`.

- [ ] **Step 3: Implement**

```ts
// src/backend/models/oauth-connect-nonce.repository.ts
// Single-use nonce repository for the OAuth connect flow (ADR-0023,
// sub-project 2), mirroring RefreshToken's tokenHash + rotation pattern —
// only a hash is ever persisted, never the raw nonce.
import crypto from 'crypto'
import prisma from '../config/db'

export function hashNonce(rawNonce: string): string {
  return crypto.createHash('sha256').update(rawNonce).digest('hex')
}

export interface CreateNonceInput {
  tenantId:  number
  userId:    number
  provider:  string
  expiresAt: Date
}

export async function createNonce(input: CreateNonceInput): Promise<string> {
  const rawNonce = crypto.randomBytes(32).toString('base64url')
  await prisma.oAuthConnectNonce.create({
    data: {
      nonceHash: hashNonce(rawNonce),
      tenantId:  input.tenantId,
      userId:    input.userId,
      provider:  input.provider,
      expiresAt: input.expiresAt,
    },
  })
  return rawNonce
}

/**
 * Grill finding N-3: atomic single-statement consume — UPDATE ... WHERE
 * consumedAt IS NULL, checked by affected-row count, never a separate
 * verify-then-mark sequence (which would let two near-simultaneous
 * callbacks with the same state both pass a check before either marks
 * consumed). Returns true iff this call consumed the row.
 */
export async function consumeNonce(rawNonce: string): Promise<boolean> {
  const nonceHash = hashNonce(rawNonce)
  const result = await prisma.oAuthConnectNonce.updateMany({
    where: { nonceHash, consumedAt: null },
    data:  { consumedAt: new Date() },
  })
  return result.count === 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest oauth-connect-nonce.repository.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/oauth-connect-nonce.repository.ts src/backend/__tests__/oauth-connect-nonce.repository.test.ts
git commit -m "feat(storage): OAuthConnectNonce repository — atomic single-use consume (ADR-0023, grill N-3)"
```

---

*(Sub-PR A boundary, per this plan's own PR-split assessment above — Tasks 1–6 are a self-contained, fully-unit-tested driver+crypto core with no live-Google dependency and no user-facing surface. Full regression check before continuing: `cd src/backend && npx jest`.)*

---

## Task 7: `GET /clinic/storage-config/google/authorize`

**Files:**
- Modify: `src/backend/controllers/settings.controller.ts`
- Modify: `src/backend/routes/settings.routes.ts`
- Create: `src/backend/tests/integration/storage-config-google-authorize.test.ts`

**Interfaces:**
- Produces: `googleAuthorize(req, res, next)` — added to `settings.controller.ts` alongside the existing storage-config handlers. No zod schema (GET, no body).
- Consumes: `signOAuthState` (Task 5), `createNonce` (Task 6).

- [ ] **Step 1: Write the failing integration tests**

```ts
// src/backend/tests/integration/storage-config-google-authorize.test.ts
// Mirrors the beforeAll/afterAll seed pattern in
// tests/integration/storage-config.test.ts verbatim (tenant + clinic_admin +
// doctor users, seedUserRoles, login helper) — see that file for the exact
// boilerplate; only the endpoint under test and the SUB_A subdomain differ.
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'
import app from '../../app'

const SUB_A = 'storage-gdrive-auth-a'
const PASSWORD = 'TestPass1!'

let server: Server
let tidA = 0
let adminToken = ''
let doctorToken = ''

async function login(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tA = await prisma.tenant.create({ data: { name: 'Storage GDrive Auth A', subdomain: SUB_A } })
  tidA = tA.id
  const branchA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main A' } })
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const [adminRole, doctorRole] = await Promise.all([
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
    prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor',       tenantId: null } }),
  ])
  await prisma.user.createMany({
    data: [
      { tenantId: tidA, name: 'Admin A',  username: 'gda_admin_a',  email: 'admin@gda-a.test',  passwordHash, roleId: adminRole.id },
      { tenantId: tidA, name: 'Doctor A', username: 'gda_doctor_a', email: 'doctor@gda-a.test', passwordHash, roleId: doctorRole.id },
    ],
  })
  const [uAdminA, uDoctorA] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'gda_admin_a'  } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'gda_doctor_a' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdminA.id,  tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uDoctorA.id, tenantId: tidA, roleKey: 'doctor'       },
  ])
  await prisma.userBranch.createMany({ data: [{ tenantId: tidA, userId: uDoctorA.id, branchId: branchA.id }], skipDuplicates: true })
  adminToken  = await login(SUB_A, 'gda_admin_a')
  doctorToken = await login(SUB_A, 'gda_doctor_a')
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tidA])
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: tidA } })
  await prisma.userBranch.deleteMany({ where: { tenantId: tidA } })
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.branch.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

describe('GET /api/settings/clinic/storage-config/google/authorize', () => {
  const ORIGINAL_ENV = process.env

  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  test('GA-01: with OAuth env vars configured, returns a Google consent URL and records a nonce', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    const res = await request(server).get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${adminToken}`).expect(200)
    expect(res.body.data.url).toContain('accounts.google.com')
    expect(res.body.data.url).toContain('client_id=test-client-id')
    expect(res.body.data.url).toContain('prompt=consent')
    expect(res.body.data.url).toContain('access_type=offline')
    expect(res.body.data.url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file')
    const nonceRows = await prisma.oAuthConnectNonce.count({ where: { tenantId: tidA, provider: 'google' } })
    expect(nonceRows).toBe(1)
  })

  test('GA-02: missing GOOGLE_OAUTH_CLIENT_ID → 503 GOOGLE_OAUTH_NOT_CONFIGURED, nothing recorded (grill N-6)', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    const res = await request(server).get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${adminToken}`).expect(503)
    expect(res.body.code).toBe('GOOGLE_OAUTH_NOT_CONFIGURED')
  })

  test('GA-03: doctor without clinic.integrations.edit → 403', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
    await request(server).get('/api/settings/clinic/storage-config/google/authorize')
      .set('Authorization', `Bearer ${doctorToken}`).expect(403)
  })

  test('GA-04: no token → 401', async () => {
    await request(server).get('/api/settings/clinic/storage-config/google/authorize').expect(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config-google-authorize.test.ts --testPathPattern=integration`
Expected: FAIL — route doesn't exist (404 on all requests).

- [ ] **Step 3: Implement the controller + route**

Add to `src/backend/controllers/settings.controller.ts`:

```ts
import prisma from '../config/db'
import { signOAuthState } from '../utils/oauth-state'
import { createNonce } from '../models/oauth-connect-nonce.repository'

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

/**
 * BA finding G-2a: the redirect origin embedded in `state` is derived
 * SERVER-SIDE from the tenant's own record — never from a client
 * header/param/Referer, even though the value ends up signed. This
 * deployment does not yet route the frontend by per-tenant subdomain (grep
 * confirms no such helper exists), so FRONTEND_URL_PATTERN is an opt-in hook
 * for when it does; until then every tenant resolves to the single
 * configured frontend origin — still server-derived, never client-supplied.
 */
function deriveTenantFrontendOrigin(subdomain: string): string {
  const pattern = process.env.FRONTEND_URL_PATTERN // e.g. 'https://{subdomain}.anemal.app'
  if (pattern) return pattern.replace('{subdomain}', subdomain)
  return process.env.FRONTEND_URL || 'http://localhost:5173'
}

function googleOAuthRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/google/callback`
}

export async function googleAuthorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    // Grill N-6: checked lazily at request time, not at boot (would brick
    // every deployment not using Drive) — a clean 503 instead of letting
    // the admin land on Google's own confusing invalid_client error page.
    if (!clientId || !clientSecret) {
      res.status(503).json({ success: false, code: 'GOOGLE_OAUTH_NOT_CONFIGURED', error: 'Google Drive connection is not configured on this server' })
      return
    }

    const { tenantId, userId } = req.context!
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { subdomain: true } })
    if (!tenant) { res.status(404).json({ success: false, error: 'Tenant not found' }); return }

    const rawNonce = await createNonce({ tenantId, userId, provider: 'google', expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) })
    const origin = deriveTenantFrontendOrigin(tenant.subdomain)
    const state = signOAuthState({ tenantId, userId, origin, nonce: rawNonce })

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  googleOAuthRedirectUri(),
      response_type: 'code',
      access_type:   'offline',
      // prompt=consent guarantees a fresh refresh token on EVERY connect,
      // not just the first ever — access_type=offline alone does not
      // reliably re-issue one on a second consent after a prior disconnect.
      prompt: 'consent',
      scope:  GOOGLE_DRIVE_SCOPE,
      state,
    })
    res.json({ success: true, data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` } })
  } catch (err) { next(err) }
}
```

Add to `src/backend/routes/settings.routes.ts`, directly after the existing `/clinic/storage-config` block:

```ts
router.get('/clinic/storage-config/google/authorize', requirePlane('clinic'), requirePermission('clinic.integrations.edit'), ctrl.googleAuthorize)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-config-google-authorize.test.ts --testPathPattern=integration`
Expected: PASS (4 tests, GA-01..GA-04).

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/settings.controller.ts src/backend/routes/settings.routes.ts src/backend/tests/integration/storage-config-google-authorize.test.ts
git commit -m "feat(storage): GET /clinic/storage-config/google/authorize (ADR-0023, BA G-2a, grill N-6)"
```

---

## Task 8: `GET /oauth/google/callback` — top-level public route

**Files:**
- Create: `src/backend/controllers/oauth-google.controller.ts`
- Create: `src/backend/routes/oauth-google.routes.ts`
- Modify: `src/backend/app.ts`
- Create: `src/backend/tests/integration/oauth-google-callback.test.ts`

**Interfaces:**
- Produces: `handleGoogleOAuthCallback(req, res)` (no `next` — every failure path is a redirect, never a thrown error that reaches the global handler; matches "OAuth callback failures ... redirect ... nothing persisted" from the design's Error Handling section).
- Consumes: `verifyOAuthState` (Task 5), `consumeNonce` (Task 6), `exchangeCodeForTokens`/`revokeGoogleToken` (Task 2), `bootstrapTenantFolders` (Task 3), `resolvePermissions` (existing `permission.service.ts`), `tenant-storage-config.repository.ts` (Task 4), `settings-audit.repository.ts` (existing).
- **Why a brand-new top-level router, not a sub-router on `settings.routes.ts`** (cite in code comment, not just this plan): `settings.routes.ts` applies `router.use(authMiddleware)` at the top of the file — that middleware runs for **every** request matching the router's mount prefix (`/api/settings`) regardless of whether a specific route inside it exists or requires auth, because Express walks middleware in registration order within a router, not per-route. A same-prefix public sub-router mounted *after* that line would still 401 Google's unauthenticated redirect; mounting it *before* would work today but creates a silent-regression risk the next time `app.ts` or `settings.routes.ts` is reordered (grill finding, superseding BA's original "dedicated public sub-router at the same path" fix). A completely different top-level path (`/oauth/google/callback`, its own router, its own `app.use('/oauth', ...)` line in `app.ts`) removes the dependency entirely rather than managing it.

- [ ] **Step 1: Write the failing integration tests**

```ts
// src/backend/tests/integration/oauth-google-callback.test.ts
import request from 'supertest'
import { Server } from 'http'
import prisma from '../../config/db'
import { signOAuthState } from '../../utils/oauth-state'
import { createNonce } from '../../models/oauth-connect-nonce.repository'

jest.mock('../../config/google-drive-client', () => {
  const actual = jest.requireActual('../../config/google-drive-client')
  return {
    ...actual,
    exchangeCodeForTokens: jest.fn().mockResolvedValue({ accessToken: 'fake-access', refreshToken: 'fake-refresh' }),
    revokeGoogleToken: jest.fn().mockResolvedValue(undefined),
    createGoogleDriveClient: jest.fn(() => ({
      findByName: jest.fn().mockResolvedValue(null),
      createFolder: jest.fn().mockImplementation(async (_parentId: string, name: string) => ({ id: `folder-${name}`, name })),
      createFile: jest.fn(), updateFile: jest.fn(), readFile: jest.fn(), deleteFile: jest.fn(),
      folderExists: jest.fn().mockResolvedValue(true), ping: jest.fn().mockResolvedValue(undefined),
    })),
  }
})

import app from '../../app'
import { exchangeCodeForTokens } from '../../config/google-drive-client'

const SUB_A = 'oauth-gdrive-cb-a'
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
process.env.FRONTEND_URL = 'http://localhost:5173'

let server: Server
let tidA = 0
let adminUserId = 0

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  const tA = await prisma.tenant.create({ data: { name: 'OAuth GDrive CB A', subdomain: SUB_A } })
  tidA = tA.id
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  const admin = await prisma.user.create({
    data: { tenantId: tidA, name: 'Admin A', username: 'cb_admin_a', email: 'admin@cb-a.test', passwordHash: 'x', roleId: adminRole.id },
  })
  adminUserId = admin.id
  await prisma.userRole.create({ data: { userId: adminUserId, tenantId: tidA, roleId: adminRole.id } })
})

afterAll(async () => {
  await prisma.userRole.deleteMany({ where: { tenantId: tidA } })
  await prisma.oAuthConnectNonce.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenantStorageConfig.deleteMany({ where: { tenantId: tidA } })
  await prisma.settingsAuditLog.deleteMany({ where: { tenantId: tidA } })
  await prisma.user.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: tidA } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
}, 30000)

async function freshState(): Promise<{ state: string; nonce: string }> {
  const nonce = await createNonce({ tenantId: tidA, userId: adminUserId, provider: 'google', expiresAt: new Date(Date.now() + 60_000) })
  const state = signOAuthState({ tenantId: tidA, userId: adminUserId, origin: 'http://localhost:5173', nonce })
  return { state, nonce }
}

describe('GET /oauth/google/callback', () => {
  test('OC-01: no Authorization header required — the route is public (deny-by-default exception, trust boundary is signed state)', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302) // redirect, never 401
  })

  test('OC-02: valid code + state → tokens persisted encrypted, tenant-scoped folders created, audit row written, redirects to the interstitial page', async () => {
    const { state } = await freshState()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage/connecting')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(row?.provider).toBe('google_drive')
    expect(row?.googleAccessTokenEncrypted).toMatch(/^enc:v1:/)
    expect(row?.googleRefreshTokenEncrypted).toMatch(/^enc:v1:/)
    expect(row?.googleEmrFolderId).toBeTruthy()
    expect(row?.googlePhotoFolderId).toBeTruthy()
    const audit = await prisma.settingsAuditLog.findFirst({ where: { tenantId: tidA, tableName: 'tenant_storage_config', newValue: 'google_drive' } })
    expect(audit).not.toBeNull()
  })

  test('OC-03: replayed/already-consumed state → rejected, redirects with an error param, nothing new persisted (grill N-3)', async () => {
    const { state } = await freshState()
    await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state }) // consumes it
    const before = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=google_state_replayed')
    const after = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: tidA } })
    expect(after?.updatedAt).toEqual(before?.updatedAt) // no new write happened on the replay
  })

  test('OC-04: tampered/invalid state signature → rejected, redirects to the FIXED default origin, never a value read out of state (grill N-7)', async () => {
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state: 'not-a-real-state' })
    expect(res.headers.location).toBe('http://localhost:5173/settings/storage?error=google_state_invalid')
  })

  test('OC-05: expired state → rejected the same way as an invalid signature', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { state } = await freshState()
    jest.setSystemTime(new Date('2026-01-01T00:20:00Z'))
    jest.useRealTimers()
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=google_state_invalid')
  })

  test('OC-06: consent-denied (Google redirects with ?error=access_denied, no code) → rejected, nothing persisted', async () => {
    const res = await request(server).get('/oauth/google/callback').query({ error: 'access_denied' })
    expect(res.headers.location).toContain('error=google_consent_denied')
  })

  test('OC-07: inactive user at callback time → rejected, nothing persisted (grill N-9)', async () => {
    const { state } = await freshState()
    await prisma.user.update({ where: { id: adminUserId }, data: { isActive: false } })
    try {
      const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
      expect(res.headers.location).toContain('error=google_not_authorized')
    } finally {
      await prisma.user.update({ where: { id: adminUserId }, data: { isActive: true } })
    }
  })

  test('OC-08: missing GOOGLE_OAUTH_CLIENT_ID/SECRET at callback time → rejected cleanly, nothing persisted', async () => {
    const { state } = await freshState()
    const savedId = process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    try {
      const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
      expect(res.headers.location).toContain('error=google_not_configured')
    } finally {
      process.env.GOOGLE_OAUTH_CLIENT_ID = savedId
    }
  })

  test('OC-09: code-exchange failure → rejected, nothing persisted', async () => {
    const { state } = await freshState()
    ;(exchangeCodeForTokens as jest.Mock).mockRejectedValueOnce(new Error('invalid_grant'))
    const res = await request(server).get('/oauth/google/callback').query({ code: 'fake-code', state })
    expect(res.headers.location).toContain('error=google_connect_failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest oauth-google-callback.test.ts --testPathPattern=integration`
Expected: FAIL — `/oauth/google/callback` 404s (route not mounted yet).

- [ ] **Step 3: Implement the controller, route, and `app.ts` mount**

```ts
// src/backend/controllers/oauth-google.controller.ts
// Public callback for the Google Drive OAuth connect flow (ADR-0023,
// sub-project 2). No JWT/permission middleware — the signed, single-use
// `state` param IS the trust boundary. Every failure path redirects; this
// route never throws to the global error handler.
import { Request, Response } from 'express'
import prisma from '../config/db'
import { verifyOAuthState } from '../utils/oauth-state'
import { consumeNonce } from '../models/oauth-connect-nonce.repository'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { resolvePermissions } from '../services/permission.service'
import { encryptField, decryptField } from '../utils/encryption'
import { exchangeCodeForTokens, revokeGoogleToken, createGoogleDriveClient } from '../config/google-drive-client'
import { bootstrapTenantFolders } from '../config/google-drive-driver'
import { logger } from '../utils/logger'

const DEFAULT_ERROR_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173'

function googleOAuthRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/google/callback`
}

export async function handleGoogleOAuthCallback(req: Request, res: Response): Promise<void> {
  const query = req.query as { code?: string; state?: string; error?: string }

  // Consent-denied is the only branch reachable before state verification —
  // Google omits `code` and `state` alike on a denial, so there is nothing
  // signed to check yet, and nothing has been read or persisted either way.
  if (query.error) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=google_consent_denied`)
    return
  }
  if (!query.state) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=google_state_invalid`)
    return
  }

  // Grill N-7: on an invalid/expired signature the embedded origin cannot be
  // trusted either (same reasoning as BA G-2a) — this branch NEVER reads out
  // of `state`, always the fixed server-configured default.
  const verified = verifyOAuthState(query.state)
  if (!verified) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=google_state_invalid`)
    return
  }

  // Grill N-3: atomic single-statement consume, BEFORE the code exchange.
  const nonceOk = await consumeNonce(verified.nonce)
  if (!nonceOk) {
    res.redirect(`${verified.origin}/settings/storage?error=google_state_replayed`)
    return
  }

  if (!query.code) {
    res.redirect(`${verified.origin}/settings/storage?error=google_consent_denied`)
    return
  }

  // Grill N-9: re-verify the initiating user/tenant are still active and the
  // permission still held, immediately before persisting — the callback
  // never passes through authMiddleware's normal checks (it has no JWT).
  const [user, tenant] = await Promise.all([
    prisma.user.findFirst({ where: { id: verified.userId, tenantId: verified.tenantId }, select: { isActive: true } }),
    prisma.tenant.findUnique({ where: { id: verified.tenantId }, select: { isActive: true } }),
  ])
  const perms = user?.isActive !== false && tenant?.isActive !== false
    ? await resolvePermissions(verified.userId, verified.tenantId)
    : new Set<string>()
  const stillEntitled = !!user && user.isActive !== false && !!tenant && tenant.isActive !== false && perms.has('clinic.integrations.edit')
  if (!stillEntitled) {
    res.redirect(`${verified.origin}/settings/storage?error=google_not_authorized`)
    return
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.redirect(`${verified.origin}/settings/storage?error=google_not_configured`)
    return
  }

  try {
    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, redirectUri: googleOAuthRedirectUri(), code: query.code })

    // Grill N-10: best-effort revoke of a PREVIOUS token before overwrite —
    // reconnecting without disconnecting first would otherwise leave a
    // stale-but-still-valid grant alive at Google indefinitely.
    const previous = await tenantStorageConfigRepo.getStorageConfig(verified.tenantId)
    if (previous?.googleRefreshTokenEncrypted) {
      await revokeGoogleToken(decryptField(previous.googleRefreshTokenEncrypted)).catch((revokeErr) => {
        logger.warn({ tenantId: verified.tenantId, revokeErr: String(revokeErr) }, 'Google Drive reconnect: best-effort revoke of previous token failed')
      })
    }

    const client = createGoogleDriveClient({ clientId, clientSecret, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
    const folders = await bootstrapTenantFolders(verified.tenantId, client)

    await tenantStorageConfigRepo.upsertStorageConfig(verified.tenantId, {
      provider: 'google_drive',
      googleAccessTokenEncrypted:  encryptField(tokens.accessToken),
      googleRefreshTokenEncrypted: encryptField(tokens.refreshToken),
      googleRootFolderId:  folders.rootFolderId,
      googleEmrFolderId:   folders.emrFolderId,
      googlePhotoFolderId: folders.photoFolderId,
    })

    await auditRepo.createMany([{
      tenantId: verified.tenantId, changedBy: verified.userId, tableName: 'tenant_storage_config',
      fieldName: 'provider', oldValue: previous?.provider ?? 'local', newValue: 'google_drive',
    }])

    res.redirect(`${verified.origin}/settings/storage/connecting`)
  } catch (err) {
    logger.warn({ tenantId: verified.tenantId, err: String(err) }, 'Google Drive OAuth callback failed')
    res.redirect(`${verified.origin}/settings/storage?error=google_connect_failed`)
  }
}
```

```ts
// src/backend/routes/oauth-google.routes.ts
// Top-level, provider-generic public router (ADR-0023 §14) — deliberately
// NOT nested under /api/settings. settings.routes.ts applies
// router.use(authMiddleware) at its top, which 401s every request matching
// its mount prefix regardless of route existence; a same-prefix public
// sub-router only avoids that if registered before that line, an ordering
// dependency this route removes entirely by living at a different prefix.
import { Router } from 'express'
import { handleGoogleOAuthCallback } from '../controllers/oauth-google.controller'

const router = Router()
router.get('/google/callback', handleGoogleOAuthCallback)

export default router
```

`src/backend/app.ts` — add the import and mount it (placement is not order-dependent by construction, but grouped near the other top-level route mounts for readability):

```ts
import oauthGoogleRoutes from './routes/oauth-google.routes'
```

```ts
app.use('/oauth',               oauthGoogleRoutes)
```

(Add both lines; the `app.use` line can go anywhere among the existing `app.use('/...', ...)` block — e.g. directly after `app.use('/api/settings', settingsRoutes)` — since `/oauth` shares no prefix with any existing mount.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest oauth-google-callback.test.ts --testPathPattern=integration`
Expected: PASS (9 tests, OC-01..OC-09).

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/oauth-google.controller.ts src/backend/routes/oauth-google.routes.ts src/backend/app.ts src/backend/tests/integration/oauth-google-callback.test.ts
git commit -m "feat(storage): GET /oauth/google/callback — top-level public route, signed-state trust boundary (ADR-0023 §14, grill N-3/N-7/N-9/N-10)"
```

---

## Task 9: `updateStorageConfig` — disconnect revokes at Google and nulls stored tokens

**Files:**
- Modify: `src/backend/services/storage-config.service.ts`
- Modify: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Changes: `updateStorageConfig`'s `'local'`/`'custom_path'` persist branches now also null the 5 `google*` columns whenever the *current* row's provider is `'google_drive'`, and best-effort-revoke the stored refresh token at Google first (BA G-4b). `effectiveBaseKey` gains a `'google_drive'` case so switching away from it is always treated as a base change requiring `confirmBaseChange`.

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/storage-config.service.test.ts`:

```ts
jest.mock('../config/google-drive-client')
import { revokeGoogleToken } from '../config/google-drive-client'

describe('updateStorageConfig — disconnecting from google_drive (BA G-4b)', () => {
  beforeEach(() => jest.clearAllMocks())

  test('switching google_drive → local revokes the stored refresh token at Google and nulls all google* columns in the same write', async () => {
    const encryptedRefresh = encryptField('stored-refresh-token')
    ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptedRefresh,
      googleRootFolderId: 'r1', googleEmrFolderId: 'e1', googlePhotoFolderId: 'p1',
    })
    ;(revokeGoogleToken as jest.Mock).mockResolvedValue(undefined)
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })

    await updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })

    expect(revokeGoogleToken).toHaveBeenCalledWith('stored-refresh-token')
    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      provider: 'local',
      googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null,
    }))
  })

  test('a failed Google revoke is logged, never blocks the switch (best-effort, matches the existing SMB-failure pattern)', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(revokeGoogleToken as jest.Mock).mockRejectedValue(new Error('Google revoke endpoint down'))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })

    await expect(updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })).resolves.toBeUndefined()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })

  test('switching google_drive → custom_path (not just → local) also nulls the google* columns', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(revokeGoogleToken as jest.Mock).mockResolvedValue(undefined)
    ;(SmbShareDriver as jest.Mock).mockImplementation(() => ({ save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) }))
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'custom_path' })

    await updateStorageConfig(1, 42, { provider: 'custom_path', smbHost: 'h', smbShare: 's', smbUsername: 'u', smbPassword: 'p', confirmBaseChange: true })

    expect(repo.upsertStorageConfig).toHaveBeenCalledWith(1, expect.objectContaining({
      googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null,
    }))
  })

  test('a currently google_drive row is always treated as a base change — switching away without confirmBaseChange throws', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: null })
    await expect(updateStorageConfig(1, 42, { provider: 'local' })).rejects.toBeInstanceOf(StorageConfigSwitchConfirmationRequiredError)
    expect(repo.upsertStorageConfig).not.toHaveBeenCalled()
  })

  test('no stored refresh token (edge case: connected then row was already partially cleared) — revoke is skipped, switch still succeeds', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'google_drive', googleRefreshTokenEncrypted: null })
    ;(repo.upsertStorageConfig as jest.Mock).mockResolvedValue({ tenantId: 1, provider: 'local' })
    await updateStorageConfig(1, 42, { provider: 'local', confirmBaseChange: true })
    expect(revokeGoogleToken).not.toHaveBeenCalled()
    expect(repo.upsertStorageConfig).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: FAIL — the current `'local'`/`'custom_path'` persist branches don't null the `google*` columns or call `revokeGoogleToken`; `effectiveBaseKey` has no `google_drive` case.

- [ ] **Step 3: Implement**

In `src/backend/services/storage-config.service.ts`, add the import and update `effectiveBaseKey` + `updateStorageConfig`:

```ts
import { revokeGoogleToken } from '../config/google-drive-client'
```

```ts
// The "effective base" a tenant's files resolve against. A google_drive
// row is always its own base — switching away from it (to local OR to a
// different custom_path) is always a base change requiring confirmation.
function effectiveBaseKey(row: { provider: string; smbHost?: string | null; smbShare?: string | null } | null): string {
  if (!row || row.provider === 'local') return 'local'
  if (row.provider === 'google_drive') return 'google_drive'
  return `custom_path:${row.smbHost}:${row.smbShare}`
}
```

Replace the body of `updateStorageConfig` (keep the existing confirmation-check block, `custom_path` connect-test-write block, and audit-write block unchanged; only the two provider-persist branches change):

```ts
export async function updateStorageConfig(
  tenantId: number,
  userId: number,
  input: UpdateStorageConfigInput,
): Promise<void> {
  const current = await repo.getStorageConfig(tenantId)
  const currentBase = effectiveBaseKey(current)
  const nextBase = effectiveBaseKey(
    input.provider === 'custom_path'
      ? { provider: 'custom_path', smbHost: input.smbHost, smbShare: input.smbShare }
      : { provider: 'local' },
  )

  if (currentBase !== nextBase && !input.confirmBaseChange) {
    throw new StorageConfigSwitchConfirmationRequiredError()
  }

  // BA G-4b: switching AWAY from google_drive (to local or to a different
  // custom_path) revokes the stored refresh token at Google (best-effort,
  // logged on failure, never blocks the switch — matches the existing
  // SMB-failure posture) and nulls the token+folder-ID columns in the SAME
  // write as the new provider, so a stale encrypted refresh token never
  // survives a confirmed disconnect.
  const disconnectingFromGoogle = current?.provider === 'google_drive' && input.provider !== undefined
  if (disconnectingFromGoogle && current?.googleRefreshTokenEncrypted) {
    await revokeGoogleToken(decryptField(current.googleRefreshTokenEncrypted)).catch((revokeErr) => {
      logger.warn({ tenantId, revokeErr: String(revokeErr) }, 'Google Drive disconnect: best-effort token revoke failed')
    })
  }
  const googleColumnResets = disconnectingFromGoogle
    ? { googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null, googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null }
    : {}

  if (input.provider === 'custom_path') {
    // Connect-and-test-write BEFORE persisting anything (decision 5) — calls
    // createSmbClient directly (not via SmbShareDriver) specifically so a
    // connect-time failure surfaces as its distinct SmbHostUnreachableError /
    // SmbShareNotFoundError / SmbAuthRejectedError rather than the generic
    // StorageUnavailableError SmbShareDriver normalizes to for its normal
    // read/write/delete/exists callers.
    const client = createSmbClient({
      host: input.smbHost ?? '', share: input.smbShare ?? '',
      username: input.smbUsername ?? '', password: input.smbPassword ?? '',
    })
    const testKey = `tenants/${tenantId}/.storage-config-test`
    await client.connect()
    try {
      await client.writeFile(testKey, Buffer.from('test-write'))
      await client.unlink(testKey).catch((deleteErr: unknown) => {
        logger.warn({ tenantId, testKey, deleteErr: String(deleteErr) }, 'storage-config test-write marker cleanup failed — harmless orphan, ignored')
      })
    } finally {
      await client.disconnect().catch(() => undefined)
    }

    await repo.upsertStorageConfig(tenantId, {
      provider: 'custom_path',
      smbHost: input.smbHost, smbShare: input.smbShare, smbUsername: input.smbUsername,
      smbPasswordEncrypted: input.smbPassword ? encryptField(input.smbPassword) : current?.smbPasswordEncrypted,
      ...googleColumnResets,
    })
  } else {
    await repo.upsertStorageConfig(tenantId, {
      provider: 'local', smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null,
      ...googleColumnResets,
    })
  }

  await auditRepo.createMany([{
    tenantId, changedBy: userId, tableName: 'tenant_storage_config',
    fieldName: 'provider', oldValue: current?.provider ?? 'local', newValue: input.provider,
  }])
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: PASS — all prior tests plus 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/storage-config.service.ts src/backend/__tests__/storage-config.service.test.ts
git commit -m "feat(storage): disconnect from google_drive revokes at Google and nulls stored tokens/folders (ADR-0023, BA G-4b)"
```

---

## Task 10: Token write-back on silent refresh — race-safe conditional update

**Files:**
- Modify: `src/backend/models/tenant-storage-config.repository.ts`
- Create: `src/backend/__tests__/tenant-storage-config.repository.test.ts`

**Interfaces:**
- Changes: `writeBackRefreshedGoogleAccessToken(tenantId, newAccessToken)` (Task 4's naive version) becomes a conditional `updateMany` — `WHERE tenantId = ? AND provider = 'google_drive' AND googleRefreshTokenEncrypted IS NOT NULL` — silently dropped (never retried, never errored) if it doesn't match. No signature change, no caller change (Task 4's wiring in `getStorageDriver` already calls this function; only its internal query changes).

- [ ] **Step 1: Write the failing test**

```ts
// src/backend/__tests__/tenant-storage-config.repository.test.ts
// Real-DB test — the grill-N-4 race-safety guarantee is a DB-level
// conditional UPDATE, not something a mocked Prisma client can prove.
import prisma from '../config/db'
import { decryptField } from '../utils/encryption'
import { upsertStorageConfig, writeBackRefreshedGoogleAccessToken } from '../models/tenant-storage-config.repository'

const TENANT_ID = 900002

let tenantCreated = false

beforeEach(async () => {
  if (!tenantCreated) {
    await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      create: { id: TENANT_ID, name: 'Repo Token Writeback Test', subdomain: 'repo-token-writeback' },
      update: {},
    })
    tenantCreated = true
  }
})

afterEach(async () => {
  await prisma.tenantStorageConfig.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
  await prisma.$disconnect()
})

describe('writeBackRefreshedGoogleAccessToken', () => {
  test('provider=google_drive with a stored refresh token → the new access token is encrypted and persisted', async () => {
    await upsertStorageConfig(TENANT_ID, {
      provider: 'google_drive', googleAccessTokenEncrypted: 'old', googleRefreshTokenEncrypted: 'enc:v1:aaaa:bbbb:cccc',
    })
    await writeBackRefreshedGoogleAccessToken(TENANT_ID, 'brand-new-access-token')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: TENANT_ID } })
    expect(row?.googleAccessTokenEncrypted).toMatch(/^enc:v1:/)
    expect(decryptField(row!.googleAccessTokenEncrypted!)).toBe('brand-new-access-token')
  })

  test('grill N-4: a refresh that completes AFTER a disconnect does not resurrect an encrypted token on the now-local row', async () => {
    await upsertStorageConfig(TENANT_ID, { provider: 'google_drive', googleRefreshTokenEncrypted: 'enc:v1:aaaa:bbbb:cccc' })
    // Simulate the disconnect race: the row switches to local (nulling
    // google columns) BEFORE the in-flight refresh's write-back arrives.
    await upsertStorageConfig(TENANT_ID, {
      provider: 'local', googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null,
    })
    await writeBackRefreshedGoogleAccessToken(TENANT_ID, 'stale-refreshed-token')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: TENANT_ID } })
    expect(row?.provider).toBe('local')
    expect(row?.googleAccessTokenEncrypted).toBeNull() // NOT resurrected
  })

  test('a row with provider=google_drive but a null refresh token (mid-disconnect edge case) is also left untouched', async () => {
    await upsertStorageConfig(TENANT_ID, { provider: 'google_drive', googleAccessTokenEncrypted: 'old', googleRefreshTokenEncrypted: null })
    await writeBackRefreshedGoogleAccessToken(TENANT_ID, 'should-not-land')
    const row = await prisma.tenantStorageConfig.findUnique({ where: { tenantId: TENANT_ID } })
    expect(row?.googleAccessTokenEncrypted).toBe('old') // untouched, not overwritten
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest tenant-storage-config.repository.test.ts`
Expected: FAIL on the N-4 race test and the null-refresh-token test — Task 4's naive `update()` blindly writes regardless of the row's current `provider`/`googleRefreshTokenEncrypted` state.

- [ ] **Step 3: Implement**

Replace `writeBackRefreshedGoogleAccessToken` in `src/backend/models/tenant-storage-config.repository.ts`:

```ts
/**
 * Conditional update, guarded against the disconnect race (grill N-4): an
 * in-flight operation's silent token refresh can complete AFTER the admin
 * has disconnected (row nulled by updateStorageConfig's BA-G-4b write) —
 * this WHERE clause makes that write-back a no-op instead of resurrecting
 * an encrypted token onto a row whose provider is no longer google_drive.
 * Never retried, never errored — this is a system token refresh, not an
 * admin action, and is explicitly EXEMPT from settings_audit_log (BA G-4a).
 */
export async function writeBackRefreshedGoogleAccessToken(tenantId: number, newAccessToken: string): Promise<void> {
  await prisma.tenantStorageConfig.updateMany({
    where: { tenantId, provider: 'google_drive', googleRefreshTokenEncrypted: { not: null } },
    data:  { googleAccessTokenEncrypted: encryptField(newAccessToken) },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest tenant-storage-config.repository.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/tenant-storage-config.repository.ts src/backend/__tests__/tenant-storage-config.repository.test.ts
git commit -m "fix(storage): token write-back is a race-safe conditional update, audit-exempt (ADR-0023, grill N-4, BA G-4a)"
```

---

## Task 11: `GET /clinic/storage-config` gains a live `connected` field for `google_drive`

**Files:**
- Modify: `src/backend/services/storage-config.service.ts`
- Modify: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Changes: `StorageConfigDisplay` gains `connected?: boolean` (present only when `provider === 'google_drive'`). `getStorageConfigForDisplay` performs a live, cheap `ping()` Drive call for `google_drive` tenants — `GoogleDriveAuthInvalidError` → `connected: false`; any other failure (network blip) → `connected: true`, logged, not surfaced (design: "a transient check failure must not falsely tell the admin to reconnect").

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/storage-config.service.test.ts`:

```ts
jest.mock('../config/google-drive-client')
import { createGoogleDriveClient, GoogleDriveAuthInvalidError } from '../config/google-drive-client'

describe('getStorageConfigForDisplay — google_drive live status check (design §"Status check")', () => {
  beforeEach(() => jest.clearAllMocks())

  test('a valid connection → connected: true', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(createGoogleDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockResolvedValue(undefined) })
    const result = await getStorageConfigForDisplay(1)
    expect(result).toEqual({ provider: 'google_drive', configured: true, connected: true })
  })

  test('a revoked/invalid token → connected: false', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(createGoogleDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new GoogleDriveAuthInvalidError()) })
    const result = await getStorageConfigForDisplay(1)
    expect(result.connected).toBe(false)
  })

  test('a transient failure (network blip) does NOT flip connected to false — "a blip must not read as data loss"', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue({
      tenantId: 1, provider: 'google_drive',
      googleAccessTokenEncrypted: encryptField('at'), googleRefreshTokenEncrypted: encryptField('rt'),
    })
    ;(createGoogleDriveClient as jest.Mock).mockReturnValue({ ping: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) })
    const result = await getStorageConfigForDisplay(1)
    expect(result.connected).toBe(true)
  })

  test('local/custom_path responses never include a connected field', async () => {
    (repo.getStorageConfig as jest.Mock).mockResolvedValue(null)
    const result = await getStorageConfigForDisplay(1)
    expect(result).not.toHaveProperty('connected')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: FAIL — `getStorageConfigForDisplay` doesn't branch on `google_drive` yet.

- [ ] **Step 3: Implement**

In `src/backend/services/storage-config.service.ts`, add the import and extend `StorageConfigDisplay`/`getStorageConfigForDisplay`:

```ts
import { createGoogleDriveClient, GoogleDriveAuthInvalidError } from '../config/google-drive-client'
```

```ts
export interface StorageConfigDisplay {
  provider:     string
  configured:   boolean
  connected?:   boolean
  smbHost?:     string
  smbShare?:    string
  smbUsername?: string
}

async function checkGoogleDriveConnected(row: { googleAccessTokenEncrypted: string | null; googleRefreshTokenEncrypted: string | null }): Promise<boolean> {
  if (!row.googleAccessTokenEncrypted || !row.googleRefreshTokenEncrypted) return false
  const client = createGoogleDriveClient({
    clientId:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    accessToken:  decryptField(row.googleAccessTokenEncrypted),
    refreshToken: decryptField(row.googleRefreshTokenEncrypted),
  })
  try {
    await client.ping()
    return true
  } catch (err) {
    if (err instanceof GoogleDriveAuthInvalidError) return false
    // Transient failure — "don't read a blip as data loss" (design's status-
    // check principle, applied here) — the check is simply skipped/logged,
    // never falsely tells the admin to reconnect over a network hiccup.
    logger.warn({ err: String(err) }, 'Google Drive live status check failed transiently — connected stays true')
    return true
  }
}

/** Never includes the password/tokens — a "configured" boolean stands in for them. */
export async function getStorageConfigForDisplay(tenantId: number): Promise<StorageConfigDisplay> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local', configured: false }
  if (row.provider === 'google_drive') {
    const connected = await checkGoogleDriveConnected(row)
    return { provider: 'google_drive', configured: true, connected }
  }
  return {
    provider:    row.provider,
    configured:  true,
    smbHost:     row.smbHost ?? undefined,
    smbShare:    row.smbShare ?? undefined,
    smbUsername: row.smbUsername ?? undefined,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-config.service.test.ts`
Expected: PASS — all prior tests plus 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/storage-config.service.ts src/backend/__tests__/storage-config.service.test.ts
git commit -m "feat(storage): GET /clinic/storage-config live connected status for google_drive (ADR-0023, design status-check)"
```

---

## Task 12: Frontend — Google Drive option on the Storage settings page

**Files:**
- Modify: `src/frontend/src/hooks/useStorageConfig.ts`
- Modify: `src/frontend/src/views/settings/StoragePage.tsx`
- Create: `src/frontend/src/views/settings/StorageConnectingPage.tsx`
- Modify: `src/frontend/src/App.tsx`
- Modify: `src/frontend/src/__tests__/StoragePage.test.tsx`

**Interfaces:**
- Changes: `StorageConfigData.provider` widens to `'local' | 'custom_path' | 'google_drive'`, gains `connected?: boolean`. New `useGoogleAuthorize()` hook (mutation, calls the `/authorize` endpoint, returns `{ url }`).
- Produces: `StorageConnectingPage` — the interstitial route at `/settings/storage/connecting`.

- [ ] **Step 1: Extend `useStorageConfig.ts`**

```ts
// src/frontend/src/hooks/useStorageConfig.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface StorageConfigData {
  provider: 'local' | 'custom_path' | 'google_drive'
  configured: boolean
  connected?: boolean
  smbHost?: string
  smbShare?: string
  smbUsername?: string
}

export interface StorageConfigInput {
  provider: 'local' | 'custom_path'
  smbHost?: string
  smbShare?: string
  smbUsername?: string
  smbPassword?: string
  confirmBaseChange?: boolean
}

export function useStorageConfig() {
  return useQuery<StorageConfigData>({
    queryKey: ['settings', 'clinic', 'storage-config'],
    queryFn:  () => api.get('/api/settings/clinic/storage-config').then(r => r.data.data),
  })
}

export function useUpdateStorageConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StorageConfigInput) =>
      api.put('/api/settings/clinic/storage-config', data).then(r => r.data.data as StorageConfigData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic', 'storage-config'] }),
  })
}

/** Calls the authenticated /authorize endpoint, returns { url } — the
 *  caller performs the actual browser navigation (window.location.href =
 *  url), never this hook, so the redirect stays a plain full-page nav. */
export function useGoogleAuthorize() {
  return useMutation({
    mutationFn: () => api.get<{ data: { url: string } }>('/api/settings/clinic/storage-config/google/authorize').then(r => r.data.data),
  })
}
```

- [ ] **Step 2: Add the Google Drive radio option + Connect/Disconnect UI to `StoragePage.tsx`**

Add the import and the `'google_drive'` branch to `StorageForm`'s provider union, then insert a third radio option and its conditional panel. Full updated file:

```tsx
import React, { useState, useEffect } from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { useStorageConfig, useUpdateStorageConfig, useGoogleAuthorize, type StorageConfigInput } from '../../hooks/useStorageConfig'
import { getErrorMessage } from '../../utils/errorMessage'

function getErrorCode(error: unknown): string | undefined {
  return (error as { response?: { data?: { code?: string } } })?.response?.data?.code
}

interface StorageForm {
  provider: 'local' | 'custom_path' | 'google_drive'
  smbHost: string
  smbShare: string
  smbUsername: string
  smbPassword: string
}

const EMPTY_FORM: StorageForm = { provider: 'local', smbHost: '', smbShare: '', smbUsername: '', smbPassword: '' }

export default function StoragePage(): React.ReactElement {
  const { data, isLoading } = useStorageConfig()
  const update = useUpdateStorageConfig()
  const googleAuthorize = useGoogleAuthorize()

  const [form, setForm] = useState<StorageForm>(EMPTY_FORM)
  const [editingPassword, setEditingPassword] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingSwitchAway, setPendingSwitchAway] = useState<'local' | 'custom_path' | null>(null)

  useEffect(() => {
    if (!data) return
    setForm({
      provider: data.provider,
      smbHost: data.smbHost ?? '',
      smbShare: data.smbShare ?? '',
      smbUsername: data.smbUsername ?? '',
      smbPassword: '',
    })
    setEditingPassword(data.provider === 'custom_path' && !data.configured)
  }, [data])

  function buildPayload(provider: 'local' | 'custom_path', confirmBaseChange?: boolean): StorageConfigInput {
    if (provider === 'local') return { provider: 'local', confirmBaseChange }
    const payload: StorageConfigInput = {
      provider: 'custom_path',
      smbHost: form.smbHost,
      smbShare: form.smbShare,
      smbUsername: form.smbUsername,
      confirmBaseChange,
    }
    if (editingPassword && form.smbPassword) payload.smbPassword = form.smbPassword
    return payload
  }

  async function handleSave(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (form.provider === 'google_drive') return // Google Drive connects via OAuth, not this form's Save
    try {
      await update.mutateAsync(buildPayload(form.provider))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      if (getErrorCode(err) === 'STORAGE_SWITCH_CONFIRMATION_REQUIRED') { setPendingSwitchAway(form.provider); setConfirmOpen(true) }
    }
  }

  async function handleConnectGoogle(): Promise<void> {
    const { url } = await googleAuthorize.mutateAsync()
    window.location.href = url // leaves the app for Google's consent screen — full-page navigation, no popup
  }

  async function handleDisconnectGoogle(): Promise<void> {
    setPendingSwitchAway('local')
    setConfirmOpen(true)
  }

  async function handleConfirmSwitch(): Promise<void> {
    setConfirmOpen(false)
    const provider = pendingSwitchAway ?? 'local'
    try {
      await update.mutateAsync(buildPayload(provider, true))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      // error displayed via update.error below
    }
  }

  const errorCode = getErrorCode(update.error)
  const fieldError = (field: 'smbHost' | 'smbUsername'): string | null => {
    if (field === 'smbHost' && errorCode === 'SMB_HOST_UNREACHABLE') return 'Cannot reach this host — check the address and that the server can reach the share.'
    if (field === 'smbHost' && errorCode === 'SMB_SHARE_NOT_FOUND') return 'Share not found on that host — check the share name.'
    if (field === 'smbUsername' && errorCode === 'SMB_AUTH_REJECTED') return 'Username or password was rejected.'
    return null
  }
  const genericError = update.error && !errorCode?.startsWith('SMB_') && errorCode !== 'STORAGE_SWITCH_CONFIRMATION_REQUIRED'
    ? getErrorMessage(update.error, 'Please try again.')
    : null

  if (isLoading) return (
    <div className="p-xl flex items-center gap-sm text-on-surface-variant">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-body-md">Loading…</span>
    </div>
  )

  return (
    <form onSubmit={handleSave} className="max-w-5xl mx-auto p-6 flex flex-col gap-lg">
      <h1 className="text-headline-md font-headline text-on-surface">Storage</h1>

      {saved && (
        <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-secondary flex items-center gap-sm">
          <MaterialIcon name="check_circle" size={18} />
          Changes saved successfully
        </div>
      )}

      {genericError && (
        <div className="px-md py-sm bg-error/10 border border-error/30 rounded-xl text-body-md text-error">
          Failed to save: {genericError}
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-outline-variant p-lg flex flex-col gap-md">
        <h2 className="text-title-md font-medium text-on-surface">File storage location</h2>
        <p className="text-body-md text-on-surface-variant">
          Where pet photos and EMR attachments are saved. Files already uploaded stay at their current
          location and are not moved automatically when you switch.
        </p>

        <div className="flex flex-col gap-sm">
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input type="radio" name="storage-provider" checked={form.provider === 'local'}
              onChange={() => setForm(p => ({ ...p, provider: 'local' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Local (default)</span>
          </label>
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input type="radio" name="storage-provider" checked={form.provider === 'custom_path'}
              onChange={() => setForm(p => ({ ...p, provider: 'custom_path' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Network share</span>
          </label>
          <label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
            <input type="radio" name="storage-provider" checked={form.provider === 'google_drive'}
              onChange={() => setForm(p => ({ ...p, provider: 'google_drive' }))} className="w-5 h-5" />
            <span className="text-body-md text-on-surface">Google Drive</span>
          </label>
        </div>

        {form.provider === 'custom_path' && (
          <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-host" className="text-label-md text-on-surface-variant">Host / IP address</label>
              <input id="smb-host" type="text" value={form.smbHost}
                onChange={e => setForm(p => ({ ...p, smbHost: e.target.value }))} placeholder="192.168.1.10"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
              <p className="text-label-md text-on-surface-variant">
                Evaluated on the clinic server, not your PC — use the share's network address, not a locally mapped drive letter.
              </p>
              {fieldError('smbHost') && <p className="text-label-md text-error">{fieldError('smbHost')}</p>}
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-share" className="text-label-md text-on-surface-variant">Share name</label>
              <input id="smb-share" type="text" value={form.smbShare}
                onChange={e => setForm(p => ({ ...p, smbShare: e.target.value }))} placeholder="vetfiles"
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-username" className="text-label-md text-on-surface-variant">Username</label>
              <input id="smb-username" type="text" value={form.smbUsername}
                onChange={e => setForm(p => ({ ...p, smbUsername: e.target.value }))}
                className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
              {fieldError('smbUsername') && <p className="text-label-md text-error">{fieldError('smbUsername')}</p>}
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor="smb-password" className="text-label-md text-on-surface-variant">Password</label>
              {!editingPassword ? (
                <div className="flex items-center gap-sm">
                  <span className="min-h-[44px] px-md flex items-center border border-outline-variant rounded-xl text-body-md text-on-surface-variant bg-surface-container-low flex-1">
                    Connected — password saved
                  </span>
                  <button type="button" onClick={() => setEditingPassword(true)}
                    className="min-h-[44px] min-w-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
                    Change
                  </button>
                </div>
              ) : (
                <input id="smb-password" type="password" value={form.smbPassword}
                  onChange={e => setForm(p => ({ ...p, smbPassword: e.target.value }))}
                  className="min-h-[44px] px-md border border-outline-variant rounded-xl text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary w-full" />
              )}
            </div>
          </div>
        )}

        {form.provider === 'google_drive' && (
          <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
            {/* BA finding G-3 — data-custody note, parity with the network-share/local switch-confirmation copy. */}
            <p className="text-body-md text-on-surface-variant">
              Files are stored in <strong>this Google account's</strong> Drive. If this account is lost or
              access is revoked, the clinic loses access to those files until reconnected.
            </p>
            {data?.provider === 'google_drive' && data.configured ? (
              <div className="flex items-center gap-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${data.connected ? 'bg-secondary' : 'bg-error'}`} aria-hidden="true" />
                <span className="text-body-md text-on-surface">
                  {data.connected ? 'Connected' : 'Not connected — reconnect required'}
                </span>
                <button type="button" onClick={handleDisconnectGoogle}
                  className="ml-auto min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
                  Disconnect
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleConnectGoogle} disabled={googleAuthorize.isPending}
                className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50 self-start">
                {googleAuthorize.isPending ? 'Connecting…' : 'Connect with Google'}
              </button>
            )}
          </div>
        )}
      </div>

      {form.provider !== 'google_drive' && (
        <div className="sticky bottom-0 bg-background pt-sm pb-md flex items-center justify-end border-t border-outline-variant">
          <button type="submit" disabled={update.isPending}
            className="min-h-[44px] min-w-[44px] px-xl bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {update.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-lg">
          <div className="bg-surface rounded-2xl p-lg max-w-md w-full flex flex-col gap-md">
            <h3 className="text-title-md font-medium text-on-surface">Change storage location?</h3>
            <p className="text-body-md text-on-surface-variant">
              Files already uploaded will stay at their current location and won't be visible at the new
              location until moved there manually. Backing them up is now your clinic's responsibility.
              {data?.provider === 'google_drive' && ' This also disconnects the currently connected Google account.'}
            </p>
            <div className="flex justify-end gap-sm">
              <button type="button" onClick={() => setConfirmOpen(false)}
                className="min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmSwitch}
                className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
```

- [ ] **Step 3: Write the interstitial page**

```tsx
// src/frontend/src/views/settings/StorageConnectingPage.tsx
import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const REDIRECT_DELAY_MS = 1500

export default function StorageConnectingPage(): React.ReactElement {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => navigate('/settings/storage', { replace: true }), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-md bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-body-lg text-on-surface">Connecting to Google Drive…</p>
    </div>
  )
}
```

- [ ] **Step 4: Register the route in `App.tsx`**

Add the lazy import near the other settings pages:

```tsx
const StorageConnectingPage = lazy(() => import('./views/settings/StorageConnectingPage'))
```

Add the route as a sibling of the existing `storage` route inside the `/settings` `<Route>` block:

```tsx
<Route path="storage/connecting" element={<RequirePermission perm="clinic.integrations.edit"><StorageConnectingPage/></RequirePermission>}/>
```

- [ ] **Step 5: Extend the frontend test**

Read `src/frontend/src/__tests__/StoragePage.test.tsx` first to match its existing mock/render setup exactly, then append:

```tsx
test('renders the Google Drive radio option and a Connect button when not yet connected', async () => {
  // ... mirror this file's existing useStorageConfig mock setup, with { provider: 'local', configured: false }
  // select the "Google Drive" radio, assert "Connect with Google" button renders
})

test('clicking Connect with Google calls the authorize endpoint and navigates to the returned url', async () => {
  // ... mock useGoogleAuthorize's mutateAsync to resolve { url: 'https://accounts.google.com/...' },
  // assert window.location.href was set to that url after clicking Connect
})

test('when already connected, shows the status dot + Disconnect button instead of the Connect button', async () => {
  // ... mock useStorageConfig to return { provider: 'google_drive', configured: true, connected: true }
  // assert "Connected" text and a "Disconnect" button render, no "Connect with Google" button
})

test('Disconnect opens the switch-confirmation dialog; confirming resubmits with confirmBaseChange: true and provider: local', async () => {
  // ... click Disconnect, assert the confirmation dialog appears, click Confirm,
  // assert update.mutateAsync (mocked) was called with { provider: 'local', confirmBaseChange: true }
})
```

Run: `cd src/frontend && npx vitest run StoragePage`
Expected: PASS (all prior tests + 4 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/hooks/useStorageConfig.ts src/frontend/src/views/settings/StoragePage.tsx src/frontend/src/views/settings/StorageConnectingPage.tsx src/frontend/src/App.tsx src/frontend/src/__tests__/StoragePage.test.tsx
git commit -m "feat(storage): Google Drive connect UI — radio option, Connect/Disconnect, interstitial page (ADR-0023, BA G-3)"
```

---

## Task 13: Full regression pass

**Files:** none (verification only).

- [ ] **Step 1: Backend**

Run: `cd src/backend && npx jest`
Expected: full green — the count grows by roughly 55 tests over the pre-plan baseline (Tasks 3: 11, 5: 6, 6: 5, 7: 4, 8: 9, 9: 5, 10: 3, 4: 2, 11: 4, plus the 2 `getStorageDriver`/`resolveStorageConfig` tests already counted in Task 4). Confirm the exact before/after totals when this actually runs and report them for the phase-status table update (`@pm-agent`'s documentation step, after QA sign-off).

- [ ] **Step 2: Frontend**

Run: `cd src/frontend && npx vitest run`
Expected: full green — the count grows by roughly 4 (Task 12).

- [ ] **Step 3: TypeScript strict check (both packages)**

Run: `cd src/backend && npx tsc --noEmit && cd ../../src/frontend && npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 4: Confirm no regression to sub-project 1's driver/SMB tests**

Run: `cd src/backend && npx jest smb-share-driver.test.ts storage-driver.test.ts storage-config.service.test.ts storage-errors.test.ts --testPathPattern="__tests__|integration"`
Expected: PASS — the new `google_drive` branches are additive; every existing `local`/`custom_path` test path is untouched.

No commit for this task — it is the checkpoint before handing off to `@qa-agent` / Ponytail.

---

## Open questions / things flagged back for a decision (not silently assumed)

1. **Frontend file/component names in Task 12 mirror the already-shipped `StoragePage.tsx`/`useStorageConfig.ts` (sub-project 1, PR #47 on this same branch) exactly** — read in full before this plan was written, so this is not a guess the way sub-project 1's own Task 11 flagged its frontend location as best-guess. No open question here.
2. **`FRONTEND_URL_PATTERN` (Task 7's `deriveTenantFrontendOrigin`) is a forward-looking hook, not a currently-wired feature.** A `grep` for `subdomain` across `src/backend/services|controllers|utils` at plan-writing time found no existing per-tenant-subdomain→frontend-origin resolver — today's deployment is single-origin (`FRONTEND_URL`). The function is still genuinely "server-derived, never client-supplied" (satisfies BA G-2a) even in single-origin mode; the pattern-substitution branch is inert until `FRONTEND_URL_PATTERN` is actually set by ops. Flagging so this isn't mistaken for an unfinished multi-tenant-subdomain feature — it is deliberately scoped to what BA G-2a actually requires (server-side derivation), not a promise of per-tenant subdomain routing.
3. **Production redirect URI registration (`http://localhost:4000/oauth/google/callback` for dev; the production URI) is a deploy-time task**, same posture as sub-project 1's SMB library production caveat — out of scope for this plan's implementation, called out per the design doc's own "Explicitly out of scope" section.
4. **OneDrive (sub-project 3) reuses `OAuthConnectNonce` and the `/oauth/<provider>/callback` path shape verbatim** (both were deliberately built provider-generic in Tasks 1/6/8) — not built in this plan, but the seam is already there per the design's own stated intent.
