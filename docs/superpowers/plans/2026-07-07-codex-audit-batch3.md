# Codex Audit Batch 3 — QA Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Source of truth:** `docs/adr/0005-codex-audit-batch3-qa-automation.md` (D1–D5, authoritative). BA sign-off + grilling (Step 3.5) both complete — grill FAILED first pass (F2, F3, F4, F8 blocking), all four resolved by design amendments encoded in the ADR. This plan only implements already-resolved decisions; it does not re-litigate them.

**Goal:** Deliver the "QA automation to add" items from `RecomendByCodex/06-recommendations.md`: a platform-login smoke case, a CI-enforced role-route authorization matrix (with a route-walker + guard-annotation mechanism built to support it), platform contract tests pinning Zod schemas against payload literals, a strengthened third audit-sink assertion, and a formalized manual browser-smoke gate.

**Branch:** `fix/codex-audit-batch3-qa-automation`

**Order:** T1 → T2 → T3 → T4 → T5 → T6 → T7. T2 (guard annotations) must precede T3 (walker) and T4 (matrix test), since T3's fixture app and T4's real-route sweep both depend on `permissionCodes`/`mode` existing on the closures. T1, T5, T6 have no dependency on T2–T4 and could run in parallel, but this plan executes sequentially in ADR decision order for a clean, reviewable commit history. T7 (docs) runs last since it references the shipped `roleRouteMatrix.test.ts` and the smoke-walkthrough skill it extends.

**Tech Stack:** Backend — Node/Express/Prisma/Jest (`src/backend/`). No frontend code changes in this batch (T7 is docs-only). Full backend suite + full frontend suite run once at the end as regression checks.

**Never commit:** `RecomendByCodex/` (source audit input, not project docs) or `.claude/roadmap/ACTIVE/*` (working scratch, not a tracked deliverable).

---

## Global Constraints (from ADR-0005 + grill record)

- No Playwright, no new dependencies (D5 — ponytail-fail if added; browser smoke stays manual/gated this batch).
- `expressRouteWalker.ts` walks `app._router.stack` recursively (Express 4.19 nested-router pattern via `layer.handle.stack`); it must have its **own** unit test with a small fixture app before it is trusted inside T4 (grill F4/F8 — a regexp bug in the walker must not silently under-enumerate routes and produce false-negative security coverage).
- Guard annotations (`permissionCodes: string[]`, `mode: 'all'|'any'`) are added **only** to `requirePermission` and `requireAnyPermission` (both in `middlewares/permission.middleware.ts`). `requirePlatformPermission` is **explicitly out of scope for annotation** — it is a static, role-enum-backed check (no DB permission table), and the role-route matrix (T4) is built to enumerate **clinic-plane routes only**, verified: every `/platform/*`-mounted route file (`platform-customers`, `platform-plans`, `platform-company-type`, `platform-audit`, `system-settings`) uses `requirePlatformPermission` exclusively — none use `requirePermission`/`requireAnyPermission`. Platform routes are covered only by the plane-mismatch sweep in T4 (clinic token → 403 on a `/platform/*` route), not the per-role allowed/denied sweep.
- Zero behavior change from T2 — the annotation is metadata attached to the returned closure; the closure's runtime behavior (401/403/next) is byte-for-byte unchanged. Verified by keeping all existing `permission.middleware.test.ts` assertions green plus one new assertion per factory.
- DB safety in T4 (grill F8): fixtures created **once** in `beforeAll` (rbac-regression.test.ts:54-101 pattern — isolated tenant + admin/doctor/staff via `user_roles`, `user_branches`); `afterAll` deletes **only** the test's own rows by id; the shared `tenantId=null` system roles/permissions are **never** deleted, ever, by this test.
- T4 expected grants are derived at **runtime** by querying `clinicRole`/`rolePermission` where `tenantId = null` (the proven `rbac-regression.test.ts` pattern) — **no import** of `seed-rbac.ts` (module-private `SYSTEM_ROLES` + top-level `PrismaClient` side effect stays untouched, per grill F2/F3).
- T5 payload literals are fallback-first (grill F11): validated via `safeParse` against the real exported Zod schemas at runtime; cross-tree `import type` of frontend DTOs is an optional, explicitly-skippable spike step, not the primary path.
- T6 pins `maskSecret`'s exact contract (`utils/encryption.ts:52-54`: `'••••••••' + value.slice(-4)`, 8-bullet prefix) — sentinel must be ≥ 5 chars so masking (the `slice(-4)` branch, not the `<=4` full-mask branch) is actually exercised.

---

### Task 1 (ADR D1): Seed credential smoke — add platform login case

**Files:**
- Modify: `src/backend/tests/integration/seedCredentialSmoke.test.ts`

**Verified against `src/backend/prisma/seed.ts:169-171`:**
```ts
const platformEmail    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.co'
const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'
```
Confirmed matching `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` env var names and literal fallbacks — no drift from what T1 will hard-code as its own fallback literals.

**Verified response shape** (`services/platform-auth.service.ts:70-90`, `controllers/platform-auth.controller.ts:37`): `POST /platform/auth/login` returns `{ success: true, data: { token, refreshToken, user: {...} } }` directly — **no** `requiresBranchSelection` branch (that concept is clinic-plane only, from `auth.controller.ts`). Platform login is single-step.

- [x] **Step 1: Add the platform credential case (test-first is moot here — this is an additive `it.each`-style case, not a bug fix; write it directly)**

In `src/backend/tests/integration/seedCredentialSmoke.test.ts`, after the existing `describe('seeded credential smoke test ...')` block, add:
```ts
describe('seeded credential smoke test — platform admin login', () => {
  it('completes single-step platform login for the seeded platform admin', async () => {
    const email    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@anemal.co'
    const password = process.env.PLATFORM_ADMIN_PASSWORD || 'PlatformAdmin1!'

    const res = await request(server)
      .post('/platform/auth/login')
      .send({ email, password })

    expect(res.status).toBe(200)
    expect(typeof res.body.data.token).toBe('string')
    // No branch selection on the platform plane (ADR-0005 D1) — this is a single-step login.
    expect(res.body.data.requiresBranchSelection).toBeUndefined()
  })
})
```
Before finalizing, read `controllers/platform-auth.controller.ts` and `platformLoginSchema` to confirm the request body field name is `email` (not `username`) — platform users are keyed by email, unlike clinic users (subdomain+username). Verify by reading the schema definition, do not assume.

- [x] **Step 2: Run the test**

From `src/backend`: `node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/integration/seedCredentialSmoke.test.ts`
Expected: PASS (this is additive coverage of an already-working path, not a bug fix — no red phase expected, but confirm the seeded platform admin actually exists in the dev/test DB the suite runs against; if 401, check the seed ran).

- [x] **Step 3: Commit**
```bash
git add src/backend/tests/integration/seedCredentialSmoke.test.ts
git commit -m "test(qa): add platform login case to seed credential smoke suite (ADR-0005 D1)"
```

---

### Task 2 (ADR D2 part 1): Guard annotations on `requirePermission` / `requireAnyPermission`

**Files:**
- Modify: `src/backend/middlewares/permission.middleware.ts`
- Modify: `src/backend/tests/unit/permission.middleware.test.ts` (extend — file already exists)

**Interfaces:**
- `requirePermission(permissionCode: string): RequestHandler` — the returned closure additionally carries `permissionCodes: [permissionCode]` and `mode: 'all'` as own properties (assigned after the arrow function is created, before `return`).
- `requireAnyPermission(permissionCodes: string[]): RequestHandler` — the returned closure carries `permissionCodes` (the same array reference) and `mode: 'any'`.
- `requirePlatformPermission` is **not** touched (out of scope — see Global Constraints).

TDD: write the failing unit test first, then implement.

- [x] **Step 1: Read the existing unit test file to match its conventions**

Read `src/backend/tests/unit/permission.middleware.test.ts` in full — match its existing `req`/`res`/`next` mock helper pattern exactly (do not introduce a second mocking style in the same file).

- [x] **Step 2: Write the failing annotation assertions**

Add to `permission.middleware.test.ts` (inside or alongside the existing describe blocks for each factory):
```ts
describe('guard annotations (ADR-0005 D2) — zero behavior change, metadata only', () => {
  it('requirePermission attaches permissionCodes + mode:"all" to the returned closure', () => {
    const handler = requirePermission('billing.view')
    expect((handler as any).permissionCodes).toEqual(['billing.view'])
    expect((handler as any).mode).toBe('all')
  })

  it('requireAnyPermission attaches permissionCodes + mode:"any" to the returned closure', () => {
    const handler = requireAnyPermission(['roles.view', 'roles.manage'])
    expect((handler as any).permissionCodes).toEqual(['roles.view', 'roles.manage'])
    expect((handler as any).mode).toBe('any')
  })
})
```

- [x] **Step 3: Run to verify failure**

From `src/backend`: `node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/unit/permission.middleware.test.ts`
Expected: FAIL — `permissionCodes`/`mode` are `undefined` on the current closures.

- [x] **Step 4: Implement the annotations**

In `middlewares/permission.middleware.ts`, change `requirePermission`:
```ts
export function requirePermission(permissionCode: string): RequestHandler {
  const handler: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ... existing body, unchanged ...
  }
  ;(handler as RequestHandler & { permissionCodes: string[]; mode: 'all' | 'any' }).permissionCodes = [permissionCode]
  ;(handler as RequestHandler & { permissionCodes: string[]; mode: 'all' | 'any' }).mode = 'all'
  return handler
}
```
Apply the equivalent change to `requireAnyPermission`, setting `mode = 'any'` and `permissionCodes = permissionCodes` (the parameter array, passed through as-is — do not clone unless the existing code already treats it as owned/mutable elsewhere; grep first).

Do not modify `requirePlatformPermission`.

- [x] **Step 5: Run to verify pass, then run the full unit suite as a zero-behavior-change regression check**

```
node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/unit/permission.middleware.test.ts
node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/unit/permission.middleware.test.ts tests/unit/middlewares.test.ts
```
Expected: PASS — all pre-existing 401/403/next-call assertions in this file remain green (proves the annotation is additive, not behavior-changing).

- [x] **Step 6: Commit**
```bash
git add src/backend/middlewares/permission.middleware.ts src/backend/tests/unit/permission.middleware.test.ts
git commit -m "feat(rbac): attach permissionCodes+mode guard annotations to requirePermission/requireAnyPermission (ADR-0005 D2)"
```

---

### Task 3 (ADR D2 part 2): `expressRouteWalker.ts` helper + its own unit test

**Files:**
- Create: `src/backend/tests/helpers/expressRouteWalker.ts`
- Create: `src/backend/tests/helpers/__tests__/expressRouteWalker.test.ts` (own unit test, fixture app, per ADR/grill F4/F8 — a walker bug must not silently under-enumerate)

TDD: fixture-app walker test first (red), then implement the walker (green). T4 depends on this being trustworthy first.

**Interface (new module):**
```ts
export interface EnumeratedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string                          // reconstructed full mount path, e.g. '/clinic/roles/:roleId/permissions'
  permissionCodes?: string[]            // present only if a requirePermission/requireAnyPermission layer guards this route
  mode?: 'all' | 'any'
}

export function walkRoutes(app: import('express').Express): EnumeratedRoute[]
```

- [x] **Step 1: Write the walker's own fixture-app unit test first**

Create `src/backend/tests/helpers/__tests__/expressRouteWalker.test.ts`:
```ts
/**
 * The route walker is load-bearing for roleRouteMatrix.test.ts's security
 * coverage (ADR-0005 D2) — a regexp bug here could silently under-enumerate
 * routes and produce a false-negative "everything is guarded" result. This
 * test pins the walker's behavior against a small, known 3-route fixture app
 * BEFORE it is trusted against the real app tree.
 */
import express from 'express'
import { walkRoutes } from '../expressRouteWalker'

function buildFixtureApp() {
  const app = express()
  const nested = express.Router()

  const guarded: express.RequestHandler = ((req, res, next) => next()) as express.RequestHandler & {
    permissionCodes: string[]; mode: 'all' | 'any'
  }
  ;(guarded as any).permissionCodes = ['fixture.view']
  ;(guarded as any).mode = 'all'

  nested.get('/:id', guarded, (req, res) => res.json({ ok: true }))
  app.use('/nested', nested)
  app.post('/plain', (req, res) => res.json({ ok: true }))          // unguarded, top-level
  app.get('/health', (req, res) => res.json({ status: 'ok' }))       // unguarded, top-level

  return app
}

describe('expressRouteWalker — fixture app (3 routes)', () => {
  const routes = walkRoutes(buildFixtureApp())

  it('enumerates exactly 3 routes', () => {
    expect(routes).toHaveLength(3)
  })

  it('reconstructs the nested mount path with param placeholder intact', () => {
    const nested = routes.find(r => r.method === 'GET' && r.path === '/nested/:id')
    expect(nested).toBeDefined()
    expect(nested?.permissionCodes).toEqual(['fixture.view'])
    expect(nested?.mode).toBe('all')
  })

  it('enumerates top-level unguarded routes with no permissionCodes', () => {
    const plain = routes.find(r => r.method === 'POST' && r.path === '/plain')
    expect(plain).toBeDefined()
    expect(plain?.permissionCodes).toBeUndefined()

    const health = routes.find(r => r.method === 'GET' && r.path === '/health')
    expect(health).toBeDefined()
    expect(health?.permissionCodes).toBeUndefined()
  })
})
```

- [x] **Step 2: Run to verify failure**

`node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/helpers/__tests__/expressRouteWalker.test.ts`
Expected: FAIL — module `../expressRouteWalker` doesn't exist yet.

- [x] **Step 3: Implement the walker**

Create `src/backend/tests/helpers/expressRouteWalker.ts`. Recursively walk `app._router.stack`; for each layer:
- If `layer.route` exists, it's a terminal route — read `layer.route.path` and `layer.route.methods` (object of `{get: true, ...}`), and inspect `layer.route.stack` (the per-method handler chain) for any handler carrying `.permissionCodes`/`.mode` (set by T2). Concatenate with the current mount-path prefix.
- If `layer.name === 'router'` and `layer.handle.stack` exists, it's a nested router — recurse, prefixing with the mount path reconstructed from `layer.regexp` (Express stores the mount path in `layer.regexp` and, in Express 4.19+, also in `layer.path`/`layer.params` in some builds; **verify against the installed express version** — `require('express/package.json').version` — before relying on `layer.regexp.fast_slash`/source-string parsing, since regexp-to-path reconstruction is exactly where a bug would under-enumerate; prefer any exposed `layer.path`/mount metadata the installed version provides over hand-parsing `regexp.toString()` if available).
- Skip layers that are neither a route nor a named sub-router (e.g. bare middleware like `helmet()`, `cors()`, `express.json()`).
- Normalize path params to `:name` form (Express already stores them this way in `layer.route.path` for nested routers — mount-path params from parent `app.use('/users/:userId/branches', ...)`-style dynamic mounts, if any exist in this codebase, must also resolve to `:name`; grep `app.use\(` and route files for parameterized mount paths before finalizing — none were found in `app.ts` at the time this plan was written, but verify at implementation time since a missed one would silently break path reconstruction for that subtree).

- [x] **Step 4: Run to verify pass**

`node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/helpers/__tests__/expressRouteWalker.test.ts`
Expected: PASS.

- [x] **Step 5: Sanity-check against the real app before T4 depends on it**

Write a throwaway local script or extend the test temporarily with `import app from '../../../app'; console.log(walkRoutes(app).length)` to eyeball a plausible total route count (cross-check against `grep -c "router\.\(get\|post\|put\|patch\|delete\)(" src/backend/routes/*.routes.ts` plus the one `app.get('/health', ...)`). Remove the throwaway check before committing — it is a manual sanity step, not a kept test.

- [x] **Step 6: Commit**
```bash
git add src/backend/tests/helpers/expressRouteWalker.ts src/backend/tests/helpers/__tests__/expressRouteWalker.test.ts
git commit -m "test(qa): add expressRouteWalker helper with its own fixture-app unit test (ADR-0005 D2)"
```

---

### Task 4 (ADR D2 part 3): `roleRouteMatrix.test.ts` — CI-enforced role/route authorization sweep

**Files:**
- Create: `src/backend/tests/integration/roleRouteMatrix.test.ts`

**Fixture pattern** (verified against `tests/integration/rbac-regression.test.ts:54-101`): isolated tenant(s) + admin/doctor/staff created **once** in `beforeAll` via `prisma.user.createMany` + `user_roles` (via the `seedUserRoles` helper at `tests/helpers/seedUserRoles.ts`, which resolves system `ClinicRole` ids by key where `tenantId: null` and creates `UserRole` rows) + `user_branches` (via `prisma.userBranch.createMany`, required because inventory/branch-scoped endpoints read `branchId` from the token). Login via the two-step `/auth/login` → `/auth/select-branch` flow (see `login()` helper in `rbac-regression.test.ts:33-40`, reuse the same shape). Sequential requests (no `Promise.all` fan-out per grill F8 concurrency concern), shared `server` listener, `server.keepAliveTimeout = 0`.

**Expected-grants derivation (grill F2/F3 — do NOT import `seed-rbac.ts`):**
```ts
async function expectedPermissionsFor(roleKey: 'clinic_admin' | 'doctor' | 'clinic_staff'): Promise<Set<string>> {
  const role = await prisma.clinicRole.findFirstOrThrow({ where: { key: roleKey, tenantId: null } })
  const grants = await prisma.rolePermission.findMany({ where: { roleId: role.id }, include: { permission: true } })
  return new Set(grants.map(g => g.permission.code))
}
```
Verify the exact Prisma relation/field names (`rolePermission.permission.code` vs a differently-named include) against `permission.service.ts`'s `resolvePermissions` implementation before finalizing — match whatever shape that service already uses so the "expected" side and the "actual runtime" side can never drift from two different join conventions.

**Semantics (verified, exact per ADR):**
- `allowed` = response status **NOT IN** `{401, 403}` (2xx/400/404/422 all count as "reached the handler, not denied"; `POST`/`PUT`/`PATCH` bodies are `{}`).
- `denied` = exactly `403`.
- `no-token sweep` = exactly `401` (send with no `Authorization` header at all).
- Dynamic `:id`/`:roleId`/`:userId` segments → dummy `999999` (verified: guards run before any controller/`router.param` resolves the id, and no permission code in the catalogue is conditioned on which id was passed — confirmed by reading `permission.middleware.ts`, which never inspects `req.params`).

**Plane sweeps (both directions):**
- A clinic-plane token hitting any enumerated `/platform/*` route → expect `403`.
- A platform-plane token hitting any enumerated guarded clinic route (e.g. `/clinic/roles`, `/api/pets`) → expect `403`.

**Unmapped-route allowlist (verified by reading each route file in this session — do not re-derive from scratch, but re-confirm at implementation time since routes may have changed):**
```ts
const UNMAPPED_ALLOWLIST: Array<{ method: string; path: string; reason: string }> = [
  { method: 'GET',  path: '/health',              reason: 'Public health check, mounted directly on app, no auth at all.' },
  { method: 'POST', path: '/auth/login',           reason: 'Public — credentials ARE the auth.' },
  { method: 'POST', path: '/auth/select-branch',   reason: 'Public — step 2 of login, secured by signed pendingToken, not a permission.' },
  { method: 'POST', path: '/auth/refresh',         reason: 'Public — refresh token IS the auth.' },
  { method: 'POST', path: '/auth/logout',          reason: 'Public — revokes by refresh token, no permission needed.' },
  { method: 'GET',  path: '/auth/me',              reason: 'requirePlane("clinic") only — any authenticated clinic user reads their own identity, no permission gate by design.' },
  { method: 'GET',  path: '/api/settings/personal', reason: 'requirePlane("clinic") only — S2.3: personal preferences are self-service for any clinic role.' },
  { method: 'PUT',  path: '/api/settings/personal', reason: 'requirePlane("clinic") only — same as above.' },
]
```
Note: `/platform/auth/*` and other `/platform/*` routes are **not** part of this allowlist and **not** part of the per-role sweep either — they are excluded from the clinic-route enumeration entirely (walker results filtered to routes NOT under `/platform`), consistent with the Global Constraints note that platform routes use `requirePlatformPermission` (unannotated by design) and are covered only by the plane-mismatch sweep.

Before finalizing this list, re-run the verification done during planning: `Grep -n "router\.\(get\|post\|put\|patch\|delete\)(" <each clinic-mounted route file>` and confirm every match either has `requirePermission`/`requireAnyPermission` on the same line or appears in the allowlist above. At the time this plan was written, every clinic-mounted route file other than `auth.routes.ts` and `settings.routes.ts` (the `/personal` lines) had full annotation coverage — re-verify this hasn't drifted.

- [x] **Step 1: Write the test skeleton with fixtures (beforeAll/afterAll) — no assertions yet**

Create `src/backend/tests/integration/roleRouteMatrix.test.ts`. Set up: one isolated tenant (`SUB = 'role-route-matrix'`), one branch, three users (admin/doctor/staff) via `seedUserRoles`, `user_branches` rows, sequential logins producing `adminToken`/`doctorToken`/`staffToken`. Also stand up one platform user + `signPlatformToken` (pattern from `auditRedaction.test.ts:38-47`) for the plane-sweep direction. `afterAll` deletes only this test's own tenant/users/roles by id (never touch `tenantId: null` rows).

- [x] **Step 2: Run to verify the skeleton boots (no real assertions to fail yet, this step just proves fixtures work)**

`node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/integration/roleRouteMatrix.test.ts`
Expected: PASS (empty test body or a single `expect(true).toBe(true)` placeholder) — confirms tenant/user/role/branch/login fixtures all succeed before layering the real sweep on top.

- [x] **Step 3: Add the enumeration + allowed/denied/no-token sweep**

Using `walkRoutes(app)` from T3, filter to routes NOT starting with `/platform`. For each remaining route:
- If in `UNMAPPED_ALLOWLIST` and has no `permissionCodes` → skip (or assert it truly has none, to catch the allowlist going stale if someone adds a guard later without removing the allowlist entry — prefer this stronger form: `if (allowlisted) { expect(route.permissionCodes).toBeUndefined(); return }`).
- Else if it has no `permissionCodes` and is **not** allowlisted → **fail** (`throw`/`fail()` naming the exact method+path, per ADR's "unmapped-route guard").
- Else (has `permissionCodes` + `mode`): compute `expected = mode === 'all' ? permissionCodes.every(c => rolePerms.has(c)) : permissionCodes.some(c => rolePerms.has(c))` for each of admin/doctor/staff's `expectedPermissionsFor(...)` set, and assert the live HTTP call's allowed/denied outcome matches, for all three roles, plus the no-token 401 case.

- [x] **Step 4: Add the plane sweeps**

For a representative sample of enumerated clinic routes (or all of them — budget allows per ADR's "runtime budget ~1-3 min accepted"), assert platform token → 403. For a representative sample of `/platform/*` routes (enumerate separately, unfiltered), assert clinic token (any of admin/doctor/staff) → 403.

- [x] **Step 5: Run the full file**

`node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/integration/roleRouteMatrix.test.ts`
Expected: PASS. If any route fails the allowed/denied sweep, that is either (a) a genuine RBAC gap this test correctly caught — flag to `@qa-agent`/`@ba-agent`, do not silently loosen the assertion — or (b) an expected-grants derivation bug — fix the derivation, not the test's strictness.

- [x] **Step 6: Commit**
```bash
git add src/backend/tests/integration/roleRouteMatrix.test.ts
git commit -m "test(qa): add CI-enforced role-route authorization matrix sweep (ADR-0005 D2)"
```

---

### Task 5 (ADR D3): `platformContract.test.ts` — Zod contract pinning

**Files:**
- Create: `src/backend/tests/integration/platformContract.test.ts` (unit-style — no server, no supertest, pure `safeParse` calls)

**Schemas verified exported** (grep confirmed):
- `controllers/platform-customers.controller.ts`: `createCustomerSchema`, `updateCustomerSchema` (also `setQuotaSchema`, `updateProvisioningSchema` — in scope too, ADR names "customer create/edit" but the file exports these four; include all for completeness since they're free once the file is imported).
- `controllers/platform-plans.controller.ts`: `createPlanSchema`, `updatePlanSchema`.
- `controllers/system-settings.controller.ts`: `updateAllSettingsSchema` (also `updateSystemSettingSchema` for the single-key `PUT /:key` route — include both).

- [x] **Step 1: Write the contract test file**

```ts
/**
 * Pins representative frontend payload shapes against the REAL exported Zod
 * schemas (ADR-0005 D3) — catches silent frontend/backend drift on the
 * platform-console contracts without a cross-tree TypeScript import (ts-jest
 * rootDir '.' rejects reaching into src/frontend from src/backend — grill
 * F11 confirmed this is a spike, not the primary path; see Step 3 below).
 */
import {
  createCustomerSchema, updateCustomerSchema, setQuotaSchema, updateProvisioningSchema,
} from '../../controllers/platform-customers.controller'
import { createPlanSchema, updatePlanSchema } from '../../controllers/platform-plans.controller'
import { updateAllSettingsSchema, updateSystemSettingSchema } from '../../controllers/system-settings.controller'

describe('platform contract — createCustomerSchema', () => {
  // KEEP IN SYNC with src/frontend/src/views/platform/<create-customer-form-hook> payload shape
  it('accepts a representative valid create-customer payload', () => {
    const result = createCustomerSchema.safeParse({ /* fill in exact required fields — read the schema first */ })
    expect(result.success).toBe(true)
  })
  it('rejects a payload missing a required field', () => {
    const result = createCustomerSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// Repeat the same positive+negative pair for: updateCustomerSchema, setQuotaSchema,
// updateProvisioningSchema, createPlanSchema, updatePlanSchema, updateAllSettingsSchema,
// updateSystemSettingSchema.
```
Implementer note: read each schema's actual `z.object({...})` field definitions (already located at the line numbers found during planning — `platform-customers.controller.ts:19,28,37,52`; `platform-plans.controller.ts:16,27`; `system-settings.controller.ts:9,29`) before writing the payload literals — do not guess field names or types. Each `it` block's payload literal gets a `// KEEP IN SYNC with <frontend file/hook>` comment naming the actual frontend call site (grep `src/frontend/src` for the matching `api.post`/`api.put` call to find it).

- [x] **Step 2: Run**

`node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/integration/platformContract.test.ts`
Expected: PASS for all positive cases (proves the payload literals are currently valid per the live schema) and PASS for all negative cases (proves `safeParse` correctly rejects the incomplete payload — this is not a "should fail then be fixed" TDD step since there's no bug being fixed, just new coverage of an existing contract).

- [x] **Step 3 (optional, explicitly skippable per ADR D3): cross-tree import spike**

Attempt `import type { CreateCustomerPayload } from '../../../frontend/src/...'` in a scratch file; if `ts-jest`'s `rootDir` rejects it (expected), abandon — do not spend more than a few minutes here, and do not add `ts-jest` config changes to make it work (that is out of this batch's scope — ponytail-gate risk). Note the outcome in the commit message or PR description, do not leave partial scaffolding in the repo either way.

- [x] **Step 4: Commit**
```bash
git add src/backend/tests/integration/platformContract.test.ts
git commit -m "test(qa): pin platform-console Zod contracts with payload-literal safeParse coverage (ADR-0005 D3)"
```

---

### Task 6 (ADR D4): Strengthen the third audit-sink assertion in `auditRedaction.test.ts`

**Files:**
- Modify: `src/backend/tests/integration/auditRedaction.test.ts` (existing file — already covers `platform_audit_logs` and `audit_logs`; this task adds the third sink, `settings_audit_logs`, and strengthens the shape assertion)

**Verified:** `settings_audit_logs` rows are written by `models/settings-audit.repository.ts` and `models/tenant-settings.repository.ts:37` (via `prisma.settingsAuditLog.createMany`), triggered by `PUT /platform/settings` (system-settings routes, `requirePlatformPermission('platform.settings.edit')`) and by clinic tenant-settings updates. `maskSecret` (`utils/encryption.ts:52-54`) returns `'••••••••'` for values ≤ 4 chars, else `` `••••••••${value.slice(-4)}` `` — sentinel must be **≥ 5 chars** to exercise the `slice(-4)` branch, not just the full-mask branch.

- [x] **Step 1: Read the full existing file to place the new block consistently**

Read `tests/integration/auditRedaction.test.ts` in full (already read during planning — reconfirm no drift) to match its existing `beforeAll`/`afterAll` fixture and login-helper conventions exactly; the new sub-test reuses `platformToken` already established in the existing `beforeAll`.

- [x] **Step 2: Write the failing (or newly-added, non-regression) sentinel-shape assertion**

Add to the existing `describe('audit redaction — platform plane', ...)` block, or a new sibling describe:
```ts
describe('audit redaction — third sink (settings_audit_logs)', () => {
  it('masks a changed settings secret as literal "••••••••" + last-4, and never stores the full sentinel', async () => {
    const sentinel = 'SENTINEL-SETTINGS-SECRET-12345' // >=5 chars, exercises the slice(-4) branch
    const res = await request(server)
      .put('/platform/settings/smtpPassword')  // verify exact key/route shape against system-settings.routes.ts + updateSystemSettingSchema before finalizing
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ value: sentinel })
    expect([200, 400, 404]).toContain(res.status)

    const rows = await prisma.settingsAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
    const expectedMasked = `••••••••${sentinel.slice(-4)}`
    for (const row of rows) {
      const serialized = JSON.stringify(row) // adjust to the actual column holding old/new value, per the repository's schema
      expect(serialized).not.toContain(sentinel)
    }
    // At least one row (the one this test just created, if any) must show the exact masked shape —
    // read settings-audit.repository.ts's actual column names (oldValue/newValue or similar) before
    // finalizing which field to assert `toBe(expectedMasked)` against; do not assume the field name.
  })
})
```
Implementer note: read `models/settings-audit.repository.ts` and the `SettingsAuditLog` Prisma model (`prisma/schema.prisma:205` onward) in full before finalizing the route/body/column names above — this plan sketches the shape from what was verified during planning but the exact route path (`PUT /platform/settings/:key` vs `PUT /platform/settings` bulk) and the exact audit-log column name (`oldValue`/`newValue`/`changes` JSON) must be confirmed against the real schema, not assumed.

- [x] **Step 3: Run**

`node node_modules/jest/bin/jest.js --runInBand --forceExit --runTestsByPath tests/integration/auditRedaction.test.ts`
Expected: PASS for all three sinks (existing two + new one).

- [x] **Step 4: Commit**
```bash
git add src/backend/tests/integration/auditRedaction.test.ts
git commit -m "test(qa): strengthen third audit-sink (settings_audit_logs) to pin maskSecret's exact masked shape (ADR-0005 D4)"
```

---

### Task 7 (ADR D5): Formalize the manual browser-smoke gate

**Files:**
- Modify: `.claude/roadmap/qa-protocols.md`
- Modify: `.claude/skills/anemal-smoke-walkthrough/SKILL.md`

No tests — documentation-only task.

- [x] **Step 1: Add the "Browser smoke (manual, gated)" section to qa-protocols.md**

Insert a new numbered Protocol section (after the existing protocols — read the file's current numbering before choosing the next number) stating: required at Step 7 (QA sign-off) for any release-bound branch touching frontend or auth code; performed via the `anemal-smoke-walkthrough` skill; output is a role×page status table; that table **is** the sign-off artifact (attach to the PR or plan file) — a release-bound branch touching frontend/auth cannot reach Step 8 without one attached. State explicitly this is a deliberate manual gate, not deferred/skipped automation (D5 — no Playwright this batch; automated E2E revisited at Phase 10/11, tracked as a backlog entry, not a TODO left dangling).

- [x] **Step 2: Extend `anemal-smoke-walkthrough/SKILL.md` with a create/edit-one-record step**

In the "Steps per role" section, after the existing step 4 (nav-item walk + console/network check), add a new step: "For at least one role per plane, create or edit one representative record end-to-end (e.g. clinic: create an owner+pet or edit a pet; platform: create or edit a customer) — a pure nav-and-look pass can miss write-path regressions (validation, permission checks) that only surface on submit." Keep the existing report format (role | page | status | detail) — add "action" as an optional note column only if the create/edit step needs it, don't restructure the table.

- [x] **Step 3: Add the backlog note for automated E2E**

In `qa-protocols.md`'s new section (or a "Backlog" subsection), add: "Automated browser E2E (Playwright or equivalent) is explicitly deferred to Phase 10/11 per ADR-0005 D5 — not a gap, a scoped decision (no new heavyweight dependency this batch)."

- [x] **Step 4: Commit**
```bash
git add .claude/roadmap/qa-protocols.md .claude/skills/anemal-smoke-walkthrough/SKILL.md
git commit -m "docs(qa): formalize manual browser-smoke as the release gate at Step 7; extend smoke-walkthrough with a create/edit step (ADR-0005 D5)"
```

---

## Final verification (after all 7 tasks)

- [ ] Run full backend suite: `node node_modules/jest/bin/jest.js --runInBand --forceExit` (from `src/backend`) — expect all suites pass, including the 5 new/extended test files (T1, T3's helper test, T4, T5, T6) and the T2 unit-test extension.
- [ ] Run full frontend suite: `npm test -- --run` (from `src/frontend`) — expect no regressions (no frontend files changed this batch, this is a pure regression check).
- [ ] Confirm `RecomendByCodex/` and `.claude/roadmap/ACTIVE/*` were never staged in any commit this batch: `git log --stat fix/codex-audit-batch3-qa-automation -- RecomendByCodex .claude/roadmap/ACTIVE` should show no output.
- [ ] Run `git log --oneline fix/codex-audit-batch3-qa-automation` and confirm 7 commits in T1→T2→T3→T4→T5→T6→T7 order, with ADR-0005 and this plan file included in the first commit's diff (per the task brief: "First commit includes ADR-0005 + plan file").
- [ ] Hand off to `@ponytail-agent` (Step 5 gate) before `/execute-plan`, then `@qa-agent` (Step 7) for sign-off — T4 (role-route matrix) and T6 (audit redaction) are RBAC/security-relevant and should get particular scrutiny; T4's own pass/fail result is itself a QA deliverable (any route it flags as a real gap must be triaged, not silently loosened) — then `/anemal-finish-branch` (Step 8, which invokes `/anemal-HTML-updater` as its last act).
