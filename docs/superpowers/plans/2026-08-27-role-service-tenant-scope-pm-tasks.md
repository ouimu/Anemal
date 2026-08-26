# Role Service Tenant Scope — PM Task Breakdown (Step 2, reworked)

**Branch:** `fix/role-service-tenant-scope`
**Author:** @pm-agent
**Date:** 2026-08-27 (rework)
**Input:** [2026-08-27-role-service-tenant-scope.md](2026-08-27-role-service-tenant-scope.md) (Step 1
brainstorm, human-approved) ·
[2026-08-27-role-service-tenant-scope-ba-signoff.md](2026-08-27-role-service-tenant-scope-ba-signoff.md)
(Step 3, **APPROVED WITH CONDITIONS C-1…C-8**)

**Why this document was rewritten:** @ba-agent's Step 3 sign-off found four must-fix defects and one
significant gap in the original v1 breakdown (a permission code that does not exist in this
codebase, a false "no behavior regression" AC, a wrong schema file path, and a false
data-integrity claim) — plus a live, unguarded cross-tenant leak in the same file that v1 did not
address. The human has now ruled on both open questions raised by that sign-off:

1. **Include RST-5** (the `listRoles` cross-tenant count fix, BA's G-1) in this branch.
2. **Add the FK-violation catch** in `deleteRole` (BA's M-2/C-3 recommended option), not the
   accept-500 alternative.

This document folds conditions **C-1 through C-6** into the task list below. C-7 and C-8 are
carried forward to Step 6 (`@db-agent` review) and Step 8 (PR body) respectively — they are not
task-list edits.

---

## Nature of change

Defence-in-depth hardening plus one live cross-tenant disclosure fix:

- `deleteRole` (`src/backend/services/role.service.ts:172-190`) already blocks cross-tenant role
  deletion at line 180 (`if (role.tenantId !== tenantId) throw ForbiddenError`) **before**
  `countRoleUsage` is called at line 184. `countRoleUsage` itself is currently unscoped
  (`role.repository.ts:163-165`) but unreachable cross-tenant today because of that upstream guard.
  This branch scopes it anyway so it is safe to call from any future caller without relying on an
  upstream guard (RST-1/RST-2).
- **RST-5 is not defence-in-depth — it is a live fix.** `listRoles`
  (`role.repository.ts:22-36`) has **no** tenant filter on its `_count.userRoles`, and this value is
  rendered today, unguarded, as `assignedUserCount` in `RoleList.tsx:302-305`. For a system role
  this discloses the platform-wide user count for that role to every tenant. Tracked separately as
  `CodexCodeReview.md` R2-ME-01 (never carried into `.claude/roadmap/` until now).
- **RST-6 (new) closes the regression the BA sign-off identified in RST-2's original AC.** Narrowing
  `countRoleUsage`'s scope means a drifted `UserRole` row (same `roleId`, foreign `tenantId`) no
  longer trips the pre-check — it instead hits `UserRole.role`'s `onDelete: Restrict` FK
  (`schema.prisma:941`) inside `roleRepo.deleteRole`, and today that surfaces as an opaque 500
  (`error-handler.middleware.ts` has no `PrismaClientKnownRequestError` branch). Human-approved
  resolution: catch it in the service and re-throw the existing `ConflictError`.

## Pre-flight checks (updated from v1 per C-2, C-4)

- Grepped the whole repo for `countRoleUsage`, **scoped to `src/backend/`** (per C-2 — see the
  worktree-hazard warning below) — confirmed single production call site:
  `src/backend/services/role.service.ts:184`. No other caller exists.
- Grepped all test files referencing `countRoleUsage` — `roleManagement.test.ts:362` and
  `roleEditor-t5f01.test.ts:260` mention it only in **comments** explaining fixture design; neither
  asserts or depends on the current 1-argument signature. No test breaks from the signature change.
- No dedicated `role.repository.test.ts` exists yet
  (`src/backend/tests/unit/user.repository.test.ts`, `refresh-token.repository.test.ts` are the
  pattern to follow — real Prisma client against the test DB, isolated tenant/fixture creation,
  `afterAll` cleanup in strict child-before-parent order; not a mocked-prisma unit test). This PR
  creates that file.
- **Corrected per C-4 (was false in v1):** `ClinicRole.tenantId` / `UserRole.tenantId` are **not**
  kept in sync by any FK or unique constraint. `@@unique([tenantId, userId])` enforces one role per
  user per tenant (ADR-0019 D-7) — it says nothing about which tenant owns the *role*. There is no
  composite FK `(roleId, tenantId) → ClinicRole(id, tenantId)`, and one cannot easily exist because
  system roles carry `tenantId = NULL`. **Drift is DB-insertable** — a `UserRole` row can reference
  a `roleId` owned by a different tenant than the row's own `tenantId`. It is, however,
  **app-unreachable today**: `user.service.ts:186-189`'s `assertRoleBelongsToCallerTenant` blocks it
  on every create/update path, and all production writes (`user.repository.ts:59`,
  `platform-customers.repository.ts:362`, `seed.ts:128`) pass a consistent `tenantId`. Reaching
  drift requires raw SQL, a restore error, or a future bug — noted in the PR body per C-8, no
  schema change made here (tracked as backlog **B-4** in the BA sign-off for a future composite-FK
  or CHECK-style guard).

### ⚠️ Schema path / grep-scoping hazard (per C-2)

The correct schema file is **`src/backend/prisma/schema.prisma`** — there is **no** `prisma/`
directory at the repo root. A glob like `**/schema.prisma` returns **three additional false
matches** that must never be edited:

1. `.claude/worktrees/wizardly-kowalevski-14f642/…/schema.prisma` (untracked worktree copy)
2. `src/backend/.claude/worktrees/exciting-volhard-2256e8/…/schema.prisma` (untracked worktree copy)
3. `node_modules/.prisma/client/schema.prisma` (generated, not source)

**Scope every grep/glob for this branch to `src/backend/` explicitly** (e.g.
`git grep -n "schema.prisma" -- src/backend` or `Glob({ path: "src/backend", pattern: "prisma/schema.prisma" })`),
never a bare repo-root `**/schema.prisma`. This is the same worktree-grep hazard flagged in the
2026-08-21 sign-off (§5); it has now recurred once and is called out explicitly so it does not
recur a second time.

## Scope decision (updated)

### In scope (this branch, ship as ONE PR)
| Item | Disposition |
|---|---|
| `countRoleUsage` tenant-scoping (RST-1/RST-2) | **In** |
| FK-violation catch in `deleteRole` (RST-6) | **In** — human-approved 2026-08-27, per C-3 |
| `listRoles` cross-tenant `_count` fix (RST-5) | **In** — human-approved 2026-08-27, per C-5 |
| `src/backend/prisma/schema.prisma:225` stale ADR-0019 comment (RST-4) | **In** — comment-only, zero runtime effect |
| New unit test proving RST-1/RST-2's exclusion (RST-3) | **In** |

### Explicitly out of scope (backlog / other tracked items, do not touch here)
- Backend eslint flat-config migration (tracked separately, `2026-08-21-auth-recovery-paths-pm-tasks.md`)
- Audit logging for repeated payment-route probes (`docs/adr/0025-...md`)
- Any frontend change (RST-5's fix changes the *value* `assignedUserCount` carries, not the
  `RoleList.tsx` rendering code — no frontend file is touched)
- Any Prisma migration (`schema.prisma:225` is a comment edit only — `prisma migrate` not required;
  RST-5's `_count` filter is a query-shape change only, no schema change)
- `findRoleById(roleId)` global cross-tenant existence-oracle issue (BA sign-off backlog **B-1**) —
  **not requested by the approved brainstorm**; file as a separate backlog item, do not fold into
  this PR
- `error-handler.middleware.ts` having no generic `PrismaClientKnownRequestError` mapping (BA
  sign-off backlog **B-3**) — RST-6 catches the *specific* P2003 case in the service layer instead;
  a generic middleware-level mapping is broader than this branch and stays backlog
- A DB-level composite-FK/CHECK constraint tying `UserRole.tenantId` to its role's owning tenant
  (BA sign-off backlog **B-4**) — schema-design question for @db-agent, separate branch

## Ponytail pre-check (informal, formal gate is Step 5)

3 files changed (`role.repository.ts`, `role.service.ts`, `schema.prisma` comment-only) + 1 new
test file = 4 files. 0 new subsystems, 0 duplicate work, 0 new deps, 0 new endpoints, 0 migrations.
RST-6's FK catch is ~3 lines reusing the existing `ConflictError` class (no new error class). RST-5
is a 1-line filtered-relation-count change (Prisma ≥4.3 required, `^5.13.0` already pinned in
`src/backend/package.json:19,46`). Far under all 7 thresholds.

---

## Task list

Atomic, developer-ready. Sequenced by dependency.

### RST-1 — Tenant-scope `countRoleUsage`
**Task ID:** RST-1
**Actor/role:** `clinic_admin` (via `roles.manage` / role-deletion flow — RBAC-internal, no new permission)
**Device:** Both (backend-only change, no UI surface)

**Description:**
In `src/backend/models/role.repository.ts:163-165`, change:
```ts
export function countRoleUsage(roleId: number) {
  return prisma.userRole.count({ where: { roleId } })
}
```
to:
```ts
export function countRoleUsage(roleId: number, tenantId: number) {
  return prisma.userRole.count({ where: { roleId, tenantId } })
}
```
Update the JSDoc above it (currently lines 157-162) to document the new `tenantId` param (mirror
the style already used for `deleteRole`'s `@param tenantId - Owning tenant scope; prevents
cross-tenant deletes.` at line 150). No relation join needed — `UserRole.tenantId` is already
denormalized (`src/backend/prisma/schema.prisma` — see path warning above).

**Acceptance Criteria:**
- [ ] `countRoleUsage` signature is `(roleId: number, tenantId: number)`
- [ ] Query is `prisma.userRole.count({ where: { roleId, tenantId } })`
- [ ] JSDoc documents both params
- [ ] TypeScript compiles with no `any`/signature-mismatch errors anywhere in the backend

**Permission(s):** None new — internal repository function, reached only via `deleteRole`'s
existing `roles.manage`-gated route (`src/backend/routes/role.routes.ts:37`).
**Dependencies:** None

---

### RST-2 — Update the sole call site
**Task ID:** RST-2
**Actor/role:** `clinic_admin`
**Device:** Both

**Description:**
In `src/backend/services/role.service.ts:184`, change:
```ts
const usageCount = await roleRepo.countRoleUsage(roleId)
```
to:
```ts
const usageCount = await roleRepo.countRoleUsage(roleId, tenantId)
```
`tenantId` is already in scope in `deleteRole`'s parameters (line 172) and already validated
against `role.tenantId` at line 180 — this call additionally scopes the count query itself as a
second, independent safety layer (per ADR-0025 D-1: a pre-check gating a state-changing operation
must use the identical tenant scope as the write, not rely on an upstream guard alone).

**Acceptance Criteria (C-1, C-3 applied — replaces v1's false "additive/no regression" AC):**
- [ ] Call site passes `tenantId` as the second argument
- [ ] Existing integration tests `roleManagement.test.ts` and `roleEditor-t5f01.test.ts` (which
      exercise `deleteRole` end-to-end via HTTP) still pass unmodified
- [ ] **This narrows what passes the pre-check — it is a behavior change, not purely additive.**
      The specific behavior-change scenario (a drifted `UserRole` row that used to trip the guard
      and no longer does) is covered by RST-6's AC below, not waved away here.

**Permission(s):** `roles.manage` (existing route guard on `DELETE /:roleId`, unchanged;
`role.routes.ts:37` — corrected from v1's nonexistent `staff.manage_roles` citation per C-1).
**Dependencies:** RST-1

---

### RST-3 — Prove cross-tenant exclusion (new test)
**Task ID:** RST-3
**Actor/role:** (test-only, not role-scoped)
**Device:** — (backend test)

**Description (rewritten per C-6 — one deterministic recipe, no open-ended branch):**
Create `src/backend/tests/unit/role.repository.test.ts` following the existing convention in
`src/backend/tests/unit/user.repository.test.ts` (real Prisma client against the test DB, own
isolated fixtures created in `beforeAll`, cleaned up in `afterAll` — never touch seeded
dev-clinic/test-clinic data).

**Fixture (stated directly — the schema is already resolved, no "verify against schema before
writing" step needed):** system roles are `tenantId: null, isSystem: true` and shared across every
tenant (`schema.prisma`, `findSystemRoleByKey` confirms); custom roles are per-tenant. Use one
**custom** role in tenant A plus a deliberately drifted row for a tenant-B user, exactly as follows:

1. Create two tenants, A and B (`prisma.tenant.create`, unique `subdomain` per tenant, e.g.
   `` `role-repo-unit-a-${Date.now()}` ``).
2. Create **one** custom `ClinicRole` owned by tenant A (`prisma.clinicRole.create({ data: {
   tenantId: tenantA.id, isSystem: false, ... } })`). Call its id `roleId`.
3. Create **two distinct users** — `userA` in tenant A, `userB` in tenant B. (`UserRole`'s primary
   key is `@@id([userId, roleId])`, so two rows sharing the same `roleId` require two different
   `userId`s — reusing one user for both rows would collide on the PK and the fixture would fail to
   insert, not silently misrepresent the test.)
4. Create `UserRole { userId: userA.id, roleId, tenantId: tenantA.id }` — the legitimate,
   non-drifted row.
5. Create `UserRole { userId: userB.id, roleId, tenantId: tenantB.id }` — the **drifted** row:
   same `roleId` (owned by tenant A), but `tenantId` is tenant B's. This is DB-insertable (per the
   corrected pre-flight note above — no constraint prevents it) even though it is app-unreachable
   via normal write paths.
6. Assert `countRoleUsage(roleId, tenantA.id)` returns `1` (only the non-drifted row).
7. Assert `countRoleUsage(roleId, tenantB.id)` returns `0` (the drifted row's `tenantId` matches
   tenant B, but its `roleId` belongs to tenant A — confirms the count is scoped by the query's own
   `tenantId` predicate, not by which role the caller happens to be checking).

**Cleanup ordering (per C-6/G-2 — `UserRole.role` is `onDelete: Restrict` and `UserRole.tenant` is
Restrict by Prisma default, so parent-before-child deletion will fail):**
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
(Mirrors `src/backend/tests/unit/user.repository.test.ts:36-42`'s child-before-parent discipline:
`userRole` rows for **both** tenants first, then users, then roles, then tenants.)

**Acceptance Criteria:**
- [ ] New file `src/backend/tests/unit/role.repository.test.ts` exists, follows the repo's
      real-DB/isolated-fixture/cleanup convention
- [ ] Test proves the drifted `UserRole` row (same `roleId`, tenant-B `tenantId`) is **excluded**
      from tenant A's count (negative/authorization-adjacent case)
- [ ] Test proves the non-drifted, same-tenant row **is** counted (positive case, guards against a
      trivially-over-scoped false-negative implementation)
- [ ] `afterAll` deletes `userRole` rows for **both** tenants before deleting users, then roles,
      then tenants — in that order — so the run does not fail on `Restrict` FK errors
- [ ] Test fails against the pre-RST-1 (unscoped) implementation: with this fixture, the old
      `where: { roleId }` shape returns `2` where the post-fix scoped query returns `1` — verify by
      temporarily reverting RST-1 and confirming red, not just by code-review inspection

**Permission(s):** N/A (test-only, no HTTP layer)
**Dependencies:** RST-1

---

### RST-4 — Fix stale ADR-0019 comment
**Task ID:** RST-4
**Actor/role:** (doc/comment-only, not role-scoped)
**Device:** —

**Description (C-2 applied — corrected file path):**
In **`src/backend/prisma/schema.prisma`** (not `prisma/schema.prisma` — see the path/grep-hazard
warning above), around line 225, change the comment:
```
// Phase 8 (5-A): primary role reference (display/fallback); effective perms come from userRoles union
```
to reflect ADR-0019 (single-role-per-user retires multi-role), e.g.:
```
// Phase 8 (5-A): the user's single role (ADR-0019). Effective perms come from this roleRef alone;
// userRoles is the assignment join table only, not a permission-union source.
```
Comment-only. Zero runtime effect. **No `prisma migrate` run** — this is not a schema-shape change.

**Acceptance Criteria:**
- [ ] Comment no longer says "effective perms come from userRoles union"
- [ ] Comment references ADR-0019 or states the single-roleRef model in its own words, consistent
      with `docs/adr/0019-single-role-per-user-retires-multi-role.md`
- [ ] `git diff src/backend/prisma/schema.prisma` shows only the comment line(s) changed — no
      field, relation, or `@@` directive touched
- [ ] No new migration file generated under `src/backend/prisma/migrations/`

**Permission(s):** N/A
**Dependencies:** None (independent of RST-1/2/3/5/6, bundled into the same PR per the brainstorm's
"ship as ONE PR" scope decision)

---

### RST-5 — Tenant-scope `listRoles`'s `assignedUserCount` (new, per C-5, human-approved)
**Task ID:** RST-5
**Actor/role:** `clinic_admin`, `clinic_staff` (any role holding `roles.view` or `roles.manage`)
**Device:** Both

**Description:**
In `src/backend/models/role.repository.ts:22-36` (`listRoles`), change:
```ts
export function listRoles(tenantId: number) {
  return prisma.clinicRole.findMany({
    where: {
      OR: [
        { tenantId: null },
        { tenantId },
      ],
    },
    include: {
      permissions: { select: { permissionCode: true } },
      _count: { select: { userRoles: true } },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
}
```
to:
```ts
export function listRoles(tenantId: number) {
  return prisma.clinicRole.findMany({
    where: {
      OR: [
        { tenantId: null },
        { tenantId },
      ],
    },
    include: {
      permissions: { select: { permissionCode: true } },
      _count: { select: { userRoles: { where: { tenantId } } } },
    },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
}
```
This is a **live cross-tenant disclosure fix**, not defence-in-depth: for a shared system role
(`tenantId: null`), the unfiltered `_count` currently counts `UserRole` rows for that role across
**every tenant on the platform**, and that number flows unmodified through
`role.service.ts:63-69` (`assignedUserCount`) → `GET /api/roles` (`roles.view`/`roles.manage`) →
`RoleList.tsx:302-305`, where it is rendered today as a visible count chip. Filtered relation
counts require Prisma ≥4.3; `src/backend/package.json:19,46` already pins `^5.13.0`, so no
dependency change is needed.

**Acceptance Criteria:**
- [ ] `listRoles`'s `_count.userRoles` select includes `where: { tenantId }`
- [ ] Test: a **system** role (`tenantId: null`) with `UserRole` rows created in two different
      tenants — calling `listRoles(tenantA.id)` returns that role with `assignedUserCount` equal to
      only tenant A's row count, not the combined total across both tenants
- [ ] Test: a **custom** role's `assignedUserCount` (already implicitly tenant-scoped since custom
      roles only ever have same-tenant `UserRole` rows under normal writes) is unaffected —
      regression guard on the common case
- [ ] `GET /api/roles` integration test (existing `roleManagement.test.ts` or equivalent) still
      passes unmodified for the non-system-role, non-drift case
- [ ] TypeScript compiles with no signature-mismatch errors

**Permission(s):** `roles.view` or `roles.manage` (existing route guard on `GET /`, unchanged —
`role.routes.ts:28`). No new permission code.
**Dependencies:** None (independent of RST-1/2/3/6 — different function in the same file; bundled
into the same PR per the human's 2026-08-27 scope decision)

---

### RST-6 — Catch the FK violation in `deleteRole` (new, per C-3, human-approved)
**Task ID:** RST-6
**Actor/role:** `clinic_admin`
**Device:** Both

**Description:**
RST-1/RST-2 narrow `countRoleUsage`'s pre-check to the caller's own tenant. That means a drifted
`UserRole` row (same `roleId`, a **different** tenant's `tenantId` — DB-insertable per the
corrected pre-flight note, though app-unreachable today) no longer trips the `usageCount > 0` guard
in `role.service.ts:184-187`. If `deleteRole` proceeds, `roleRepo.deleteRole`
(`role.repository.ts:153-155`, `prisma.clinicRole.deleteMany({ where: { id: roleId, tenantId } })`)
hits `UserRole.role`'s `onDelete: Restrict` FK (`src/backend/prisma/schema.prisma:941`), Prisma
throws `PrismaClientKnownRequestError` with code `P2003`, and
`src/backend/middlewares/error-handler.middleware.ts` has no Prisma-error branch — it falls through
to a generic 500 `INTERNAL_ERROR`. The human-approved fix: catch that specific error in the service
and re-throw the existing `ConflictError`, so the drift case still surfaces as 409, matching the
pre-fix behavior's intent.

In `src/backend/services/role.service.ts:172-190`, change:
```ts
export async function deleteRole(tenantId: number, roleId: number): Promise<void> {
  const role = await roleRepo.findRoleById(roleId)
  if (!role) {
    throw new NotFoundError('Role')
  }
  if (role.isSystem) {
    throw new ForbiddenError('System roles cannot be deleted')
  }
  if (role.tenantId !== tenantId) {
    throw new ForbiddenError('Role does not belong to your tenant')
  }

  const usageCount = await roleRepo.countRoleUsage(roleId, tenantId)
  if (usageCount > 0) {
    throw new ConflictError('Cannot delete a role that is currently assigned to users')
  }

  await roleRepo.deleteRole(tenantId, roleId)
}
```
to:
```ts
import { Prisma } from '@prisma/client'
// (add alongside existing imports at the top of role.service.ts)

export async function deleteRole(tenantId: number, roleId: number): Promise<void> {
  const role = await roleRepo.findRoleById(roleId)
  if (!role) {
    throw new NotFoundError('Role')
  }
  if (role.isSystem) {
    throw new ForbiddenError('System roles cannot be deleted')
  }
  if (role.tenantId !== tenantId) {
    throw new ForbiddenError('Role does not belong to your tenant')
  }

  const usageCount = await roleRepo.countRoleUsage(roleId, tenantId)
  if (usageCount > 0) {
    throw new ConflictError('Cannot delete a role that is currently assigned to users')
  }

  try {
    await roleRepo.deleteRole(tenantId, roleId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new ConflictError('Cannot delete a role that is currently assigned to users')
    }
    throw err
  }
}
```
No new error class, no new dependency — `ConflictError` already exists and is already used two
lines above for the same user-facing message. `Prisma` is already available via
`@prisma/client` (already a dependency; only the import line is new in this file).

**Acceptance Criteria (replaces v1 RST-2's withdrawn "no behavior regression" claim per C-3):**
- [ ] `deleteRole` wraps `roleRepo.deleteRole(tenantId, roleId)` in try/catch
- [ ] On `PrismaClientKnownRequestError` with `code === 'P2003'`, re-throws `ConflictError` with
      the same message used by the pre-check branch above it
- [ ] Any other error from `roleRepo.deleteRole` (non-P2003) is re-thrown unchanged, not swallowed
- [ ] **Load-bearing test:** given the RST-3 drift fixture (a `UserRole` row with `roleId` owned by
      tenant A but `tenantId` set to tenant B), calling `deleteRole(tenantA.id, roleId)` returns
      **409 Conflict**, not 500 — this is the specific regression scenario the BA sign-off (M-2)
      flagged and it must be asserted directly, not inferred
- [ ] Happy-path `deleteRole` (no usage, no drift) still succeeds unchanged — regression guard

**Permission(s):** `roles.manage` (existing route guard on `DELETE /:roleId`, unchanged —
`role.routes.ts:37`).
**Dependencies:** RST-1, RST-2 (must land after the count is tenant-scoped — this task closes the
gap that scoping opens)

---

### RST-7 — Fix stale test comment documenting the RST-5 bug as intended (new, per Step 3.5 grill G-3)
**Task ID:** RST-7
**Actor/role:** (test-only, not role-scoped)
**Device:** —

**Description:**
In `src/backend/tests/integration/roleEditor-t5f01.test.ts:142`, the comment
`// Admin A and Admin B both hold clinic_admin → count is global to the role (≥2)` documents the
cross-tenant leak RST-5 fixes as intended behavior. The assertion above it
(`expect(adminRoleRow!.assignedUserCount).toBeGreaterThanOrEqual(1)`) does **not** go red after
RST-5 — tenant A's own admin still counts as 1 — but the comment becomes false if left unchanged.

Change the comment to describe the corrected, per-tenant counting behavior, e.g.:
```
// Admin A and Admin B hold the same system role in different tenants. After RST-5, the count is
// scoped to the caller's own tenant, so this only reflects tenant A's admin(s) — the ≥1 assertion
// holds precisely because it no longer double-counts across tenants.
```

**Acceptance Criteria:**
- [ ] Comment at `roleEditor-t5f01.test.ts:142` no longer says "count is global to the role"
- [ ] Comment accurately describes per-tenant scoping post-RST-5
- [ ] No assertion logic changed — this is a comment-only edit
- [ ] `roleEditor-t5f01.test.ts` still passes unmodified

**Permission(s):** N/A
**Dependencies:** RST-5 (comment describes RST-5's behavior; should land in the same PR after or
alongside it)

---

## Task count: 7 (RST-1 through RST-7; RST-5, RST-6, RST-7 are new since v1)

## Dependency graph
```
RST-1 (repository signature) ──> RST-2 (call site) ──> RST-6 (FK catch)
                              └─> RST-3 (test, drift fixture also proves RST-6's 409 case)
RST-4 (schema comment) ── independent, same PR
RST-5 (listRoles _count fix) ── independent, same PR ──> RST-7 (stale test comment fix)
```

## Step 3.5 grill outcome
`/grill-with-docs` ran 2026-08-27 — see
[2026-08-27-role-service-tenant-scope-grill.md](2026-08-27-role-service-tenant-scope-grill.md).
All findings resolved: RST-6's FK catch confirmed correct as-is (plain `err.code` check, matching
codebase convention — no `meta.field_name` narrowing needed); RST-5's visible-number change
confirmed as a silent bug fix, no release note; RST-7 added to fix a stale test comment. No new
ADR needed — this branch closes an existing ADR-0025 D-1 deviation, cite it in the PR body per C-8.

## Hand-off per CLAUDE.md Agent Router
- `@db-agent`: review RST-1/RST-2/RST-3/RST-5 for tenant-isolation query safety before merge
  (Critical Rule — every query must include `WHERE tenant_id`). **Also confirm the `onDelete:
  Restrict` interaction RST-6 handles** — the count is the only thing standing between `deleteRole`
  and the FK violation RST-6 catches (BA sign-off condition **C-7**). Confirm RST-4's comment
  wording is accurate against the live schema and ADR-0019.
- `@dev-agent`: implement RST-1, RST-2, RST-4, RST-5, RST-6.
- `@qa-agent`: implement/verify RST-3 and RST-7 (including RST-3's role as the fixture source for
  RST-6's 409 assertion), confirm `roleManagement.test.ts` and `roleEditor-t5f01.test.ts` still pass
  unmodified, run full backend suite (must stay green — `main` is currently 1295/1295 per HANDOFF
  doc; this PR should land at 1295 + new RST-3/RST-5/RST-6 cases).

## PR body requirements (BA sign-off condition C-8 — not a task, a Step 8 checklist item)
- Cite **ADR-0025 D-1** (pre-check scope must equal write scope) as the governing precedent for
  RST-1/RST-2.
- State the drift characterization from the corrected pre-flight note: drift is DB-insertable (no
  composite FK ties `UserRole.tenantId` to its role's owning tenant) but app-unreachable today via
  `user.service.ts:186-189`'s `assertRoleBelongsToCallerTenant`.
- State that RST-5 closes `CodexCodeReview.md` R2-ME-01 (the `listRoles` half); note that the
  sibling finding (`findRoleById`'s cross-tenant existence oracle, BA sign-off backlog B-1) remains
  open and tracked separately — do not let this PR read as having closed R2-ME-01 in full if B-1 is
  filed as a distinct item.

## Next pipeline step
Per CLAUDE.md Standard Pipeline: this reworked task list satisfies BA sign-off conditions C-1…C-6.
Proceed to the MANDATORY `/grill-with-docs` (Step 3.5) before `/superpowers:write-plan` (Step 4).
Do not skip ahead.
