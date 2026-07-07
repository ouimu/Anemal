# Codex Audit Batch 1 — Stop-Ship Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source of truth:** `docs/adr/0003-codex-audit-batch1-stopship-decisions.md` (D1–D6, authoritative). Bug context: `RecomendByCodex/02-bugs.md` (BUG-001..008). BA sign-off + grilling (Step 3.5) both complete — this plan only encodes already-resolved decisions, it does not re-litigate them.

**Goal:** Fix 6 stop-ship items found by the Codex audit: (1) plaintext secrets leaking into audit logs, both historically and going forward, (2/3) frontend↔backend payload contract mismatches on Customer and Plan mutations, (4) settings PUT rejecting null SMTP fields, (5) seed/dev-DB drift blocking role walkthroughs, (6) a timezone bug in platform audit date filtering.

**Branch:** `fix/codex-audit-batch1-stopship`

**Order:** T1 → T5 → T6 → T2 → T3 → T4 (security first, then QA fixture unblock, then contract fixes). This order is intentional — do not reorder.

**Tech Stack:** Node/Express, Prisma, Jest + supertest (backend integration tests in `src/backend/tests/integration/`); React 18 + TanStack Query + Vitest (frontend, `src/frontend/src/`).

## Global Constraints

- Every query must include `tenantId` where applicable (CLAUDE.md multi-tenancy rule) — N/A for platform-plane-only fixes in this batch (T1 platform half, T5, T6), but clinic-plane audit path (T1) still must not touch `AuditLog.tenantId` scoping.
- No schema change in this batch (Ponytail-gate scope) — T1's scrub script is a data migration, not a schema migration.
- Deny-by-default stays deny-by-default: T5 must NOT relax `auth.service.ts` 403-on-no-branch behavior (ADR D5, explicit).
- T4 must NOT bundle featureFlags-on-PUT or audit-actor fixes (ADR D4, explicit — those are separately flagged, out of scope here).
- T2/T3 backend is untouched (ADR D2/D3 — trial lifecycle deferred to Phase 10; plan features stay `Record<string, boolean>`).

---

### Task 1 (BUG-001, Critical): Deep pattern-based audit redaction + one-time scrub script

**Files:**
- Modify: `src/backend/middlewares/audit.middleware.ts`
- Create: `src/backend/scripts/scrub-audit-secrets.ts`
- Test: `src/backend/tests/integration/auditRedaction.test.ts` (new)

**Interfaces:**
- Produces: `redact(value: unknown): unknown` (recursive, replaces `sanitize`) in `audit.middleware.ts` — deep-walks objects/arrays, replaces any string value whose **key** matches `/(password|secret|apikey|api_key|token|credential)/i` with `'***'`, regardless of nesting depth. Case-insensitive on the key name (matches `baseSmsApiKey`, `smtpPassword`, `lineChannelSecret`, `newPassword`, etc. — supersedes the old 4-key `SENSITIVE` list).
- Produces (script): `src/backend/scripts/scrub-audit-secrets.ts` — standalone Node script, run via `ts-node` or `npx ts-node src/backend/scripts/scrub-audit-secrets.ts`. Idempotent: re-running on already-scrubbed rows is a no-op (checks for `'***'` sentinel before rewrite, does not error).

- [x] **Step 1: Write the failing tests for `redact`**

Create `src/backend/tests/integration/auditRedaction.test.ts`:
```ts
/**
 * BUG-001 regression: audit middleware must deep-redact secret-like keys
 * before persisting `details` to either audit table, no matter the nesting depth.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'
import { getDecryptedValue } from '../../services/system-settings.service'

const SENTINEL = 'SENTINEL-SECRET-VALUE-DO-NOT-PERSIST'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('audit redaction — platform plane', () => {
  it('never stores a plaintext sentinel secret in platform_audit_logs.details', async () => {
    // Use an authenticated platform mutation route that accepts a secret-like field
    // (settings PUT — smtpPassword-shaped custom key goes through system-settings update).
    // Route + auth wiring: reuse existing platform login helper pattern from
    // platform-console-t5f02.test.ts (login as seeded platform super-admin).
    // ... obtain platformToken via /platform/login ...
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${/* platformToken */ ''}`)
      .send({ smtpUser: 'test', apiKey: SENTINEL })
    expect([200, 400]).toContain(res.status) // route may reject unknown field; that's fine

    const rows = await prisma.platformAuditLog.findMany({
      where: { action: { contains: 'settings' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    for (const row of rows) {
      expect(JSON.stringify(row.details)).not.toContain(SENTINEL)
    }
  })
})

describe('audit redaction — clinic plane', () => {
  it('never stores a plaintext sentinel secret in audit_logs.details', async () => {
    // Reuse an existing clinic mutation route (e.g. clinic settings or user password change)
    // that accepts a secret-like body field, login as seeded clinic admin (admin_a).
    // ... obtain clinicToken via /auth/login + /auth/select-branch ...
    const res = await request(server)
      .put('/api/some-clinic-route') // replace with a real mutating route during implementation
      .set('Authorization', `Bearer ${/* clinicToken */ ''}`)
      .send({ newPassword: SENTINEL, nested: { apiSecret: SENTINEL } })
    expect([200, 400, 404]).toContain(res.status)

    const rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    for (const row of rows) {
      expect(JSON.stringify(row.details)).not.toContain(SENTINEL)
    }
  })
})
```
Note for implementer: fill in the two `TODO`-style route calls with a real existing mutating route on each plane (grep `router.put(` / `router.post(` in `src/backend/routes/platform/` and `src/backend/routes/` for one that accepts a free-form body field you can smuggle a `nested.apiSecret`-shaped key into, or add a harmless extra key if the Zod schema is not `.strict()`). If every candidate route is `.strict()` and rejects unknown keys, use a route whose schema already contains a secret-like field name (e.g. provisioning's `smtpPassword`, `baseSmsApiKey`, `lineChannelSecret`) and assert the real value is redacted, not a smuggled sentinel.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx jest auditRedaction --runInBand`
Expected: FAIL — either the route/auth scaffolding needs finishing (compile error) or, once wired, the plaintext sentinel/secret IS found in `details` (proving the shallow 4-key list misses nested/pattern-matched keys).

- [x] **Step 3: Implement recursive `redact` in `audit.middleware.ts`**

Replace lines 12–20 of `src/backend/middlewares/audit.middleware.ts`:
```ts
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SENSITIVE = ['password', 'passwordHash', 'newPassword', 'currentPassword']

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  for (const k of SENSITIVE) if (k in clone) clone[k] = '***'
  return clone
}
```
with:
```ts
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Deny-by-default: any key matching this pattern is redacted, at any nesting depth. */
const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|api_key|token|credential)/i

/**
 * Recursively redacts any object key matching SENSITIVE_KEY_PATTERN, at any depth,
 * including inside arrays and nested objects. Replaces matched values with '***'.
 * Non-plain-object/array leaves pass through unchanged.
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '***' : redact(v)
    }
    return out
  }
  return value
}

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined
  return redact(body) as Record<string, unknown>
}
```
No other lines in the file change — `sanitize` is called the same way at line 30 for both plane branches, so this single change covers both `platformAuditRepo.createPlatformAuditLog` and `auditRepo.create` call sites.

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest auditRedaction --runInBand`
Expected: PASS.

- [x] **Step 5: Run full audit-adjacent suite to confirm no regressions**

Run: `npx jest audit --runInBand`
Expected: PASS — includes `platform-console-t5f02.test.ts` audit-related describe blocks and any existing `audit.middleware` tests.

- [x] **Step 6: Write the one-time scrub script**

Create `src/backend/scripts/scrub-audit-secrets.ts`:
```ts
/**
 * One-time scrub of existing plaintext secret-like values in platform_audit_logs.details.
 *
 * BUG-001 / ADR-0003 D1: the audit middleware's pre-fix shallow 4-key sanitizer missed
 * secret-like fields (baseSmsApiKey, smtpPassword, lineChannelSecret, etc.) that were
 * nested or didn't match the literal 'password' family. This script re-applies the new
 * recursive SENSITIVE_KEY_PATTERN redaction to every existing row's `details` JSON blob.
 *
 * Idempotent: rows already containing '***' for a matched key are left as-is on re-run
 * (the redact() function is deterministic and safe to re-apply).
 *
 * Run once via: npx ts-node src/backend/scripts/scrub-audit-secrets.ts
 *
 * Ops note (ADR D1): affected tenant credentials (baseSmsApiKey, smtpPassword,
 * lineChannelSecret) found in plaintext rows must be ROTATED after this script runs —
 * scrubbing the audit log does not invalidate a credential that may already be
 * compromised. Credential rotation is a manual ops task, tracked separately, NOT
 * automated by this script.
 */
import prisma from '../config/db'

const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|api_key|token|credential)/i

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '***' : redact(v)
    }
    return out
  }
  return value
}

async function main() {
  const rows = await prisma.platformAuditLog.findMany({
    where: { details: { not: Prisma.JsonNull } as never },
    select: { id: true, details: true },
  })

  let scrubbedCount = 0
  for (const row of rows) {
    if (!row.details || typeof row.details !== 'object') continue
    const before = JSON.stringify(row.details)
    const after = redact(row.details)
    if (JSON.stringify(after) === before) continue // idempotent: no change needed
    await prisma.platformAuditLog.update({
      where: { id: row.id },
      data: { details: after as never },
    })
    scrubbedCount++
  }

  console.log(`Scrubbed ${scrubbedCount} of ${rows.length} platform_audit_logs rows.`)
  console.log('OPS ACTION REQUIRED: rotate any tenant credentials (baseSmsApiKey, smtpPassword, lineChannelSecret) that were found in plaintext prior to this scrub.')
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
```
Note: import `Prisma` from `@prisma/client` at the top (`import { Prisma } from '@prisma/client'`) alongside the `prisma` default import, needed for the `Prisma.JsonNull` filter.

- [x] **Step 7: Dry-run the scrub script against dev DB**

Run: `npx ts-node src/backend/scripts/scrub-audit-secrets.ts`
Expected: prints `Scrubbed N of M platform_audit_logs rows.` with no thrown errors. Re-run immediately after — expected `Scrubbed 0 of M rows.` (idempotency check).

- [x] **Step 8: Commit**

```bash
git add src/backend/middlewares/audit.middleware.ts src/backend/scripts/scrub-audit-secrets.ts src/backend/tests/integration/auditRedaction.test.ts
git commit -m "fix(audit): deep pattern-based secret redaction + one-time scrub script (BUG-001)"
```

---

### Task 2 (BUG-005): Seed re-run + tenant-2 duplicate/artifact cleanup + credential smoke test

**Files:**
- Modify: none in `src/backend/prisma/seed.ts` (ADR D5: seed's `user_branches` upsert is already correct since commit `76d6e09` — DB just predates it; re-running the existing seed is the fix, not a seed code change).
- Create: `src/backend/scripts/deactivate-duplicate-test-users.ts`
- Test: `src/backend/tests/integration/seedCredentialSmoke.test.ts` (new)

**Interfaces:**
- Produces (script): `src/backend/scripts/deactivate-duplicate-test-users.ts` — sets `isActive=false` on tenant-2 duplicate users (`user4`, `user5`, `user6` — matched by `username`, not id, since ids are DB-instance-specific) and test artifacts (`user2072`, `intruder_b`). No hard delete (FK safety per ADR D5).
- Test asserts: for every credential documented in `HOW-TO-RUN.md`, a full two-step login (`POST /auth/login` → `POST /auth/select-branch` if `requiresBranchSelection`) returns `200` with a JWT.

- [x] **Step 1: Re-run the seed against dev DB**

Run: `npx ts-node src/backend/prisma/seed.ts` (or the project's documented seed command from `HOW-TO-RUN.md`, e.g. `npm run seed` if defined in `package.json` — check `package.json` scripts first: `grep '"seed"' src/backend/package.json` or root `package.json`).
Expected: completes without error; re-applies the `user_branches` upsert for `doctor_b`/`staff_b` (and all other seeded users) so branch assignment matches current seed intent.

- [x] **Step 2: Write the failing credential smoke test**

Create `src/backend/tests/integration/seedCredentialSmoke.test.ts`:
```ts
/**
 * BUG-005 regression: every credential documented in HOW-TO-RUN.md must be able to
 * complete a full two-step login (credentials → branch select → JWT), so the
 * documented walkthrough never silently drifts from the live seeded DB again.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// Sourced from HOW-TO-RUN.md + prisma/seed.ts seed data — keep in sync with both.
const SEEDED_CLINIC_CREDENTIALS: Array<{ subdomain: string; username: string; password: string }> = [
  { subdomain: 'dev-clinic',  username: 'admin_a',  password: 'AdminPass1!' },
  { subdomain: 'dev-clinic',  username: 'doctor_a', password: 'DoctorPass1!' },
  { subdomain: 'dev-clinic',  username: 'staff_a',  password: 'StaffPass1!' },
  { subdomain: 'test-clinic', username: 'admin_b',  password: 'AdminPass2!' },
  { subdomain: 'test-clinic', username: 'doctor_b', password: 'DoctorPass2!' },
  { subdomain: 'test-clinic', username: 'staff_b',  password: 'StaffPass2!' },
]

describe('seeded credential smoke test — every HOW-TO-RUN credential logs in', () => {
  it.each(SEEDED_CLINIC_CREDENTIALS)(
    'completes two-step login for $username @ $subdomain',
    async ({ subdomain, username, password }) => {
      const step1 = await request(server)
        .post('/auth/login')
        .send({ subdomain, username, password })
      expect(step1.status).toBe(200)

      if (step1.body.data.requiresBranchSelection === false) {
        expect(typeof step1.body.data.token).toBe('string')
        return
      }

      const { pendingToken, branches } = step1.body.data
      expect(branches.length).toBeGreaterThan(0)
      const step2 = await request(server)
        .post('/auth/select-branch')
        .send({ pendingToken, branchId: branches[0].id })
      expect(step2.status).toBe(200)
      expect(typeof step2.body.data.token).toBe('string')
    },
  )
})
```
Note for implementer: fill in the exact seeded username/password list by reading `src/backend/prisma/seed.ts` in full (lines around 61-83 shown in context already cover tenant A/B clinic users) plus the platform super-admin credential block (search seed.ts for `PlatformUser` create) and the exact HOW-TO-RUN.md credential values (`grep -n "Password\|password" HOW-TO-RUN.md`) before finalizing this array — do not guess passwords, copy them verbatim from seed.ts.

- [x] **Step 3: Run tests to verify current state (pre-cleanup)**

Run: `npx jest seedCredentialSmoke --runInBand`
Expected: PASS for all rows once Step 1's seed re-run has landed (this validates D5's core claim: re-running seed alone fixes `doctor_b`/`staff_b` 403s). If any row still fails, investigate before proceeding — do not paper over with an `auth.service.ts` relaxation (explicitly forbidden by ADR D5).

- [x] **Step 4: Write the duplicate/artifact deactivation script**

Create `src/backend/scripts/deactivate-duplicate-test-users.ts`:
```ts
/**
 * One-time cleanup (BUG-005 / ADR-0003 D5): deactivate tenant-2 duplicate historical
 * users and known test artifacts left over from prior manual DB probing.
 *
 * No hard delete — FK safety (these users may be referenced by AuditLog, Appointment,
 * etc.). Sets isActive=false only. Idempotent: re-running on already-deactivated users
 * is a no-op.
 *
 * Usernames targeted: user4, user5, user6 (tenant-2 duplicates), user2072, intruder_b
 * (test artifacts). Matched by username, NOT id — ids are DB-instance-specific and
 * unsafe to hardcode across environments.
 *
 * Run once via: npx ts-node src/backend/scripts/deactivate-duplicate-test-users.ts
 */
import prisma from '../config/db'

const TARGET_USERNAMES = ['user4', 'user5', 'user6', 'user2072', 'intruder_b']

async function main() {
  const result = await prisma.user.updateMany({
    where: { username: { in: TARGET_USERNAMES }, isActive: true },
    data: { isActive: false },
  })
  console.log(`Deactivated ${result.count} of ${TARGET_USERNAMES.length} targeted users (already-inactive rows are skipped).`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
```

- [x] **Step 5: Run the cleanup script against dev DB**

Run: `npx ts-node src/backend/scripts/deactivate-duplicate-test-users.ts`
Expected: prints `Deactivated N of 5 targeted users...`. Re-run immediately after — expected `Deactivated 0 of 5...` (idempotency check).

- [x] **Step 6: Re-run full smoke test to confirm no collateral damage**

Run: `npx jest seedCredentialSmoke --runInBand`
Expected: PASS — deactivating tenant-2 duplicates/artifacts must not affect any of the documented HOW-TO-RUN credentials (none of `user4/5/6/user2072/intruder_b` should be in the documented credential list; if one is, stop and flag to BA before deactivating).

- [x] **Step 7: Confirm auth.service.ts 403 behavior is untouched**

Run: `git diff --stat src/backend/services/auth.service.ts`
Expected: empty output (no changes to this file in this task — ADR D5 hard constraint).

- [x] **Step 8: Commit**

```bash
git add src/backend/scripts/deactivate-duplicate-test-users.ts src/backend/tests/integration/seedCredentialSmoke.test.ts
git commit -m "fix(seed): re-run seed + deactivate tenant-2 duplicate/artifact users, add credential smoke test (BUG-005)"
```

---

### Task 3 (BUG-008): Platform audit date filter — pure UTC bounds + Zod validation

**Files:**
- Modify: `src/backend/controllers/platform-audit.controller.ts`
- Test: `src/backend/tests/integration/platformAuditUtcBounds.test.ts` (new); existing `src/backend/tests/integration/platform-console-t5f02.test.ts:443` becomes deterministically correct once this lands (no change needed to that file).

**Interfaces:**
- Modifies: `querySchema.from`/`querySchema.to` gain `.regex(/^\d{4}-\d{2}-\d{2}$/)` validation.
- Modifies: `handleListPlatformAudit` date-bound construction — `from` → `${from}T00:00:00.000Z`, `to` → `${to}T23:59:59.999Z`, both parsed as literal UTC instants (no `setHours`, which mutates in local time).

- [x] **Step 1: Write the failing tests with injected timestamps**

Create `src/backend/tests/integration/platformAuditUtcBounds.test.ts`:
```ts
/**
 * BUG-008 regression: from/to date filters must be pure UTC calendar-day bounds,
 * independent of server wall-clock/local timezone. Uses injected timestamps
 * (not "today") so the test is deterministic regardless of when/where it runs.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'
// Reuse existing platform login helper pattern from platform-console-t5f02.test.ts

const SUB_MARKER = 'utc-bounds-test'
let server: Server
let platformToken = ''
let tenantId = 0

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  // ... obtain platformToken via existing platform super-admin login helper ...
  // ... create a throwaway tenant for isolation ...
  const tenant = await prisma.tenant.create({ data: { name: 'UTC Bounds Test', subdomain: SUB_MARKER } })
  tenantId = tenant.id

  // Insert a platform audit row with an injected createdAt right at a UTC day boundary:
  // 2026-03-10T23:30:00.000Z — this is still "2026-03-10" in UTC but would be
  // "2026-03-11" local time at UTC+7 (the bug this test targets).
  const platformAdmin = await prisma.platformUser.findFirstOrThrow({})
  await prisma.platformAuditLog.create({
    data: {
      action: 'tenant.utc-bounds-test',
      targetTenantId: tenantId,
      performedByPlatformUserId: platformAdmin.id,
      createdAt: new Date('2026-03-10T23:30:00.000Z'),
    },
  })
})

afterAll(async () => {
  await prisma.platformAuditLog.deleteMany({ where: { targetTenantId: tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('GET /platform/audit — pure UTC date bounds (BUG-008)', () => {
  it('includes a row at 23:30 UTC when from=to=that UTC calendar day', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${tenantId}&from=2026-03-10&to=2026-03-10`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.some((r: { action: string }) => r.action === 'tenant.utc-bounds-test')).toBe(true)
  })

  it('excludes that row when from=to=the next UTC calendar day', async () => {
    const res = await request(server)
      .get(`/platform/audit?tenantId=${tenantId}&from=2026-03-11&to=2026-03-11`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items.some((r: { action: string }) => r.action === 'tenant.utc-bounds-test')).toBe(false)
  })

  it('rejects a malformed from/to param with 400', async () => {
    const res = await request(server)
      .get(`/platform/audit?from=2026-3-1&to=2026-03-10`)
      .set('Authorization', `Bearer ${platformToken}`)
    expect(res.status).toBe(400)
  })
})
```
Note for implementer: wire `platformToken` using the same platform super-admin login helper already present in `platform-console-t5f02.test.ts` (read that file's `beforeAll` in full for the exact call sequence before finalizing).

- [x] **Step 2: Run tests to verify they fail**

Run: `npx jest platformAuditUtcBounds --runInBand`
Expected: FAIL on the malformed-param test (currently no regex validation → not rejected with 400) and possibly on the day-boundary tests depending on the machine's local timezone (only fails reliably at UTC+ offsets ahead of UTC, per ADR D6 — if run on a UTC or UTC-behind machine the existing `setHours` bug may not reproduce; that's expected and is exactly why ADR D6 calls for injected-timestamp determinism plus a code fix rather than relying on a flaky wall-clock repro).

- [x] **Step 3: Add Zod regex validation and switch to pure UTC bounds**

In `src/backend/controllers/platform-audit.controller.ts`, replace lines 20–27:
```ts
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  action: z.string().optional(),
  tenantId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
})
```
with:
```ts
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const querySchema = z.object({
  from: z.string().regex(DATE_ONLY, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(DATE_ONLY, 'to must be YYYY-MM-DD').optional(),
  action: z.string().optional(),
  tenantId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
})
```

Replace lines 47–54:
```ts
    const from = q.from ? new Date(q.from) : undefined
    const to = q.to
      ? (() => {
          const d = new Date(q.to)
          d.setHours(23, 59, 59, 999)
          return d
        })()
      : undefined
```
with:
```ts
    // Pure UTC calendar-day bounds (ADR-0003 D6): from/to are YYYY-MM-DD interpreted
    // as UTC calendar days, inclusive. Avoids setHours() mutating in server-local time,
    // which silently dropped the last ~7h of the UTC day at UTC+7.
    const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : undefined
    const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest platformAuditUtcBounds --runInBand`
Expected: PASS, all 3 tests.

- [x] **Step 5: Confirm the existing flaky test is now deterministically correct**

Run: `npx jest platform-console-t5f02 --runInBand`
Expected: PASS — the `today window (from=to=today) includes the just-written suspend row` test (line ~443) now passes regardless of local server timezone offset, since the controller is UTC-consistent end to end.

- [x] **Step 6: Commit**

```bash
git add src/backend/controllers/platform-audit.controller.ts src/backend/tests/integration/platformAuditUtcBounds.test.ts
git commit -m "fix(platform-audit): pure UTC date-filter bounds + Zod format validation (BUG-008)"
```

---

### Task 4 (BUG-002): Remove `trialEndsAt` from frontend customer payloads

**Files:**
- Modify: `src/frontend/src/hooks/usePlatformCustomers.ts`
- Modify: `src/frontend/src/views/platform/CustomerListView.tsx`
- Modify: `src/frontend/src/views/platform/CustomerDetailView.tsx`
- Test: existing frontend test file for these views if present (check `src/frontend/src/views/platform/__tests__/` or co-located `*.test.tsx`); otherwise add a minimal Vitest assertion.

**Interfaces:**
- Modifies: `CreateCustomerPayload` (drops `trialEndsAt?`), `UpdateCustomerPayload` (drops `trialEndsAt?`) in `usePlatformCustomers.ts`. `Customer`/`CustomerDetail` (read types) KEEP `trialEndsAt: string | null` — this is a display-only read field surfaced by an unchanged backend GET; only the write payloads change (ADR D2: no backend change).
- Preserves: `companyTypeId` handling in `UpdateCustomerPayload` and `CustomerDetailView.tsx`'s save handler — untouched.

- [x] **Step 1: Check for existing frontend tests covering these components**

Run: `Get-ChildItem -Recurse -Filter "*Customer*.test.*" src/frontend/src` (PowerShell) or `find src/frontend/src -iname "*Customer*test*"` (Bash)
Expected: note any existing test file path to update in Step 5; if none exists, Step 5 creates a minimal one.

- [x] **Step 2: Remove `trialEndsAt` from the write payload types**

In `src/frontend/src/hooks/usePlatformCustomers.ts`, change:
```ts
export interface CreateCustomerPayload {
  name:         string
  subdomain:    string
  planId:       number
  trialEndsAt?: string | null
}

export interface UpdateCustomerPayload {
  name?:          string
  planId?:        number
  trialEndsAt?:   string | null
  companyTypeId?: number | null
}
```
to:
```ts
export interface CreateCustomerPayload {
  name:         string
  subdomain:    string
  planId:       number
}

export interface UpdateCustomerPayload {
  name?:          string
  planId?:        number
  companyTypeId?: number | null
}
```
Leave `Customer`/`CustomerDetail` (`trialEndsAt: string | null`) and all hook implementations (`useCreatePlatformCustomer`, `useUpdatePlatformCustomer`) untouched — they already just forward whatever payload type is passed.

- [x] **Step 3: Remove the trial input from `CustomerListView.tsx`**

In `src/frontend/src/views/platform/CustomerListView.tsx`:
- Remove `trialEndsAt: null,` from `EMPTY_FORM` (line 23).
- Remove the trial date input block (lines ~185-193, the block containing `value={form.trialEndsAt ?? ''}` and its `onChange`) and its enclosing label/wrapper JSX. Read the surrounding 15 lines first to remove the whole form-field block cleanly (label + input + any wrapper div), not just the two matched lines.
- If the create-payload object built before calling `useCreatePlatformCustomer().mutate(...)` still spreads `form` directly (check for `mutate(form)` or similar), ensure it now only includes `name`, `subdomain`, `planId` — either destructure explicitly or confirm `CreateCustomerPayload`'s narrower type causes a TS error at the call site that surfaces exactly what to strip.

- [x] **Step 4: Remove/hide the trial editor in `CustomerDetailView.tsx`**

In `src/frontend/src/views/platform/CustomerDetailView.tsx`:
- Remove the `editTrial` state initialization at line 61 (`setEditTrial(customer.trialEndsAt ? customer.trialEndsAt.slice(0, 10) : '')`) and its corresponding `useState` declaration (search for `const [editTrial, setEditTrial]` above line 61).
- In the save handler at line 68, change:
  ```ts
  { name: editName, trialEndsAt: editTrial || null, companyTypeId: editCompanyTypeId },
  ```
  to:
  ```ts
  { name: editName, companyTypeId: editCompanyTypeId },
  ```
- KEEP the read-only display block at lines 160-164 (`{customer.trialEndsAt && (...)}`) — this renders existing trial data for tenants that still have it set from before Phase 10; ADR D2 only removes the ability to set/edit it going forward, not the display of already-set values. If this block includes an editable input (not just display), remove/disable the input specifically but keep the label showing the read-only value.

- [x] **Step 5: Add/update a frontend test asserting the payload shape**

If an existing test file was found in Step 1, add a test there; otherwise create `src/frontend/src/hooks/usePlatformCustomers.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { CreateCustomerPayload, UpdateCustomerPayload } from './usePlatformCustomers'

describe('CreateCustomerPayload / UpdateCustomerPayload (BUG-002)', () => {
  it('does not allow trialEndsAt on create payload (compile-time check)', () => {
    const payload: CreateCustomerPayload = { name: 'Acme', subdomain: 'acme', planId: 1 }
    // @ts-expect-error trialEndsAt must not exist on CreateCustomerPayload
    payload.trialEndsAt = '2026-01-01'
    expect(payload.name).toBe('Acme')
  })

  it('does not allow trialEndsAt on update payload but keeps companyTypeId', () => {
    const payload: UpdateCustomerPayload = { name: 'Acme', companyTypeId: 3 }
    // @ts-expect-error trialEndsAt must not exist on UpdateCustomerPayload
    payload.trialEndsAt = '2026-01-01'
    expect(payload.companyTypeId).toBe(3)
  })
})
```

- [x] **Step 6: Run the frontend test suite for this area**

Run: `npx vitest run usePlatformCustomers CustomerListView CustomerDetailView`
Expected: PASS, including the two new `@ts-expect-error` compile-time checks (Vitest + `vite-plugin-checker`/`tsc` must actually type-check `@ts-expect-error` — if the project's Vitest config doesn't type-check test files, instead run `npx tsc --noEmit -p src/frontend` as an additional verification step to catch the `@ts-expect-error` assertions).

- [x] **Step 7: Commit**

```bash
git add src/frontend/src/hooks/usePlatformCustomers.ts src/frontend/src/views/platform/CustomerListView.tsx src/frontend/src/views/platform/CustomerDetailView.tsx
git commit -m "fix(platform-customers): remove trialEndsAt from write payloads, defer trial lifecycle to Phase 10 (BUG-002)"
```

---

### Task 5 (BUG-003): Frontend write translation for Plan `price`/`features`

**Files:**
- Modify: `src/frontend/src/hooks/usePlatformPlans.ts`
- Modify: `src/frontend/src/views/platform/PlatformPlansView.tsx` (only if it reads/writes `price`/`features` directly on the mutation payload rather than through the hook's exported types — verify in Step 1)

**Interfaces:**
- Modifies: `CreatePlanPayload`/`UpdatePlanPayload` (the wire-shape sent to backend) change `price: number` → `priceMonth: number` and `features?: string[]` → `features?: Record<string, boolean>`. The UI-facing `Plan` (read type, `price: number`, `features: string[]`) is UNCHANGED — backend GET already translates `priceMonth` → `price` and `Record<string,boolean>` → `string[]` (ADR D3: this task mirrors that existing backend read-translation on the frontend write side).
- Produces: a translation function in the hook, applied inside `mutationFn`, so `PlatformPlansView.tsx`'s form state keeps using the UI-friendly `price`/`features: string[]` shape and does not need to change its input handling — only the wire payload changes at the mutation boundary.

- [x] **Step 1: Confirm where the UI-facing form shape is assembled**

Read `src/frontend/src/views/platform/PlatformPlansView.tsx` in full (it's short, ~230 lines) to find the exact shape of `value`/form state passed into `useCreatePlatformPlan().mutate(...)` and `useUpdatePlatformPlan(id).mutate(...)`. Confirm whether the mutate() call passes a `CreatePlanPayload`-typed object directly (in which case only the hook types+translation need to change) or builds its own inline object (in which case this task also touches this file to match the new hook contract).

- [x] **Step 2: Add wire-level payload types + translation in the hook**

In `src/frontend/src/hooks/usePlatformPlans.ts`, replace:
```ts
export interface CreatePlanPayload {
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  features?:    string[]
}

export type UpdatePlanPayload = Partial<Omit<CreatePlanPayload, 'key'>>
```
with:
```ts
/** UI-facing shape — matches the existing form state in PlatformPlansView.tsx. */
export interface CreatePlanPayload {
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  features?:    string[]
}

export type UpdatePlanPayload = Partial<Omit<CreatePlanPayload, 'key'>>

/** Wire shape the backend actually accepts (mirrors the existing backend GET translation in reverse). */
interface PlanWirePayload {
  key?:         string
  name?:        string
  priceMonth?:  number
  maxBranches?: number | null
  maxUsers?:    number | null
  maxOwners?:   number | null
  features?:    Record<string, true>
}

/**
 * Translates the UI-facing CreatePlanPayload/UpdatePlanPayload shape to the wire shape
 * the backend Zod schema expects. `price` -> `priceMonth`; `features: string[]` ->
 * `Record<string, true>` (boolean-flag catalogue, ADR-0003 D3 — no valued config).
 * Preserves key immutability: `key` is only ever included on create, never on update
 * (UpdatePlanPayload has no `key` field at the type level, so this is enforced by the
 * type system, not runtime logic).
 */
function toWirePayload(payload: CreatePlanPayload | UpdatePlanPayload): PlanWirePayload {
  const { price, features, ...rest } = payload as CreatePlanPayload
  const wire: PlanWirePayload = { ...rest }
  if (price !== undefined) wire.priceMonth = price
  if (features !== undefined) {
    wire.features = features.reduce((acc, f) => { acc[f] = true; return acc }, {} as Record<string, true>)
  }
  return wire
}
```

- [x] **Step 3: Apply the translation at the two mutation call sites**

In the same file, change:
```ts
export function useCreatePlatformPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) =>
      platformApi.post('/platform/plans', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
```
to:
```ts
export function useCreatePlatformPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) =>
      platformApi.post('/platform/plans', toWirePayload(payload)).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
```
and:
```ts
export function useUpdatePlatformPlan(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePlanPayload) =>
      platformApi.put(`/platform/plans/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}
```
to:
```ts
export function useUpdatePlatformPlan(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePlanPayload) =>
      platformApi.put(`/platform/plans/${id}`, toWirePayload(payload)).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}
```

- [x] **Step 4: If Step 1 found `PlatformPlansView.tsx` builds its own inline payload**, update it to keep using the UI-facing `price`/`features: string[]` shape (do not have the view construct `priceMonth`/`Record` itself — that translation belongs solely in the hook per this task's interface contract). Otherwise, no changes needed to this file.

- [x] **Step 5: Write a unit test for `toWirePayload`**

Create `src/frontend/src/hooks/usePlatformPlans.test.ts` (export `toWirePayload` from the hook file for testability, or test indirectly by mocking `platformApi` — prefer exporting it since it's a pure function):
```ts
import { describe, it, expect, vi } from 'vitest'
import { toWirePayload } from './usePlatformPlans'

describe('toWirePayload (BUG-003)', () => {
  it('translates price -> priceMonth and features string[] -> Record<string, true>', () => {
    const wire = toWirePayload({
      key: 'pro', name: 'Pro', price: 999,
      maxBranches: 5, maxUsers: 20, maxOwners: null,
      features: ['sms', 'line'],
    })
    expect(wire).toEqual({
      key: 'pro', name: 'Pro', priceMonth: 999,
      maxBranches: 5, maxUsers: 20, maxOwners: null,
      features: { sms: true, line: true },
    })
  })

  it('omits features key entirely when not provided (partial update)', () => {
    const wire = toWirePayload({ price: 1200 })
    expect(wire).toEqual({ priceMonth: 1200 })
    expect(wire.features).toBeUndefined()
  })

  it('preserves key immutability: update payload never includes key at the type level', () => {
    const updatePayload: import('./usePlatformPlans').UpdatePlanPayload = { name: 'Renamed' }
    // @ts-expect-error key is not assignable on UpdatePlanPayload (Omit<CreatePlanPayload, 'key'>)
    updatePayload.key = 'new-key'
    expect(updatePayload.name).toBe('Renamed')
  })
})
```
Add `export function toWirePayload` (change from unexported `function toWirePayload` to `export function toWirePayload`) in `usePlatformPlans.ts` to make it importable by the test.

- [x] **Step 6: Run tests**

Run: `npx vitest run usePlatformPlans PlatformPlansView`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/frontend/src/hooks/usePlatformPlans.ts src/frontend/src/hooks/usePlatformPlans.test.ts
git commit -m "fix(platform-plans): translate price->priceMonth and features array->record on write (BUG-003)"
```

---

### Task 6 (BUG-004): Backend settings PUT — nullable optional SMTP fields

**Files:**
- Modify: `src/backend/controllers/system-settings.controller.ts`
- Test: `src/backend/tests/integration/systemSettingsNullable.test.ts` (new) — check first whether an existing `systemSettings*.test.ts` file already covers `PUT /platform/settings` and extend it instead if so.

**Interfaces:**
- Modifies: `updateAllSettingsSchema` — `smtpHost`, `smtpPort`, `smtpUser`, `smtpFrom` (and any other optional SMTP-shaped field in the schema) become `.nullable().optional()` instead of just `.optional()`. `appName`, `baseUrl`, `maintenanceMode`, `trialDays` stay as-is (ADR D4 scopes this to "optional SMTP fields" specifically — do not widen scope to non-SMTP fields or bundle `featureFlags`/audit-actor fixes, per explicit ADR exclusion).
- Modifies: `updateAllSettings` handler's per-field loop — `null` now must be distinguished from `undefined`: `undefined` = unchanged (skip, as today), `null` = clear (call `coerceToString`-equivalent path that stores `''`), non-null = set (existing `coerceToString` path).

- [ ] **Step 1: Write the failing test**

Create `src/backend/tests/integration/systemSettingsNullable.test.ts` (or extend an existing settings test file if `Get-ChildItem` / `find` in Step 0 below locates one):

Step 0 (run first): `find "D:/Development/AnimalClinic/src/backend/tests/integration" -iname "*setting*"` — if a file like `systemSettings.test.ts` or `platformSettings.test.ts` already exists and covers `PUT /platform/settings`, add the new `describe` block there instead of creating a new file, and skip creating `systemSettingsNullable.test.ts`.

```ts
/**
 * BUG-004 regression: PUT /platform/settings must accept null for optional SMTP
 * fields (symmetric with GET, which already emits null for blank values) — null
 * clears the value (stored as ''), undefined leaves it unchanged.
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
// Reuse existing platform super-admin login helper pattern from platform-console-t5f02.test.ts

let server: Server
let platformToken = ''

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
  // ... obtain platformToken via existing platform login helper ...
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('PUT /platform/settings — nullable optional SMTP fields (BUG-004)', () => {
  it('accepts null for smtpHost/smtpPort/smtpUser/smtpFrom and clears them', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ smtpHost: null, smtpPort: null, smtpUser: null, smtpFrom: null })
    expect(res.status).toBe(200)

    const getRes = await request(server)
      .get('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(getRes.status).toBe(200)
    expect(getRes.body.data.smtpHost).toBeNull()
    expect(getRes.body.data.smtpPort).toBeNull()
    expect(getRes.body.data.smtpUser).toBeNull()
    expect(getRes.body.data.smtpFrom).toBeNull()
  })

  it('leaves smtpHost unchanged when omitted (undefined) from the payload', async () => {
    await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ smtpHost: 'smtp.example.com' })
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ smtpUser: 'someone' }) // smtpHost omitted entirely
    expect(res.status).toBe(200)

    const getRes = await request(server)
      .get('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
    expect(getRes.body.data.smtpHost).toBe('smtp.example.com') // unchanged, not cleared
  })

  it('still accepts a valid non-null smtpFrom value', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ smtpFrom: 'noreply@example.com' })
    expect(res.status).toBe(200)
  })

  it('rejects an invalid non-null, non-email smtpFrom (still validated when present)', async () => {
    const res = await request(server)
      .put('/platform/settings')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ smtpFrom: 'not-an-email' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest systemSettingsNullable --runInBand`
Expected: FAIL on the first test with `400` (current `.strict()` schema rejects `null` for fields typed as `z.string().optional()` etc., since Zod's `.optional()` alone does not accept `null`).

- [ ] **Step 3: Make optional SMTP fields nullable in the Zod schema**

In `src/backend/controllers/system-settings.controller.ts`, replace lines 29–39:
```ts
export const updateAllSettingsSchema = z.object({
  appName:         z.string().max(200).optional(),
  baseUrl:         z.string().url().max(500).optional(),
  maintenanceMode: z.boolean().optional(),
  trialDays:       z.number().int().min(0).max(3650).optional(),
  smtpHost:        z.string().max(253).optional(),
  smtpPort:        z.number().int().min(1).max(65535).optional(),
  smtpUser:        z.string().max(200).optional(),
  smtpFrom:        z.string().email().max(200).optional(),
  featureFlags:    z.record(z.boolean()).optional(),
}).strict()
```
with:
```ts
export const updateAllSettingsSchema = z.object({
  appName:         z.string().max(200).optional(),
  baseUrl:         z.string().url().max(500).optional(),
  maintenanceMode: z.boolean().optional(),
  trialDays:       z.number().int().min(0).max(3650).optional(),
  // Nullable (BUG-004 / ADR-0003 D4): null clears the value, undefined leaves it
  // unchanged, symmetric with GET which already emits null for blank SMTP fields.
  smtpHost:        z.string().max(253).nullable().optional(),
  smtpPort:        z.number().int().min(1).max(65535).nullable().optional(),
  smtpUser:        z.string().max(200).nullable().optional(),
  smtpFrom:        z.string().email().max(200).nullable().optional(),
  featureFlags:    z.record(z.boolean()).optional(),
}).strict()
```
Note: `z.string().email()` validation still applies whenever `smtpFrom` is a non-null string — `.nullable()` only widens the type to also accept literal `null`, it does not weaken the email format check for non-null values (covered by Step 1's 4th test case).

- [ ] **Step 4: Update the handler to distinguish null (clear) from undefined (unchanged)**

In the same file, replace the `updateAllSettings` loop body (lines 140–148):
```ts
    let updated = 0
    for (const [field, dbKey] of Object.entries(SETTINGS_KEY_MAP)) {
      // featureFlags is not in SETTINGS_KEY_MAP so raw is always string | boolean | number | undefined
      const raw = (body as Record<string, string | boolean | number | undefined>)[field]
      if (raw === undefined) continue

      await systemSvc.updateByKey(dbKey, coerceToString(raw), userId)
      updated++
    }
```
with:
```ts
    let updated = 0
    for (const [field, dbKey] of Object.entries(SETTINGS_KEY_MAP)) {
      // featureFlags is not in SETTINGS_KEY_MAP so raw is always string | boolean | number | null | undefined
      const raw = (body as Record<string, string | boolean | number | null | undefined>)[field]
      if (raw === undefined) continue // undefined = unchanged, per field

      // null = clear (stored as ''); non-null = set via existing coerceToString path.
      const valueToStore = raw === null ? '' : coerceToString(raw)
      await systemSvc.updateByKey(dbKey, valueToStore, userId)
      updated++
    }
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p src/backend`
Expected: no errors. (`coerceToString(raw: string | boolean | number)` — confirm this signature still compiles now that `raw`'s narrowed type at the call site excludes `null` via the ternary; if TS complains, narrow explicitly with `raw !== null ? coerceToString(raw) : ''` instead of relying on the ternary branch alone.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest systemSettingsNullable --runInBand`
Expected: PASS, all 4 tests.

- [ ] **Step 7: Run the full settings + platform-console suite to confirm no regressions**

Run: `npx jest systemSettings platform-console --runInBand`
Expected: PASS.

- [ ] **Step 8: Confirm scope discipline — no featureFlags or audit-actor changes**

Run: `git diff --stat src/backend/controllers/system-settings.controller.ts` — confirm the diff touches only the 4 SMTP field schema lines and the loop body; `featureFlags` line and any audit-actor code (userId vs platformUserId) must show no changes (ADR D4 explicit exclusion).

- [ ] **Step 9: Commit**

```bash
git add src/backend/controllers/system-settings.controller.ts src/backend/tests/integration/systemSettingsNullable.test.ts
git commit -m "fix(settings): accept null for optional SMTP fields to clear them, symmetric with GET (BUG-004)"
```

---

## Final verification (after all 6 tasks)

- [ ] Run full backend suite: `npx jest --runInBand`
- [ ] Run full frontend suite: `npx vitest run`
- [ ] Run `git log --oneline fix/codex-audit-batch1-stopship` and confirm 6+ commits in the T1→T5→T6→T2→T3→T4 order
- [ ] Hand off to `@ponytail-agent` (Step 5 gate) before `/execute-plan`, then `@qa-agent` (Step 7) for RBAC/isolation sign-off, then `/anemal-finish-branch` (Step 8)
