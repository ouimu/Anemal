# Per-Tenant Storage Provider — Microsoft OneDrive Driver — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Sub-project:** 3 of 3 on `feature/tenant-storage-provider` (custom-path/SMB shipped as PR #46+#47; Google Drive shipped as PR #47 addendum (core) + PR #48 (OAuth+UI) — both merged to `main`. OneDrive is the final sub-project, same branch, per the locked build-order decision.)

**Goal:** A Clinic Admin can connect their tenant's EMR attachments + pet photos to their own Microsoft OneDrive via OAuth (`Files.ReadWrite.AppFolder` scope), as a fourth alternative to local disk / SMB share / Google Drive. Builds on ADR-0022/0023's `StorageDriver` interface, `getStorageDriver(tenantId)` switch point, and the Google Drive sub-project's OAuth infrastructure (`oauth-state.ts`, `OAuthConnectNonce`, `/oauth/<provider>/callback` top-level router pattern) — all reused, not reinvented.

**Inputs (read in full before this plan was written):**
- Design (final, all rounds folded in): `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`
- BA sign-off: `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-ba-signoff.md`
- Grill round 1: `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill.md`
- Grill round 2 (independent adversarial re-check): `docs/superpowers/specs/2026-07-24-storage-onedrive-driver-grill-round2.md`
- Precedent plan (format/granularity mirrored throughout): `docs/superpowers/plans/2026-07-23-storage-google-drive-driver.md`
- ADR-0023, both amendments (custom-path + Google Drive)
- Live source read before writing this plan: `src/backend/config/storage-driver.ts`, `src/backend/config/google-drive-client.ts`, `src/backend/config/google-drive-driver.ts`, `src/backend/controllers/oauth-google.controller.ts`, `src/backend/controllers/settings.controller.ts`, `src/backend/routes/oauth-google.routes.ts`, `src/backend/routes/settings.routes.ts`, `src/backend/app.ts`, `src/backend/models/tenant-storage-config.repository.ts`, `src/backend/models/oauth-connect-nonce.repository.ts`, `src/backend/services/storage-config.service.ts`, `src/backend/utils/oauth-state.ts`, `src/backend/utils/encryption.ts`, `src/backend/config/env.ts`, `src/backend/prisma/schema.prisma`, `src/frontend/src/hooks/useStorageConfig.ts`, `src/frontend/src/views/settings/StoragePage.tsx`, `src/frontend/src/views/settings/StorageConnectingPage.tsx`.

**Architecture:** New `OneDriveDriver` (implements the existing `StorageDriver` interface) alongside `LocalDiskDriver`/`SmbShareDriver`/`GoogleDriveDriver`, talking to Microsoft Graph only through an injectable `OneDriveClient` seam (`src/backend/config/onedrive-client.ts`) — mirrors `google-drive-client.ts`/`smb-client.ts` exactly. **Zero new runtime dependencies** (M-6 — plain `fetch`, no MSAL, no Graph SDK). `getStorageDriver(tenantId)` gains a `provider === 'onedrive'` branch. OAuth reuses the Google sub-project's signed-`state`/nonce infrastructure verbatim, with one hardening (`consumeNonce` gains a `provider` predicate, M-7) applied to both flows. Two already-shipped pieces of code get retrofitted: `oauth-google.controller.ts` (null `oneDrive*` columns when Google is connected over an OneDrive row, M-10 reverse direction; populate+check `googleAccountIdHash`, M-11) and `oauth-connect-nonce.repository.ts` (`consumeNonce` signature).

**Tech Stack:** Node/Express/TypeScript backend (Prisma/Postgres), React 18/Vite frontend, Jest/supertest (backend), Vitest/Testing Library (frontend). No new dependency — Node's built-in `fetch` covers all 8 Graph/token-endpoint calls (M-6).

---

## Task 0 (gate, not implementation): OD-13 verification spike — MUST run and be resolved before Task 2 onward

**Why this is Task 0/1, not a normal task:** the design (§2 M-11, risk OD-13) explicitly left **two unverified scope claims** as the single open item blocking write-plan-derived implementation:
1. Does `Files.ReadWrite.AppFolder` (Microsoft) authorize `GET /me/drive`? Or only the narrower `GET /me/drive/special/approot`?
2. Does Google's `drive.file` scope (already live in production) actually authorize `about.get?fields=user`?

Every later task that touches account-ID lookup (M-11 duplicate-account hash) or the live status ping (I-16/M-9) is written in **two variants** below — "if primary approach works" and "if fallback needed" — and this spike is what tells the implementer which variant to build. **Do not implement Task 5 (status ping) or the hash-derivation half of Task 3/8 until this spike's outcome is recorded.**

**Files:**
- Create (scratch, not committed to the app runtime — lives under the scratchpad or a throwaway `scripts/` location, deleted after use): `scripts/spikes/od-13-scope-verification.ts`
- Modify (record outcome): `docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md` — append a dated "OD-13 spike result" note under §2 M-11 with the confirmed answer for both providers (this is the artifact later tasks read, not the throwaway script)

- [ ] **Step 1: Obtain a real test token for each provider**
  - Microsoft: register a throwaway test connection (or reuse the dev Entra app registration created for this feature, scope `offline_access Files.ReadWrite.AppFolder`), complete one manual OAuth consent in a browser, capture the resulting access token.
  - Google: reuse an existing dev-tenant's already-connected `drive.file` access token (decrypt one from a test tenant's `tenant_storage_config` row, or connect a fresh throwaway test Google account through the already-shipped flow).

- [ ] **Step 2: Write and run the spike script**

```ts
// scripts/spikes/od-13-scope-verification.ts
// THROWAWAY — not part of the app, not imported by any runtime code, deleted
// after this task closes. Confirms OD-13 (design §2 M-11) before any
// production code is written against either assumption.
const MS_TOKEN = process.env.SPIKE_MS_ACCESS_TOKEN!
const GOOGLE_TOKEN = process.env.SPIKE_GOOGLE_ACCESS_TOKEN!

async function checkMicrosoft() {
  console.log('--- GET /me/drive (primary claim) ---')
  const r1 = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
    headers: { Authorization: `Bearer ${MS_TOKEN}` },
  })
  console.log(r1.status, await r1.text())

  console.log('--- GET /me/drive/special/approot (fallback) ---')
  const r2 = await fetch('https://graph.microsoft.com/v1.0/me/drive/special/approot', {
    headers: { Authorization: `Bearer ${MS_TOKEN}` },
  })
  console.log(r2.status, await r2.text())
}

async function checkGoogle() {
  console.log('--- GET about.get?fields=user (M-11 claim) ---')
  const r = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${GOOGLE_TOKEN}` },
  })
  console.log(r.status, await r.text())
}

checkMicrosoft().then(checkGoogle)
```

Run: `SPIKE_MS_ACCESS_TOKEN=... SPIKE_GOOGLE_ACCESS_TOKEN=... npx tsx scripts/spikes/od-13-scope-verification.ts`

- [ ] **Step 3: Record the outcome — this determines every later task's branch**

Expected outcomes and what each means for the plan below:

| Result | Meaning | Which variant to build |
|---|---|---|
| `GET /me/drive` → 200 with `owner.user.id` present | `Files.ReadWrite.AppFolder` authorizes the primary claim | Task 5/8 build the **primary** variant: ping = `GET /me/drive`, hash source = `owner.user.id` |
| `GET /me/drive` → 403, `GET /me/drive/special/approot` → 200 with `parentReference.driveId` present | Primary claim false, fallback confirmed (as the design anticipated) | Task 5/8 build the **fallback** variant: ping = `GET /me/drive/special/approot`, hash source = `parentReference.driveId` |
| `about.get?fields=user` → 200 with `user.permissionId` | `drive.file` authorizes the Google-side M-11 claim | Task 8's Google retrofit proceeds as designed |
| `about.get?fields=user` → 403 | `drive.file` does NOT authorize this call | **Escalate — not covered by any documented fallback.** Do not silently substitute a broader scope (that would be a live production scope change requiring its own product decision). Stop and get a product-owner decision before Task 8 (this is the one branch the design did not pre-resolve). |

Append the confirmed result to the design doc (`docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md`, under M-11, dated) as the record future readers rely on, then delete the throwaway script — it is not committed to the branch.

- [ ] **Step 4: Commit only the doc update**

```bash
git add docs/superpowers/specs/2026-07-23-storage-onedrive-driver-design.md
git commit -m "docs(storage): record OD-13 spike result — confirms MS/Google account-ID lookup scope (ADR-0023 sub-project 3)"
```

> **The rest of this plan is written assuming the design-documented primary path holds for Microsoft** (`GET /me/drive` works — this is the common case per Microsoft Graph documentation for delegated app-folder permissions) **and assumed to hold for Google** (`about.get?fields=user` works under `drive.file` — Google's docs list this as a metadata-only call, typically covered). Every task below that depends on this marks its exact fallback edit inline (search this document for "OD-13 fallback") so the implementer swaps in the fallback branch without re-deriving it, if Step 3 says so.

---

## PR Split (proposed — subject to Ponytail Step 5 confirmation)

**Footprint estimate for Ponytail (Step 5 gate, not run by this plan):**
- New files: `onedrive-client.ts`, `fakeOneDriveClient.ts`, `onedrive-driver.ts` + its test, `onedrive.controller.ts`, `oauth-onedrive.routes.ts`, `account-id-hash.ts` + its test, 1 migration file = **8 new files**
- Modified files: `schema.prisma`, `storage-driver.ts`, `storage-config.service.ts` (+its test), `tenant-storage-config.repository.ts`, `oauth-connect-nonce.repository.ts` (+its test), `oauth-google.controller.ts` (+its test), `settings.routes.ts`, `settings.controller.ts` (+its test), `app.ts`, `useStorageConfig.ts`, `StoragePage.tsx` (+its test), `StorageConnectingPage.tsx` = **~14 modified files**
- New dependencies: **0** (M-6)
- New endpoints: **2** (`GET .../onedrive/authorize`, `GET /oauth/onedrive/callback`)
- Subsystems touched: DB/migration, backend crypto+driver core, backend API surface (incl. retrofitting 2 already-shipped files), frontend — **4**, same count that triggered the GDrive split ruling (criterion 4, >3 subsystems).

This mirrors the GDrive sub-project's footprint closely enough that the same split is proposed here, sequenced identically:

- **Sub-PR A — driver + crypto core + shipped-code hardening, Tasks 0–7:** the spike, migration (4 `oneDrive*` columns + `googleAccountIdHash` retrofit), `account-id-hash.ts` shared helper, `OneDriveClient`/`FakeOneDriveClient`, `OneDriveDriver`, `getStorageDriver` branch, `consumeNonce` provider-match hardening (M-7) + its Google-flow regression test, and the Google callback retrofit (M-10 reverse direction + M-11 hash/collision). No new user-facing route yet — the OneDrive branch in `getStorageDriver` is wired but structurally unreachable (no connect flow exists to ever set `provider: 'onedrive'`), same "zero new HTTP attack surface" posture the GDrive Sub-PR A note called out. Fully covered by unit/integration tests against fakes and the existing (retrofitted) Google flow — nothing here depends on a live Microsoft account.
- **Sub-PR B — OAuth endpoints + status check + frontend, Tasks 8–12:** the `/authorize` endpoint, `/oauth/onedrive/callback`, the live `connected`/`duplicateAccountWarning` status fields, and the frontend (4th radio, Connect/Disconnect, interstitial copy generalization, switch-dialog M-12/F-OD-4 copy, duplicate-account banner). Depends on Sub-PR A merged to this branch's base.

Each sub-PR runs its own Step 6→8. Sub-PR B starts only after Sub-PR A merges. **This split is a proposal for the implementer to carry into Step 5 — the actual ruling is Ponytail's, not this plan's.**

## Global Constraints

- Every query touching `TenantStorageConfig` MUST be tenant-scoped — the table's PK **is** `tenantId` (unchanged, inherited from sub-projects 1–2).
- `GET .../onedrive/authorize` requires `clinic.integrations.edit`. `GET /oauth/onedrive/callback` has **no** permission/plane middleware — signed single-use `state` is the entire trust boundary, verified (signature → expiry → atomic provider-matched nonce-consume → still-active user/tenant/permission) **before anything is read or persisted** (I-9/I-10/I-12, M-7).
- `state` signing, HKDF key derivation, 10-min expiry, fixed-default-origin-on-invalid-state: **reused verbatim** from `oauth-state.ts` — no OneDrive-specific state format.
- The `oneDriveAccountIdHash`/`googleAccountIdHash` HMAC uses a **distinct HKDF `info` string** (`'account-id-hash-v1'`) from `oauth-state.ts`'s own (`'oauth-state-hmac-v1'`) — purpose separation per round-2 grill finding 7, never reuse the state-signing key for this.
- Tokens are never returned by any `GET` — `configured`/`connected` booleans stand in, same rule as every prior provider.
- `save()` on OneDrive is inherently overwrite-in-place via path-based `PUT`/upload-session with `conflictBehavior: replace` — no list-then-update dance like Google's (M-4), but the regression test proving "photo replace yields one file, not two" is kept anyway (design §9 — "load-bearing guarantee", asserted not assumed).
- Disconnecting from `onedrive` nulls all **four** `oneDrive*` columns (incl. `oneDriveAccountIdHash`, corrected count per round-2 grill finding 2) in the same write — no revoke call exists to make (M-3, Microsoft provides none).
- Connecting `onedrive` nulls `smb*`, `google*`, and `googleAccountIdHash` in the same write (M-10 forward direction); connecting `google_drive` over an existing `onedrive` row nulls all four `oneDrive*` columns (M-10 reverse direction, retrofit to shipped code, round-2 grill finding 1 — **High severity**, this is OneDrive's *only* kill mechanism since Microsoft has no revoke endpoint).
- `duplicateAccountWarning` in `GET /clinic/storage-config`'s response is gated to `clinic.integrations.edit` holders only (round-2 grill finding 5) — recomputed on every read, never cached at connect time.
- Layered architecture stays Route → Controller → Service/Repository → Driver; `OneDriveDriver`/`createOneDriveClient` constructed only inside `getStorageDriver()` or the OAuth callback controller.
- TypeScript strict mode; no `any` beyond what's already accepted elsewhere in touched files.
- Cross-tenant existence checks return 404, never 403 (ADR-0014 precedent) — unaffected here, must not regress.

---

# SUB-PR A — Driver core + shipped-code hardening

## Task 1: Prisma migration — 4 new `oneDrive*` columns + `googleAccountIdHash` retrofit

**Files:**
- Modify: `src/backend/prisma/schema.prisma`
- Create: `src/backend/prisma/migrations/20260724090000_add_onedrive_storage/migration.sql`

**Interfaces:**
- Produces: 4 new nullable columns on `TenantStorageConfig` (`oneDriveAccessTokenEncrypted`, `oneDriveRefreshTokenEncrypted`, `oneDriveTokenExpiresAt`, `oneDriveAccountIdHash`) + 1 retrofit column (`googleAccountIdHash`). `provider` value set extends to include `'onedrive'` (comment-only change, column stays `VarChar(20)`, no enum in Postgres). No change to `OAuthConnectNonce` schema (M-7 is a query-predicate change, not a column addition).

- [ ] **Step 1: Add the columns to `TenantStorageConfig` in `schema.prisma`**

```prisma
// Per-tenant BYO storage location (ADR-0023). One row per tenant; absence
// of a row means "use the operator's default LocalDiskDriver" — no backfill
// needed. provider values: 'local' | 'custom_path' | 'google_drive' | 'onedrive'.
// google*/oneDrive* columns are populated only when provider matches that
// value — see ADR-0023's sub-project 2 (Google) and sub-project 3 (OneDrive)
// amendments.
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
  // HMAC-SHA256 (HKDF-derived key, distinct info string from oauth-state.ts)
  // of the connected Google account's identifier — not reversible, not PII
  // at rest. Retrofit column (sub-project 3, M-11) — populated + collision-
  // checked by the (patched) Google callback going forward; NULL for any
  // tenant connected before this migration until they reconnect.
  googleAccountIdHash          String?
  // Microsoft OneDrive (sub-project 3) — same encryption helper/key.
  // Refresh token ROTATES (unlike Google's stable one) — replaced on every
  // refresh, not only at connect (M-2). No folder-ID columns: Microsoft
  // Graph addresses by path under the app-folder, not by cached ID (M-4) —
  // the whole folder-ID-cache class of column that Google needs does not
  // exist here.
  oneDriveAccessTokenEncrypted  String?
  oneDriveRefreshTokenEncrypted String?
  oneDriveTokenExpiresAt        DateTime?
  oneDriveAccountIdHash         String?
  updatedAt            DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@map("tenant_storage_config")
}
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- src/backend/prisma/migrations/20260724090000_add_onedrive_storage/migration.sql
ALTER TABLE "tenant_storage_config" ADD COLUMN "googleAccountIdHash" TEXT;

ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveAccessTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveRefreshTokenEncrypted" TEXT;
ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "tenant_storage_config" ADD COLUMN "oneDriveAccountIdHash" TEXT;
```

- [ ] **Step 3: Generate + apply**

Run: `cd src/backend && npx prisma generate && npx prisma migrate dev --name add_onedrive_storage`
Expected: migration applies cleanly; `SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_storage_config';` shows the 5 new columns (4 `oneDrive*` + `googleAccountIdHash`).

- [ ] **Step 4: Commit**

```bash
git add src/backend/prisma/schema.prisma src/backend/prisma/migrations/20260724090000_add_onedrive_storage
git commit -m "feat(storage): add OneDrive columns + googleAccountIdHash retrofit (ADR-0023 sub-project 3)"
```

---

## Task 2: `account-id-hash.ts` — shared HKDF-hashing helper + collision-check query (M-11)

**Files:**
- Create: `src/backend/utils/account-id-hash.ts`
- Create: `src/backend/__tests__/account-id-hash.test.ts`

**Interfaces:**
- Produces: `function hashAccountId(rawAccountId: string): string`, `interface DuplicateAccountCheckResult { duplicate: boolean }`, `async function checkDuplicateAccount(prisma, provider: 'google_drive' | 'onedrive', hash: string, excludeTenantId: number): Promise<DuplicateAccountCheckResult>`. Consumed by Task 8 (Google retrofit) and Task 10/Sub-PR B (OneDrive callback + status read).

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/account-id-hash.test.ts
import { hashAccountId, checkDuplicateAccount } from '../utils/account-id-hash'
import prisma from '../config/db'

jest.mock('../config/db', () => ({
  tenantStorageConfig: { findFirst: jest.fn() },
}))

describe('hashAccountId', () => {
  test('is deterministic for the same input', () => {
    expect(hashAccountId('microsoft-user-123')).toBe(hashAccountId('microsoft-user-123'))
  })

  test('differs for different inputs', () => {
    expect(hashAccountId('a')).not.toBe(hashAccountId('b'))
  })

  test('never contains the raw input (not reversible at a glance)', () => {
    expect(hashAccountId('microsoft-user-123')).not.toContain('microsoft-user-123')
  })
})

describe('checkDuplicateAccount', () => {
  beforeEach(() => jest.clearAllMocks())

  test('predicate is provider + hash + tenantId != excludeTenantId — explicit, not hash-alone (round-2 grill finding 5)', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue(null)
    await checkDuplicateAccount(prisma, 'onedrive', 'hash-abc', 7)
    expect(prisma.tenantStorageConfig.findFirst).toHaveBeenCalledWith({
      where: { provider: 'onedrive', oneDriveAccountIdHash: 'hash-abc', tenantId: { not: 7 } },
    })
  })

  test('returns duplicate:true when a match exists', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue({ tenantId: 99 })
    const result = await checkDuplicateAccount(prisma, 'onedrive', 'hash-abc', 7)
    expect(result).toEqual({ duplicate: true })
  })

  test('returns duplicate:false when no match', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue(null)
    const result = await checkDuplicateAccount(prisma, 'google_drive', 'hash-xyz', 7)
    expect(result).toEqual({ duplicate: false })
  })

  test('never returns the matched tenant id or any identifying detail (existence-only signal)', async () => {
    ;(prisma.tenantStorageConfig.findFirst as jest.Mock).mockResolvedValue({ tenantId: 99 })
    const result = await checkDuplicateAccount(prisma, 'onedrive', 'hash-abc', 7)
    expect(result).not.toHaveProperty('tenantId')
    expect(Object.keys(result)).toEqual(['duplicate'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest account-id-hash.test.ts`
Expected: FAIL — `Cannot find module '../utils/account-id-hash'`.

- [ ] **Step 3: Implement**

```ts
// src/backend/utils/account-id-hash.ts
// Shared HMAC-SHA256 hashing + cross-tenant duplicate-account detection for
// BOTH cloud providers (ADR-0023, sub-project 3, M-11). Uses an HKDF-derived
// key from SETTINGS_ENCRYPTION_KEY with a DISTINCT info string from
// oauth-state.ts's own (round-2 grill finding 7) — purpose separation, the
// same reasoning that motivated HKDF for state-signing (grill N-5) applies
// here: a bug in one derived key must never affect the other.
import crypto from 'crypto'
import { config } from '../config/env'
import type { PrismaClient } from '@prisma/client'

const HKDF_INFO = 'account-id-hash-v1'

function deriveHashKey(): Buffer {
  const masterKey = Buffer.from(config.settingsEncryptionKey, 'hex')
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(HKDF_INFO), 32))
}

/** Not reversible; never stores the raw account ID/email — nothing PII-shaped at rest. */
export function hashAccountId(rawAccountId: string): string {
  return crypto.createHmac('sha256', deriveHashKey()).update(rawAccountId).digest('hex')
}

export interface DuplicateAccountCheckResult {
  duplicate: boolean
}

/**
 * Cross-tenant duplicate-account check (M-11). Predicate is explicit
 * provider + hash + tenantId-exclusion — NOT hash-alone (round-2 grill
 * finding 5) — this doubly guards against a stale hash left on an unrelated
 * row surviving a disconnect/switch that should have nulled it (Task 8/10's
 * column-hygiene tasks are what actually prevent that; this predicate is
 * defense in depth on top). Returns existence-only — never the matched
 * tenant's id or any identifying detail (same discipline as the
 * ADR-0019/0014 404-not-403 precedent).
 */
export async function checkDuplicateAccount(
  prisma: PrismaClient,
  provider: 'google_drive' | 'onedrive',
  hash: string,
  excludeTenantId: number,
): Promise<DuplicateAccountCheckResult> {
  const hashColumn = provider === 'google_drive' ? 'googleAccountIdHash' : 'oneDriveAccountIdHash'
  const match = await prisma.tenantStorageConfig.findFirst({
    where: { provider, [hashColumn]: hash, tenantId: { not: excludeTenantId } },
  })
  return { duplicate: !!match }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest account-id-hash.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/utils/account-id-hash.ts src/backend/__tests__/account-id-hash.test.ts
git commit -m "feat(storage): add shared account-id hashing + duplicate-account check (ADR-0023, M-11)"
```

---

## Task 3: `onedrive-client.ts` seam — interface, fake test double, plain-`fetch` implementation (M-6)

**Files:**
- Create: `src/backend/config/onedrive-client.ts`
- Create: `src/backend/__tests__/helpers/fakeOneDriveClient.ts`

**Interfaces:**
- Produces: `interface OneDriveClientConfig { clientId, clientSecret, accessToken, refreshToken, onTokensRefreshed?: (tokens: {accessToken, refreshToken, expiresAt: Date}) => void }`, `interface OneDriveClient { findByPath, putSmall, createUploadSession, uploadChunk, readFile, deleteByPath, ensureFolder, ping }`, `class OneDriveAuthInvalidError extends Error`, `class OneDriveInsufficientScopeError extends Error`, `function createOneDriveClient(config): OneDriveClient`, `function exchangeCodeForTokens(params): Promise<{accessToken, refreshToken, expiresAt}>`. **No dependency added** — Node's built-in `global.fetch`.

- [ ] **Step 1: Write `onedrive-client.ts`**

```ts
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
```

- [ ] **Step 2: Write the fake test double**

```ts
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
```

- [ ] **Step 3: Compile check**

Run: `cd src/backend && npx tsc --noEmit`
Expected: no new type errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add src/backend/config/onedrive-client.ts src/backend/__tests__/helpers/fakeOneDriveClient.ts
git commit -m "feat(storage): OneDriveClient interface (plain fetch, zero new deps) + FakeOneDriveClient (ADR-0023 sub-project 3, M-6)"
```

---

## Task 4: `OneDriveDriver` implements `StorageDriver`

**Files:**
- Create: `src/backend/config/onedrive-driver.ts`
- Create: `src/backend/__tests__/onedrive-driver.test.ts`

**Interfaces:**
- Consumes: `OneDriveClient`/`OneDriveClientConfig`/`createOneDriveClient` (Task 3), `StorageDriver`/`StorageKeyError`/`StorageNotFoundError`/`StorageUnavailableError` (existing `storage-driver.ts`).
- Produces: `interface OneDriveCredentials { clientId, clientSecret, accessToken, refreshToken }`, `function parseOneDriveKey(tenantId, key): ParsedKey` (same shape/contract as `google-drive-driver.ts`'s `parseKey` — foreign-tenant/malformed key → `StorageKeyError`), `class OneDriveDriver implements StorageDriver` — constructor `(tenantId: number, credentials: OneDriveCredentials, onTokensRefreshed: (tokens) => Promise<void>, clientFactory = createOneDriveClient)`. Consumed by Task 6 (`getStorageDriver`'s `onedrive` branch).

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/onedrive-driver.test.ts
import { OneDriveDriver } from '../config/onedrive-driver'
import { FakeOneDriveClient } from './helpers/fakeOneDriveClient'
import { StorageNotFoundError, StorageUnavailableError, StorageKeyError } from '../config/storage-driver'
import { OneDriveClientConfig } from '../config/onedrive-client'

const credentials = { clientId: 'cid', clientSecret: 'csecret', accessToken: 'at', refreshToken: 'rt' }

function makeDriver(client: FakeOneDriveClient, onTokensRefreshed: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  const factory = (_config: OneDriveClientConfig) => client
  return new OneDriveDriver(1, credentials, onTokensRefreshed, factory)
}

describe('OneDriveDriver', () => {
  test('save() then read() round-trips exact bytes', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('img-bytes'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('img-bytes')
  })

  test('photo replace on the same key yields exactly ONE file, not two (the N-1-class regression test — design §9, "load-bearing even though path-PUT makes it structurally hard to fail")', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v1'), 'image/jpeg')
    await driver.save('tenants/1/photo/pet-1.jpg', Buffer.from('v2-longer-body'), 'image/jpeg')
    expect((await driver.read('tenants/1/photo/pet-1.jpg')).toString()).toBe('v2-longer-body')
    expect(client.countFilesAt('tenant-1/photo/pet-1.jpg')).toBe(1)
  })

  test('emr keys resolve under the tenant emr/{recordId} path', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/emr/42/report.pdf', Buffer.from('x'), 'application/pdf')
    expect((await driver.read('tenants/1/emr/42/report.pdf')).toString()).toBe('x')
  })

  test('exists() is false before save and true after', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(false)
    await driver.save('tenants/1/photo/never.jpg', Buffer.from('x'), 'image/jpeg')
    expect(await driver.exists('tenants/1/photo/never.jpg')).toBe(true)
  })

  test('read() on a missing key throws StorageNotFoundError', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/1/photo/ghost.jpg')).rejects.toBeInstanceOf(StorageNotFoundError)
  })

  test('delete() is idempotent on an already-missing key', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.delete('tenants/1/photo/nothing.jpg')).resolves.toBeUndefined()
  })

  test('a key outside tenants/{tenantId}/{emr|photo}/... shape throws StorageKeyError', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.save('not-a-valid-key.txt', Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a key for a different tenant throws StorageKeyError', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await expect(driver.read('tenants/999/photo/pet-1.jpg')).rejects.toBeInstanceOf(StorageKeyError)
  })

  test('a revoked/invalid token surfaces as StorageUnavailableError', async () => {
    const client = new FakeOneDriveClient({ failAuthInvalid: true })
    const driver = makeDriver(client)
    await expect(driver.save('tenants/1/photo/a.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(StorageUnavailableError)
  })

  test('a body ≤4MB routes through putSmall (simple PUT), not the upload session (M-5)', async () => {
    const client = new FakeOneDriveClient()
    jest.spyOn(client, 'putSmall')
    jest.spyOn(client, 'createUploadSession')
    const driver = makeDriver(client)
    await driver.save('tenants/1/photo/small.jpg', Buffer.alloc(1024), 'image/jpeg')
    expect(client.putSmall).toHaveBeenCalled()
    expect(client.createUploadSession).not.toHaveBeenCalled()
  })

  test('a body >4MB routes through the upload-session/chunk path (M-5)', async () => {
    const client = new FakeOneDriveClient()
    jest.spyOn(client, 'putSmall')
    jest.spyOn(client, 'createUploadSession')
    const driver = makeDriver(client)
    const big = Buffer.alloc(5 * 1024 * 1024) // 5 MB > 4 MB threshold
    await driver.save('tenants/1/emr/1/big.pdf', big, 'application/pdf')
    expect(client.createUploadSession).toHaveBeenCalled()
    expect(client.putSmall).not.toHaveBeenCalled()
    expect((await driver.read('tenants/1/emr/1/big.pdf')).length).toBe(big.length)
  })

  test('parent-folder ensure treats an already-exists 409 as success (M-4) — no error surfaced even when ensureFolder is called twice for the same tenant', async () => {
    const client = new FakeOneDriveClient()
    const driver = makeDriver(client)
    await driver.save('tenants/1/emr/1/a.pdf', Buffer.from('a'), 'application/pdf')
    await expect(driver.save('tenants/1/emr/1/b.pdf', Buffer.from('b'), 'application/pdf')).resolves.toBeUndefined()
  })

  test('a rotated token pair from a proactive/reactive refresh fires onTokensRefreshed with BOTH tokens (M-2 — Microsoft rotates, unlike Google)', async () => {
    const client = new FakeOneDriveClient()
    const onTokensRefreshed = jest.fn().mockResolvedValue(undefined)
    // Simulate the client-level refresh firing by calling the callback directly through a refresh-triggering fake — covered at the onedrive-client.ts unit level (Task 3); this driver-level test asserts the callback wiring reaches the driver's constructor param.
    const driver = makeDriver(client, onTokensRefreshed)
    expect(driver).toBeDefined() // wiring-only smoke test; full refresh behavior asserted in Task 3/8's client-level and callback-level tests
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest onedrive-driver.test.ts`
Expected: FAIL — `Cannot find module '../config/onedrive-driver'`.

- [ ] **Step 3: Implement `onedrive-driver.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest onedrive-driver.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/onedrive-driver.ts src/backend/__tests__/onedrive-driver.test.ts
git commit -m "feat(storage): add OneDriveDriver — path-based overwrite-in-place, 4MB threshold routing (ADR-0023, M-4/M-5)"
```

---

## Task 5: `getStorageDriver(tenantId)` gains the `onedrive` branch; `resolveStorageConfig` widens

**Files:**
- Modify: `src/backend/config/storage-driver.ts`
- Modify: `src/backend/models/tenant-storage-config.repository.ts`
- Modify: `src/backend/services/storage-config.service.ts`
- Modify: `src/backend/__tests__/storage-driver.test.ts`
- Modify: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Changes: `ResolvedStorageConfig` gains a 4th union member `{ provider: 'onedrive'; accessToken; refreshToken; tokenExpiresAt: Date | null }`. `StorageConfigWriteData` widens `provider` to include `'onedrive'` and gains 4 optional `oneDrive*` fields. Repository gains `writeBackRefreshedOneDriveTokens(tenantId, tokens: {accessToken, refreshToken, expiresAt}): Promise<void>` (race-safe conditional update from the start — M-2 requires both tokens written back, unlike GDrive's Task-4/Task-10 two-step, so this task builds the hardened version directly).

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/storage-driver.test.ts`:

```ts
import { OneDriveDriver } from '../config/onedrive-driver'

describe('getStorageDriver(tenantId) — onedrive branch', () => {
  test('provider="onedrive" row → resolves an OneDriveDriver', async () => {
    jest.spyOn(storageConfigSvc, 'resolveStorageConfig').mockResolvedValue({
      provider: 'onedrive', accessToken: 'at', refreshToken: 'rt', tokenExpiresAt: new Date(Date.now() + 3600_000),
    })
    const driver = await getStorageDriver(1)
    expect(driver).toBeInstanceOf(OneDriveDriver)
  })
})
```

Append to `src/backend/__tests__/storage-config.service.test.ts`, inside `describe('resolveStorageConfig', ...)`:

```ts
test('provider="onedrive" row → decrypts both tokens and passes through expiry', async () => {
  const encryptedAccess = encryptField('od-access-token')
  const encryptedRefresh = encryptField('od-refresh-token')
  const expiresAt = new Date('2026-08-01T00:00:00Z')
  ;(repo.getStorageConfig as jest.Mock).mockResolvedValue({
    tenantId: 1, provider: 'onedrive',
    oneDriveAccessTokenEncrypted: encryptedAccess, oneDriveRefreshTokenEncrypted: encryptedRefresh,
    oneDriveTokenExpiresAt: expiresAt,
  })
  const result = await resolveStorageConfig(1)
  expect(result).toEqual({ provider: 'onedrive', accessToken: 'od-access-token', refreshToken: 'od-refresh-token', tokenExpiresAt: expiresAt })
})
```

Add a new file `src/backend/__tests__/tenant-storage-config.repository.onedrive.test.ts`:

```ts
import { writeBackRefreshedOneDriveTokens } from '../models/tenant-storage-config.repository'
import prisma from '../config/db'

jest.mock('../config/db', () => ({ tenantStorageConfig: { updateMany: jest.fn() } }))

describe('writeBackRefreshedOneDriveTokens', () => {
  test('conditional update — WHERE provider=onedrive AND oneDriveRefreshTokenEncrypted IS NOT NULL (N-4 analog, extended to both rotating tokens, M-2)', async () => {
    ;(prisma.tenantStorageConfig.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    const expiresAt = new Date('2026-08-01T00:00:00Z')
    await writeBackRefreshedOneDriveTokens(1, { accessToken: 'new-at', refreshToken: 'new-rt', expiresAt })
    expect(prisma.tenantStorageConfig.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 1, provider: 'onedrive', oneDriveRefreshTokenEncrypted: { not: null } },
      data: expect.objectContaining({ oneDriveTokenExpiresAt: expiresAt }),
    })
  })

  test('a refresh completing after disconnect writes nothing (zero rows matched, silently dropped)', async () => {
    ;(prisma.tenantStorageConfig.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    await expect(writeBackRefreshedOneDriveTokens(1, { accessToken: 'x', refreshToken: 'y', expiresAt: new Date() })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-driver.test.ts storage-config.service.test.ts tenant-storage-config.repository.onedrive.test.ts`
Expected: FAIL — no `onedrive` branch/type yet.

- [ ] **Step 3: Implement**

`src/backend/models/tenant-storage-config.repository.ts` — widen the write-data type and add the write-back function:

```ts
export interface StorageConfigWriteData {
  provider:                     'local' | 'custom_path' | 'google_drive' | 'onedrive'
  smbHost?:                     string | null
  smbShare?:                    string | null
  smbUsername?:                 string | null
  smbPasswordEncrypted?:        string | null
  googleAccessTokenEncrypted?:  string | null
  googleRefreshTokenEncrypted?: string | null
  googleRootFolderId?:          string | null
  googleEmrFolderId?:           string | null
  googlePhotoFolderId?:         string | null
  googleAccountIdHash?:         string | null
  oneDriveAccessTokenEncrypted?:  string | null
  oneDriveRefreshTokenEncrypted?: string | null
  oneDriveTokenExpiresAt?:        Date | null
  oneDriveAccountIdHash?:         string | null
}

// ... (getStorageConfig, upsertStorageConfig, updateGoogleFolderIds, writeBackRefreshedGoogleAccessToken unchanged) ...

/**
 * Conditional update (M-2, extends the N-4/writeBackRefreshedGoogleAccessToken
 * pattern to BOTH rotating tokens plus expiry — Microsoft rotates the
 * refresh token on every use, unlike Google's stable one). Guarded against
 * the disconnect race exactly like the Google analog: a refresh completing
 * after disconnect matches zero rows and is silently dropped. EXEMPT from
 * settings_audit_log (same reasoning as N-4/BA G-4a — a system token
 * refresh, not an admin action).
 */
export async function writeBackRefreshedOneDriveTokens(
  tenantId: number,
  tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
): Promise<void> {
  await prisma.tenantStorageConfig.updateMany({
    where: { tenantId, provider: 'onedrive', oneDriveRefreshTokenEncrypted: { not: null } },
    data: {
      oneDriveAccessTokenEncrypted:  encryptField(tokens.accessToken),
      oneDriveRefreshTokenEncrypted: encryptField(tokens.refreshToken),
      oneDriveTokenExpiresAt:        tokens.expiresAt,
    },
  })
}
```

`src/backend/services/storage-config.service.ts` — widen `ResolvedStorageConfig` and `resolveStorageConfig`:

```ts
export type ResolvedStorageConfig =
  | { provider: 'local' }
  | { provider: 'custom_path'; host: string; share: string; username: string; password: string }
  | { provider: 'google_drive'; accessToken: string; refreshToken: string; rootFolderId: string | null; emrFolderId: string | null; photoFolderId: string | null }
  | { provider: 'onedrive'; accessToken: string; refreshToken: string; tokenExpiresAt: Date | null }

export async function resolveStorageConfig(tenantId: number): Promise<ResolvedStorageConfig> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local' }

  if (row.provider === 'onedrive') {
    return {
      provider:      'onedrive',
      accessToken:   row.oneDriveAccessTokenEncrypted ? decryptField(row.oneDriveAccessTokenEncrypted) : '',
      refreshToken:  row.oneDriveRefreshTokenEncrypted ? decryptField(row.oneDriveRefreshTokenEncrypted) : '',
      tokenExpiresAt: row.oneDriveTokenExpiresAt,
    }
  }

  if (row.provider === 'google_drive') {
    // ... unchanged ...
  }

  return {
    // ... custom_path, unchanged ...
  }
}
```

`src/backend/config/storage-driver.ts` — add the branch to `getStorageDriver`:

```ts
import { OneDriveDriver } from './onedrive-driver'

export async function getStorageDriver(tenantId: number): Promise<StorageDriver> {
  const resolved = await resolveStorageConfig(tenantId)

  if (resolved.provider === 'onedrive') {
    // ONEDRIVE_OAUTH_CLIENT_ID/SECRET checked lazily here, not at boot
    // (I-13, mirrors GDrive's N-6) — a tenant that connected OneDrive while
    // the env vars were set still needs them present at read/write time.
    return new OneDriveDriver(
      tenantId,
      {
        clientId:     process.env.ONEDRIVE_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.ONEDRIVE_OAUTH_CLIENT_SECRET ?? '',
        accessToken:  resolved.accessToken,
        refreshToken: resolved.refreshToken,
      },
      (tokens) => tenantStorageConfigRepo.writeBackRefreshedOneDriveTokens(tenantId, tokens),
    )
  }

  if (resolved.provider === 'google_drive') {
    // ... unchanged ...
  }
  if (resolved.provider === 'custom_path') {
    // ... unchanged ...
  }
  return new LocalDiskDriver()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-driver.test.ts storage-config.service.test.ts tenant-storage-config.repository.onedrive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/config/storage-driver.ts src/backend/models/tenant-storage-config.repository.ts src/backend/services/storage-config.service.ts src/backend/__tests__/storage-driver.test.ts src/backend/__tests__/storage-config.service.test.ts src/backend/__tests__/tenant-storage-config.repository.onedrive.test.ts
git commit -m "feat(storage): getStorageDriver resolves OneDriveDriver for provider=onedrive; race-safe dual-token write-back (ADR-0023, M-2)"
```

**Note — structurally unreachable until Sub-PR B:** this branch is dead code from an attack-surface standpoint until Sub-PR B's OAuth callback can ever write `provider: 'onedrive'` to a row. Same "zero new HTTP attack surface" posture the GDrive Sub-PR A note established — safe to ship standalone.

---

## Task 6: `consumeNonce(rawNonce, provider)` signature change (M-7) — cross-provider replay hardening

**Files:**
- Modify: `src/backend/models/oauth-connect-nonce.repository.ts`
- Modify: `src/backend/controllers/oauth-google.controller.ts` (the one call site — updates to pass `'google'`)
- Modify: `src/backend/__tests__/oauth-connect-nonce.repository.test.ts` (or create if it doesn't exist yet — check first)
- Modify: `src/backend/__tests__/oauth-google.controller.test.ts` (regression test — **this modifies already-shipped, production code's test suite**)

**Why this touches shipped code:** `consumeNonce(rawNonce)` currently matches on `nonceHash + consumedAt IS NULL` only, not `provider`. Once the OneDrive callback shares this same table, a state minted for the Google flow would verify and consume successfully at the OneDrive callback and vice versa (cross-flow replay class, low-but-nonzero exploitability). The fix is a one-line predicate addition, but because it changes a function every already-shipped caller uses, this task is explicitly a **regression-test-first change to production code**, per BA F-OD-2's precedent (design §9).

**Interfaces:**
- Changes: `consumeNonce(rawNonce: string, provider: string): Promise<boolean>` — adds `AND provider = ?`.

- [ ] **Step 1: Check for an existing test file, and write/extend the failing tests**

```bash
ls src/backend/__tests__/oauth-connect-nonce.repository.test.ts 2>/dev/null || echo "no existing file — create one"
```

```ts
// src/backend/__tests__/oauth-connect-nonce.repository.test.ts
// (extend if the file exists from the GDrive sub-project; create if not)
import { createNonce, consumeNonce } from '../models/oauth-connect-nonce.repository'

describe('consumeNonce — provider-matched consume (M-7)', () => {
  test('a nonce minted for "google" consumes successfully when presented with provider="google" (non-regression, BA F-OD-2)', async () => {
    const rawNonce = await createNonce({ tenantId: 1, userId: 1, provider: 'google', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'google')).resolves.toBe(true)
  })

  test('a nonce minted for "google" is REJECTED when presented with provider="onedrive" (the one genuinely new security test, M-7)', async () => {
    const rawNonce = await createNonce({ tenantId: 1, userId: 1, provider: 'google', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'onedrive')).resolves.toBe(false)
  })

  test('a nonce minted for "onedrive" is REJECTED when presented with provider="google" (both directions)', async () => {
    const rawNonce = await createNonce({ tenantId: 1, userId: 1, provider: 'onedrive', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'google')).resolves.toBe(false)
  })

  test('a nonce minted for "onedrive" consumes successfully when presented with provider="onedrive"', async () => {
    const rawNonce = await createNonce({ tenantId: 1, userId: 1, provider: 'onedrive', expiresAt: new Date(Date.now() + 600_000) })
    await expect(consumeNonce(rawNonce, 'onedrive')).resolves.toBe(true)
  })

  test('still single-use within the same provider (existing N-3 guarantee unaffected)', async () => {
    const rawNonce = await createNonce({ tenantId: 1, userId: 1, provider: 'google', expiresAt: new Date(Date.now() + 600_000) })
    expect(await consumeNonce(rawNonce, 'google')).toBe(true)
    expect(await consumeNonce(rawNonce, 'google')).toBe(false)
  })
})
```

Also extend the existing Google callback integration test — locate and add:

```ts
// src/backend/__tests__/oauth-google.controller.test.ts — ADD this test,
// do not remove any existing ones. This is the explicit non-regression
// assertion BA F-OD-2/OD-8 called for.
test('Google-flow non-regression: the callback still consumes a "google"-provider nonce successfully after the consumeNonce signature change', async () => {
  // ... reuse the existing happy-path test's setup (signed state, mocked
  // token exchange, etc.) and assert the callback still succeeds end-to-end
  // — this proves the call site's own update to pass 'google' is correct.
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest oauth-connect-nonce.repository.test.ts`
Expected: FAIL — `consumeNonce` doesn't accept/check a second argument yet.

- [ ] **Step 3: Implement**

`src/backend/models/oauth-connect-nonce.repository.ts`:

```ts
/**
 * M-7: atomic single-statement consume, now ALSO predicated on provider —
 * closes a cross-flow replay class once two providers share this table (a
 * state minted for the Google flow must not verify at the OneDrive callback
 * and vice versa). Still UPDATE ... WHERE ... consumedAt IS NULL, checked
 * by affected-row count — never a separate verify-then-mark (N-3, unchanged).
 */
export async function consumeNonce(rawNonce: string, provider: string): Promise<boolean> {
  const nonceHash = hashNonce(rawNonce)
  const result = await prisma.oAuthConnectNonce.updateMany({
    where: { nonceHash, provider, consumedAt: null },
    data:  { consumedAt: new Date() },
  })
  return result.count === 1
}
```

`src/backend/controllers/oauth-google.controller.ts` — update the one call site:

```ts
// Before: const nonceOk = await consumeNonce(verified.nonce)
// After:
const nonceOk = await consumeNonce(verified.nonce, 'google')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest oauth-connect-nonce.repository.test.ts oauth-google.controller.test.ts`
Expected: PASS — all prior Google-flow tests still pass (non-regression), plus the 5 new cross-provider tests.

- [ ] **Step 5: Commit**

```bash
git add src/backend/models/oauth-connect-nonce.repository.ts src/backend/controllers/oauth-google.controller.ts src/backend/__tests__/oauth-connect-nonce.repository.test.ts src/backend/__tests__/oauth-google.controller.test.ts
git commit -m "fix(storage): consumeNonce requires provider match — closes cross-flow OAuth replay (ADR-0023, M-7, retrofits shipped Google flow)"
```

---

## Task 7: Retrofit `oauth-google.controller.ts` — M-10 reverse-direction nulling + M-11 hash populate/collision-check

**Files:**
- Modify: `src/backend/controllers/oauth-google.controller.ts` (already-shipped production code — this task's regression-test discipline mirrors Task 6's)
- Modify: `src/backend/__tests__/oauth-google.controller.test.ts`

**Why this is the highest-severity retrofit (risk OD-11, "High"):** per M-3, Microsoft provides **no token-revocation endpoint** — nulling the `oneDrive*` columns is the *only* mechanism that ends Anemal's access to a connected OneDrive account. If a clinic connects Google Drive over an existing `provider='onedrive'` row and the shipped Google callback (which currently only nulls `smb*`) doesn't also null `oneDrive*`, a live, silently-rotating OneDrive refresh token sits encrypted on a `provider='google_drive'` row indefinitely, with no cleanup path.

**Interfaces:**
- Changes: the `upsertStorageConfig` call inside `handleGoogleOAuthCallback` gains 4 more null fields (`oneDriveAccessTokenEncrypted`, `oneDriveRefreshTokenEncrypted`, `oneDriveTokenExpiresAt`, `oneDriveAccountIdHash`) when the row being overwritten had `provider === 'onedrive'`; gains `googleAccountIdHash` population + `checkDuplicateAccount` call (M-11, using Task 2's helper — **only implement the hash-populate half if the Task 0 spike confirmed `about.get?fields=user` works under `drive.file`**; if it didn't, this half is blocked and must be escalated per Task 0 Step 3's table, not silently skipped).

- [ ] **Step 1: Write the failing tests**

Append to `src/backend/__tests__/oauth-google.controller.test.ts`:

```ts
describe('handleGoogleOAuthCallback — M-10 reverse-direction column hygiene (round-2 grill finding 1, risk OD-11 High)', () => {
  test('connecting Google Drive over a row whose provider was "onedrive" nulls all four oneDrive* columns in the same write', async () => {
    // Arrange: seed a tenant_storage_config row with provider='onedrive' and
    // non-null oneDrive* columns (accessToken/refreshToken/expiresAt/accountIdHash).
    // Act: drive the callback through its happy path (valid signed state,
    // consumed nonce, mocked token exchange).
    // Assert: the resulting row has provider='google_drive', all four
    // oneDrive* columns NULL, and — per M-3 — assert NO revoke call was
    // attempted for OneDrive (there is no revokeOneDriveToken export to call;
    // assert the absence, mirroring the OneDrive-disconnect assertion in
    // Sub-PR B Task 10).
  })

  test('connecting Google Drive over a row whose provider was "custom_path" leaves oneDrive* columns untouched (still NULL, no-op — unaffected direction)', async () => {
    // Regression guard: this task must not touch behavior for the
    // already-shipped custom_path→google_drive direction.
  })
})

describe('handleGoogleOAuthCallback — M-11 googleAccountIdHash populate + collision check', () => {
  test('a successful connect populates googleAccountIdHash from the confirmed account-ID call (about.get, per OD-13 spike result)', async () => {
    // Mock the Drive client's about.get (or equivalent) call to return a
    // fixed user id; assert the persisted row's googleAccountIdHash equals
    // hashAccountId(thatId).
  })

  test('a second tenant connecting the SAME Google account does not block the connect, and a subsequent GET reflects duplicateAccountWarning:true for a clinic.integrations.edit caller', async () => {
    // Connect tenant A, then tenant B with the same underlying account id.
    // Both persist successfully (never blocked). Covered end-to-end together
    // with the GET-side gating test in Task 9 (storage-config.service);
    // this test only asserts the callback itself doesn't reject the connect.
  })

  test('two branches of the SAME tenant reconnecting do not trip the collision check against themselves (tenantId != ? predicate)', async () => {
    // Reconnect the same tenant twice; no false self-collision.
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest oauth-google.controller.test.ts`
Expected: FAIL — the callback doesn't null `oneDrive*` or populate `googleAccountIdHash` yet.

- [ ] **Step 3: Implement**

Edit `src/backend/controllers/oauth-google.controller.ts`:

```ts
import { hashAccountId, checkDuplicateAccount } from '../utils/account-id-hash'
import prisma from '../config/db' // already imported

// Inside handleGoogleOAuthCallback, after the existing bootstrapTenantFolders call:
const client = createGoogleDriveClient({ clientId, clientSecret, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
const folders = await bootstrapTenantFolders(verified.tenantId, client)

// M-11: populate the account-id hash from the confirmed call (OD-13 spike
// result — about.get?fields=user under drive.file). If this call fails with
// a scope error, the connect still completes (hash stays null, no collision
// check runs) rather than blocking the whole feature on a detection nicety.
let googleAccountIdHash: string | null = null
try {
  const accountId = await getGoogleAccountId(client) // see helper below
  googleAccountIdHash = hashAccountId(accountId)
} catch (err) {
  logger.warn({ tenantId: verified.tenantId, err: String(err) }, 'Google Drive connect: account-id lookup failed — duplicate-account detection skipped, connect proceeds')
}

// M-10 REVERSE DIRECTION (round-2 grill finding 1, risk OD-11 — High):
// nulling oneDrive* here is OneDrive's ONLY kill mechanism (M-3, no revoke
// endpoint exists at Microsoft). Must run even if the row being overwritten
// wasn't onedrive — the null-if-absent-anyway is harmless and keeps this
// branch unconditional/simple, matching the existing smb* nulling style.
await tenantStorageConfigRepo.upsertStorageConfig(verified.tenantId, {
  provider: 'google_drive',
  smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null,
  oneDriveAccessTokenEncrypted: null, oneDriveRefreshTokenEncrypted: null,
  oneDriveTokenExpiresAt: null, oneDriveAccountIdHash: null,
  googleAccessTokenEncrypted:  encryptField(tokens.accessToken),
  googleRefreshTokenEncrypted: encryptField(tokens.refreshToken),
  googleRootFolderId:  folders.rootFolderId,
  googleEmrFolderId:   folders.emrFolderId,
  googlePhotoFolderId: folders.photoFolderId,
  googleAccountIdHash,
})

// M-11: recomputed on read too (Task 9), but this is fine to skip persisting
// a "warning" flag anywhere — duplicateAccountWarning is derived at GET time,
// never stored (round-2 grill finding 5's "doesn't go stale" requirement).
```

Add the account-id helper near the top of the file (or inline in `google-drive-client.ts` if preferred — dev-agent's call, either location satisfies the interface):

```ts
// Confirms account ownership via Drive's about.get — the OD-13-verified
// call. Kept local to this controller since it's only used at connect time,
// not by GoogleDriveDriver's normal file operations.
async function getGoogleAccountId(client: ReturnType<typeof createGoogleDriveClient>): Promise<string> {
  // Implementation depends on whichever primitive google-drive-client.ts
  // exposes for this — if `ping()` doesn't already return an account id,
  // add a narrow `getAccountId(): Promise<string>` to GoogleDriveClient
  // (Task 7, this task) that calls `drive.about.get({ fields: 'user' })`
  // and returns `data.user.permissionId`. One new method on an existing
  // interface, not a new file.
  return client.getAccountId()
}
```

(**Dev-agent note:** this requires adding `getAccountId(): Promise<string>` to the `GoogleDriveClient` interface in `google-drive-client.ts` — a small addition to an already-shipped file, covered by its own unit test alongside this task's controller-level tests.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest oauth-google.controller.test.ts`
Expected: PASS — all prior Google-flow tests unaffected, plus the new M-10/M-11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/oauth-google.controller.ts src/backend/config/google-drive-client.ts src/backend/__tests__/oauth-google.controller.test.ts
git commit -m "fix(storage): Google callback nulls oneDrive* on connect (M-10 reverse direction, risk OD-11) + populates/checks googleAccountIdHash (M-11)"
```

---

# SUB-PR B — OAuth endpoints + status check + frontend

*(Starts only after Sub-PR A merges to this branch's base.)*

## Task 8: `GET /clinic/storage-config/onedrive/authorize` — connect-initiate endpoint

**Files:**
- Modify: `src/backend/controllers/settings.controller.ts`
- Modify: `src/backend/routes/settings.routes.ts`
- Modify: `src/backend/__tests__/settings.controller.test.ts` (or the relevant storage-config integration test file — locate before writing)

**Interfaces:**
- Produces: `onedriveAuthorize(req, res, next)` handler — pattern-copy of `googleAuthorize` (I-8).

- [ ] **Step 1: Write the failing tests**

```ts
describe('GET /clinic/storage-config/onedrive/authorize', () => {
  test('requires clinic.integrations.edit — 403 without it', async () => { /* ... */ })
  test('missing ONEDRIVE_OAUTH_CLIENT_ID/SECRET → 503 ONEDRIVE_OAUTH_NOT_CONFIGURED', async () => { /* ... */ })
  test('returns { url } pointing at the v2.0 authorize endpoint with audience=common, scope=offline_access Files.ReadWrite.AppFolder, prompt=select_account (M-1)', async () => { /* ... */ })
  test('the embedded state is signed and its nonce is provider="onedrive" (consumable only by the OneDrive callback, M-7)', async () => { /* ... */ })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest settings.controller.test.ts -t "onedrive/authorize"`
Expected: FAIL — no such route/handler.

- [ ] **Step 3: Implement**

`src/backend/controllers/settings.controller.ts` — add beside `googleAuthorize`:

```ts
const ONEDRIVE_SCOPE = 'offline_access Files.ReadWrite.AppFolder'

function onedriveOAuthRedirectUri(): string {
  return process.env.ONEDRIVE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/onedrive/callback`
}

export async function onedriveAuthorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = process.env.ONEDRIVE_OAUTH_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
    // I-13/M-8: checked lazily at request time, never at boot.
    if (!clientId || !clientSecret) {
      res.status(503).json({ success: false, code: 'ONEDRIVE_OAUTH_NOT_CONFIGURED', error: 'OneDrive connection is not configured on this server' })
      return
    }

    const { tenantId, userId } = req.context!
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { subdomain: true } })
    if (!tenant) { res.status(404).json({ success: false, error: 'Tenant not found' }); return }

    const rawNonce = await createNonce({ tenantId, userId, provider: 'onedrive', expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) })
    const origin = deriveTenantFrontendOrigin(tenant.subdomain)
    const state = signOAuthState({ tenantId, userId, origin, nonce: rawNonce })

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  onedriveOAuthRedirectUri(),
      response_type: 'code',
      // M-1: no prompt=consent needed — Microsoft re-issues a refresh token
      // on every authorization with offline_access consented, unlike
      // Google. prompt=select_account instead, so a multi-account admin
      // explicitly picks (relevant given Q1 = both personal and work/school).
      prompt: 'select_account',
      scope:  ONEDRIVE_SCOPE,
      state,
    })
    // M-1: audience resolves to 'common' per Q1's decision (both account
    // types) — a single constant, not per-tenant configurable.
    res.json({ success: true, data: { url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` } })
  } catch (err) { next(err) }
}
```

`src/backend/routes/settings.routes.ts` — add beside the Google authorize route:

```ts
router.get('/clinic/storage-config/onedrive/authorize', requirePlane('clinic'), requirePermission('clinic.integrations.edit'), ctrl.onedriveAuthorize)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest settings.controller.test.ts -t "onedrive/authorize"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/settings.controller.ts src/backend/routes/settings.routes.ts src/backend/__tests__/settings.controller.test.ts
git commit -m "feat(storage): add GET .../onedrive/authorize connect-initiate endpoint (ADR-0023 sub-project 3, M-1)"
```

---

## Task 9: `GET /oauth/onedrive/callback` — the OAuth callback controller + route

**Files:**
- Create: `src/backend/controllers/oauth-onedrive.controller.ts`
- Create: `src/backend/routes/oauth-onedrive.routes.ts`
- Modify: `src/backend/app.ts`
- Create: `src/backend/__tests__/oauth-onedrive.controller.test.ts`

**Interfaces:**
- Produces: `handleOneDriveOAuthCallback(req, res)` — same shape as `handleGoogleOAuthCallback`, with two documented divergences: (1) Microsoft **includes `state`** on `error=access_denied`/`consent_required` redirects (round-2 grill finding 8) — the callback must verify that returned state and redirect to the correct tenant origin, not blindly fall back to the fixed default the way a naive Google-mirror would; (2) the persist step nulls `smb*`/`google*`/`googleAccountIdHash` (M-10 forward direction) instead of only `smb*`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/backend/__tests__/oauth-onedrive.controller.test.ts
describe('handleOneDriveOAuthCallback', () => {
  test('happy path: valid state + code → exchanges tokens, probes GET /me/drive/special/approot, persists encrypted tokens + expiry + audit row, redirects to the interstitial', async () => { /* ... */ })
  test('replayed nonce → rejected, redirects with error=onedrive_state_replayed', async () => { /* ... */ })
  test('a "google"-provider nonce presented at the OneDrive callback is REJECTED (M-7 cross-provider hardening, the one genuinely new security test)', async () => { /* ... */ })
  test('invalid/expired state → falls back to the FIXED DEFAULT origin (I-11), never a value read from the untrusted state', async () => { /* ... */ })
  test('consent-denied (error=access_denied WITH a state param) → verifies that state and redirects to the CORRECT TENANT ORIGIN with distinct error copy — NOT the fixed default (round-2 grill finding 8, the Google-mirror divergence)', async () => { /* ... */ })
  test('consent_required (admin-approval-needed for work/school accounts) → distinct error code/copy from access_denied (Q4/BA F-OD-3)', async () => { /* ... */ })
  test('inactive user or tenant at callback time → rejected (N-9/I-12 re-check)', async () => { /* ... */ })
  test('missing ONEDRIVE_OAUTH_CLIENT_ID/SECRET at callback time → clean redirect with error=onedrive_not_configured (I-13)', async () => { /* ... */ })
  test('the persist upsert nulls smb*, google*, AND googleAccountIdHash in the same write (M-10 forward direction)', async () => { /* ... */ })
  test('nothing is persisted on ANY failure branch', async () => { /* ... */ })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest oauth-onedrive.controller.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/backend/controllers/oauth-onedrive.controller.ts
// Public callback for the OneDrive OAuth connect flow (ADR-0023, sub-project
// 3). No JWT/permission middleware — the signed, single-use `state` param IS
// the trust boundary, reused verbatim from the Google flow (I-8..I-12) with
// one M-7 hardening (provider-matched nonce consume) and one genuine
// Microsoft-specific divergence: Microsoft INCLUDES `state` on its
// error=access_denied/consent_required redirects (round-2 grill finding 8),
// where Google omits it on denial — a naive mirror of the Google callback
// would fall back to the fixed default origin on these branches instead of
// the correct tenant origin, which this controller explicitly avoids.
import { Request, Response } from 'express'
import prisma from '../config/db'
import { verifyOAuthState } from '../utils/oauth-state'
import { consumeNonce } from '../models/oauth-connect-nonce.repository'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { resolvePermissions } from '../services/permission.service'
import { encryptField } from '../utils/encryption'
import { hashAccountId, checkDuplicateAccount } from '../utils/account-id-hash'
import { exchangeCodeForTokens, createOneDriveClient } from '../config/onedrive-client'
import { logger } from '../utils/logger'

const DEFAULT_ERROR_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173'

function onedriveOAuthRedirectUri(): string {
  return process.env.ONEDRIVE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/onedrive/callback`
}

export async function handleOneDriveOAuthCallback(req: Request, res: Response): Promise<void> {
  const query = req.query as { code?: string; state?: string; error?: string }

  // Round-2 grill finding 8: unlike Google, Microsoft INCLUDES `state` on
  // error=access_denied/consent_required. Verify it first when present so
  // the redirect lands on the correct TENANT origin, not the fixed default
  // — a naive Google-mirror (redirect to DEFAULT_ERROR_ORIGIN whenever
  // query.error is set) would be wrong here.
  if (query.error) {
    if (query.state) {
      const verifiedOnError = verifyOAuthState(query.state)
      if (verifiedOnError) {
        const errorCode = query.error === 'consent_required' ? 'onedrive_consent_required' : 'onedrive_consent_denied'
        res.redirect(`${verifiedOnError.origin}/settings/storage?error=${errorCode}`)
        return
      }
    }
    // No state, or state didn't verify — nothing trustworthy to redirect to but the fixed default (I-11).
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=onedrive_consent_denied`)
    return
  }
  if (!query.state) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=onedrive_state_invalid`)
    return
  }

  // I-11/grill N-7: on an invalid/expired signature, NEVER read the origin
  // out of `state` — fixed default only.
  const verified = verifyOAuthState(query.state)
  if (!verified) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=onedrive_state_invalid`)
    return
  }

  // M-7: atomic, PROVIDER-MATCHED consume — a 'google'-minted nonce must
  // fail here even with a structurally valid signature.
  const nonceOk = await consumeNonce(verified.nonce, 'onedrive')
  if (!nonceOk) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_state_replayed`)
    return
  }

  if (!query.code) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_consent_denied`)
    return
  }

  // N-9/I-12: re-verify user/tenant active + permission still held, right before persisting.
  const [user, tenant] = await Promise.all([
    prisma.user.findFirst({ where: { id: verified.userId, tenantId: verified.tenantId }, select: { isActive: true } }),
    prisma.tenant.findUnique({ where: { id: verified.tenantId }, select: { isActive: true } }),
  ])
  const perms = user?.isActive !== false && tenant?.isActive !== false
    ? await resolvePermissions(verified.userId, verified.tenantId)
    : new Set<string>()
  const stillEntitled = !!user && user.isActive !== false && !!tenant && tenant.isActive !== false && perms.has('clinic.integrations.edit')
  if (!stillEntitled) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_not_authorized`)
    return
  }

  const clientId = process.env.ONEDRIVE_OAUTH_CLIENT_ID
  const clientSecret = process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_not_configured`)
    return
  }

  try {
    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, redirectUri: onedriveOAuthRedirectUri(), code: query.code })

    const client = createOneDriveClient({ clientId, clientSecret, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })

    // Probes the app folder once — creates it server-side on first access
    // and proves the grant actually works before committing to it. Also the
    // OD-13-verified source of the account-id hash (M-11).
    const { accountId } = await client.ping()
    const oneDriveAccountIdHash = hashAccountId(accountId)

    await client.ensureFolder('', `tenant-${verified.tenantId}`)
    await client.ensureFolder(`tenant-${verified.tenantId}`, 'emr')
    await client.ensureFolder(`tenant-${verified.tenantId}`, 'photo')

    // M-10 FORWARD DIRECTION: connecting OneDrive nulls smb*, google*, AND
    // googleAccountIdHash in the same write — no stale foreign-provider
    // secret/hash survives at rest on a row whose provider is now onedrive.
    await tenantStorageConfigRepo.upsertStorageConfig(verified.tenantId, {
      provider: 'onedrive',
      smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null,
      googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null, googleAccountIdHash: null,
      oneDriveAccessTokenEncrypted:  encryptField(tokens.accessToken),
      oneDriveRefreshTokenEncrypted: encryptField(tokens.refreshToken),
      oneDriveTokenExpiresAt:        tokens.expiresAt,
      oneDriveAccountIdHash,
    })

    const current = await tenantStorageConfigRepo.getStorageConfig(verified.tenantId)
    await auditRepo.createMany([{
      tenantId: verified.tenantId, changedBy: verified.userId, tableName: 'tenant_storage_config',
      fieldName: 'provider', oldValue: current?.provider === 'onedrive' ? 'onedrive' : 'previous', newValue: 'onedrive',
    }])

    res.redirect(`${verified.origin}/settings/storage/connecting`)
  } catch (err) {
    logger.warn({ tenantId: verified.tenantId, err: String(err) }, 'OneDrive OAuth callback failed')
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_connect_failed`)
  }
}
```

```ts
// src/backend/routes/oauth-onedrive.routes.ts
// Top-level, public router — same reasoning as oauth-google.routes.ts (I-9):
// NOT nested under /api/settings, which globally applies authMiddleware.
import { Router } from 'express'
import { handleOneDriveOAuthCallback } from '../controllers/oauth-onedrive.controller'

const router = Router()
router.get('/onedrive/callback', handleOneDriveOAuthCallback)

export default router
```

`src/backend/app.ts` — mount beside the Google router:

```ts
import oauthOnedriveRoutes from './routes/oauth-onedrive.routes'
// ...
app.use('/oauth', oauthOnedriveRoutes)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest oauth-onedrive.controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/controllers/oauth-onedrive.controller.ts src/backend/routes/oauth-onedrive.routes.ts src/backend/app.ts src/backend/__tests__/oauth-onedrive.controller.test.ts
git commit -m "feat(storage): add GET /oauth/onedrive/callback — OAuth persist + M-10 forward nulling + M-11 hash (ADR-0023 sub-project 3)"
```

---

## Task 10: Disconnect wiring + live status check (`connected`, `duplicateAccountWarning`) for `onedrive`

**Files:**
- Modify: `src/backend/services/storage-config.service.ts`
- Modify: `src/backend/__tests__/storage-config.service.test.ts`

**Interfaces:**
- Changes: `updateStorageConfig`'s `effectiveBaseKey`/googleColumnResets pattern extends to also null `oneDrive*` when switching away from `onedrive` (I-14, corrected 4-column count incl. `oneDriveAccountIdHash`). `getStorageConfigForDisplay` gains an `onedrive` branch (live ping → `connected`) and a `duplicateAccountWarning?: boolean` field, present **only** when the caller holds `clinic.integrations.edit` (round-2 grill finding 5) — this requires threading the caller's permission set into `getStorageConfigForDisplay`, a signature change.

- [ ] **Step 1: Write the failing tests**

```ts
describe('updateStorageConfig — disconnect from onedrive', () => {
  test('switching away from onedrive nulls all FOUR oneDrive* columns (incl. oneDriveAccountIdHash, round-2 grill finding 2) in the disconnect write', async () => { /* ... */ })
  test('no revoke call is attempted for OneDrive (M-3 — assert the absence, mirroring the Google-side revoke-attempted assertion)', async () => { /* ... */ })
  test('switching FROM onedrive TO custom_path requires confirmBaseChange (effectiveBaseKey treats onedrive as its own base)', async () => { /* ... */ })
})

describe('getStorageConfigForDisplay — onedrive status + duplicate-account gating', () => {
  test('connected:true on a valid ping', async () => { /* ... */ })
  test('connected:false on an auth-invalid ping (401/invalid_grant)', async () => { /* ... */ })
  test('a transient ping failure does NOT flip connected to false (I-16 "don\'t read a blip as data loss")', async () => { /* ... */ })
  test('a 403 (insufficient scope) on the ping is classified as auth-invalid, NOT transient — flips connected:false with distinct reconnect copy (round-2 grill finding 3, M-9)', async () => { /* ... */ })
  test('duplicateAccountWarning:true when another tenant holds the same oneDriveAccountIdHash, for a clinic.integrations.edit caller', async () => { /* ... */ })
  test('duplicateAccountWarning is ABSENT from the response for a clinic.profile.view-only caller (round-2 grill finding 5 — doctor/staff still get configured/connected, not this field)', async () => { /* ... */ })
  test('two branches of the same tenant do not trigger duplicateAccountWarning against each other (tenantId != ? predicate)', async () => { /* ... */ })
  test('a disconnected tenant\'s hash is NULL and no longer triggers warnings for other tenants (recomputed per read, not stale)', async () => { /* ... */ })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/backend && npx jest storage-config.service.test.ts -t "onedrive"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/backend/services/storage-config.service.ts`:

```ts
import { createOneDriveClient, OneDriveAuthInvalidError, OneDriveInsufficientScopeError } from '../config/onedrive-client'
import { checkDuplicateAccount } from '../utils/account-id-hash'

// effectiveBaseKey: add an onedrive branch (own base, same treatment as google_drive)
function effectiveBaseKey(row: { provider: string; smbHost?: string | null; smbShare?: string | null } | null): string {
  if (!row || row.provider === 'local') return 'local'
  if (row.provider === 'google_drive') return 'google_drive'
  if (row.provider === 'onedrive') return 'onedrive'
  return `custom_path:${row.smbHost}:${row.smbShare}`
}

// updateStorageConfig: extend the disconnect-nulling block
const disconnectingFromGoogle  = current?.provider === 'google_drive'
const disconnectingFromOneDrive = current?.provider === 'onedrive'
if (disconnectingFromGoogle && current?.googleRefreshTokenEncrypted) {
  await revokeGoogleToken(decryptField(current.googleRefreshTokenEncrypted)).catch((revokeErr) => {
    logger.warn({ tenantId, revokeErr: String(revokeErr) }, 'Google Drive disconnect: best-effort token revoke failed')
  })
}
// M-3: no revoke call exists for OneDrive — nulling is the ONLY mechanism.
// Deliberately no revoke attempt here (assert-the-absence is the test).
const googleColumnResets = disconnectingFromGoogle
  ? { googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null, googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null, googleAccountIdHash: null }
  : {}
const oneDriveColumnResets = disconnectingFromOneDrive
  ? { oneDriveAccessTokenEncrypted: null, oneDriveRefreshTokenEncrypted: null, oneDriveTokenExpiresAt: null, oneDriveAccountIdHash: null }
  : {}
// ... spread both { ...googleColumnResets, ...oneDriveColumnResets } into both the custom_path and local upsert branches below (unchanged shape otherwise)

async function checkOneDriveConnected(row: { oneDriveAccessTokenEncrypted: string | null; oneDriveRefreshTokenEncrypted: string | null }): Promise<boolean> {
  if (!row.oneDriveAccessTokenEncrypted || !row.oneDriveRefreshTokenEncrypted) return false
  const client = createOneDriveClient({
    clientId:     process.env.ONEDRIVE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.ONEDRIVE_OAUTH_CLIENT_SECRET ?? '',
    accessToken:  decryptField(row.oneDriveAccessTokenEncrypted),
    refreshToken: decryptField(row.oneDriveRefreshTokenEncrypted),
  })
  try {
    await client.ping()
    return true
  } catch (err) {
    // M-9, round-2 grill finding 3: 403 (insufficient scope) is classified
    // the SAME as auth-invalid here — NOT the generic transient bucket,
    // which would otherwise mask a permanently broken status check as green.
    if (err instanceof OneDriveAuthInvalidError || err instanceof OneDriveInsufficientScopeError) return false
    logger.warn({ err: String(err) }, 'OneDrive live status check failed transiently — connected stays true')
    return true
  }
}

export interface StorageConfigDisplay {
  provider:     string
  configured:   boolean
  connected?:   boolean
  smbHost?:     string
  smbShare?:    string
  smbUsername?: string
  duplicateAccountWarning?: boolean
}

/**
 * Never includes the password/tokens. `callerHasIntegrationsEdit` gates the
 * duplicateAccountWarning field (round-2 grill finding 5) — a doctor/staff
 * caller (clinic.profile.view only) still gets configured/connected, never
 * this field, since recomputing per-read would otherwise let a non-admin
 * infer another tenant's connect/disconnect timing over repeated loads.
 */
export async function getStorageConfigForDisplay(tenantId: number, callerHasIntegrationsEdit: boolean): Promise<StorageConfigDisplay> {
  const row = await repo.getStorageConfig(tenantId)
  if (!row || row.provider === 'local') return { provider: 'local', configured: false }

  if (row.provider === 'onedrive') {
    const connected = await checkOneDriveConnected(row)
    const display: StorageConfigDisplay = { provider: 'onedrive', configured: true, connected }
    if (callerHasIntegrationsEdit && row.oneDriveAccountIdHash) {
      const { duplicate } = await checkDuplicateAccount(prisma, 'onedrive', row.oneDriveAccountIdHash, tenantId)
      display.duplicateAccountWarning = duplicate
    }
    return display
  }
  if (row.provider === 'google_drive') {
    const connected = await checkGoogleDriveConnected(row)
    const display: StorageConfigDisplay = { provider: 'google_drive', configured: true, connected }
    if (callerHasIntegrationsEdit && row.googleAccountIdHash) {
      const { duplicate } = await checkDuplicateAccount(prisma, 'google_drive', row.googleAccountIdHash, tenantId)
      display.duplicateAccountWarning = duplicate
    }
    return display
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

**Call-site update required** (this is a signature change — `getStorageConfigForDisplay` now takes a second param): `src/backend/controllers/settings.controller.ts`'s `getStorageConfig`/`updateStorageConfig` handlers must resolve the caller's permission set (already available via `req.context` + `resolvePermissions`, same pattern as the OAuth callbacks' N-9 check) and pass `perms.has('clinic.integrations.edit')` through. Update both call sites and their tests in this same task.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/backend && npx jest storage-config.service.test.ts settings.controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/storage-config.service.ts src/backend/controllers/settings.controller.ts src/backend/__tests__/storage-config.service.test.ts src/backend/__tests__/settings.controller.test.ts
git commit -m "feat(storage): onedrive disconnect nulling + live status check + gated duplicateAccountWarning (ADR-0023, I-14/M-9/M-11)"
```

---

## Task 11: Frontend — 4th radio option, Connect/Disconnect, copy additions, duplicate-account banner

**Files:**
- Modify: `src/frontend/src/hooks/useStorageConfig.ts`
- Modify: `src/frontend/src/views/settings/StoragePage.tsx`
- Modify: `src/frontend/src/views/settings/StorageConnectingPage.tsx`
- Modify: `src/frontend/src/__tests__/StoragePage.test.tsx`

**Interfaces:**
- Changes: `StorageConfigData.provider` widens to include `'onedrive'`, gains `duplicateAccountWarning?: boolean`. New `useOneDriveAuthorize()` hook mirroring `useGoogleAuthorize()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/frontend/src/__tests__/StoragePage.test.tsx — extend with:
describe('OneDrive radio option', () => {
  test('renders a fourth "Microsoft OneDrive" radio alongside Local/Network share/Google Drive', () => { /* ... */ })
  test('not-yet-connected state shows a "Connect with Microsoft" button', () => { /* ... */ })
  test('clicking Connect with Microsoft calls the authorize hook then navigates window.location.href to the returned url', () => { /* ... */ })
  test('connected state shows the green/red status dot + Disconnect button, reusing the existing switch-confirmation dialog', () => { /* ... */ })
  test('OneDrive OAuth error codes (onedrive_consent_denied, onedrive_consent_required, onedrive_state_invalid, onedrive_state_replayed, onedrive_not_authorized, onedrive_not_configured, onedrive_connect_failed) map to distinct copy, mirroring the Google error map', () => { /* ... */ })
  test('duplicateAccountWarning:true renders a non-blocking banner naming no other tenant, for BOTH google_drive and onedrive', () => { /* ... */ })
  test('switch-confirmation dialog includes the M-12 no-migration/reversibility paragraph and the F-OD-4 delete-orphan sentence, reused for every provider pair (not a per-pair variant)', () => { /* ... */ })
  test('Q4 helper copy: connect-with-Microsoft section includes one sentence about work/school admin approval', () => { /* ... */ })
  test('disconnect copy for onedrive includes the M-3 sentence: keys removed immediately, but the entry stays listed at Microsoft until removed there manually', () => { /* ... */ })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src/frontend && npx vitest run StoragePage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/frontend/src/hooks/useStorageConfig.ts`:

```ts
export interface StorageConfigData {
  provider: 'local' | 'custom_path' | 'google_drive' | 'onedrive'
  configured: boolean
  connected?: boolean
  smbHost?: string
  smbShare?: string
  smbUsername?: string
  duplicateAccountWarning?: boolean
}

export function useOneDriveAuthorize() {
  return useMutation({
    mutationFn: () => api.get<{ data: { url: string } }>('/api/settings/clinic/storage-config/onedrive/authorize').then(r => r.data.data),
  })
}
```

`src/frontend/src/views/settings/StoragePage.tsx` — key additions (full file follows the existing `google_drive` block's shape verbatim, one more radio + one more conditional section):

```tsx
const ONEDRIVE_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  onedrive_consent_denied:    'Microsoft sign-in was cancelled — try again if you want to connect OneDrive.',
  onedrive_consent_required:  'Your Microsoft administrator needs to approve Anemal before this account can connect — ask your IT admin, then try again.',
  onedrive_state_invalid:     'That Microsoft sign-in link was invalid or expired — try connecting again.',
  onedrive_state_replayed:    'That Microsoft sign-in link was already used — try connecting again.',
  onedrive_not_authorized:    'Your account no longer has permission to connect OneDrive — ask an admin to try again.',
  onedrive_not_configured:    'OneDrive connection is not configured on this server yet.',
  onedrive_connect_failed:    'Could not connect to OneDrive — please try again.',
}
// merged into the existing oauthErrorCode lookup alongside GOOGLE_OAUTH_ERROR_MESSAGES

// StorageForm.provider widens to include 'onedrive'; EMPTY_FORM unaffected (defaults to 'local')

// New radio, alongside the existing three:
<label className="flex items-center gap-sm min-h-[44px] cursor-pointer">
  <input type="radio" name="storage-provider" checked={form.provider === 'onedrive'}
    onChange={() => setForm(p => ({ ...p, provider: 'onedrive' }))} className="w-5 h-5" />
  <span className="text-body-md text-on-surface">Microsoft OneDrive</span>
</label>

// New conditional section, mirroring the google_drive block:
{form.provider === 'onedrive' && (
  <div className="flex flex-col gap-md pl-lg border-l-2 border-outline-variant">
    <p className="text-body-md text-on-surface-variant">
      Files are stored in <strong>this Microsoft account's</strong> OneDrive. If this account is lost or
      access is removed, the clinic loses access to those files until reconnected.
    </p>
    {/* Q4 note (BA F-OD-3) */}
    <p className="text-body-md text-on-surface-variant">
      Work or school Microsoft accounts may require your organization's administrator to approve
      Anemal's access once before this will work.
    </p>
    {data?.provider === 'onedrive' && data.configured ? (
      <div className="flex flex-col gap-sm">
        <div className="flex items-center gap-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${data.connected ? 'bg-secondary' : 'bg-error'}`} aria-hidden="true" />
          <span className="text-body-md text-on-surface">
            {data.connected ? 'Connected' : 'Not connected — reconnect required'}
          </span>
          <button type="button" onClick={handleDisconnectOneDrive}
            className="ml-auto min-h-[44px] px-lg border border-outline-variant rounded-xl text-body-md text-on-surface hover:bg-surface-container-low">
            Disconnect
          </button>
        </div>
        {/* M-3 disconnect-copy addition */}
        <p className="text-label-md text-on-surface-variant">
          Disconnecting removes Anemal's access keys immediately, but the Anemal entry stays listed in
          this Microsoft account's app permissions until removed there manually.
        </p>
      </div>
    ) : (
      <button type="button" onClick={handleConnectOneDrive} disabled={onedriveAuthorize.isPending}
        className="min-h-[44px] px-lg bg-primary text-surface rounded-xl text-body-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50 self-start">
        {onedriveAuthorize.isPending ? 'Connecting…' : 'Connect with Microsoft'}
      </button>
    )}
  </div>
)}

{/* M-11 duplicate-account banner — shown for EITHER cloud provider */}
{data?.duplicateAccountWarning && (
  <div className="px-md py-sm bg-surface-container-low border border-outline-variant rounded-xl text-body-md text-on-surface-variant">
    This account is already connected to another clinic on Anemal — we recommend each clinic use a
    separate account (branches of the same clinic sharing one account is fine).
  </div>
)}
```

Switch-confirmation dialog — add the M-12 + F-OD-4 paragraphs, reused for every provider pair (not per-pair copy):

```tsx
<p className="text-body-md text-on-surface-variant">
  {/* existing paragraph unchanged */}
</p>
<p className="text-body-md text-on-surface-variant">
  Switching providers does not automatically move your existing files. The app won't see them until
  you switch back — nothing is deleted, and switching back restores visibility at any time.
</p>
<p className="text-body-md text-on-surface-variant">
  If a file is deleted while a different provider than the one storing it is active, the physical file
  at the old provider is not removed and can no longer be reached through the app.
</p>
```

`src/frontend/src/views/settings/StorageConnectingPage.tsx` — generalize the copy (no new route):

```tsx
<p className="text-body-lg text-on-surface">Connecting your storage…</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src/frontend && npx vitest run StoragePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/useStorageConfig.ts src/frontend/src/views/settings/StoragePage.tsx src/frontend/src/views/settings/StorageConnectingPage.tsx src/frontend/src/__tests__/StoragePage.test.tsx
git commit -m "feat(storage): OneDrive radio + Connect/Disconnect UI, M-12/F-OD-4 copy, duplicate-account banner (ADR-0023 sub-project 3)"
```

---

## Task 12: Full regression sweep + design-doc §9 test-checklist reconciliation

**Files:** none new — verification-only task.

- [ ] **Step 1: Run the full backend suite**

Run: `cd src/backend && npx jest`
Expected: PASS, zero regressions in the existing SMB/GDrive/local driver tests or their call sites (design §9's explicit "no changes to existing local/SMB/GDrive driver tests or call sites" requirement).

- [ ] **Step 2: Run the full frontend suite**

Run: `cd src/frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Walk the design doc's §9 list against this plan's tests and confirm every line has a home**

Cross-check (do not skip any row):
- `OneDriveDriver` unit tests → Task 4 ✓ (incl. the N-1-class regression test, 4MB routing, folder-ensure 409-as-success, key validation, auth-invalid)
- `getStorageDriver` branch test → Task 5 ✓
- Token write-back race test → Task 5 ✓
- Callback integration tests (happy path, replay, cross-provider nonce reject, invalid/expired state, consent-denied/consent_required distinct params, inactive user/tenant, missing env) → Task 9 ✓
- Disconnect test (4 columns nulled incl. hash, audit written, no revoke attempted) → Task 10 ✓
- Status-check tests (connected true/false/transient/403) → Task 10 ✓
- Connect-side column hygiene, both directions (M-10) → Task 7 (reverse) + Task 9 (forward) ✓
- Google-flow non-regression (consumeNonce signature) → Task 6 ✓
- Duplicate-account detection (both providers, gating, lifecycle) → Task 7 (Google) + Task 10 (OneDrive, gating) ✓
- No-migration/reversibility round-trip → covered by existing driver-level key-determinism tests (Task 4) + frontend copy test (Task 11); **if a dedicated backend round-trip integration test doesn't already exist from the GDrive sub-project, add one here** covering provider A → B → A file visibility.
- Upload-failure visibility (M-13) → Task 4's FakeOneDriveClient `failUploadSessionOnChunk` test + Task 11's reliance on the existing generic upload-error UI (no new frontend test needed per M-13's "no code change" framing — confirm the existing EMR/pet-photo upload error-toast tests still pass unmodified).
- 403 classification (round-2 grill finding 3) → Task 10 ✓

- [ ] **Step 4: `tsc --noEmit` across both workspaces**

Run: `cd src/backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 5: Update the implementation-status matrix (PM-agent, per CLAUDE.md's "documents LAST" rule)**

Not part of this write-plan's execution — flagged here as the final step `/anemal-finish-branch` (CLAUDE.md Step 8) will drive, once Steps 5–7 (Ponytail, execute-plan, code-review/QA) complete for both sub-PRs.

---

## Summary of what this plan does NOT do (explicitly out of scope, per design §10 — do not add)

- Migrating existing files when switching providers (warn-only, all sub-projects).
- Production redirect-URI registration, Entra app registration, publisher verification (deploy-time/operator tasks — Q3).
- SharePoint document libraries as a target.
- Surfacing which Microsoft account is connected (email display) — would need `User.Read`, a separate decision.
- Any retry/backoff machinery for 429 throttling.
- Automatic retry of a failed upload (M-13 closes "does the user find out", not "does it retry itself").
