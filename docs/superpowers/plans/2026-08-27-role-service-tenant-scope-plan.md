# Role Service Tenant Scope — Implementation Plan (Step 4 `/write-plan`)

**Branch:** `fix/role-service-tenant-scope`
**Author:** @pm-agent
**Date:** 2026-08-27
**Inputs (read in full):**
- `docs/superpowers/plans/2026-08-27-role-service-tenant-scope.md` (Step 1 brainstorm, human-approved)
- `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-pm-tasks.md` (Step 2, reworked, RST-1…RST-7)
- `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-ba-signoff.md` (Step 3 — APPROVED WITH CONDITIONS C-1…C-8, all folded)
- `docs/superpowers/plans/2026-08-27-role-service-tenant-scope-grill.md` (Step 3.5 — ALL FINDINGS RESOLVED)

**Governing rule (repeat, do not re-litigate):** a query gating a state-changing operation must be
scoped to the caller's tenant in the query itself, not by a caller's upstream guard (ADR-0025 D-1).
This branch closes an existing deviation from that ratified rule; it is not new policy.

**No re-analysis performed here.** RST-1…RST-7 in the pm-tasks doc already carry exact before/after
code, exact file paths, and exact AC. This document reformats that content into the repo's
execute-plan checkbox convention (per `2026-08-21-auth-recovery-paths.md` /
`2026-08-19-branch-select-login-flash.md` precedent) and sequences it into 2–5 minute atomic tasks.
All decisions already made are preserved unchanged:
- RST-6 catches `PrismaClientKnownRequestError` by a plain `err.code === 'P2003'` check — no
  `meta.field_name` narrowing (grill G-1, matches codebase-wide convention).
- RST-5 is a silent bug fix — no release note, no customer communication (grill G-2).
- RST-7 is a comment-only fix to `roleEditor-t5f01.test.ts:142` (grill G-3).

**⚠️ Grep/glob scoping hazard (per BA C-2 — repeat because it will bite again otherwise):** the
schema file is **`src/backend/prisma/schema.prisma`** — no `prisma/` directory exists at repo root.
A bare `**/schema.prisma` glob returns three false matches that must never be edited:
`.claude/worktrees/wizardly-kowalevski-14f642/…/schema.prisma`,
`src/backend/.claude/worktrees/exciting-volhard-2256e8/…/schema.prisma`, and
`node_modules/.prisma/client/schema.prisma`. Scope every grep/glob on this branch to `src/backend/`.

---

## 1. Files touched (Ponytail pre-check restated for Step 5)

| File | Change | Status |
|---|---|---|
| `src/backend/models/role.repository.ts` | `countRoleUsage` signature (RST-1), `listRoles` `_count` filter (RST-5) | **Done, committed `f60dbe5`** |
| `src/backend/services/role.service.ts` | call-site update (RST-2), FK-catch (RST-6) | **Done, committed `f60dbe5`** |
| `src/backend/prisma/schema.prisma` | comment-only, line ~225 (RST-4) | **Done, committed `f60dbe5`** |
| `src/backend/tests/unit/role.repository.test.ts` | **new file** (RST-3) | Outstanding — Task 4 |
| `src/backend/tests/integration/roleEditor-t5f01.test.ts` | comment-only, line 142 (RST-7) | Outstanding — Task 9 |

5 files (4 edits + 1 new), 0 new subsystems, 0 duplicate work, 0 new deps, 0 new endpoints, 0
migrations, 0 new error classes. Well under all 7 Ponytail thresholds — flag this preemptively at
Step 5 so RST-5/6/7 (added after the original v1 scope) don't read as scope creep: they are 1-line,
~3-line, and comment-only changes respectively, in files already being touched by RST-1/2.

**Update (post Ponytail run 1, 2026-08-27):** Tasks 1, 2, 3, 5, 8 were already applied to the working
tree ahead of this plan doc (from earlier same-day pipeline iteration) and are now committed at
`f60dbe5`. Ponytail's first pass correctly flagged this as stale-plan-vs-repo drift (criterion 2,
duplicate work) — not a scope problem. Those five tasks below are rewritten as verification-only
checkboxes; genuinely outstanding work is Task 4, Task 9, and the re-run/compile checks in Task 6/7.

## 2. AC → task map (traceability, per this repo's write-plan convention)

| AC source | Statement | Task(s) | Test |
|---|---|---|---|
| RST-1 | `countRoleUsage(roleId, tenantId)`, query scoped, JSDoc updated | Task 1 | Task 4 (T1/T2), compile check Task 7 |
| RST-2 | Call site passes `tenantId`; existing integration tests unmodified pass | Task 2 | Task 6 (re-run) |
| RST-3 | Drifted `UserRole` row excluded from count; non-drifted row included; cleanup order; red-before-fix falsifiability | Task 4 | T1 (exclude), T2 (include) |
| RST-4 | Stale ADR-0019 comment fixed, comment-only, no migration | Task 3 | Task 7 (diff check) |
| RST-5 | `listRoles`'s `_count.userRoles` scoped by `tenantId` | Task 5 | T3 (system role, 2-tenant), T4 (custom role regression) |
| RST-6 | FK P2003 caught in `deleteRole`, re-thrown as `ConflictError`; other errors pass through; happy path unaffected | Task 8 | T5 (409 on drift fixture), T6 (happy path) |
| RST-7 | Stale "count is global to the role" comment fixed | Task 9 | Task 6 (re-run, unmodified pass) |

7 AC groups, 6 named tests (T1–T6) + 2 pure re-run/compile checks. No orphaned AC.

## 3. Interfaces changed (decided already in pm-tasks, restated for the executor)

```ts
// src/backend/models/role.repository.ts
export function countRoleUsage(roleId: number, tenantId: number): Promise<number>
// prisma.userRole.count({ where: { roleId, tenantId } })

export function listRoles(tenantId: number) // signature unchanged
// _count: { select: { userRoles: { where: { tenantId } } } }  (was: { userRoles: true })
```

```ts
// src/backend/services/role.service.ts
import { Prisma } from '@prisma/client'   // new import, top of file

export async function deleteRole(tenantId: number, roleId: number): Promise<void>
// unchanged signature; body wraps roleRepo.deleteRole(tenantId, roleId) in try/catch,
// re-throws ConflictError on Prisma P2003, re-throws everything else unchanged
```

No frontend interface changes (RST-5 changes the *value* `assignedUserCount` carries; `RoleList.tsx`
is not touched). No new permission code. No new route.

---

## 4. Task list

Atomic, developer-ready, sequenced by dependency. Each task is independently committable but the
whole set ships as **one PR** per the human-approved Step 1 scope decision.

### Task 1 — Tenant-scope `countRoleUsage` signature (implements RST-1) — **DONE, committed `f60dbe5`**
**Owner:** @dev-agent

- [x] `countRoleUsage(roleId: number, tenantId: number)` queries `where: { roleId, tenantId }`
- [x] JSDoc updated with `@param tenantId` line
- [x] No relation join added — `UserRole.tenantId` already denormalized

**Verify:** `git show f60dbe5 -- src/backend/models/role.repository.ts` shows this function + JSDoc
changed as specified above.

**Dependencies:** None

---

### Task 2 — Update the sole call site (implements RST-2) — **DONE, committed `f60dbe5`**
**Owner:** @dev-agent

- [x] Call site passes `tenantId`: `await roleRepo.countRoleUsage(roleId, tenantId)`

**Verify (still outstanding, do now):**
- [ ] `npx tsc --noEmit` (backend) — zero signature-mismatch errors
- [ ] `roleManagement.test.ts` and `roleEditor-t5f01.test.ts` still pass unmodified

**Dependencies:** Task 1 (done)

---

### Task 3 — Fix stale ADR-0019 comment (implements RST-4) — **DONE, committed `f60dbe5`**
**Owner:** @dev-agent

- [x] Comment updated to reflect ADR-0019 (single role, no union)

**Verify:**
- [x] `git show f60dbe5 -- src/backend/prisma/schema.prisma` shows only the comment line(s) changed —
      no field, relation, or `@@` directive touched, no migration file created

**Dependencies:** None

---

### Task 4 — New test proving cross-tenant exclusion (implements RST-3)
**Owner:** @qa-agent
**File:** `src/backend/tests/unit/role.repository.test.ts` (**new file**)

Follow the real-Prisma/isolated-fixture/`afterAll`-cleanup convention in
`src/backend/tests/unit/user.repository.test.ts` — not a mocked-Prisma unit test.

- [ ] Create two tenants A and B: `prisma.tenant.create` with unique `subdomain` per tenant, e.g.
      `` `role-repo-unit-a-${Date.now()}` `` / `` `role-repo-unit-b-${Date.now()}` ``
- [ ] Create one custom `ClinicRole` owned by tenant A: `prisma.clinicRole.create({ data: {
      tenantId: tenantA.id, isSystem: false, ... } })` — capture its id as `roleId`
- [ ] Create **two distinct users**: `userA` in tenant A, `userB` in tenant B (required — `UserRole`
      PK is `@@id([userId, roleId])`, so two rows sharing `roleId` need two different `userId`s)
- [ ] Create `UserRole { userId: userA.id, roleId, tenantId: tenantA.id }` — the legitimate row
- [ ] Create `UserRole { userId: userB.id, roleId, tenantId: tenantB.id }` — the **drifted** row
      (same `roleId`, owned by tenant A; `tenantId` is tenant B's — DB-insertable, no constraint
      prevents it, app-unreachable via normal write paths)
- [ ] **T1:** assert `countRoleUsage(roleId, tenantB.id)` returns `0` (drifted row excluded — the
      negative/authorization-adjacent case)
- [ ] **T2:** assert `countRoleUsage(roleId, tenantA.id)` returns `1` (non-drifted row included —
      positive case, guards against a trivially-over-scoped false negative)
- [ ] `afterAll` cleanup, in this exact order (child-before-parent, `Restrict` FKs otherwise fail
      the teardown):
  ```ts
  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { tenantId: tenantA.id } })
    await prisma.userRole.deleteMany({ where: { tenantId: tenantB.id } })
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } })
    await prisma.clinicRole.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } })
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } })
    await prisma.$disconnect()
  })
  ```
- [ ] **Falsifiability check (do this once, then leave Task 1's fix in place):** temporarily revert
      Task 1's `where: { roleId, tenantId }` back to `where: { roleId }`, re-run this file, confirm
      T1 goes red (returns `2`, not `0`). Re-apply Task 1's fix, confirm both tests pass. Do not skip
      this — code-review inspection is not sufficient per RST-3's AC.

**Dependencies:** Task 1 (needs the 2-arg signature to call)

---

### Task 5 — Tenant-scope `listRoles`'s `assignedUserCount` (implements RST-5) — **DONE, committed `f60dbe5`**
**Owner:** @dev-agent

- [x] `_count: { select: { userRoles: { where: { tenantId } } } }` applied inside `listRoles`'s
      `prisma.clinicRole.findMany(...)` call. No other line in the function changed.

**Verify (test file: extend `src/backend/tests/unit/role.repository.test.ts` from Task 4, or a
sibling `describe` block in the same file):**
- [ ] **T3:** create a **system** role (`tenantId: null, isSystem: true`) with `UserRole` rows in
      two different tenants (e.g. reuse tenants A/B from Task 4's fixtures, or fresh ones scoped to
      this test's own `beforeAll`/`afterAll`). Call `listRoles(tenantA.id)`; assert the returned
      system role's `_count.userRoles` equals only tenant A's row count, not the cross-tenant total.
- [ ] **T4 (regression guard):** a custom role's `assignedUserCount` is unaffected — assert it still
      equals its own tenant's `UserRole` row count (custom roles only ever have same-tenant rows
      under normal writes, so this must not change).
- [ ] `GET /api/roles` integration test (`roleManagement.test.ts` or equivalent) still passes
      unmodified for the non-system-role, non-drift case.
- [ ] `npx tsc --noEmit` — zero signature-mismatch errors.

**Dependencies:** None (independent of Task 1/2/4/6/8 — different function, same file; safe to do in
parallel, but land in the same PR)

---

### Task 6 — Re-run existing integration tests, confirm unmodified pass
**Owner:** @qa-agent
**Files:** `src/backend/tests/integration/roleManagement.test.ts`,
`src/backend/tests/integration/roleEditor-t5f01.test.ts`

- [ ] Run both files after Task 1, 2, and 5 land. Confirm both pass **unmodified** (no edits to
      either file yet — RST-7's comment-only edit is Task 9, after this baseline is established).
- [ ] Record pass/fail — if either fails, stop and diagnose before proceeding to Task 8 (RST-6
      depends on this baseline being green).

**Dependencies:** Task 1, Task 2, Task 5

---

### Task 7 — Full backend compile + comment-diff check
**Owner:** @dev-agent
**Scope:** repo-wide

- [ ] `npx tsc --noEmit` across the whole backend — zero errors (confirms Task 1/2/5's signature
      changes don't ripple beyond the single call site already grepped in the pm-tasks pre-flight).
- [ ] `git diff src/backend/prisma/schema.prisma` — confirm still comment-only (Task 3's change is
      the only diff in this file across the whole branch).

**Dependencies:** Task 1, Task 2, Task 3, Task 5

---

### Task 8 — Catch the FK violation in `deleteRole` (implements RST-6) — **DONE, committed `f60dbe5`**
**Owner:** @dev-agent

- [x] `import { Prisma } from '@prisma/client'` added
- [x] Delete call wrapped in try/catch; `P2003` re-thrown as `ConflictError`, everything else
      re-thrown unchanged — matches the plan's specified body exactly (verified via
      `git show f60dbe5 -- src/backend/services/role.service.ts`)
- [x] **Catch specificity confirmed by grill (do not narrow further):** plain `err.code === 'P2003'`
      check, no `meta.field_name` narrowing — matches the existing codebase-wide convention
      (`owner.service.ts:104,133`, `platform-customers.service.ts:469`, `user.service.ts:214`). Only
      one `onDelete: Restrict` FK currently references `ClinicRole` (`UserRole.role`,
      `schema.prisma:941`), so the blanket catch is safe today; this was explicitly reviewed and
      accepted at Step 3.5, not an oversight.

**Verify:**
- [ ] **T5 (load-bearing):** using the RST-3 drift fixture (Task 4's `UserRole` row: `roleId` owned
      by tenant A, `tenantId` set to tenant B), call `deleteRole(tenantA.id, roleId)` at the service
      layer — assert it throws `ConflictError` (surfaces as **409**, not 500). This is the specific
      regression BA sign-off M-2 flagged; assert it directly, do not infer from code review.
- [ ] **T6 (regression guard):** happy-path `deleteRole` (no usage, no drift) still succeeds
      unchanged.
- [ ] Assert a non-P2003 error thrown by `roleRepo.deleteRole` is re-thrown unchanged, not swallowed
      (e.g. mock/spy `roleRepo.deleteRole` to throw a plain `Error` and confirm it propagates as-is).

**Dependencies:** Task 1, Task 2, Task 4 (needs the drift fixture), Task 6 (needs the pre-RST-6
baseline confirmed green first)

---

### Task 9 — Fix stale test comment (implements RST-7)
**Owner:** @qa-agent
**File:** `src/backend/tests/integration/roleEditor-t5f01.test.ts:142`

- [ ] Change:
  ```
  // Admin A and Admin B both hold clinic_admin → count is global to the role (≥2)
  ```
  to:
  ```
  // Admin A and Admin B hold the same system role in different tenants. After RST-5, the count is
  // scoped to the caller's own tenant, so this only reflects tenant A's admin(s) — the ≥1 assertion
  // holds precisely because it no longer double-counts across tenants.
  ```
- [ ] **No assertion logic changed** — comment-only edit. The existing
      `expect(adminRoleRow!.assignedUserCount).toBeGreaterThanOrEqual(1)` line is untouched.

**Verify:**
- [ ] `roleEditor-t5f01.test.ts` still passes unmodified (assertion untouched, only the comment
      above it changed)
- [ ] `git diff src/backend/tests/integration/roleEditor-t5f01.test.ts` shows only the comment lines

**Dependencies:** Task 5 (comment describes RST-5's post-fix behavior — must land after or alongside
Task 5, before this PR closes)

---

## 5. Dependency graph

```
Task 1 (countRoleUsage signature) ──> Task 2 (call site) ──> Task 6 (baseline re-run) ──> Task 8 (FK catch)
                                   └─> Task 4 (drift test, T1/T2) ───────────────────────────^
Task 3 (schema comment) ── independent ──────────────────────────────────────────> Task 7 (compile+diff check)
Task 5 (listRoles _count) ── independent ──> Task 6 ──> Task 9 (stale comment fix)
Task 7 depends on: Task 1, 2, 3, 5
Task 8 depends on: Task 1, 2, 4, 6
Task 9 depends on: Task 5
```

Suggested execution order for `/execute-plan`: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.**

## 6. Test summary

| Test | Proves | New/Extend |
|---|---|---|
| T1 | Drifted `UserRole` row excluded from `countRoleUsage` | New (`role.repository.test.ts`) |
| T2 | Non-drifted row included in `countRoleUsage` | New (`role.repository.test.ts`) |
| T3 | System role's `assignedUserCount` scoped per-tenant via `listRoles` | New (`role.repository.test.ts`) |
| T4 | Custom role's `assignedUserCount` regression guard | New (`role.repository.test.ts`) |
| T5 | Drift fixture → `deleteRole` returns 409, not 500 | New (service-level, Task 8) |
| T6 | Happy-path `deleteRole` unaffected | New (service-level, Task 8) |
| Re-run | `roleManagement.test.ts`, `roleEditor-t5f01.test.ts` pass unmodified | Existing, re-run only (Task 2, Task 6, Task 9) |

6 new tests + 1 new test file + 2 comment-only edits to existing test files (Task 9's edit is the
comment fix itself; `roleManagement.test.ts` is re-run, not edited).

## 7. Hand-off per CLAUDE.md Agent Router

- `@db-agent`: review Task 1, 2, 4, 5 for tenant-isolation query safety before merge (CLAUDE.md
  Critical Rule — every query must include `WHERE tenant_id`). Confirm the `onDelete: Restrict`
  interaction Task 8 handles (BA sign-off C-7) — the count is the only thing standing between
  `deleteRole` and the FK violation Task 8 catches. Confirm Task 3's comment wording is accurate
  against the live schema and ADR-0019.
- `@dev-agent`: implement Task 1, 2, 3, 5, 8.
- `@qa-agent`: implement Task 4, 6, 9; own T1–T6; confirm `roleManagement.test.ts` and
  `roleEditor-t5f01.test.ts` still pass unmodified; run the full backend suite (must stay green —
  `main` was 1295/1295 as of 2026-08-20 per HANDOFF doc; re-verify current count before Step 7 sign-off,
  several commits have landed since — this PR should land at that count + 6 new cases).

## 8. PR body requirements (BA sign-off condition C-8 — Step 8 checklist, not a task)

- Cite **ADR-0025 D-1** (pre-check scope must equal write scope) as governing precedent for Task 1/2.
- State the drift characterization: DB-insertable (no composite FK ties `UserRole.tenantId` to its
  role's owning tenant) but app-unreachable today via `user.service.ts:186-189`'s
  `assertRoleBelongsToCallerTenant`.
- State that Task 5 (RST-5) closes `CodexCodeReview.md` R2-ME-01's `listRoles` half; the sibling
  finding (`findRoleById`'s cross-tenant existence oracle, BA sign-off backlog B-1) remains open and
  tracked separately — do not let this PR read as closing R2-ME-01 in full.

## 9. Next pipeline step

Per CLAUDE.md Standard Pipeline: this plan is resubmitted for **Step 5 — `@ponytail-agent`**
(7-criteria simplicity gate), re-run #2. Run #1 (2026-08-27) REJECTed on criterion 2 (duplicate
work) only — Tasks 1/2/3/5/8 were already applied uncommitted, plan hadn't been updated to match.
Fix applied: those five tasks committed at `f60dbe5`, plan doc above rewritten to mark them done.
Criteria 1, 3-7 already passed cleanly in run #1 and are unchanged (still 5 files total, 0 new
deps/endpoints/migrations/error classes). Remaining real work for `/execute-plan` (Step 6, still
BLOCKED until Ponytail returns APPROVE): Task 4 (new test), Task 6 (baseline re-run), Task 7
(compile+diff check), Task 9 (stale test comment).
