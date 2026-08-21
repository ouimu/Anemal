# Backend Test Suite Repair Post-ADR-0019 — Execution Plan

**Branch:** `fix/backend-tests-post-adr-0019`
**Pipeline step:** Step 4 (`/write-plan`) — `@pm-agent`
**Inputs (all read in full):**
- `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-pm-tasks.md` (Step 1+2)
- `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-ba-signoff.md` (Step 3, APPROVED WITH CONDITIONS)
- `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-grill.md` (Step 3.5, ALL FINDINGS RESOLVED)
- `docs/adr/0025-payment-claim-failure-distinguishes-not-found-from-conflict.md`
- `docs/adr/0019-single-role-per-user-retires-multi-role.md`

**Next gate:** `@ponytail-agent` (Step 5) — do not run `/execute-plan` before APPROVE.

---

## 0. Locked scope recap (do not re-litigate here)

- Dispositions: **DELETE 7 / REWRITE 8 / FIX-FIXTURE 12 / PRODUCTION FIX 1 = 28 exactly.**
- Production edit confined to **one file, one function**: `src/backend/models/invoice.repository.ts` → `claimInvoicePaid`.
- `authService.test.ts` failure is **PR #53** (`f8b92e2`, HI-02), not PR #54 — nothing to do with roles.
- `prisma/scripts/collapse-multi-role.ts` is **kept**, untouched.
- `collapse-multi-role.test.ts`'s `does not classify a single-role user at all` (line 100) is **kept verbatim**.
- `permission.service.test.ts`'s union test is **rewritten**, not deleted (D-1).
- C-5 fixture trap: role-test replacement users must share tenant with the role AND have `users.roleId` match the `user_roles` row.
- Out of scope: audit logging for payment probes, tenant-scoping `countRoleUsage`, the 8 frontend test files (separate session).

---

## 1. Test-count arithmetic (verified against the dispositions — corrected)

| Change | Delta |
|---|---|
| Starting total | 1293 (28 failing, 1265 passing) |
| DELETE 7 tests (5 collapse-multi-role + 1 pet-medical-degradation + 1 appointmentDoctors) | −7 |
| REWRITE 8 tests (permission.service.test.ts) | 0 (1:1, same test count) |
| FIX-FIXTURE 12 tests (authService ×3, roleManagement ×3, roleEditor-t5f01 ×1, pet-medical-degradation collateral ×2, clinicUsage ×3) | 0 (1:1, same test count) |
| PRODUCTION FIX — `bill-09` fixed in place | 0 (existing test, same count) |
| **NEW** invoice tests required by AC-05 / grill §2's four-case table, not covered by any existing test — **3 new tests**: wrong-branch-same-tenant→404, nonexistent-id-own-tenant→404, and a colocated already-paid-own-scope→409 (duplicates bill-06's assertion by design, for AC-05 traceability — see Task 10.2 note) | +3 |

**Corrected expected end state: 1293 − 7 + 3 = 1289 total, 0 failing.**

(The 1286 figure in the Step-4 brief assumed only the −7 deletions and missed the +3 new invoice tests that AC-05/grill §2 mandate. FIX-FIXTURE/REWRITE are 1:1 swaps, not deletions, so they were already correctly excluded from the delta — the missing term was the 3 new cases.)

---

## Task list

Grouped by file so a failure is attributable to one task. Each task is 2–5 minutes. Run `npx jest <file>` after each file group to confirm before moving to the next.

### Group 0 — Coverage-loss record (R-1, do first so later deletions cite it)

**Task 0.1** — Create `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-deleted-coverage.md`
- Table: file, test name, reason (cite ADR-0019), what still covers the surviving requirement (per BA §6 / grill §6).
- Content is the 7 DELETE rows from the BA sign-off §4 "Confirmed as written" table, one row each:
  1. `collapse-multi-role.test.ts` — `classifyMultiRoleUsers › classifies a system+custom user as auto-collapsible, keeping the system role`
  2. `collapse-multi-role.test.ts` — `classifyMultiRoleUsers › classifies a 2-system-role user as ambiguous`
  3. `collapse-multi-role.test.ts` — `classifyMultiRoleUsers › classifies a 2-custom-role user with no system role as ambiguous`
  4. `collapse-multi-role.test.ts` — `collapseMultiRoleUsers › collapses an auto-collapsible user to the system role and logs it`
  5. `collapse-multi-role.test.ts` — `collapseMultiRoleUsers › leaves an ambiguous user untouched and reports it`
  6. `pet-medical-degradation.test.ts` — `multi-role union: no-emr custom role + doctor role still resolves emr.view and sees both fields (CR-01)`
  7. `appointmentDoctors.test.ts` — `findDoctorsForBranch (repository) › includes a multi-role user if any one role is Doctor-derived`
- No test coverage for `classifyMultiRoleUsers`/`collapseMultiRoleUsers`'s ambiguous/auto-collapsible branches survives (the script is behaviorally frozen — its precondition is now unconstructable in a live schema); this is called out explicitly as an accepted gap, not silently dropped. `does not classify a single-role user at all` remains as the sole regression guard (imports + runs against live schema).
- AC: `TEST-PARITY-03`.

### Group 1 — `tests/unit/authService.test.ts` (mock gap, PR #53, nothing to do with roles)

**Task 1.1** — Add `updateMany` stub to the `user` mock at `tests/unit/authService.test.ts:9`
```ts
user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn() },
```
- No assertion changes in any `it`.
- AC: covers `login step 1 › admin: bypasses branch selection...`, `login step 1 › staff: returns pendingToken + assigned branches only`, `login step 1 › staff with zero assigned branches → throws 403`.

**Task 1.2** — Run `npx jest tests/unit/authService.test.ts` — expect 9/9 green (was 6/9).

### Group 2 — `tests/unit/permission.service.test.ts` (8 REWRITE)

**Task 2.1** — Retitle + rewrite `resolvePermissions › returns union of all role permissions as a Set` (line 53) to `resolvePermissions › returns the assigned role's permission codes as a Set` (D-1)
- Mock `findUnique` → one `{ role: { permVersion, permissions: [...] } }` object (single role, no second-role fixture, no duplicate-code fixture — `RolePermission` is `@@id([roleId, permissionCode])`, dedup is structurally impossible).
- Assert Set membership and `size` against that one role's permission codes.

**Task 2.2** — Rewrite `resolvePermissions › queries with correct tenantId and userId` (line 62)
- Assert `findUnique({ where: { tenantId_userId: { tenantId, userId } } })` — the composite-key call shape, not merely "was called." Per BA §6, this is the single most important test in the batch (tenant-scoping for the whole permission-resolution layer) — must not degrade into a bare call-count check.

**Task 2.3** — Rewrite `resolvePermissions › returns cached result on second call without querying DB` (line 70)
- Mock exposes `findUnique`; `MOCK_USER_ROLES` becomes a single `{ role: {...} }` object, not an array.

**Task 2.4** — Rewrite `resolvePermissions › re-queries DB after invalidatePermCache` (line 77) — same mechanical mock-shape change.

**Task 2.5** — Rewrite `resolvePermissions › returns empty Set when user has no roles` (line 85) — `findMany` returning `[]` becomes `findUnique` returning `null`.

**Task 2.6** — Rewrite `resolvePermissions › caches per tenantId:userId — two users get separate caches` (line 91) — mechanical mock-shape change only.

**Task 2.7** — Retitle + rewrite `computePermSetVersion › returns max permVersion across all user roles` (line 100) to `computePermSetVersion › returns the assigned role's permVersion`
- Keep the underlying assertion (the role's `permVersion` is returned); drop "max ... across all" language per BA §4 (a retired-capability title is a spec artefact).

**Task 2.8** — Rewrite `computePermSetVersion › returns 1 when user has no roles` (line 106) — `findUnique` → `null`.

**Task 2.9** — Run `npx jest tests/unit/permission.service.test.ts` — expect 8/8 green (was 0/8).

### Group 3 — `tests/scripts/collapse-multi-role.test.ts` (5 DELETE, 1 KEEP)

**Task 3.1** — Delete `classifyMultiRoleUsers › classifies a system+custom user as auto-collapsible, keeping the system role` (line 43) and its body.

**Task 3.2** — Delete `classifyMultiRoleUsers › classifies a 2-system-role user as ambiguous` (line 63).

**Task 3.3** — Delete `classifyMultiRoleUsers › classifies a 2-custom-role user with no system role as ambiguous` (line 82).

**Task 3.4** — Delete `collapseMultiRoleUsers › collapses an auto-collapsible user to the system role and logs it` (line 142) and `collapseMultiRoleUsers › leaves an ambiguous user untouched and reports it` (line 180).

**Task 3.5** — Remove now-unused fixture variables left by 3.1–3.4: `systemStaffRoleId` (both `describe` blocks, lines 10 and 116), `customRoleBId` (line 12), and any `beforeAll`/`afterAll` seeding that existed only for the deleted tests. `noUnusedLocals: true` in `tsconfig.json` will fail the build on any leftover — run `npx tsc --noEmit` after this task specifically.
- **Do not touch** `does not classify a single-role user at all` (line 100) or its enclosing `describe`'s `beforeAll`/`afterAll` that it still depends on (C-3). If a shared `beforeAll` seeded fixtures for both kept and deleted tests, split it — do not delete wholesale.

**Task 3.6** — Run `npx jest tests/scripts/collapse-multi-role.test.ts` — expect 1/1 green (was 1/6; the file now has exactly 1 test). Run `npx tsc --noEmit` — expect 0 errors.

### Group 4 — `tests/integration/roleManagement.test.ts` (3 FIX-FIXTURE, C-5 conditions)

**Task 4.1** — Replace the `beforeAll` fixture at `tests/integration/roleManagement.test.ts:358-360`
- Current: `prisma.userRole.create({ data: { userId: adminUserId, roleId: inUseRoleId, tenantId: tid } })` — adds a second role to the already-roled admin, now illegal under `@@unique([tenantId, userId])`.
- New: create a **dedicated new user** in the same tenant (`tid`) as `inUseRoleId`'s role, with `users.roleId: inUseRoleId` **and** a matching `user_roles` row for the same role (C-5 — both must name the same role, or a wrong-tenant fixture would still pass the 409 check via `countRoleUsage(roleId)`'s unscoped query, silently asserting nothing).
- Store the new user's id for cleanup.

**Task 4.2** — Extend the `afterAll` at `tests/integration/roleManagement.test.ts:363-367` to delete the new fixture user (in addition to the existing `userRole`/`rolePermission`/`clinicRole` cleanup) — `UserRole.role` is `onDelete: Restrict`, so delete order stays: `userRole` rows → user → role.

**Task 4.3** — Run `npx jest tests/integration/roleManagement.test.ts` — expect all tests green, specifically:
- `DELETE /clinic/roles/:roleId › returns 403 when attempting to delete a system role`
- `DELETE /clinic/roles/:roleId › returns 409 when role is still assigned to a user`
- `DELETE /clinic/roles/:roleId › successfully deletes a custom role that is not in use`

### Group 5 — `tests/integration/roleEditor-t5f01.test.ts` (1 FIX-FIXTURE, C-5)

**Task 5.1** — In `409 when a custom role is still assigned, with assignedCount in the envelope` (line ~250), replace `await prisma.userRole.create({ data: { userId: adminUserIdA, roleId: inUseId, tenantId: tidA } })` with creation of a **new dedicated user** in tenant `tidA`, `users.roleId: inUseId` + matching `user_roles` row (same C-5 pattern as Task 4.1). This test is self-contained (no shared `beforeAll`), so cleanup stays inline in the same `it` — extend the existing inline cleanup block to also delete the new user.

**Task 5.2** — Run `npx jest tests/integration/roleEditor-t5f01.test.ts` — expect all green, including AC-6 tenant-isolation tests (must remain untouched and green — regression guard, not part of this fix).

### Group 6 — `tests/integration/pet-medical-degradation.test.ts` (1 DELETE + 2 collateral)

**Task 6.1** — Delete `multi-role union: no-emr custom role + doctor role still resolves emr.view and sees both fields (CR-01)` (line 114) and its fixture block: `unionUser` (lines 61-64), the two `userRole.create` calls for it (lines 64-65), `userBranch.create` for it (line 66), and `unionToken` (line 17, 77).
- `noUnusedLocals: true` — remove all four together or the build fails.

**Task 6.2** — Run `npx jest tests/integration/pet-medical-degradation.test.ts` — expect both survivors green (the collateral failures resolve once `unionUser`'s illegal double-`userRole.create` is gone from `beforeAll`):
- `doctor (has emr.view) sees medicalRecords and vaccinations`
- `custom role without emr.view gets neither field, but still sees the pet`

Run `npx tsc --noEmit` to confirm no leftover unused-var errors.

### Group 7 — `tests/integration/appointmentDoctors.test.ts` (1 DELETE)

**Task 7.1** — Delete `findDoctorsForBranch (repository) › includes a multi-role user if any one role is Doctor-derived` (line 158) and any fixture rows created solely for it (a second `userRole` row on an existing user).

**Task 7.2** — Run `npx jest tests/integration/appointmentDoctors.test.ts` — expect all remaining tests green, specifically confirm these stay green (regression guard, not touched):
- `includes a user whose custom role is cloned (sourceRoleId) from the system Doctor role` (line 143)
- `never returns a doctor from another tenant` (line 117)

### Group 8 — `__tests__/clinicUsage.test.ts` (3 FIX-FIXTURE)

**Task 8.1** — Replace the mock at `__tests__/clinicUsage.test.ts:24-31`
```ts
// was:
userRole = {
  findMany: () => Promise.resolve([{
    role: { permissions: [{ permissionCode: 'clinic.profile.view' }] },
  }]),
}
// becomes:
userRole = {
  findUnique: () => Promise.resolve({
    role: { permissions: [{ permissionCode: 'clinic.profile.view' }] },
  }),
}
```
- Drop the stale `// Phase 8 (T-5B-01)` comment (line 23) — predates ADR-0019 and now misdescribes the call shape.
- No assertion changes.

**Task 8.2** — Run `npx jest __tests__/clinicUsage.test.ts` — expect 5/5 green (was 2/5): `returns 200 for doctor`, `returns 200 for staff`, `returns 200 for admin`, plus the two already-green 401 tests.
- Note for `@qa-agent` (BACKLOG-2, not this branch): this mock grants `clinic.profile.view` unconditionally to every token, so these three tests prove route wiring, not the real permission matrix — recorded, not fixed here.

### Group 9 — Production fix: `models/invoice.repository.ts` → `claimInvoicePaid` (TDD: tests red first)

**Task 9.1 (RED)** — Add 3 new tests to `__tests__/invoice.test.ts`, in the `bill-3.2` describe block, immediately after `bill-09` (after line 149). Use the existing `tokenA`/`tokenB`/`bA`/`bB` fixtures already in scope (see file header, `bA`/`bB` are tenant A's branches).
```ts
test('bill-17: same-tenant, wrong-branch pay attempt → 404', async () => {
  // requires a second branch token/context for tenant A distinct from the invoice's branch —
  // reuse or add a tenant-A, other-branch token (tokenA2) scoped to a branch that is NOT
  // the invoice's branch. If no such fixture exists yet, add one in this file's beforeAll
  // (tenant A, second branch, admin role) — do not create a new tenant.
  await request(server).put(`/api/invoices/${invoiceId}/payment`).set(auth(tokenA2)).send({ paymentMethod: 'cash' }).expect(404)
})

test('bill-18: same-tenant, nonexistent invoice id → 404', async () => {
  await request(server).put('/api/invoices/999999999/payment').set(auth(tokenA)).send({ paymentMethod: 'cash' }).expect(404)
})

test('bill-19: same-tenant, same-branch, already-paid → 409 (AC-05 grouped regression companion to bill-06)', async () => {
  await request(server).put(`/api/invoices/${invoiceId}/payment`).set(auth(tokenA)).send({ paymentMethod: 'cash' }).expect(409)
})
```
- `bill-17` and `bill-18` are expected to FAIL before Task 9.2 (both currently return 409, per the bug). `bill-19` is expected to PASS immediately (duplicates `bill-06`'s scope; kept alongside 17/18 purely so AC-05's four-case table maps to four colocated, individually named tests — not a new behavior).
- Run `npx jest __tests__/invoice.test.ts -t "bill-1[789]"` — confirm bill-17 and bill-18 fail with `409` where `404` is expected, bill-19 passes. This is the RED checkpoint — do not proceed to 9.2 until confirmed.

**Task 9.2 (GREEN)** — Fix `claimInvoicePaid` in `src/backend/models/invoice.repository.ts:188-204`
```ts
export async function claimInvoicePaid(
  tx: Prisma.TransactionClient, tenantId: number, branchId: number | null | undefined, id: number, paymentMethod: string,
) {
  const claimed = await tx.invoice.updateMany({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      paymentStatus: { not: 'paid' },
    },
    data: { paymentStatus: 'paid', paymentMethod, paidAt: new Date() },
  })
  if (claimed.count !== 1) {
    const existsInScope = await tx.invoice.findFirst({
      where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
      select: { id: true },
    })
    if (!existsInScope) throw new NotFoundError('Invoice')
    throw new ConflictError('Invoice is already paid', 'INVOICE_ALREADY_PAID')
  }
  const invoice = await tx.invoice.findFirst({ where: { id, tenantId }, include: { items: true, pet: { include: { owner: true } } } })
  if (!invoice) throw new NotFoundError('Invoice')
  return invoice
}
```
- **Binding constraints (verify against the diff before running tests):**
  1. The atomic `updateMany` (predicate + `data`) is byte-for-byte unchanged — the added code is only inside the `if (claimed.count !== 1)` block, never before it (grill §2 constraint 2 — no pre-check, TOCTOU race stays closed).
  2. The new `findFirst` uses the **identical** scope as the claim: `{ id, tenantId, ...(branchId != null ? { branchId } : {}) }` — no wider (grill §2 constraint 1).
  3. `409` is thrown only when `existsInScope` is truthy, i.e. only for an invoice inside the caller's own tenant+branch scope (grill §2 constraint 3).
  4. This is the **only** file and **only** function changed under `src/backend/services|controllers|models|routes` (AC-04′).

**Task 9.3 (VERIFY)** — Run `npx jest __tests__/invoice.test.ts` — expect all tests green, specifically the full regression set named in AC-05:
- `bill-05: record payment marks invoice paid` → 200
- `bill-06: double payment rejected (409)` → 409
- `bill-08: tenant B cannot read tenant A invoice → 404` → 404 (unchanged, confirms no regression)
- `bill-09: tenant B cannot pay tenant A invoice → 404` → 404 (was 409, now fixed)
- `bill-17: same-tenant, wrong-branch pay attempt → 404` → 404 (was 409, now fixed)
- `bill-18: same-tenant, nonexistent invoice id → 404` → 404 (was 409, now fixed)
- `bill-19: same-tenant, same-branch, already-paid → 409` → 409 (unchanged)
- Confirm response body for the 409 case still exposes no invoice data (static message + code only) — no field additions to the `ConflictError` payload.

**Task 9.4** — `@db-agent` review of the diff in `models/invoice.repository.ts` (repository + money path, per AC-04′) — record sign-off in the PR description, not a new doc.

**Task 9.5** — Commit the production change **separately** from every test change, message references `BILL-DEF-01` / `SCOPE-AMEND-01` (AC-04′ commit-hygiene requirement).

### Group 10 — Orchestration rule (R-2, human ruling — CLAUDE.md edit permitted here)

**Task 10.1** — Edit `D:\Development\Anemal\CLAUDE.md`, `## Tracking & Documentation` section (or a new short subsection immediately after the Step 8 pipeline row) to add:
```
- **Red-suite ship gate (added 2026-08-20):** a red backend suite on `main` blocks the next
  merge. `/anemal-finish-branch` (Step 8) must refuse to open a PR — or must halt before
  merge — if `main`'s current backend suite is red, independent of the feature branch's own
  test gate. This closes the gap that let 28 backend tests sit red on `main` for ~2 weeks
  unnoticed after PR #53 (2026-08-06 to 2026-08-20). See `anemal-finish-branch` SKILL.md §1.5
  for the mechanic.
```
- This is a genuine orchestration-rule change (explicitly permitted per the grill's R-2 ruling and CLAUDE.md's own "Touch CLAUDE.md itself only when an orchestration rule changes" clause) — do not add anything else to CLAUDE.md in this branch.

**Task 10.2** — Edit `.claude/skills/anemal-finish-branch/SKILL.md`, insert a new step **1.5** after the existing `## 1. Preflight` numbered list (after item 4, before `## 2. Test gate`):
```
5. **Check `main`'s current backend suite status** — `git fetch origin`, then run the backend
   test suite against `origin/main` (or check the most recent CI result on `main` if available).
   If `main` is currently red, STOP: report which suite/tests are failing and that this is a
   pre-existing break, not introduced by the current branch. Do not create a PR until `main`
   is green — either this branch is retargeted to fix `main` first, or a separate fix branch
   must land first. (Rule added 2026-08-20 after a 2-week undetected red-`main` incident —
   see CLAUDE.md "Red-suite ship gate".)
```
- Keep the existing §2 "Test gate" (this branch's own suite) unchanged — this is an additional, earlier check, not a replacement.

**Task 10.3** — `git diff` both files, confirm only the additive text above was inserted, no unrelated edits.

### Group 11 — Full suite verification

**Task 11.1** — Run the full backend suite: `npm test` (or the exact script name in `package.json`).
- **Expected: 1289 total, 0 failed** (1293 − 7 DELETE + 3 new invoice tests; see §1 arithmetic).
- If the actual total differs, do not adjust the test files to match — re-derive the arithmetic against the dispositions actually applied and report the discrepancy; a mismatch means either a disposition was missed or an extra test was added/removed outside this plan.

**Task 11.2** — Run `npx tsc --noEmit` for the whole backend — expect 0 errors (catches any straggling `noUnusedLocals` violation from Groups 3, 6).

**Task 11.3** — `git diff main --stat` — confirm the file set matches AC-04′ exactly:
- Exactly one file under `src/backend/models|services|controllers|routes`: `src/backend/models/invoice.repository.ts`.
- Everything else confined to `src/backend/tests/**`, `src/backend/__tests__/**`, `docs/**`, `CLAUDE.md`, `.claude/skills/anemal-finish-branch/SKILL.md`.

**Task 11.4** — `git grep -n "union of all role\|multi-role union\|Multi Role User\|multi-role"` across `src/backend/tests` and `src/backend/__tests__` — expect zero matches (AC-02).

---

## 2. AC → test map (every AC named against a test)

| AC | Test(s) |
|---|---|
| AC-01 (amended, TEST-PARITY-01) — suite green, exact counts | Task 11.1 (`npm test` → 1289/1289, 0 failed) |
| AC-02 (TEST-PARITY-02) — no multi-role-union assertions remain | Task 11.4 (`git grep`); Task 2.1 (rewritten union test asserts single-role only) |
| AC-03 (TEST-PARITY-03) — deleted coverage documented | Task 0.1 (deleted-coverage doc); PR description cites it |
| AC-04′ (TEST-PARITY-04′) — production edit confined to one file/function, atomic-claim unchanged, same-scope read, own-commit, db-agent review, no test's expected code changed to match old behavior | Task 9.2 (the diff itself); Task 9.4 (db-agent review); Task 9.5 (separate commit); Task 11.3 (`git diff --stat`); Task 9.1/9.3 (bill-09 still asserts 404, never edited to 409) |
| AC-05 (TEST-PARITY-05) — payment endpoint distinguishes not-found from already-paid, all 4 cases | `bill-09` (Task 9.1/9.3, wrong tenant → 404), `bill-17` (wrong branch same tenant → 404), `bill-18` (nonexistent id → 404), `bill-19`/`bill-06` (already paid own scope → 409), `bill-05` (unpaid own scope → 200), `bill-08` (cross-tenant read → 404, regression guard) |
| C-1 — authService misattribution corrected, `updateMany` mock added | Task 1.1, Task 1.2 |
| C-2 — 28-failure reconciliation | §1 arithmetic table above, sourced from BA §1/C-2 |
| C-3 — `does not classify a single-role user at all` kept verbatim, fixtures preserved | Task 3.5 (explicit do-not-touch instruction) |
| C-4 — `collapse-multi-role.ts` script untouched | No task in this plan touches `prisma/scripts/collapse-multi-role.ts` — confirmed by Task 11.3's file-set check (only `invoice.repository.ts` under production paths) |
| C-5 — role-test fixtures share tenant + role identity | Task 4.1, Task 5.1 (both explicit same-tenant, same-role-in-both-places instructions) |
| C-6 — PM doc corrected on PR attribution | Already corrected in the BA sign-off and grill record; no code task needed |
| C-7 — ADR-0019 doc unedited | No task in this plan touches `docs/adr/0019-*.md` |
| R-2 — red-suite ship gate | Task 10.1 (CLAUDE.md), Task 10.2 (finish-branch skill) |

---

## 3. Ponytail pre-check (informational, for Step 5)

- Files touched: 1 production file (`invoice.repository.ts`) + 9 test files + 1 CLAUDE.md + 1 skill file + 1 new doc = 13 files. Under the 15-file cap.
- LOC: production diff ~8 lines; test diffs are mechanical mock-shape edits + 3 new small test cases + deletions (net negative LOC in tests). Comfortably under 500.
- 0 new endpoints, 0 new dependencies, 1 subsystem (billing) touched in production code, plus test-only edits across RBAC/permission test files (not new subsystems, existing ones).
- 0 new hooks/mutations/endpoints — `claimInvoicePaid` is an existing internal function, not a new API surface.

---

## 4. Handoff

Next: **Step 5, `@ponytail-agent`** — review this plan against the 7-point simplicity gate. On APPROVE, proceed to **Step 6, `/execute-plan`** with `@dev-agent` (Groups 1-2, 8-9 — test + prod code) and `@db-agent` (Task 9.4, invoice repository review) in sequence per file group, followed by **Step 7 `@qa-agent`** (`/code-review` + `/audit` on the RBAC-adjacent and money-path changes), then **Step 8 `/anemal-finish-branch`**.
