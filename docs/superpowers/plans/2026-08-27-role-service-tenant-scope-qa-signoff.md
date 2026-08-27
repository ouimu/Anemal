# QA Sign-off — Role Service Tenant Scope (RST-1…RST-7)

**Branch:** `fix/role-service-tenant-scope`
**Merge-base:** `b1cc638`  ·  **HEAD (round 2):** `d4ad882`
**Date:** 2026-08-27
**Reviewer:** @qa-agent (Standard Pipeline Step 7)
**Implements:** ADR-0025 D-1 · RST-1…RST-7 · BA sign-off C-1…C-8

# QA-Agent Approval: ✅ APPROVED (round 2)

Round 1 (below, preserved) found the implementation correct but blocked sign-off
on tree state: a concurrent process was rewriting the same test files while the
suite was being measured, and out-of-scope work (ESLint stand-up, unrelated
source edits) had ridden onto the branch. §2's implementation verification does
not need re-litigating — only the tree-state blockers.

## Round 2 — re-verification of the 3 mechanical items

1. **In-flight work resolved.** `git log` shows the fixture-dedup landed as its
   own commit, `e2f2fb7` ("test(role): dedupe tenant fixture setup, pin
   cross-tenant-delete's existing 403"), authored after this sign-off's round 1.
2. **B-2 resolved.** `src/backend/tests/unit/helpers/role-tenant-fixtures.ts` is
   tracked (part of `e2f2fb7`); both `role.repository.test.ts` and
   `role.service.test.ts` import it and the tree compiles (`tsc --noEmit`, clean,
   exit 0).
3. **Clean-tree suite run, attributable to a specific commit.** `git status
   --short` returns empty at `HEAD = d4ad882`. Full backend suite run
   immediately after, no concurrent writers this time:
   **93 suites / 1309 tests passed, 0 failed, exit 0**, `git status --short`
   still empty afterward (proves nothing wrote to the tree mid-run). This
   reproduces round 1's number but is now attributable — first attributable
   green measurement of this branch.
4. **B-3 (out-of-scope work) is gone.** `git status --short` and `git ls-files
   --others --exclude-standard` are both empty — no untracked `.eslintrc.cjs`,
   no modified `package.json`/`package-lock.json`, no stray edits to
   `tenant-settings.service.ts` / `types/index.ts`. Whoever owned that work took
   it off this branch, as round 1 §6 item 1 asked. Not this branch's problem to
   verify further; confirmed absent from the diff.
5. **F-1 fixed.** `e2f2fb7`'s message confirms the "tenant B cannot delete
   tenant A's role" test now carries a comment marking the 403 as pinning
   existing (arguably-wrong per ADR-0014) behavior, tracked under BA backlog
   B-1 — not a silent endorsement. Read in `role.service.test.ts` lines 146-153.

All 4 required items from round 1 §6 are closed. §2's AC coverage map (7/7 PASS)
and §5 findings (F-1 now fixed, F-2 remains open LOW/backlog, unchanged by this
branch) stand as originally verified.

---

## 7. Approval (round 2)

- [x] ✅ Approved for Staging
- [x] ✅ Approved for Production

**QA-Agent Approval: ✅ APPROVED**

Step 8 (`/anemal-finish-branch`) may proceed against `d4ad882`.

---

---
---

# Round 1 record (preserved verbatim, superseded by round 2 above)

**HEAD (round 1):** `77a7746`

# QA-Agent Approval: ❌ REQUEST CHANGES

**The implementation is correct. The branch is not shippable.**

Every RST change verified sound, and I independently reproduced all three
falsifiability probes rather than accepting them on report — all three went red,
all three isolated cleanly. That work is done and I do not need to see it again.

What blocks sign-off is tree state, not code: **the working tree was being
modified by another process while I was measuring it**, so the 1309/1309 green
suite describes neither `77a7746` nor the current tree, and two tracked test
files now import a module that exists in no commit. Details in §3.

---

## 1. Baseline

| Check | Result |
|---|---|
| Full backend suite | **93 suites / 1309 tests passed**, 0 failed, exit 0 — ⚠️ **not attributable**, see B-1 |
| `npx tsc --noEmit` (backend) | clean, exit 0 |
| Working tree at session start | clean at `77a7746` |
| Working tree at sign-off | **11 modified + 2 untracked paths** — see B-3 |

---

## 2. What passed — verified, not taken on report

### 2.1 Falsifiability probes — all three re-run by me

Each mutation applied to the tree, targeted suites run, file restored with
`git checkout --`, restoration confirmed by empty `git diff --stat`.

| Probe | Mutation | Result |
|---|---|---|
| **A** | `countRoleUsage` → `where: { roleId }` | **RED** — T1 `0→1`, T1b `1→2`, T2 `1→2`, isolation guard `1→5`. T3/T4 stayed green (different function — probe isolated) |
| **B** | `_count` → `{ userRoles: true }` | **RED** — T3 `1→5` (**the real cross-tenant leak, made visible**), T4 `1→2`. T1/T1b/T2 stayed green |
| **C** | `deleteRole` try/catch removed | **RED** — T5 receives `PrismaClientKnownRequestError`, not `ConflictError`. Log confirms the genuine FK fired: `Foreign key constraint violated: user_roles_roleId_fkey (index)` — reproduces BA sign-off M-2's 500 exactly. Only T5 failed (6 passed) |

Probe B is the one that matters most: T3 going `1→5` is not a synthetic number.
That is a system role's `assignedUserCount` reporting holders from **every other
tenant** to a clinic admin. RST-5 closes a live read leak, not a hypothetical one.

### 2.2 Tenant isolation — branch diff

Every query in the diff is tenant-scoped in the query itself:

- `countRoleUsage` → `count({ where: { roleId, tenantId } })`
- `listRoles` → `where` OR-scoped **and** `_count.userRoles` filtered by `tenantId`
- `deleteRole` (repo) → `deleteMany({ where: { id: roleId, tenantId } })`

No query in this diff returns another tenant's data. **QA stop criteria: none triggered.**

### 2.3 Drift-row prevention — the guard the whole design rests on

The drift row the fixtures build is not merely a counting anomaly: because
`permission.service.ts:119-130` `resolvePermissions` resolves a user's effective
permissions from their single `UserRole` join row, a drifted row would resolve
**another tenant's role's permissions**. I checked the only thing preventing it.
`assertRoleBelongsToCallerTenant` (`user.service.ts:161`) guards both write paths
— `createUser` (`:189`) and `updateUser` (`:245`) — and correctly throws **404**.
Airtight for app-reachable writes.

### 2.4 RST-4 schema comment — @db-agent's required fix is factually correct

I verified the corrected wording against the implementation rather than the
description. `resolvePermissions` does `prisma.userRole.findUnique({ where: {
tenantId_userId: { tenantId, userId } } })` and maps `role.permissions` — a
single join row, tenant-scoped, never `roleRef`, never a union. The comment at
`schema.prisma:225-228` now says exactly that. Correct.

### 2.5 FK inventory — plan's claim confirmed

The plan asserts only one `onDelete: Restrict` FK references `ClinicRole`. Verified:

| Line | Relation | Action |
|---|---|---|
| 944 | `UserRole.role` | **Restrict** ← the one RST-6 catches |
| 925 | `RolePermission.role` | Cascade |
| 909 | `sourceRole` (self) | SetNull |
| 229 | `User.roleRef` | *(unspecified → default SetNull)* — see F-2 |

So the blanket `P2003` catch currently maps only the intended case. Accepting the
grill's ruling not to narrow on `meta.field_name` was right.

### 2.6 RBAC / plane-isolation regression cover

Present in the run and green: `roleRouteMatrix.test.ts`, `rbac-regression.test.ts`,
`tenantIsolation.test.ts`, `platformAuth.test.ts`, `permission.middleware.test.ts`,
`roleManagement.test.ts`, `roleEditor-t5f01.test.ts`. This branch adds no route,
no permission code, and no middleware, so the matrix surface is unchanged —
these suites are the regression guard, and they hold.

---

## 3. Blockers (round 1 — all resolved in round 2, see top of file)

### 🔴 B-1 — The tree changed under the test run; 1309/1309 is unattributable

The suite ran 08:18–08:25 local. File mtimes:

| Time | Event |
|---|---|
| 08:18 | my full-suite run starts — tree clean at `77a7746` |
| 08:21:51 | `tests/unit/helpers/` created (untracked) |
| **08:23:25** | **`tests/unit/role.repository.test.ts` modified** |
| **08:23:27** | **`tests/unit/role.service.test.ts` modified** |
| 08:23:38 | `package.json` modified (+3 devDeps) |
| ~08:25 | run reports 1309/1309 |
| 08:27:06 | `services/tenant-settings.service.ts` modified |
| 08:27:15 | `.eslintrc.cjs` created |
| ~08:29 | `types/index.ts` modified |

Both role test files were rewritten **while jest was walking the suite list**, and
they run late in that order. The reported green therefore describes neither
`77a7746` nor the current tree — it is a mixed read. CLAUDE.md's red-suite ship
gate requires a green measurement attributable to a commit. This is not one.

I did not re-run: with another process actively writing to the repo and sharing
the test database, a second number would be no more attributable than the first.

### 🔴 B-2 — Tracked test files import an untracked module

```
role.repository.test.ts:53  import { createTenantPair, findSystemStaffRoleId,
role.service.test.ts:21       teardownRoleTenantFixtures } from './helpers/role-tenant-fixtures'
```

`src/backend/tests/unit/helpers/` is **untracked** (`git ls-files` returns empty;
`role-tenant-fixtures.ts` exists on disk only). Committing the tracked
modifications without `git add`-ing the helper yields a branch that cannot
compile. This is a live foot-gun sitting directly in Step 8's path.

### 🔴 B-3 — Uncommitted out-of-scope work on the branch

Beyond the plan's approved 5-file scope the tree now carries:

- **production source:** `services/tenant-settings.service.ts`, `types/index.ts`
- **5 out-of-scope test files** (lint autofix — leading `;(expr)` → `(expr)`)
- **`package.json` +3 devDependencies** (`eslint`, `@typescript-eslint/parser`,
  `@typescript-eslint/eslint-plugin`), **`package-lock.json` +1414 lines**
- **new untracked `.eslintrc.cjs`**

@ponytail-agent approved this plan on "0 new deps, 5 files". That assessment no
longer describes the tree. Standing up ESLint is genuinely worth doing — `npm run
lint` has been in `package.json` with no eslint installed — but it is a separate
change owed its own pipeline pass. It must not ride along inside a tenant-isolation
fix PR, where it would bury a 3-line security change under 1400 lines of lockfile.

On the autofix itself: in every instance I inspected the preceding token is `{`,
so ASI does not bite and the removals are semantically safe. Safe, but unreviewed,
tool-applied, and touching production code — it should be judged on its own branch,
not waved through on mine.

**I did not revert or stash any of this.** It is someone's in-flight work and
destroying it is not my call.

---

## 4. Findings (non-blocking)

### 🟡 F-1 — MEDIUM · A new test pins 403 where this repo's own convention says 404 — FIXED in `e2f2fb7`

`role.service.test.ts` — *"tenant B cannot delete tenant A's custom role (tenant
isolation)"* — asserts `ForbiddenError` / **403**. Against that:

- `qa-protocols.md` Protocol 3.4: cross-tenant resource access → **404, not 403**
- `user.service.ts:158-160`, citing **ADR-0014**: *"404, not 403: a 403 would
  confirm to the caller that a role with this ID exists in some other tenant
  (BOLA existence-leak)"* — and `assertRoleBelongsToCallerTenant` throws 404

So `role.service.ts:182` is the outlier, and the new test now locks it in. The
underlying behaviour is **tracked BA backlog B-1** (`findRoleById`'s cross-tenant
existence oracle), genuinely out of scope here, and this branch does not worsen it
— the finding is the *test*, not the code. A test named "tenant isolation"
asserting the deviant value reads as an endorsement of it, and a future B-1 fix
will surface as a spurious regression.

**Required fix is comment-only (~3 lines)** — precisely the class of stale-comment
defect this branch already shipped twice (RST-4, RST-7). Mark the 403 as
known-deviant, tracked under BA backlog B-1 / ADR-0014, to be flipped to 404 when
B-1 lands.

### 🟢 F-2 — LOW, backlog · `User.roleRef` has no explicit `onDelete` — still open, unchanged by this branch

`schema.prisma:229` omits `onDelete`, so Prisma's optional-relation default
`SetNull` applies: deleting a role nulls `User.roleId` for any user pointing at it
— including, under drift, a user in another tenant.

**Unchanged by this branch** (before RST-1, a drifted `User.roleId` with no
`UserRole` row was already count-0), and unreachable while `replaceUserRole` keeps
the pointer in sync. Both new fixtures deliberately pin drift users' primary
`roleId` to the system role to isolate the `UserRole` Restrict edge — honest, and
it leaves this path untested. Worth an explicit `onDelete` and a backlog item.

---

## 5. AC coverage map

| AC | Verdict |
|---|---|
| RST-1 — `countRoleUsage` tenant-scoped | ✅ PASS — Probe A RED |
| RST-2 — call site passes `tenantId` | ✅ PASS — `tsc` clean, integration suites unmodified pass |
| RST-3 — drift excluded / non-drift included | ✅ PASS — T1, T1b, T2 + isolation guard, all falsifiable |
| RST-4 — schema comment accurate | ✅ PASS — verified against `resolvePermissions` (§2.4) |
| RST-5 — `listRoles._count` scoped | ✅ PASS — Probe B RED, T3 `1→5` real leak |
| RST-6 — P2003 → 409, others pass through | ✅ PASS — Probe C RED; identity check on non-P2003 passthrough |
| RST-7 — stale test comment fixed | ✅ PASS — comment-only, assertion untouched |

**7/7 AC pass. 0 unproven. 0 fail.** The AC are met; §3 is about tree state.

---

## 6. Required to clear this sign-off (round 1 — all closed, see round 2 at top)

1. **Resolve the in-flight work.** Land the ESLint + fixture-dedup changes on
   their own branch, or take them off this one. Coordinate with whoever owns
   them — I deliberately left them untouched.
2. **B-2:** if the fixture-dedup refactor stays, `git add
   src/backend/tests/unit/helpers/`; if it goes, restore both role test files to
   `77a7746`. Never one without the other.
3. **Re-run the full backend suite once on a clean tree**, and record the number
   against a specific commit SHA. Expect 1309 if the tree returns to `77a7746`.
4. **F-1:** comment-only fix to `role.service.test.ts`.

Items 1–3 are mechanical; none requires re-doing implementation work. Re-submit
and I will re-sign — §2 does not need re-litigating, only a clean measurement.
