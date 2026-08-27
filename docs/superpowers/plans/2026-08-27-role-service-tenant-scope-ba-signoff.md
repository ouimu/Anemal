# Role Service Tenant Scope — BA Sign-off (Step 3)

**Branch:** `fix/role-service-tenant-scope`
**Author:** @ba-agent
**Date:** 2026-08-27
**Reviews:** [`2026-08-27-role-service-tenant-scope.md`](2026-08-27-role-service-tenant-scope.md) (Step 1, human-approved) ·
[`2026-08-27-role-service-tenant-scope-pm-tasks.md`](2026-08-27-role-service-tenant-scope-pm-tasks.md) (Step 2, RST-1…RST-4)
**Skills applied:** `anemal-ba-toolkit`, `anemal-rbac-matrix`, `anemal-db-context`, `anemal-functional-reqs`

---

# VERDICT: **APPROVED WITH CONDITIONS**

The **core design is correct and I endorse it**: narrowing `countRoleUsage` to
`where: { roleId, tenantId }` is the right shape, needs no schema change, and makes the repository
internally consistent with the sibling function directly beneath it. RST-4 (the stale ADR-0019
comment) is correct as written.

But the task breakdown is **not yet developer-ready**. Four errors are must-fix — including a
**permission code that does not exist in this codebase** and an **acceptance criterion that is
factually false** — and one significant gap: the branch fixes the role-usage count that is *already
guarded* while leaving unfixed a second, *unguarded and live*, cross-tenant role count in the same
file, twelve lines above it.

**Eight conditions (C-1 … C-8)** must be closed before `/grill-with-docs` (Step 3.5) and
`/write-plan` (Step 4).

**Objective this branch serves:** *a query that gates a destructive RBAC operation must be scoped to
the caller's tenant in the query itself, not by a caller's guard.* Every ruling below is measured
against that objective.

---

## 0. Evidence base

Read from source on this branch. Nothing below is inherited from the brief.

| File | Read | Why it matters |
|---|---|---|
| `src/backend/models/role.repository.ts` | full (201 L) | `countRoleUsage:163`, **`listRoles:22` `_count`**, `findUserIdsByRole:179` |
| `src/backend/services/role.service.ts` | full (191 L) | `deleteRole:172-190`, **`listRoles:63-69`** |
| `src/backend/routes/role.routes.ts` | full | **Actual permission guards** |
| `src/backend/prisma/schema.prisma` | L210-248, L900-947 | Line 225 comment; `UserRole`; **`onDelete: Restrict`** |
| `src/backend/middlewares/error-handler.middleware.ts` | full | **No Prisma error mapping → 500** |
| `src/backend/services/user.service.ts` | L27-48, L145-245 | `assertRoleBelongsToCallerTenant` — drift reachability |
| `src/backend/tests/unit/user.repository.test.ts` | L1-50 | Test convention PM cites |
| `src/frontend/src/components/roles/RoleList.tsx` | L302-305 | `assignedUserCount` chip is rendered |
| `CodexCodeReview.md` | L478-497 | **R2-ME-01**, pre-existing MEDIUM finding |
| `docs/adr/0025-…md` | L35-63 | Binding precedent on pre-check scope |

---

## 1. What is right — upheld without change

**The fix shape is correct, and there is an in-repo precedent that PM did not cite.**

`role.repository.ts:179` already carries the exact target signature:

```ts
export async function findUserIdsByRole(roleId: number, tenantId: number)  // where: { roleId, tenantId }
```

`countRoleUsage(roleId)` is the **only** `userRole` query in the file that omits the tenant filter.
RST-1 does not introduce a convention — it finishes one.

**ADR-0025 D-1 is binding precedent and it endorses this change.** ADR-0025 (L57-59) rules that a
pre-check gating a state-changing operation *"MUST use the identical tenant+branch scope as the
atomic claim — never wider."* Here the write is `deleteRole` → `deleteMany({ where: { id: roleId,
tenantId } })`; the pre-check was `count({ where: { roleId } })` — **strictly wider**. Post-fix the
two align. Cite this in the PR body; it converts "defence-in-depth nice-to-have" into "closing a
named deviation from a ratified ADR."

**RST-4 verified correct.** `schema.prisma:225` does read
`// Phase 8 (5-A): primary role reference (display/fallback); effective perms come from userRoles union`,
and the `UserRole` model header (L929-934) already states the ADR-0019 single-role position. The
comment is genuinely stale. Comment-only, no migration — confirmed.

**PM's pre-flight greps are accurate on the points they cover.** Single production call site
(`role.service.ts:184`) confirmed. `roleManagement.test.ts:362` / `roleEditor-t5f01.test.ts:260`
mention `countRoleUsage` in **comments only** — confirmed, no signature coupling. The
`tests/unit/` real-Prisma/isolated-fixture convention is confirmed accurate.

---

## 2. Must-fix findings

### M-1 (blocking) — the permission code named in three acceptance criteria does not exist

PM's RST-1 and RST-2 name **`staff.manage_roles`** as the guarding permission (lines 60, 87, 117).

> A repo-wide grep returns **three hits, all inside PM's own task document**. `staff.manage_roles`
> exists nowhere in `src/`, nowhere in the seeded permission catalogue, and nowhere in
> `anemal-rbac-matrix`.

The actual guards (`src/backend/routes/role.routes.ts`):

```ts
router.get('/',                    requireAnyPermission(['roles.view', 'roles.manage']), …)
router.delete('/:roleId',          requirePermission('roles.manage'),                    …)
```

Confirmed against `anemal-rbac-matrix/references/permission-matrix.md:80-81, 164-165` —
`roles.view` (V) and `roles.manage` (E), Admin only. **The correct code for the `deleteRole` path is
`roles.manage`.**

**Impact:** an AC naming a nonexistent permission code is not verifiable by @qa-agent, and it would
seed a phantom code into the matrix's citation trail — the RBAC matrix is the authority I own, and
a fictional code propagating out of a sign-off is a defect in *my* artefact set. **Not a typo to
wave through.**

### M-2 (blocking) — RST-2's acceptance criterion is factually false

> RST-2 AC: *"`deleteRole`'s existing behavior … is unchanged — no behavior regression, this is
> additive scoping only."*

**Narrowing the scope of a count that gates a destructive operation is never "additive".** It widens
what passes the guard. Traced end-to-end:

| | Pre-fix | Post-fix |
|---|---|---|
| Drifted `UserRole` row (same `roleId`, foreign `tenantId`) exists | count ≥ 1 → **409 CONFLICT** | count = 0 → **guard passes** |
| → `roleRepo.deleteRole` | not reached | `clinicRole.deleteMany({ id, tenantId })` |
| → `UserRole.role` FK | — | `onDelete: Restrict` (`schema.prisma:941`) → **P2003** |
| → `error-handler.middleware.ts:34-35` | — | no Prisma branch → **500 `INTERNAL_ERROR`** |

The error handler maps `ZodError`, `MulterError`, and `AppError` only; a
`PrismaClientKnownRequestError` falls through to the generic 500. So in the drift case the change
converts a *wrong-but-clean* 409 into an *opaque* 500.

**Proportionality — I am not calling this a security defect.** The drift state is app-unreachable
today (see M-4), so this is unreachable today too. But PM's own justification for the branch is
*"so `countRoleUsage` is safe to call from any future caller without relying on an upstream guard"* —
and under exactly that future-caller framing, this failure mode is the one that bites. The branch
cannot claim caller-independence and simultaneously wave away the failure mode caller-independence
creates.

**Required:** an explicit, recorded decision (C-3). Recommended resolution is to catch the FK
violation in `role.service.deleteRole` and re-throw the existing `ConflictError` — ~3 lines, no new
error class, no new dependency. Accepting the 500 is *also* acceptable **if written down as a
decision with rationale**. What is not acceptable is shipping an AC that asserts the opposite of
what the code does.

### M-3 (blocking) — the schema file path in RST-4 does not exist

PM writes `prisma/schema.prisma:225` (and `prisma/schema.prisma:935-947`). Relative to the repo
root **there is no `prisma/` directory**. The real file is:

```
src/backend/prisma/schema.prisma
```

`Glob **/schema.prisma` also returns two worktree decoys —
`.claude/worktrees/wizardly-kowalevski-14f642/…` and
`src/backend/.claude/worktrees/exciting-volhard-2256e8/…` — plus the generated
`node_modules/.prisma/client/schema.prisma`. This is the **same worktree grep hazard** the
2026-08-21 sign-off flagged (§5); it has recurred. An agent following RST-4 literally either fails
to find the file or edits a worktree copy that is not tracked in git.

### M-4 (blocking) — the pre-flight constraint claim is wrong, and contradicts RST-3

> PM pre-flight: *"`ClinicRole.tenantId` / `UserRole.tenantId` are kept in sync by an FK +
> `@@unique([tenantId, userId])` constraint — no data-integrity gap expected."*

**False.** From `schema.prisma:935-947`:

- `@@unique([tenantId, userId])` enforces **one role per user per tenant** (ADR-0019 D-7). It says
  nothing about which tenant owns the *role*.
- `tenant Tenant @relation(fields: [tenantId], references: [id])` proves only that the tenant
  **exists**.
- There is **no composite FK** `(roleId, tenantId) → ClinicRole(id, tenantId)`, and there cannot
  easily be one, because system roles carry `tenantId = NULL`.

Nothing in the schema ties `UserRole.tenantId` to its role's owning tenant. **Drift is
DB-insertable.**

**The document contradicts itself:** if the constraints prevented drift, RST-3 step 4 — *"create a
second `UserRole` row referencing the same `roleId` but with tenant B's `tenantId`"* — would be
unwritable, and the load-bearing test could not exist.

**Resolved in favour of "insertable":** drift is possible at the DB level, but **not reachable
through current application code.** Verified — `user.service.ts:186-189` calls
`assertRoleBelongsToCallerTenant(roleRow, tenantId)` on both create and update, and its own comment
(L148-159) documents precisely this attack and why it returns 404 rather than 403. Every production
write (`user.repository.ts:59`, `platform-customers.repository.ts:362`, `seed.ts:128`) passes a
consistent `tenantId`. So drift requires raw SQL, a restore error, or a future bug.

State it that way. The honest framing *strengthens* the branch — it is a real, not imaginary,
integrity gap with no constraint behind it — and it is what makes M-2's failure mode credible.

---

## 3. Gap analysis — what the breakdown misses

### G-1 (significant) — the branch fixes the guarded count and leaves the *unguarded, live* one

Twelve lines above `countRoleUsage`, in the same file, `listRoles` (`role.repository.ts:22-36`):

```ts
include: {
  permissions: { select: { permissionCode: true } },
  _count: { select: { userRoles: true } },     // ← no tenant filter
}
```

`listRoles(tenantId)` returns system roles (`tenantId: null`, **shared across every tenant**) plus
the caller's custom roles. For a **system** role, `_count.userRoles` counts `user_roles` rows for
that `roleId` across **all tenants on the platform**. That number then flows:

`role.repository.ts:32` → `role.service.ts:67` (`assignedUserCount`) → `GET /api/roles`
(`roles.view`) → `RoleList.tsx:302-305` — **rendered as a visible count chip.**

So a clinic admin at tenant A reads the platform-wide number of users holding the system Doctor
role. Cross-tenant aggregate disclosure, into the clinic plane, on screen, **today**.

Contrast with the branch's actual subject: `countRoleUsage` is fully guarded upstream and leaks
nothing. **The branch fixes the inert query and ships past the live one.**

Three further facts:

1. **Already documented, never tracked.** `CodexCodeReview.md:478-497` records this as
   **R2-ME-01, MEDIUM**, with the exact fix. It was never carried into `.claude/roadmap/`. The
   2026-08-20 sign-off's BACKLOG-4 named `countRoleUsage` and `findRoleById` but **not** this. It is
   an untracked live finding.
2. **It is the one that literally violates the CLAUDE.md ABSOLUTE rule.** *"Every query must include
   `WHERE tenant_id = :tenantId`."* The nested `_count` has no tenant predicate.
3. **The fix is one line, in a file already being edited, and is supported.**
   `_count: { select: { userRoles: { where: { tenantId } } } }` — filtered relation counts require
   Prisma ≥ 4.3; `src/backend/package.json:19,46` pins `^5.13.0`. Ponytail cost: +1 line, 0 files,
   0 deps, 0 endpoints.

**Ruling.** I am **not** overriding the human-approved Step 1 scope unilaterally. C-5 requires PM to
put the choice to the human as an explicit scope question, with a default recommendation of
**include as RST-5**. If the human declines, the leak **must** be filed as a tracked backlog item in
`.claude/roadmap/` (not left only in `CodexCodeReview.md`), and the PR body must state that
cross-tenant role counts remain open — so the backlog item does not read as closed when the
higher-severity half of it is untouched.

### G-2 — RST-3's cleanup will fail as specified

RST-3's AC says `afterAll` cleans up *"scoped to the test's own tenant IDs only."* With the drift
fixture that is not sufficient:

- The drifted row is `{ userId: <B>, roleId: <A's role>, tenantId: <B> }`.
- `UserRole.role` is `onDelete: Restrict` → deleting **tenant A's role** fails while that row lives.
- `UserRole.tenant` is a required relation with no `onDelete` → Prisma default **Restrict** →
  deleting **tenant B** fails too.

`user.repository.test.ts:36-42` shows the required child-before-parent discipline. RST-3 must delete
`userRole` rows for **both** tenants **first**, then users, then roles, then tenants — otherwise the
new file is red on its first run and burns a cycle.

### G-3 — the drift fixture needs two distinct users, and RST-3 does not say so

`UserRole`'s primary key is `@@id([userId, roleId])`. Two rows sharing a `roleId` therefore require
**two different `userId`s**. RST-3 steps 3-4 say "tenant A's role/user" then "the same `roleId`"
without naming a second user — a dev following it literally hits a PK collision.

### G-4 — RST-3 step 2 hands the developer a branch, not an instruction

Step 2 is ~5 lines of *"or reuse a system role if that's how seeding works … verify against schema
before writing … if system roles are `tenantId: null` and shared, use two custom roles instead …"*.
That is unresolved analysis delegated downstream. **I have resolved it:** system roles are
`tenantId: null, isSystem: true` and shared (`schema.prisma:905-915`, `findSystemRoleByKey`
confirms); custom roles are per-tenant. The test must therefore use **one custom role in tenant A**
plus a **deliberately drifted row for a tenant-B user**. Give the developer that single recipe.

### G-5 — RST-3's falsifiability AC is upheld

RST-3's *"Test fails against the pre-RST-1 implementation"* is the strongest AC in the set and
survives scrutiny: with the drift fixture the pre-fix `where: { roleId }` returns **2** where the
post-fix returns **1**. Genuinely non-vacuous. **Upheld as written** — and note it prevents the
C-11 failure class from the 2026-08-21 sign-off recurring here.

---

## 4. Authorization-model review

| Check | Result |
|---|---|
| New permission codes | **None.** Correct — this is a repository-internal query, no new surface. |
| Route guards changed | **None.** `roles.manage` on DELETE stays as-is (M-1 corrects the *citation*, not the code). |
| Deny-by-default | **Unaffected.** No route, screen, or guard is added or relaxed. |
| Plane separation | **Unaffected.** `role.routes.ts:25` `requirePlane('clinic')`; nothing platform-plane is touched. `UserRole` is clinic-only. |
| Server as boundary | **Strengthened.** Moves a tenant predicate from caller-guard into the query. |
| No access regression | **Holds for RBAC.** No role gains or loses a permission. See M-2 for the non-RBAC behavioural regression. |
| Privilege escalation | **None.** `assertNoRoleEscalation` / `assertRoleBelongsToCallerTenant` untouched. |
| Custom-role impact | **None.** Custom roles remain per-tenant; the fix makes their usage count exact. |

**No authorization-model change is required by this branch.** The RBAC matrix needs no update; only
PM's *citation* of it does (C-1).

---

## 5. Conditions on this approval

Step 3.5 (`/grill-with-docs`) may proceed once C-1…C-6 are folded into the task list; C-7/C-8 are
carried into Step 6-8.

| # | Condition | Owner |
|---|---|---|
| **C-1** | Replace all three `staff.manage_roles` references with **`roles.manage`** (`role.routes.ts:37`). List route is `requireAnyPermission(['roles.view','roles.manage'])`. **(M-1)** | @pm-agent |
| **C-2** | Correct every schema path to **`src/backend/prisma/schema.prisma`** (L225, L935-947). Add an explicit warning that `**/schema.prisma` matches two untracked worktree copies + the generated client copy; scope all greps to `src/backend/`. **(M-3)** | @pm-agent |
| **C-3** | **Withdraw** RST-2's "no behavior regression / additive scoping only" AC. Replace with an explicit decision on the drift path: either map the FK violation to the existing `ConflictError` (**recommended**, ~3 lines in `role.service.deleteRole`) or accept the 500 with recorded rationale. Add a matching AC either way. **(M-2)** | @pm-agent → @dev-agent |
| **C-4** | Delete the false "kept in sync by FK + unique constraint" claim. Restate as: *drift is DB-insertable (no composite FK ties `UserRole.tenantId` to the role's owner) but app-unreachable today via `user.service.ts:186-189` `assertRoleBelongsToCallerTenant`.* **(M-4)** | @pm-agent |
| **C-5** | Put **G-1** to the human as an explicit scope question, recommending inclusion as **RST-5** (one-line filtered `_count` in `listRoles`, + an AC that a system role's `assignedUserCount` excludes other tenants' users). If declined: file R2-ME-01 as a tracked `.claude/roadmap/` backlog item **and** state in the PR body that cross-tenant role counts remain open. **(G-1)** | @pm-agent → human |
| **C-6** | Rewrite RST-3 with one deterministic recipe: one custom role in tenant A; two **distinct** users; one drifted row; `afterAll` deletes `userRole` for **both** tenants before roles/users/tenants. Remove the "verify against schema before writing" branch. **(G-2, G-3, G-4)** | @pm-agent |
| **C-7** | @db-agent must review RST-1/RST-2 **and** confirm the `onDelete: Restrict` interaction in C-3 — the count is the only thing standing between `deleteRole` and an FK violation. | @db-agent |
| **C-8** | PR body must cite **ADR-0025 D-1** (pre-check scope must equal write scope) as the governing precedent, and state the drift characterisation from C-4. | @pm-agent |

---

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| C-5 accepted → Ponytail reads it as scope creep | Step 5 blocked | Pre-empt in the plan: +1 line, same file, same function family, 0 files/deps/endpoints. Rejecting it means shipping a "tenant-scope role counts" PR that leaves the only *leaking* role count unscoped. |
| C-3 resolved as "accept the 500" | Opaque failure survives | Acceptable **only** if recorded. Drift is app-unreachable today; the cost of the 3-line catch is lower than the cost of the argument. |
| RST-3 cleanup ordering missed | New test file red on first run; `Restrict` errors look like unrelated flake | C-6 makes ordering an explicit AC. |
| Signature change ripples further than PM's grep | Compile break | Low. `findUserIdsByRole` proves the 2-arg convention; RST-1's "backend compiles clean" AC catches it. Greps must exclude worktrees (C-2). |
| Red-suite ship gate (CLAUDE.md 2026-08-20) | Step 8 blocked | `main` is 1295/1295 per HANDOFF; this PR should land 1295 + new RST-3 cases. Re-verify at Step 8, do not assume. |

---

## 7. Backlog raised (not this branch)

- **B-1** — **R2-ME-01 second half:** `findRoleById(roleId)` is a global lookup, and
  `role.service.ts:144/180` returns **403** for a foreign role — a cross-tenant existence oracle.
  `user.service.ts:157-159` already ratified **404-not-403** for exactly this case (ADR-0014
  precedent). The two paths are inconsistent. PM correctly kept it out of this branch; it must be
  **tracked**, which it currently is not.
- **B-2** — `CodexCodeReview.md` findings have no route into `.claude/roadmap/`. R2-ME-01 sat
  undetected through two sign-offs. Worth a triage sweep of that file.
- **B-3** — `error-handler.middleware.ts` has no `PrismaClientKnownRequestError` branch, so every
  FK/unique violation anywhere in the backend surfaces as an opaque 500. Broader than this branch.
- **B-4** — No DB-level constraint ties `UserRole.tenantId` to its role's owning tenant (M-4).
  A `CHECK`-style or composite-FK guard is a real (if large) schema question for @db-agent.

---

## 8. Definition of Ready — hand-off to @pm-agent

| Criterion | Status |
|---|---|
| Objective stated | ✅ §0 header — pre-check scope must equal write scope (ADR-0025 D-1) |
| Actors & roles named | ✅ `clinic_admin` via `roles.manage`; corrected in C-1 |
| Permission codes assigned | ⛔ **Blocked on C-1** — currently names a nonexistent code |
| Exception cases listed | ⛔ **Blocked on C-3** — drift path unspecified |
| NFR impact noted | ✅ No new endpoint, dependency, migration, or index. One extra predicate on an indexed column (`@@unique([tenantId, userId])`, `@@id([userId, roleId])`) — no measurable cost. Security posture improved; availability regression in the drift case per M-2. |
| Acceptance criteria testable | ⛔ **Blocked on C-3, C-6** — one AC is false, one is under-specified |
| Dependencies & risks recorded | ✅ §6, §7 |

**Not ready for `/write-plan`.** Ready for Step 3.5 (`/grill-with-docs`) once C-1…C-6 are folded in.

**Recommended grill targets:**
1. **G-1** — is it defensible to ship a tenant-scoping PR that leaves the live cross-tenant count leaking?
2. **M-2** — 409 → 500 in the drift case: catch the FK violation, or accept and record?
3. **M-4** — nothing in the schema prevents `UserRole.tenantId` drift. Is app-level enforcement (`assertRoleBelongsToCallerTenant`) sufficient, or does B-4 need to be scheduled?

---

*@ba-agent — Step 3 complete. Verdict: APPROVED WITH CONDITIONS (C-1 … C-8).*
