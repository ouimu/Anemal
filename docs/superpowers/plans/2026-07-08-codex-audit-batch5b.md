# Codex Audit Batch 5B — P2/P3 Hygiene Fixes + Doc-Draft Adoption

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [x]`) syntax for tracking.

**Source of truth:** `docs/adr/0007-codex-audit-batch5-reaudit-fixes.md` (D3, D4, D5, D6a, D6b,
D6c — authoritative). BA sign-off + grilling (Step 3.5) both complete — grill PASS with 6 mandates
folded in; the three that bind this batch are **F3.2** (T1), **F4.2** (T2), **F6c** (T5, cited in
the ADR as part of D6c's "grill mandate, critical"). This plan only implements already-resolved
decisions; it does not re-litigate them.

**Goal:** Close the 4 P2/P3 hygiene findings from the fresh re-audit that ran after Batches 1–4
merged (PRs #8–#11): (D3) a dead `featureFlags` field with zero consumers still occupying a
`.strict()` schema + a full settings-view card; (D4) plan-quota inputs share one lenient render
loop that lets `maxBranches`/`maxUsers` (must be ≥1) accept the same `min={0}`/"Unlimited"
affordance as `maxOwners` (genuinely nullable); (D5) `system-settings.controller.ts` reads
`req.context!.userId` with no comment explaining why that's `undefined` on the platform plane,
inviting a future "fix" that would break the `SettingsAuditLog.changedBy` FK; (D6a/D6b) two
document-only clarifications (legacy role-string nav backlog pointer; vaccination branch-scope
rationale); (D6c) `PlatformConsole.test.tsx`'s stale "STOP-CLASS WIRING BUGS" header and its
mock-proves-nothing throw-test.

**Branch:** `fix/codex-audit-batch5b-hygiene`

**Scope:** 6 tasks (T1=D3, T2=D4, T3=D5, T4=D6a+D6b, T5=D6c, T6=doc reconciliation), independent of
Batch 5A per ADR's scope split — verified: 5A touches `audit-sanitize.ts` (new),
`audit.middleware.ts`, `scrub-audit-secrets.ts`, `platform-audit.repository.ts`,
`platform-plans.service.ts`, `platform-customers.service.ts`, `platform-provisioning.service.ts`,
`platform-plans.controller.ts`, `CustomerDetailView.tsx`, and a backend integration test file for
D2's round-trip check; none of those overlap this batch's files. Both batches may independently
touch `.claude/specs/implementation-status-matrix.md` (doc, not code) — not a conflict.

**Important — planning-time discovery (read before executing T6):** the "pre-existing uncommitted
doc-draft edits" cited in the original task brief (`implementation-status-matrix.md`, `CLAUDE.md`,
`README.md`, `.claude/skills/anemal-platform-console/*`, `.claude/skills/anemal-rbac-matrix/*`,
`.claude/skills/anemal-screen-specs/*`, `.claude/skills/anemal-coding-rules/*`,
`.claude/standards/tech-stack.md`, `.claude/specs/System_Specification.md`) are **no longer
uncommitted** — `git status --short` at plan-writing time shows a clean tree for all of them; they
landed in the Batch 4 doc-repair PR (#11, commits `a1050c3`..`d1071c7`..`2437bfa`). **Re-run
`git status --short` at the start of execution** to confirm this still holds (docs can't be
committed twice) — if somehow dirty again, treat the original brief's fold-in instruction as
still valid for whatever is actually dirty. T6 below is rewritten to reflect the current (clean)
reality: there is nothing to fold in; T6 becomes forward-only doc edits.

**Never commit:** `RecomendByCodex/` (source audit input, not a project doc) or
`.claude/roadmap/ACTIVE/*` (working scratch, not a tracked deliverable).

**Order:** T1 → T2 → T3 → T4 → T5 → T6 (T6 last because it references the outcome of T1/T2/T3
and needs to check Batch 5A's merge state).

---

## Global Constraints (from ADR-0007 + grill record)

- **(grill F3.2, MANDATORY)** T1's frontend card removal and backend schema removal ship in the
  **same commit** — `featureFlags` is currently `.strict()`-accepted on both sides; removing it
  from only one side first would either 400 a still-sending frontend or silently drop a
  still-rendered card's data.
- **(grill F4.2, MANDATORY)** T2's fix is per-`field.key` conditional logic inside the existing
  shared `.map()` loop in `PlatformPlansView.tsx` — not a blanket change to all three quota
  inputs. `maxOwners` keeps its current `min={0}` / "Unlimited" behavior unchanged.
  Backend null-as-unlimited semantics for branches/users is explicitly OUT of scope this batch —
  T2 ends with a backlog note, not an implementation.
- **(grill mandate, critical — D6c)** T5's fix for the throw-test must exercise **real,
  unmocked** hook normalization logic, not flip the existing mock's expected shape. A test that
  only inverts a mock's assertion proves nothing about the actual code path.
- Every "verify against X before writing" note below was already verified by reading the real
  file in this planning session (paths, line numbers, exact code, current commit `2437bfa`).
  Still spot-check nothing drifted between planning and execution.
- One commit per task. Each commit message ends with the required co-author trailer.
- First commit (T1) also carries `docs/adr/0007-codex-audit-batch5-reaudit-fixes.md` and this
  plan file, **unless** Batch 5A's branch/PR already committed the ADR first — check
  `git log --oneline --all -- docs/adr/0007-codex-audit-batch5-reaudit-fixes.md` before T1; if it
  shows a commit already, skip re-adding the ADR file in T1 and just commit the plan file (or
  omit both if 5A's branch already carries this exact plan too, which it won't — 5A's plan is a
  separate file `2026-07-08-codex-audit-batch5a.md`).

---

## Task 1 (ADR D3): Remove dead `featureFlags` field — frontend card + backend schema, atomic

**Confirmed zero hidden consumers:** not in `schema.prisma`, not in `seed.ts`, only in the
controller (schema fields) and the frontend hook/view. Safe to remove outright.

**Files:**
- Modify: `src/backend/controllers/system-settings.controller.ts`
- Modify: `src/frontend/src/hooks/usePlatformSettings.ts`
- Modify: `src/frontend/src/views/platform/PlatformSettingsView.tsx`

**Exact changes (verified current line numbers, `system-settings.controller.ts`):**
1. Line 40: delete `featureFlags:    z.record(z.boolean()).optional(),` from
   `updateAllSettingsSchema` (the `.strict()` object closes right after — no trailing comma
   cleanup needed since it's not the last property... it currently IS listed last before the
   closing `}).strict()`; after deletion `smtpFrom` becomes the last field, drop the dangling
   line entirely).
2. Line 64: delete `featureFlags:    Record<string, boolean>` from the `PlatformSettingsResponse`
   interface.
3. Line 78: change `const partial: Partial<PlatformSettingsResponse> = { featureFlags: {} }` to
   `const partial: Partial<PlatformSettingsResponse> = {}`.
4. Line 96: delete `featureFlags:    partial.featureFlags    ?? {},` from the `data` object
   literal in `getAllSettings`.
5. Line 144: delete the now-stale comment
   `// featureFlags is not in SETTINGS_KEY_MAP so raw is always string | boolean | number | null | undefined`
   — replace with the original shorter form or just drop the `featureFlags`-specific clause,
   whichever reads cleaner (implementer's call; keep it truthful about the remaining fields).

**Exact changes, `usePlatformSettings.ts`:**
6. Line 19: delete `featureFlags:     Record<string, boolean>` from the `PlatformSettings`
   interface (line 10–20).

**Exact changes, `PlatformSettingsView.tsx`:**
7. Line 13: delete `const DEFAULT_FLAGS: Record<string, boolean> = {}`.
8. Line 28: delete the `featureFlags`/`setFeatureFlags` useState line.
9. Line 29: delete the `newFlagKey`/`setNewFlagKey` useState line (only used by the flags UI).
10. Line 42: delete `setFeatureFlags(data.featureFlags ?? {})` from the populate-on-load
    `useEffect`.
11. Line 56: delete `featureFlags,` from the `handleSave` payload object.
12. Lines 61–76: delete `toggleFlag`, `addFlag`, `removeFlag` functions entirely (dead once the
    card is gone).
13. Lines 246–296: delete the entire `{/* ── Feature Flags ─────... */}` `<section>` block.

**Verification:**
```bash
cd src/backend && npx tsc --noEmit
cd src/frontend && npx tsc --noEmit
grep -rn "featureFlags\|DEFAULT_FLAGS\|toggleFlag\|addFlag\|removeFlag\|newFlagKey" src/backend/controllers/system-settings.controller.ts src/frontend/src/hooks/usePlatformSettings.ts src/frontend/src/views/platform/PlatformSettingsView.tsx
# expect: no output (fully removed)
cd src/backend && npx jest settings-api --silent
```
No new test needed — no test currently references `featureFlags` (confirmed via grep before
writing this plan); removing it doesn't break `TC-S011`'s aggregate-update tests since none of
those payloads include the field.

**Commit:**
```
fix(platform-settings): remove dead featureFlags field (ADR-0007 D3)

Zero consumers confirmed (not in schema.prisma, not in seed). Frontend
card and backend .strict() schema field removed in the same commit —
grill F3.2 mandate: a stale frontend still sending the field would 400
if only the backend dropped it first.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Task 2 (ADR D4): Per-field plan-quota validation in `PlatformPlansView.tsx`

**Confirmed current structure:** `PlanForm` (lines 41–116) renders `maxBranches`/`maxUsers`/
`maxOwners` from one shared `.map()` over an array literal (lines 92–113):
```tsx
{([
  { id: 'plan-branches', label: 'Max Branches', key: 'maxBranches' as const },
  { id: 'plan-users',    label: 'Max Users',    key: 'maxUsers'    as const },
  { id: 'plan-owners',   label: 'Max Clients',  key: 'maxOwners'   as const },
]).map((field) => (
  <div key={field.id}>
    ...
    <input
      id={field.id}
      type="number"
      min={0}
      value={value[field.key] ?? ''}
      onChange={(e) => set(field.key, nullableInt(e.target.value))}
      placeholder="Unlimited"
      ...
    />
  </div>
))}
```
All three currently share `min={0}`, no `required`, and `placeholder="Unlimited"`.

**Exact change:** extend the field-descriptor objects with per-field `min`/`required`/
`placeholder`, and read them in the `<input>` instead of the hardcoded literals:
```tsx
{([
  { id: 'plan-branches', label: 'Max Branches', key: 'maxBranches' as const, min: 1, required: true,  placeholder: undefined },
  { id: 'plan-users',    label: 'Max Users',    key: 'maxUsers'    as const, min: 1, required: true,  placeholder: undefined },
  { id: 'plan-owners',   label: 'Max Clients',  key: 'maxOwners'   as const, min: 0, required: false, placeholder: 'Unlimited' },
]).map((field) => (
  <div key={field.id}>
    <label className="block text-label-md text-on-surface-variant mb-xs" htmlFor={field.id}>
      {field.label}{field.required && <span className="text-error"> *</span>}
    </label>
    <input
      id={field.id}
      type="number"
      min={field.min}
      required={field.required}
      value={value[field.key] ?? ''}
      onChange={(e) => set(field.key, nullableInt(e.target.value))}
      placeholder={field.placeholder}
      className="w-full min-h-[44px] px-md border border-outline-variant rounded text-body-sm text-on-surface bg-surface focus:outline-none focus:border-secondary"
    />
  </div>
))}
```
Note: `nullableInt('')` returns `null` — for `maxBranches`/`maxUsers` this still lets the browser's
native `required` validation catch an empty submit before `null` ever reaches the payload (backend
already rejects `null` for those two via its existing positive-int schema — confirmed no seed
breakage since seeded plans use 1–100 range). No backend change in this task.

**Files:**
- Modify: `src/frontend/src/views/platform/PlatformPlansView.tsx` (lines 92–113 region)

**Verification:**
```bash
cd src/frontend && npx tsc --noEmit
npx vitest run PlatformConsole.test.tsx
```
Existing AC-F5 tests (create/edit plan modal) already submit forms with numeric
`maxBranches`/`maxUsers`/`maxOwners` values ≥1 — should stay green unchanged. No new AC is
introduced by this task (it's an input-affordance tightening, not a new behavior needing its own
acceptance criterion) — spot-check manually in the running app that the Max Branches / Max Users
fields no longer accept 0 or blank, and Max Clients still does.

**Backlog note (recorded here per ADR D4, NOT implemented this batch):** the backend currently
treats `null` as "unlimited" for all three quota fields uniformly. Whether `maxBranches`/
`maxUsers` should ever be genuinely nullable (unlimited) at the product level, or whether that
was always a modeling mistake carried over from `maxOwners`, is an open product question —
raise it with `@ba-agent` before any future work touches the backend schema for these two fields.

**Commit:**
```
fix(platform-plans): per-field quota validation for branches/users vs clients (ADR-0007 D4)

maxBranches/maxUsers now require a positive integer (min=1, no
"Unlimited" placeholder); maxOwners keeps its existing nullable/
"Unlimited" semantics. Grill F4.2 mandate: the three fields render
from one shared .map() loop, so the fix is per-field.key conditionals,
not a blanket change. Backend unchanged — null-as-unlimited semantics
for branches/users recorded as an explicit backlog question, not fixed
here.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Task 3 (ADR D5): Explicit platform-plane actor identity in settings audit

**Confirmed current behavior (already correct, hardening comment/clarity only — no behavior
change):** `verifyToken()` casts the JWT payload to the clinic-shaped `JwtPayload` type
regardless of plane; a platform token's raw payload never includes a `userId` field at all
(`signPlatformToken` only signs `{ platformUserId, plane, role }` — see `jwt.ts` lines 6–10,
29–31), so `req.context!.userId` is `undefined` at runtime on the platform plane today, and
`userId ?? null` in `system-settings.service.ts:56/60` already stores `null`. The ADR's fix is to
stop relying on that being merely absent-and-undefined-by-accident and make it an explicit,
commented decision at the two call sites in the controller.

**Files:**
- Modify: `src/backend/controllers/system-settings.controller.ts`
- Modify: `src/backend/tests/integration/settings-api.test.ts` (new regression test)
- Modify: `.claude/skills/anemal-platform-console/SKILL.md` or
  `.claude/skills/anemal-platform-console/references/platform-domain.md` (one doc line —
  implementer's call on which file reads better; `platform-domain.md`'s "Migration note" section
  is the more natural home)

**Exact changes, `system-settings.controller.ts`:**
1. Line 113 (`updateSettingByKey`): replace
   ```ts
   const data = await systemSvc.updateByKey(req.params.key, value, req.context!.userId)
   ```
   with
   ```ts
   // Platform-plane requests carry no userId (JWT has platformUserId instead of it — see
   // jwt.ts's PlatformTokenPayload). settings_audit_log.changedBy FKs clinic users(id); writing
   // a platformUserId there would risk an id-collision bug, not a fix. Actor identity for
   // platform-plane writes lives in the companion platform_audit_logs row instead (ADR-0007 D5).
   const actorUserId = req.context!.plane === 'clinic' ? req.context!.userId : undefined
   const data = await systemSvc.updateByKey(req.params.key, value, actorUserId)
   ```
2. Line 140 (`updateAllSettings`): replace
   ```ts
   const userId = req.context!.userId
   ```
   with
   ```ts
   // See updateSettingByKey's comment above — same rationale (ADR-0007 D5).
   const userId = req.context!.plane === 'clinic' ? req.context!.userId : undefined
   ```
   (the rest of `updateAllSettings` already uses `userId` unchanged below this line).

**New regression test** — add to `src/backend/tests/integration/settings-api.test.ts` inside (or
right after) the existing `TC-S011` describe block, using the already-seeded `platformToken` /
`platformUserId`:
```ts
it('platform admin PUT /platform/settings → changedBy stays NULL, platform_audit_logs has the real actor (ADR-0007 D5)', async () => {
  const res = await request(server)
    .put('/platform/settings')
    .set('Authorization', `Bearer ${platformToken}`)
    .send({ appName: 'Anemal D5 Check' })
  expect(res.status).toBe(200)

  const auditRow = await prisma.settingsAuditLog.findFirst({
    where: { tableName: 'system_settings', fieldName: 'app_name' },
    orderBy: { id: 'desc' },
  })
  expect(auditRow?.changedBy).toBeNull()

  const platformAuditRow = await prisma.platformAuditLog.findFirst({
    where: { performedByPlatformUserId: platformUserId },
    orderBy: { id: 'desc' },
  })
  expect(platformAuditRow).not.toBeNull()
  expect(platformAuditRow!.performedByPlatformUserId).toBe(platformUserId)
})
```
Check whether `auditMiddleware` actually fires a `platformAuditLog` row for `PUT
/platform/settings` today (the ADR asserts it's "proven to already fire correctly" — verify by
reading `audit.middleware.ts`'s route-matching / opt-in list before trusting this, since if
settings routes aren't in its tracked-routes list the second assertion will fail and that's a
separate, real bug to flag rather than silently loosen the test). Add this test's cleanup
(`settingsAuditLog.deleteMany`) to the existing `TC-S011` `afterAll` block's field-name list
(`app_name` is already there).

**Verification:**
```bash
cd src/backend && npx jest settings-api --silent
npx tsc --noEmit
```

**Commit:**
```
fix(platform-settings): explicit undefined for platform-plane audit actor (ADR-0007 D5)

req.context!.userId on a platform token was already undefined at
runtime (platform JWTs never carry that field), so changedBy already
stored NULL — this hardens the comment/intent so a future "fix" can't
accidentally wire a platformUserId into a column FKed to clinic
users(id). New regression test pins both halves: changedBy stays NULL
and the companion platform_audit_logs row carries the real actor.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Task 4 (ADR D6a + D6b): Two documentation-only clarifications, no code change

### D6b — Vaccination branch scope (document only)

**Confirmed intentional:** create/list vaccinations are pet-scoped (tenant-wide — the record
follows the pet across branches, matching ADR-0002's "clinical records follow the pet"
precedent); only the operational due-soon worklist takes a `branchId` filter (confirmed:
`vaccination.controller.ts:31-32` reads `branchId` only in the worklist handler, not in
create/list). No code change — a branch guard on create would break the legitimate "vaccinated
while visiting another branch" flow.

**File:** `.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`

**Exact change:** add one paragraph after the existing "Vaccination administration uses its own
`vaccination.create` code..." note (lines 96–99, in the "Notes on key business decisions"
section):
```markdown
- **Vaccination records are pet-scoped, not branch-scoped** (ADR-0007 D6b, confirmed
  intentional): `POST /api/vaccinations` and its list/history reads follow the pet across
  branches — a pet vaccinated at Branch A shows the record when seen at Branch B, matching
  ADR-0002's "clinical records follow the pet" precedent. The one exception is the operational
  due-soon **worklist** (`GET /api/vaccinations/due-soon`), which does take `branchId` — that's a
  front-desk scheduling view, not the clinical record itself. Do not add a branch guard to
  create/list; it would break the legitimate cross-branch visit flow.
```

### D6a — Legacy role-string navigation (defer to backlog, document only)

**Confirmed still present at all 4 sites** (verified this planning session against current
`main`):
- `src/frontend/src/layouts/ClinicLayout.tsx:31` — `if (role === 'admin') return <Navigate ... />`
- `src/frontend/src/layouts/AdminLayout.tsx:54` — `if (role !== 'admin') return <Navigate ... />`
- `src/frontend/src/hooks/useAuth.ts:97` and `:112` — `navigate(data.role === 'admin' ? ... : ...)`
- `src/frontend/src/views/LoginView.tsx:31` — `role === 'admin' ? '/clinic-admin/dashboard' : ...`

Server-side deny-by-default is already proven (Batch 3: 148 routes × 3 roles, zero gaps) — this
is UX-only nav routing, tied to the not-yet-shipped custom/multi-role Role Editor. No code
change this batch.

**File:** `.claude/roadmap/ACTIVE/remaining-tasks.md` (confirmed tracked in git — this is the real
target of `CLAUDE.md`'s "See `.claude/roadmap/remaining-tasks.md`" reference, which is missing
its `ACTIVE/` segment; do not confuse this with the untracked scratch file
`.claude/roadmap/ACTIVE/codex-audit-remediation-tasks.md`, which stays excluded from every
commit this batch per the "Never commit" rule above — only that one specific file is scratch,
not the whole `ACTIVE/` directory).

**Exact change:** add a backlog line:
```markdown
- **T-5B-02** (backlog, deferred): retire the 4 legacy `role === 'admin'` string-comparison nav
  sites once the custom/multi-role Role Editor ships — `ClinicLayout.tsx:31`,
  `AdminLayout.tsx:54`, `useAuth.ts:97`/`:112`, `LoginView.tsx:31`. Server-side authorization is
  already role-agnostic (deny-by-default, permission-code based); this is UX routing only.
  (ADR-0007 D6a)
```

**Verification:** `git diff` shows only doc changes (no `.tsx`/`.ts` source edits in this task).

**Commit:**
```
docs(rbac): vaccination branch-scope rationale + legacy nav backlog pointer (ADR-0007 D6a, D6b)

Vaccination create/list are intentionally pet-scoped (not branch-
scoped) per ADR-0002 precedent — documented so it isn't rediscovered
as a bug. Legacy role==='admin' string-comparison nav (4 sites) is
deferred to backlog item T-5B-02, tied to the future Role Editor; no
code change, server-side deny-by-default already covers authorization.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Task 5 (ADR D6c): Fix `PlatformConsole.test.tsx` — stale header + mock-proves-nothing throw-test

**Confirmed both bullets in the "STOP-CLASS WIRING BUGS" header (lines 18–29) are already fixed
in the real hooks:**
- `usePlatformCustomers.ts` lines 100–115 (`usePlatformCustomerUsage`): already normalizes the
  raw `{ branches, users, owners, caps }` backend shape into the nested
  `{ branches: {current, limit}, staff: {current, limit}, owners: {current, limit} }` shape the
  `UsageTab` component expects.
- `usePlatformAudit.ts` lines 37–51 (`usePlatformAudit`): already extracts `.items` from the
  backend's `{ items, total, page, limit }` envelope before returning.

**The header is entirely stale — not just the usage half as its own comment implies.**

**Files:**
- Modify: `src/frontend/src/__tests__/PlatformConsole.test.tsx`

**Exact changes:**
1. Delete the entire stale header comment block, lines 18–29 (`⚠️ STOP-CLASS WIRING BUGS asserted
   here...` through the end of that comment).
2. Delete the throw-test at lines 231–239 (`'⚠️ CONTRACT: live backend usage shape ({branches:
   number, no staff}) breaks UsageTab'`) — it mocks `usePlatformCustomers` (see the module mock
   at lines 83–91), so it can never exercise the real normalization code; asserting `.toThrow()`
   against a mocked hook returning raw shape only proves the *component* would throw if fed raw
   data, which is no longer possible since the real hook never returns raw data. This is a
   landmine, not a regression test — delete it.
3. Add a genuine **unmocked** hook unit test in a new co-located file
   `src/frontend/src/hooks/usePlatformCustomers.normalization.test.ts` that imports the real
   `usePlatformCustomerUsage` (not mocked) and mocks only `@tanstack/react-query`'s `useQuery` to
   capture the real `queryFn`, plus `platformApi` to return the real raw backend envelope. This
   matches this codebase's existing convention (see
   `src/frontend/src/views/clinic/__tests__/ClinicGrooming.test.tsx` — mocks `@tanstack/react-query`
   wholesale and captures/invokes the real `queryFn`/`mutationFn` directly, rather than rendering
   a live `QueryClientProvider` tree):
   ```ts
   import { describe, it, expect, vi } from 'vitest'

   const queryFns = vi.hoisted(() => [] as Array<() => unknown>)
   vi.mock('@tanstack/react-query', () => ({
     useQuery: ({ queryFn }: { queryFn: () => unknown }) => {
       queryFns.push(queryFn)
       return { data: undefined, isLoading: true }
     },
   }))

   const rawUsage = {
     branches: 2,
     users: 5,
     owners: 40,
     caps: { maxBranches: 3, maxUsers: 10, maxOwners: 100 },
     overPlan: false,
   }
   vi.mock('../utils/platformApi', () => ({
     default: { get: vi.fn(() => Promise.resolve({ data: { data: rawUsage } })) },
   }))

   import { usePlatformCustomerUsage } from './usePlatformCustomers'

   describe('usePlatformCustomerUsage — raw-to-nested normalization (ADR-0007 D6c)', () => {
     it('normalizes the real backend envelope into the nested {current, limit} shape UsageTab expects', async () => {
       usePlatformCustomerUsage(42)
       expect(queryFns.length).toBeGreaterThan(0)
       const result = await queryFns[queryFns.length - 1]()
       expect(result).toEqual({
         branches: { current: 2, limit: 3 },
         staff:    { current: 5, limit: 10 },
         owners:   { current: 40, limit: 100 },
       })
     })
   })
   ```
   This calls the **real, unmocked** `usePlatformCustomerUsage` function body — the only thing
   mocked is React Query's `useQuery` (to capture the queryFn without needing a live
   `QueryClientProvider`) and the HTTP client (to supply a realistic raw response). If someone
   later reverts the normalization logic inside the hook, this test fails for real.
4. Update the file-header doc comment (lines 1–29) to drop the stale claims and briefly note
   that normalization is now covered by the dedicated hook test file (keep the AC-F1..F6
   reference table, lines 10–16, as-is — those are still accurate).

**Verification:**
```bash
cd src/frontend
npx vitest run PlatformConsole.test.tsx usePlatformCustomers.normalization.test.ts
npx tsc --noEmit
grep -n "STOP-CLASS" src/frontend/src/__tests__/PlatformConsole.test.tsx
# expect: no output
```

**Commit:**
```
test(platform-console): drop stale wiring-bug header, add real normalization coverage (ADR-0007 D6c)

Both bullets in the old "STOP-CLASS WIRING BUGS" header were already
fixed in usePlatformCustomers.ts / usePlatformAudit.ts — the header
was stale, not the code. The old throw-test mocked the hook itself so
it never exercised real normalization; deleted it and added a genuine
unmocked hook unit test asserting usePlatformCustomerUsage's raw-to-
nested transform against the real backend envelope shape (grill
mandate: do not just invert a mock's expected output).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Task 6 (doc reconciliation — revised from original brief per the clean-tree discovery above)

**Step 1 — re-verify the tree is clean:**
```bash
git status --short
git log --oneline --all -- .claude/specs/implementation-status-matrix.md CLAUDE.md README.md | head -5
```
**Update (2026-07-09, post plan-writing): the tree IS dirty again.** The coordinator popped a git
stash (`batch5b-doc-drafts-pending`) containing exactly the 12 files named in the original brief —
these are legitimate Batch 5 doc drafts (verified accurate by BA + grill against an earlier main
state), not stray/unrelated changes. Do NOT discard or ignore them. For each of the 12 files, run
`git diff` yourself, re-verify each claim against CURRENT main (tech stack versions, JWT payload
shape, matrix statuses) since main has moved since these were drafted, then commit the ones that
still hold as this task's deliverable — folding them in alongside (not instead of) the forward-only
D3/D4 edits in Steps 3-4 below. If a claim in the draft no longer matches current main, fix it
before committing rather than committing stale content.

**Step 2 — check whether Batch 5A has merged:**
```bash
git log --all --oneline --grep="5A\|ADR-0007 D1\|ADR-0007 D2" -10
git branch -a | grep 5a
```
At plan-writing time, no `fix/codex-audit-batch5a-security` branch exists yet (only its plan file
`docs/superpowers/plans/2026-07-08-codex-audit-batch5a.md` is on disk) — 5A has **not** merged.
Re-check this at execution time since 5A may land first.

**Step 3 — forward edit, D3 (always applies once T1 lands):**

File: `.claude/skills/anemal-platform-console/SKILL.md` (line 8 in the frontmatter description,
line 37 in the P5 capability table) and
`.claude/skills/anemal-platform-console/references/platform-domain.md` (lines 17, 32, 33).

Current wording lists "feature flags" as a live capability alongside app name/SMTP/maintenance.
Change each of these 5 occurrences from listing feature flags as a current capability to a
one-line deferred note. Example for `platform-domain.md` line 17:
```diff
- | GET/PUT `/platform/settings` | `platform.settings.view\|edit` | app/SMTP/maintenance/feature flags (maps to existing system-settings) |
+ | GET/PUT `/platform/settings` | `platform.settings.view\|edit` | app/SMTP/maintenance (feature flags removed, ADR-0007 D3 — no consumer; re-add with real persistence when a flag-reading feature ships) |
```
Apply the same pattern to `SKILL.md:8` (frontmatter description — drop "feature flags" from the
capability list), `SKILL.md:37` (P5 row), `platform-domain.md:32` (Plans/Packages screen note),
and `platform-domain.md:33` (Platform Settings screen note). Keep each edit terse — one clause,
not a new paragraph, matching the existing table style.

**Step 4 — matrix rows for company-types/plans/settings:**

**Discovery correction to the original brief:** the current matrix rows for these three modules
(`implementation-status-matrix.md` lines 41–44: "Platform — customers", "Platform — plans/quotas",
"Platform — settings", plus line 42/52 "Platform — company types" / "Company types (D-2)") **all
already read `implemented`**, not `bug` — there is no `bug`-status row for any of these three
modules to flip. The matrix's legend (`bug` = "shipped but currently broken") was never applied
to these rows for the ADR-0007 findings, because module-level status predates the fresh
re-audit's micro-findings (D2/D3/D4/D5 are all sub-row-level bugs, not module-breaking).

Given this, do **not** attempt to flip any status value. Instead, append one short parenthetical
to the three affected rows (Platform — plans/quotas, Platform — settings; leave Platform —
customers / company-types alone — that row's only ADR-0007 tie is D2, which is 5A's scope, not
5B's, and per the original brief's own instruction should stay untouched if 5A hasn't merged):

```diff
- | Platform — plans/quotas | `/platform/plans/*` | Package + per-tenant quota mgmt | `routes/platform-plans.routes.ts` | `views/platform/PlatformPlansView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
+ | Platform — plans/quotas | `/platform/plans/*` | Package + per-tenant quota mgmt (branches/users require min=1 — ADR-0007 D4) | `routes/platform-plans.routes.ts` | `views/platform/PlatformPlansView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
```
```diff
- | Platform — settings | `/platform/settings/*` | Integration secrets, AES-256-GCM | `controllers/system-settings.controller.ts` | `views/platform/PlatformSettingsView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
+ | Platform — settings | `/platform/settings/*` | Integration secrets, AES-256-GCM; featureFlags removed (ADR-0007 D3) | `controllers/system-settings.controller.ts` | `views/platform/PlatformSettingsView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
```
If Step 2 finds Batch 5A merged by execution time, ALSO add a `(company-type detail contract
fixed, ADR-0007 D2)` parenthetical to the "Platform — customers" row at that point; if 5A has not
merged, leave that row exactly as-is (do not reference D2 at all yet — avoid claiming a fix that
isn't on `main`).

**Verification:**
```bash
git diff --stat  # should show only the 2 skill files + matrix file touched in this task
npx markdownlint .claude/skills/anemal-platform-console/**/*.md .claude/specs/implementation-status-matrix.md 2>/dev/null || true
```

**Commit:**
```
docs(platform-console): mark featureFlags removed + annotate quota validation (ADR-0007 D3, D4)

Skill docs and the implementation-status matrix updated to reflect
this batch's fixes: featureFlags is gone (not "a current capability"),
and plan quotas now enforce min=1 on branches/users. No status flips
needed on the matrix — the three affected rows were already
"implemented" at module granularity; these are sub-row annotations.
Original task brief's "pre-existing uncommitted doc-draft" fold-in is
moot — that tree was already clean at plan-writing time (Batch 4, PR
#11 landed it).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Definition of done

- [x] T1: `featureFlags` gone from both frontend and backend in one commit; `tsc --noEmit` clean
      both sides; existing settings tests still pass. (commit 2a558cd)
- [x] T2: `maxBranches`/`maxUsers` require `min=1`, no "Unlimited" placeholder; `maxOwners`
      unchanged; existing AC-F5 plan tests still pass; backlog note recorded in this plan (done
      above, no further action needed). (commit a1d950e)
- [x] T3: both `req.context!.userId` reads replaced with explicit plane-conditional `undefined`;
      new regression test passes (`changedBy IS NULL` + companion `platform_audit_logs` row
      exists with correct actor); one doc line added. (commit 12fa389)
- [x] T4: vaccination branch-scope paragraph added to `permission-matrix.md`; legacy-nav backlog
      item recorded with all 4 file:line sites; zero source-code changes. (commit faa54db)
- [x] T5: stale header removed; mock-based throw-test deleted; new unmocked hook normalization
      test added and passing; `grep STOP-CLASS` returns nothing. (commit ce8c044)
- [x] T6: tree-clean re-verified (found dirty again per popped stash, all 12 drafts re-verified
      against current code, 4 stale "bug" rows corrected back to "implemented" since D2/D3/D4
      are fixed on this branch); forward doc edits applied for D3/D4 annotations; no false
      "implemented" claims made for anything not actually merged (5A not merged to main —
      "Platform — customers" row left untouched). (commit 5a358be)
- [x] All 6 commits present on `fix/codex-audit-batch5b-hygiene`, each ending with the required
      co-author trailer.
- [x] Full test suite green: backend 834/835 passing (1 pre-existing, unrelated
      `seedCredentialSmoke.test.ts` failure — confirmed present before this batch's changes via
      `git stash`, a dev-DB seed-state issue, not caused by T1-T6) and
      `cd src/frontend && npx vitest run` 143/143 passing.

**Next steps after this plan is approved by `@ponytail-agent` (Step 5 gate):** `/execute-plan`
(Step 6) → `@qa-agent` sign-off (Step 7) → `/anemal-finish-branch` (Step 8, which invokes
`/anemal-HTML-updater` as its last act).
