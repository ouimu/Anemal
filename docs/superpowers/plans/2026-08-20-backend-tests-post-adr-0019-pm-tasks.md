# Backend Test Suite Repair Post-ADR-0019 — PM Scope & Task Breakdown

**Branch:** `fix/backend-tests-post-adr-0019`
**Pipeline step:** Step 1+2 (`@pm-agent`) — scope confirmation + acceptance criteria + task list
**Author:** `@pm-agent`
**Date:** 2026-08-20
**Status:** Ready for `@ba-agent` review (Step 3) — two items below are explicitly flagged for BA ruling, do not proceed to `/write-plan` until they are resolved.

**Execution caveat:** local Postgres is down for this session. Every disposition below is from static code reading (production source + test source + migration history), not a live test run. Counts are best-effort against the reported "28 failed" total — confirm exact per-test outcomes once the suite can run (Step 6/7), and update this table if a live run surfaces a mismatch.

---

## 0. Important correction to the problem statement

The brief attributes all 9 failing suites to ADR-0019 (multi-role retirement). Reading the code shows **two independent root causes**, not one:

1. **ADR-0019 (single-role-per-user)** — the diagnosed cause, confirmed for 7 of the 9 suites.
2. **A separate, unrelated recent change** — `services/auth.service.ts`'s `login()` now calls `authRepo.touchLastLogin()` (added in PR #54 / commit `56107e3`, "make login identity resolution atomic, remove branch-select login flash"), which runs `prisma.user.updateMany(...)`. `tests/unit/authService.test.ts`'s mock of `../../config/db` only stubs `user: { findUnique, update, findFirst }` — no `updateMany`. Every login path that reaches that line throws `TypeError: db_1.default.user.updateMany is not a function` before the ADR-0019-related `roleRef` logic is ever exercised. This is a **mock-staleness bug from PR #54, not ADR-0019** — same disposition (FIX-FIXTURE, test-only) but flagging the misattribution so no one "fixes" the wrong thing looking for role/permission logic that isn't there.

This doesn't change the scope decision (still test-only, still this branch), but `@ba-agent` and whoever executes Step 6 should know the two failures are unrelated in mechanism.

---

## 1. Per-test disposition table

Legend: **DELETE** = asserts a retired requirement, remove the test. **REWRITE** = valid intent, mechanics must change for single-role model. **FIX-FIXTURE** = test/mock intent is correct, only the seeding/mocking violates the new constraint or is stale. **INVESTIGATE** = cannot classify from static reading; question for `@ba-agent`, not a guess.

### tests/unit/permission.service.test.ts (9 tests, all currently broken — mock only stubs `userRole.findMany`; service calls `userRole.findUnique`)

| Test | Disposition | Notes |
|---|---|---|
| `resolvePermissions › returns union of all role permissions as a Set` | **DELETE** | Asserts multi-role union (`perms.size === 3` across two roles). Retired by ADR-0019 — a user has one role, so there is no union to take. |
| `resolvePermissions › queries with correct tenantId and userId` | **REWRITE** | Valid intent (query is tenant-scoped); must assert `findUnique({ where: { tenantId_userId: { tenantId, userId } } })`, not `findMany({ where: { userId, tenantId } })`. |
| `resolvePermissions › returns cached result on second call without querying DB` | **REWRITE** | Valid intent; mock must expose `findUnique`, `MOCK_USER_ROLES` must become a single `{ role: {...} }` object, not an array. |
| `resolvePermissions › re-queries DB after invalidatePermCache` | **REWRITE** | Same mechanical change as above. |
| `resolvePermissions › returns empty Set when user has no roles` | **REWRITE** | `findMany` returning `[]` becomes `findUnique` returning `null`. |
| `resolvePermissions › caches per tenantId:userId — two users get separate caches` | **REWRITE** | Mechanical mock-shape change only. |
| `computePermSetVersion › returns max permVersion across all role permissions` | **REWRITE** | Title itself is now wrong ("max ... across all") — single role has one `permVersion`, nothing to max. Keep the assertion (the role's `permVersion` is returned), retitle, fix mock shape. |
| `computePermSetVersion › returns 1 when user has no roles` | **REWRITE** | Mechanical mock-shape change (`findUnique` → `null`). |

**File total: 1 DELETE, 7 REWRITE.**

### tests/unit/authService.test.ts (3 of 9 tests affected — see §0, this is a PR #54 mock gap, not ADR-0019)

| Test | Disposition | Notes |
|---|---|---|
| `login step 1 › admin: bypasses branch selection...` | **FIX-FIXTURE** | Add `updateMany: jest.fn().mockResolvedValue({ count: 1 })` to the `user` mock (`touchLastLogin` uses scoped `updateMany`, not `update`). No assertion changes needed. |
| `login step 1 › staff: returns pendingToken + assigned branches only` | **FIX-FIXTURE** | Same root cause. |
| `login step 1 › staff with zero assigned branches → throws 403` | **FIX-FIXTURE** | Currently throws an uncaught `TypeError` before reaching the real 403 path; same mock fix resolves it. |
| (wrong password / tenant not found / inactive user / inactive tenant / switchBranch × 3) | **not in the 28** | These fail before or without reaching `touchLastLogin`; already green by inference. Confirm at Step 7. |

**File total: 3 FIX-FIXTURE.**

### tests/scripts/collapse-multi-role.test.ts (6 tests, all fixtures now impossible under the current schema)

| Test | Disposition | Notes |
|---|---|---|
| `classifyMultiRoleUsers` × 4 its | **DELETE** | Every one seeds ≥2 `userRole` rows for one `(tenantId, userId)` via `createMany`/`create`, which now violates `@@unique([tenantId, userId])` (migration `20260805090000_enforce_one_role_per_user`, already applied). Cannot be rewritten — the precondition state the script exists to classify no longer exists to insert. |
| `collapseMultiRoleUsers` × 2 its | **DELETE** | Same reason. |

**File total: 6 DELETE.** See §2 scope decision below — this is the one item requiring a **BA ruling**, not just a test disposition.

### tests/integration/roleManagement.test.ts (3 of ~15 tests affected)

| Test | Disposition | Notes |
|---|---|---|
| `DELETE /clinic/roles/:roleId › returns 403 when attempting to delete a system role` | **FIX-FIXTURE** | Collateral — same `describe`'s `beforeAll` (next row) throws, taking this test down with it. |
| `DELETE /clinic/roles/:roleId › returns 409 when role is still assigned to a user` | **FIX-FIXTURE** | Root cause: `beforeAll` does `prisma.userRole.create({ userId: adminUserId, roleId: inUseRoleId, ... })` while `adminUserId` already holds `adminRoleId` — a second row for the same `(tenantId, userId)`, violates the unique constraint. Fix: assign `inUseRoleId` to a **new** dedicated user instead of adding a second role to the existing admin. Test intent (409 when a role is in use) is fully valid. |
| `DELETE /clinic/roles/:roleId › successfully deletes a custom role that is not in use` | **FIX-FIXTURE** | Same collateral as the first row. |

**File total: 3 FIX-FIXTURE (one root fixture, two collateral).**

### tests/integration/roleEditor-t5f01.test.ts (1 of ~17 tests affected)

| Test | Disposition | Notes |
|---|---|---|
| `AC-4 DELETE /clinic/roles/:id › 409 when a custom role is still assigned, with assignedCount in the envelope` | **FIX-FIXTURE** | Identical pattern to roleManagement.test.ts: `prisma.userRole.create({ userId: adminUserIdA, roleId: inUseId, ... })` on top of `adminUserIdA`'s existing role. Same fix: assign to a new dedicated user. This `it` is self-contained (not a shared `beforeAll`), so no collateral to siblings. |

**File total: 1 FIX-FIXTURE.**

### tests/integration/pet-medical-degradation.test.ts (3 tests, all affected — shared top-level `beforeAll`)

| Test | Disposition | Notes |
|---|---|---|
| `doctor (has emr.view) sees medicalRecords and vaccinations` | **FIX-FIXTURE** | Collateral — the file's single `beforeAll` throws (next row) before any test runs. |
| `custom role without emr.view gets neither field, but still sees the pet` | **FIX-FIXTURE** | Same collateral. |
| `multi-role union: no-emr custom role + doctor role still resolves emr.view and sees both fields (CR-01)` | **DELETE** | Retired requirement (CR-01 union), explicitly citable to ADR-0019. Its own fixture (`unionUser` given 2 `userRole` rows) is also what throws in `beforeAll` and takes the other two tests down. Removing this test + its fixture block (`unionUser`, `unionToken`) fixes all three. |

**File total: 1 DELETE, 2 FIX-FIXTURE (collateral).**

### tests/integration/appointmentDoctors.test.ts (1 of ~15 tests affected)

| Test | Disposition | Notes |
|---|---|---|
| `findDoctorsForBranch (repository) › includes a multi-role user if any one role is Doctor-derived` | **DELETE** | Retired requirement — no multi-role stacking is possible, so "doctor via a second stacked role" cannot occur. Note: the repository's existing single-role lineage test (`includes a user whose custom role is cloned (sourceRoleId) from the system Doctor role`) already covers the real TO-BE mechanism (clone-with-lineage) and is unaffected — keep it. This `it` is self-contained, no collateral. |

**File total: 1 DELETE.**

### __tests__/clinicUsage.test.ts (3 of 5 tests affected)

| Test | Disposition | Notes |
|---|---|---|
| `GET /clinic/usage › returns 200 for doctor` | **FIX-FIXTURE** | Mock's `userRole = { findMany: () => [...] }` (comment literally says "Phase 8 (T-5B-01)" — predates ADR-0019). Service calls `findUnique`. Change mock to `findUnique: () => Promise.resolve({ role: { permissions: [{ permissionCode: 'clinic.profile.view' }] } })`. |
| `GET /clinic/usage › returns 200 for staff` | **FIX-FIXTURE** | Same fix. |
| `GET /clinic/usage › returns 200 for admin` | **FIX-FIXTURE** | Same fix. |
| (401 no token / 401 invalid token) | **not in the 28** | Fail before permission resolution is reached; already green. |

**File total: 3 FIX-FIXTURE.**

### __tests__/invoice.test.ts (at least `bill-09`, possibly `bill-08` — **INVESTIGATE**)

| Test | Disposition | Notes |
|---|---|---|
| `bill-09: tenant B cannot pay tenant A invoice → 404` | **INVESTIGATE** | Read the full file: `tokenA`/`tokenB` are signed directly (`signToken`, bypassing `login()`), and role seeding goes through `seedUserRoles()` — a helper that already inserts exactly **one** `userRole` row per user with `skipDuplicates: true`. I cannot find a multi-role or stale-mock cause in this file's own fixtures. Two live hypotheses, neither confirmable without a DB run: (a) collateral damage — a sibling suite's `beforeAll` throwing mid-transaction (the five files above) leaves orphaned rows or exhausts the Postgres connection pool under Jest's parallel workers, incidentally breaking this file too; (b) a real, so-far-undetected defect in the invoice payment tenant-isolation check. **Do not patch this test to match current behavior without first re-running it in isolation** (`npx jest --testPathPattern=invoice.test`) once the DB is back — if it passes standalone, it was collateral (no test change needed, just confirms the other fixes); if it still fails standalone, it is a real gap and must be escalated per AC-4 below (no production-code fix belongs in this branch). |
| `bill-08: tenant B cannot read tenant A invoice → 404` | **INVESTIGATE** | Not explicitly named as failing in the brief, but shares the same isolation-check code path as bill-09 — check together. |

**File total: 0–2 INVESTIGATE. Flag to `@ba-agent` at Step 3 as an open question, not a disposition to guess at.**

### Running totals (best-effort, unverified against a live run)

| Disposition | Count |
|---|---|
| DELETE | 9 (1 permission.service + 6 collapse-multi-role + 1 pet-medical-degradation + 1 appointmentDoctors) |
| REWRITE | 7 (all in permission.service.test.ts) |
| FIX-FIXTURE | 12 (3 authService + 3 roleManagement + 1 roleEditor + 2 pet-medical-degradation collateral + 3 clinicUsage) |
| INVESTIGATE | 0–2 (invoice.test.ts) |
| **Total** | **28–30** |

The 2-item spread against the reported 28 is `bill-08`/`bill-09`'s uncertain classification — resolve at Step 6/7 with a live run, not by assumption now.

---

## 2. Scope decision

**In this branch (test-only):**
- All 9 files above: delete/rewrite/fix-fixture as tabled.
- No file under `src/backend/services`, `controllers`, `repositories`, or `routes` is touched (per AC-4 below) — every disposition found is a test/mock problem, confirmed by reading the corresponding production code for each of the 9 suites.

**Deferred / flagged, NOT this branch:**

1. **`src/backend/prisma/scripts/collapse-multi-role.ts` (the script itself, not its test)** — **flag to `@ba-agent`, do not rule here.** The one-time cutover migration (`20260805090000_enforce_one_role_per_user`) has already been applied to the schema — confirmed by the migration's presence and by `permission.service.ts`'s own doc comment citing it. Since Anemal is shared-schema multi-tenant (one DB, not one per tenant — CLAUDE.md), the cutover is a one-time, already-executed event; the script cannot run again (its own precondition — >1 `userRole` row per user — can no longer exist). Question for BA: is the script still needed for (a) disaster-recovery restores from a pre-migration backup, or (b) audit-trail/compliance retention, or is it safe to archive/delete now that its job is done? This branch **deletes its test** (fixtures are impossible either way) but takes no position on the script file itself — that's a housekeeping decision with its own blast radius (a script referenced by ADR-0019 §Consequences), not a test-fix decision.
2. **Whether `bill-08`/`bill-09` in `invoice.test.ts` need a code fix** — see INVESTIGATE row above. If the live run shows a real defect, it becomes a new, separately-scoped bug ticket (through the full pipeline, starting at Step 1), not an in-flight addition to this branch.
3. **Retitling `computePermSetVersion`'s test descriptions** to drop "across all role permissions" language is included in the REWRITE disposition above (in-scope, it's the same file already being touched) — not deferred, noted here only so it isn't missed as "just a rename, skip it."

---

## 3. Acceptance criteria

```
Task ID: TEST-PARITY-01   Actor/role: n/a (CI/build concern)   Device: n/a
Description: Backend Jest suite is fully green on `fix/backend-tests-post-adr-0019`.
Acceptance Criteria:
  - [ ] `npm test` (backend) reports 0 failed, 1293/1293 (or the post-DELETE adjusted total — see AC below) passed.
  - [ ] Every file in the disposition table above reflects its assigned action (DELETE/REWRITE/FIX-FIXTURE); no file left with a stale multi-role mock.
  - [ ] No test file marked INVESTIGATE was silently changed without a resolution recorded in this doc or a follow-up ticket.
Permission(s): n/a
Dependencies: local Postgres available for the live run (currently down).

Task ID: TEST-PARITY-02   Actor/role: n/a   Device: n/a
Description: No test in the suite asserts multi-role-per-user union semantics.
Acceptance Criteria:
  - [ ] `git grep` for "union of all role" / "multi-role union" / "Multi Role User" / "multi-role" across `src/backend/tests` and `src/backend/__tests__` returns zero matches (after this branch's changes).
  - [ ] `resolvePermissions()` unit tests exercise only the single-`findUnique` code path.
Permission(s): n/a
Dependencies: TEST-PARITY-01.

Task ID: TEST-PARITY-03   Actor/role: n/a   Device: n/a
Description: Every DELETEd test is documented as a deliberate, visible coverage reduction — not a silent drop.
Acceptance Criteria:
  - [ ] This document's disposition table (§1) is committed alongside the test changes and referenced from the PR description, naming each deleted test and citing ADR-0019.
  - [ ] `docs/adr/0019-single-role-per-user-retires-multi-role.md` is NOT edited by this branch (it already documents the decision; this branch only brings tests into compliance with it).
  - [ ] The PR description explicitly states the before/after test count so a reviewer can see coverage went from N to N-9 (or whatever the final DELETE count is) on purpose.
Permission(s): n/a
Dependencies: TEST-PARITY-01.

Task ID: TEST-PARITY-04   Actor/role: n/a   Device: n/a
Description: No production source file is modified to make this branch's tests pass.
Acceptance Criteria:
  - [ ] `git diff main --stat` for this branch shows changes confined to `src/backend/tests/**`, `src/backend/__tests__/**`, and this plan doc — zero files under `src/backend/services`, `src/backend/controllers`, `src/backend/models` (repositories), or `src/backend/routes`.
  - [ ] If any disposition above turns out to require a production change once run live (most likely candidate: `invoice.test.ts` bill-08/09 if INVESTIGATE resolves to "real bug"), that fix is escalated as a new, separately-scoped task through Step 1–8, not folded into this branch.
Permission(s): n/a
Dependencies: TEST-PARITY-01.
```

---

## 4. Risk list

| Risk | Where it bites | Mitigation |
|---|---|---|
| **Bending a tenant-isolation or permission-resolution test to match current behavior, hiding a real security defect.** | `invoice.test.ts` bill-08/bill-09 (tenant can't pay/read another tenant's invoice) is exactly this shape of test — the single highest-risk item in this batch. Also applies to any future edit inside `roleEditor-t5f01.test.ts` AC-6 (tenant isolation) or `roleManagement.test.ts`'s cache-invalidation test — none of those are on the fixture-fix list today, but if a live run surfaces a NEW failure in them, the same caution applies. | Per AC-4: these two tests are marked INVESTIGATE, not FIX-FIXTURE, specifically so nobody flips their expected status code to whatever the code currently returns. Re-run in isolation first; only accept a fixture-only explanation if the isolated run is green once the collateral suites are fixed. |
| **Deleting a test that's actually still valid, mistaking it for a retired-requirement assertion.** | Low risk here — every DELETE in §1 either directly asserts multi-role union semantics in its own title/body, or (collapse-multi-role.test.ts) has fixtures that are now physically impossible to construct. No borderline cases were found. | `@ba-agent` reviews the disposition table at Step 3 before any test is actually deleted. |
| **Archiving/deleting the `collapse-multi-role.ts` script prematurely**, losing an auditable migration tool that ADR-0019 explicitly references. | Not this branch's decision (deferred, §2.1), but a future engineer touching dead code nearby might be tempted to delete it as a drive-by cleanup. | Explicitly flagged as a separate BA-owned decision; this branch touches only the test, not the script. |
| **Mock-shape drift recurring** — `permission.service.test.ts` and `clinicUsage.test.ts` both went stale because the service's underlying Prisma call changed (`findMany` → `findUnique`) without the mocks being updated in the same PR that shipped ADR-0019's schema change. | Any future service-layer signature change. | Not fixable by this branch alone (process gap), but worth a QA-protocol note: `@qa-agent`'s Step 7 sign-off should include "did any mocked Prisma call shape change in this PR, and were all mocks of that call updated" as an explicit check. Recommend to `@qa-agent`/`@pm-agent` for `.claude/roadmap/qa-protocols.md`, not in scope to edit here. |
| **Misattributing `authService.test.ts`'s failure to ADR-0019** and looking for role/permission logic to fix instead of the actual `touchLastLogin`/`updateMany` mock gap. | Whoever executes Step 6 on this file. | Called out explicitly in §0 and in the per-test table; not left implicit. |

---

## 5. Handoff

Next step: **Step 3, `@ba-agent`** — validate this disposition table, rule on the two flagged items (collapse-multi-role.ts script disposal question in §2.1, and invoice.test.ts bill-08/09 in §1/§2.2), then sign off. Only after BA sign-off does Step 3.5 (`/grill-with-docs`, mandatory) run, followed by `/write-plan` (Step 4).
