# BA Sign-off — Backend Test Suite Repair Post-ADR-0019

**Branch:** `fix/backend-tests-post-adr-0019`
**Pipeline step:** Step 3 (`@ba-agent`) — requirement validation, authorization design, gap analysis
**Reviews:** `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-pm-tasks.md` (`@pm-agent`, Step 1+2)
**Author:** `@ba-agent`
**Date:** 2026-08-20

---

## Verdict

# APPROVED WITH CONDITIONS

The scope is correct, the objective is sound, and 26 of 28 dispositions survive review. Three
things must change before `/write-plan`:

1. **AC-04 is amended** to permit exactly one narrowly-bounded production change
   (`claimInvoicePaid`). Without the amendment, this branch cannot meet its own stated goal
   without bending a tenant-isolation test — the single outcome PM's own risk register names as
   the worst case.
2. **Two dispositions change** (one DELETE → REWRITE, one DELETE → KEEP-AS-IS). Both were
   coverage that ADR-0019 did *not* retire.
3. **The `collapse-multi-role.ts` script is KEPT**, not archived or deleted, on a ground PM did
   not have: migration `20260805090000_enforce_one_role_per_user` names the script by literal
   file path inside a runtime `RAISE EXCEPTION` message. Deleting it breaks a live remediation
   path, not a historical one.

Every condition is listed in §7 and is testable. Unless otherwise stated, PM's analysis is
accepted as written.

---

## 1. Corrections to the PM document

Ordered by consequence. All were verified against the repo, not inferred.

| # | PM says | Correct | Evidence |
|---|---|---|---|
| C-1 | `authService.test.ts` breaks because of **PR #54** (`56107e3`) | **PR #53** (`f8b92e2`, HI-02) | `git show --stat 56107e3` touches 17 files: `docs/`, `src/frontend/**` — **zero** backend files. `models/auth.repository.ts` carries the `// HI-02: scoped updateMany` comment introduced by `f8b92e2`. `touchLastLogin` has been *called* since `5d9ad3b` (Phase 4); only the `update` → `updateMany` swap is new. |
| C-2 | 28 failures, "28–30" with the invoice spread | **Exactly 28**, reconciled per-file | Live runs, this session. Per-file: permission.service **8**, authService **3**, clinicUsage **3**, roleManagement **3**, roleEditor-t5f01 **1**, pet-medical-degradation **3**, appointmentDoctors **1**, collapse-multi-role **5**, invoice **1**. Sum = 28. |
| C-3 | `collapse-multi-role.test.ts` — **6 tests, all DELETE** | **6 tests, 5 failing, 1 passing — DELETE 5, KEEP 1** | `classifyMultiRoleUsers › does not classify a single-role user at all` (line 100) seeds a **single** `userRole.create`. It is legal under `@@unique([tenantId, userId])`, it is green today, and it is a still-valid requirement. See §4. |
| C-4 | `permission.service.test.ts` header: "9 tests" | **8 tests** | The table body already lists 8; the header is a typo. Live run confirms 8 failures. |
| C-5 | `invoice.test.ts` — bill-08 and bill-09 both **INVESTIGATE** | **bill-08 PASSES; bill-09 is a confirmed production defect** | `npx jest --testPathPattern=invoice.test --runInBand` → 19 passed, 1 failed; the only failure is bill-09 (`expected 404, got 409`). Not a fixture cascade. See §2. |
| C-6 | (not noted) | **`prisma/schema.prisma:225` carries a stale comment** — "effective perms come from userRoles **union**" — contradicting ADR-0019 | Documentation defect on a production file. **Not** in this branch (AC-04 discipline). Backlogged as BACKLOG-3, §8. |

C-1 matters operationally: Step 6 must be told to add `updateMany` to the `user` mock in
`tests/unit/authService.test.ts:9` and stop looking for role logic. There is none on that path.

---

## 2. Ruling 1 — bill-09 security assessment

**I verify the assessment. This is an API-contract defect, not a security defect — with one
qualification the assessment missed, which raises the priority.**

### Finding

`models/invoice.repository.ts:188-204`, `claimInvoicePaid`, collapses three distinct outcomes of
`claimed.count !== 1` into a single `409 INVOICE_ALREADY_PAID`:

| Case | Correct response | Actual |
|---|---|---|
| (a) invoice in my scope, already paid | 409 `INVOICE_ALREADY_PAID` | 409 ✅ |
| (b) invoice belongs to another tenant | 404 | **409** ❌ |
| (c) invoice does not exist at all | 404 | **409** ❌ |
| (d) invoice in my tenant, another branch | 404 (matches `getInvoice`) | **409** ❌ |

### Isolation — INTACT

- The `updateMany` predicate is `{ id, tenantId, ...(branchId != null ? { branchId } : {}), paymentStatus: { not: 'paid' } }`. Tenant B's request matches **0 rows** and writes nothing.
- The throw precedes the `findFirst`, `createPaymentHistory`, and `earnOnPayment` calls, and the whole thing runs inside `prisma.$transaction` (`services/invoice.service.ts:171`). No cross-tenant read, no cross-tenant write, no partial state.
- Live run confirms behaviourally: bill-08 (`GET`) correctly returns 404 for tenant B, and the server log for tenant B's `PUT` shows only a static `INVOICE_ALREADY_PAID` warn with the **requester's** tenantId — no tenant-A data crosses the boundary.
- Route guard is intact and deny-by-default: `routes/invoice.routes.ts:17` → `requirePlane('clinic')` → `requirePermission('billing.payment')`. Nothing here weakens the plane or permission boundary.

### Existence oracle — NONE

Cases (b), (c), and (d) are indistinguishable: all produce `count = 0` → the same static
`ConflictError('Invoice is already paid', 'INVOICE_ALREADY_PAID')`, with no invoice data, no
timing branch, and no pre-check upstream (`validate(paymentSchema)` inspects the request body
only). A caller cannot learn whether an id exists in another tenant. The `PUT` path is uniformly
uninformative, exactly as it must be.

### Qualification the assessment missed — audit/detection blind spot

Every cross-tenant probe against the payment endpoint is currently logged as
`INVOICE_ALREADY_PAID`, i.e. **indistinguishable from a benign double-click** on a clinic tablet.
An actual cross-tenant invoice-id enumeration attempt is therefore invisible to log review and to
any alerting built on it. That is not a vulnerability — nothing leaks — but it is a real
detection gap on a money path, and it is the reason I set severity higher than the assessment did.

### Ruling

```
ID: BILL-DEF-01           Objective: payment errors must tell a clinic the truth, and
                          cross-tenant probes must be distinguishable in logs.
AS-IS: claimInvoicePaid returns 409 INVOICE_ALREADY_PAID for not-found, wrong-tenant, and
       wrong-branch alike; only the truly-already-paid case is correctly reported.
Gap/Risk: (1) API-contract defect — the payment path contradicts the read path, which 404s
       correctly (getInvoice, and the promptpay-qr endpoint, both verified 404 in this session).
       (2) Product defect — a POS/tablet shows "Invoice is already paid" for a mistyped or
       deleted invoice number, on a money path. (3) Audit blind spot — cross-tenant probes are
       unloggable-as-such.
TO-BE: not-found-in-scope → 404; found-in-scope → 409 (unchanged).
Severity: MODERATE. NOT a security defect: no cross-tenant read, no cross-tenant write, no
       existence oracle, no PII exposure, no privilege escalation, no plane crossing.
Priority: Must     Owner-agent: dev (+ db review, money/repository path)
Acceptance: see AC-05, §7.
```

**The test is correct; the production code is wrong. `bill-09` must not be edited.** This is the
one item in the batch where "make the test match current behaviour" would destroy the exact
assertion the test exists to make.

---

## 3. Ruling 2 — scope: fix bill-09 in this branch (option (a)), AC-04 amended

**Chosen: (a) — fix it here, under a narrow, enumerated amendment to AC-04.**

### Why not (b) — leave red and escalate

(b) defeats the branch's only stated objective ("backend suite green") and leaves the branch
shipping a knowingly-red main. That is precisely the condition that let 28 failures accumulate
undetected for two weeks — a suite that is expected to be red teaches everyone to ignore it. The
proximate cause of this whole clean-up is a normalised red suite; ending the clean-up by
normalising a red suite again is self-defeating.

Quarantining (`.skip`/`todo`) is worse and I reject it explicitly: a skipped tenant-isolation
test is a permanently-forgotten tenant-isolation test, and it produces a *green* suite that
silently no longer checks cross-tenant payment. If someone insists on (b), the only acceptable
mechanism would be `.failing()` (fails when it starts passing) plus a dated tracking issue — but
that is more machinery than the four-line fix it defers, so it is moot.

### Why not (c) — separate branch merged first

Considered and rejected as over-process: it doubles pipeline overhead (a full Step 1–8 for a
four-line change), creates a merge-ordering dependency, and delivers no additional review that
option (a) does not already get.

### Why (a) does not skip a gate

This branch is *at* Step 3 right now. Step 3.5 (`/grill-with-docs`), Step 4 (`/write-plan`),
Step 5 (`@ponytail-agent`), and Step 7 (`@qa-agent` + `/audit`) are all still ahead of it. A
production change folded in here receives the **full** pipeline treatment — identical to what a
separate branch would get, minus the duplication. No hard rule in `CLAUDE.md` is bypassed.

### The amendment

AC-04's intent is *"do not bend production code to make a wrong test pass."* Its literal
wording — "no production source file is modified" — over-reaches, because here the test is right
and the code is wrong. Amended text in §7 (AC-04′) keeps the intent and enumerates the single
permitted exception. Everything else stays locked.

### Bounded design requirement (NOT implementation — `@dev-agent` writes the code)

| Constraint | Requirement |
|---|---|
| Files | Exactly one production file: `src/backend/models/invoice.repository.ts`, function `claimInvoicePaid` only. No new file, no new endpoint, no new dependency, no controller/route/service change. |
| Atomicity (HI-08) | The claim itself — `updateMany` + `paymentStatus: { not: 'paid' }` + `claimed.count !== 1` — must be **byte-for-byte unchanged in semantics**. The new read is added *only* on the failure path and *only* inside the same `tx`. The double-payment race guarantee is not up for renegotiation. |
| Scope of the new read | **Identical** to the claim's scope: `tenantId`, plus `branchId` when `branchId != null`. Using a wider scope would re-introduce the very cross-tenant/cross-branch discrimination this fix must not create. |
| Semantics | exists-in-scope → `ConflictError('Invoice is already paid', 'INVOICE_ALREADY_PAID')` (unchanged, 409). not-exists-in-scope → `NotFoundError('Invoice')` (404). "Found but unpaid" (only reachable if a concurrent writer intervened) stays **409** — never 200, since nothing was written. |
| Commit hygiene | Its own commit, separate from every test change, referencing `BILL-DEF-01`. The PR description states it as a BA-authorised scope amendment (`SCOPE-AMEND-01`) so a reviewer sees it deliberately, not buried in a test diff. |
| Review | `@db-agent` reviews (repository + money path); `@qa-agent` `/audit` covers it at Step 7. |

**Regression guard — must all be green after the fix:** `bill-05` (pay → 200), `bill-06`
(double-pay → 409), `bill-08` (cross-tenant read → 404), `bill-09` (cross-tenant pay → 404), plus
one new case: **pay a nonexistent invoice id within your own tenant → 404** (§7, AC-05). Without
that new case, nothing in the suite distinguishes the fix from a fix that merely special-cases
tenant mismatch.

---

## 4. Ruling 3 — disposition validation

**Two dispositions change. The other 26 are confirmed.** Both changes are DELETEs that were
protecting still-valid requirements, which is exactly the failure mode the review was for.

### D-1 (CHANGED) — `permission.service.test.ts › resolvePermissions › returns union of all role permissions as a Set`: **DELETE → REWRITE**

PM's reasoning is half right: the *union across two roles* (`perms.size === 3`) is retired by
ADR-0019 and must go. But this is also the **only positive happy-path assertion in the file** —
the only test that asserts `resolvePermissions` actually returns the assigned role's permission
codes at all.

Cross-checking PM's seven REWRITEs: tenant-scoped query shape · cache hit · cache invalidation ·
empty Set when no role · per-key cache isolation · `computePermSetVersion` × 2. **None** asserts
the returned Set's *contents* on the happy path. Deleting this test would leave permission
resolution — the backbone of every `requirePermission` guard in the system — with its core
positive behaviour unasserted. That is an unacceptable authorization-coverage regression, and it
is not one ADR-0019 asked for.

**Rewrite as:** retitle to `returns the assigned role's permission codes as a Set`; mock
`findUnique` → one `{ role: { permVersion, permissions: [...] } }` object; assert membership and
`size`. Drop the second role and the duplicate-code fixture entirely (`RolePermission` is
`@@id([roleId, permissionCode])` at `prisma/schema.prisma:925`, so intra-role duplicates are
impossible — there is genuinely nothing left to dedupe).

### D-2 (CHANGED) — `collapse-multi-role.test.ts › classifyMultiRoleUsers › does not classify a single-role user at all`: **DELETE → KEEP AS-IS**

PM marked all four `classifyMultiRoleUsers` tests DELETE on the ground that their fixtures are
physically impossible. Three of four are. **The fourth is not, and it passes today** — it seeds a
single `userRole.create` (line ~104), which is perfectly legal under `@@unique([tenantId, userId])`.

It also happens to be the highest-value test in the file under the new model: it asserts the
script is a **correct no-op** under the single-role invariant. Keep it verbatim. See §5 for why
this single surviving test resolves the "untested migration script" problem for free.

### Confirmed as written

| Test | Disposition | BA confirmation |
|---|---|---|
| `permission.service` × 7 (query shape, cache ×3, empty, `computePermSetVersion` ×2) | REWRITE | Confirmed. Mechanical `findMany` → `findUnique` mock-shape change; intent preserved. Retitling `computePermSetVersion › returns max permVersion across all user roles` is mandatory, not cosmetic — a test title asserting a retired capability is a spec artefact, and `services/permission.service.ts:158` already documents the single-role semantics. |
| `collapse-multi-role` × 5 (3 classify + 2 collapse) | DELETE | Confirmed. Each seeds ≥2 `userRole` rows via `createMany`. Not rewritable: the precondition state cannot be inserted. **Rejected alternative:** dropping the unique index inside `beforeAll` to seed the fixture. It mutates shared schema mid-suite (unsafe under parallel Jest workers), and a crashed test leaves the DB's core RBAC invariant silently off for every later run. Not worth it for dead-code coverage. |
| `pet-medical-degradation › multi-role union … (CR-01)` | DELETE | Confirmed — directly asserts the retired CR-01 union. See §6 for why no authorization coverage is lost. |
| `appointmentDoctors › includes a multi-role user if any one role is Doctor-derived` | DELETE | Confirmed. The still-valid TO-BE mechanism (clone-with-lineage) is covered by the sibling at line 143 (`sourceRoleId` clone), and `findDoctorsForBranch`'s `userRoles: { some: { tenantId, … } }` join stays covered by lines 97/143. See §6. |
| `authService` × 3 | FIX-FIXTURE | Confirmed — but re-attributed per C-1. Add `updateMany: jest.fn().mockResolvedValue({ count: 1 })` to the `user` mock. No assertion changes. |
| `roleManagement` × 3, `roleEditor-t5f01` × 1 | FIX-FIXTURE | Confirmed, with mandatory conditions — see §6. |
| `clinicUsage` × 3 | FIX-FIXTURE | Confirmed — see §6 for an observation about what these tests do *not* prove. |

### Revised totals — reconciles to exactly 28

| Disposition | PM | BA | Delta |
|---|---|---|---|
| DELETE | 9 | **7** | −2 (D-1 → REWRITE, D-2 → KEEP) |
| REWRITE | 7 | **8** | +1 (D-1) |
| FIX-FIXTURE | 12 | **12** | — |
| PRODUCTION FIX | 0 | **1** | +1 (bill-09 / `BILL-DEF-01`) |
| INVESTIGATE | 0–2 | **0** | resolved |
| **Total** | 28–30 | **28** | matches the live run exactly |

Coverage moves from N to **N−7**, not N−9.

---

## 5. Ruling 4 — `prisma/scripts/collapse-multi-role.ts`: **KEEP**

**Ruling: KEEP the script in place, unmodified. Do not delete. Do not archive.**

PM framed this as "its job is done, is retention needed for DR or audit?" That framing is
incomplete. The decisive fact is that the script is **still referenced at runtime by a shipped
migration**:

`prisma/migrations/20260805090000_enforce_one_role_per_user/migration.sql` fails closed on
ambiguous data and raises:

> `'Migration blocked: % user(s) still hold more than one user_roles row after auto-resolution. Run prisma/scripts/collapse-multi-role.ts …'`

The migration deliberately **declines to decide business identity for a human** (confirmed by
`@ponytail-agent`'s 2026-08-05 review §3.1) and delegates the hard case *back* to this script.
That is a live, forward-looking operational dependency. Deleting the script turns a documented
remediation path into a dead end at the worst possible moment — mid-`prisma migrate deploy`,
against a restored database, with `prisma` blocking every subsequent migration until resolved.

The DR scenario is concrete, not hypothetical: restore a snapshot taken before 2026-08-05 →
replay the migration chain → the guard raises → the operator needs this file. Anemal is
shared-schema multi-tenant, so this applies to any environment rebuilt from an older backup,
including a fresh staging or a new developer machine seeded from prod. Retention cost is 5 KB of
dead code; deletion cost is a broken DR runbook. Not a close call.

### "Is an untested migration script acceptable?"

Under PM's plan it would have been zero-tested — and I would have required a replacement guard.
It doesn't come to that: **D-2 keeps `does not classify a single-role user at all`**, which
already provides exactly the guard needed:

- it **imports** the script — a deletion or compile break fails the suite immediately;
- it **executes `classifyMultiRoleUsers` against the live schema** — catching the real bit-rot
  risk for a dormant script (Prisma-client or schema drift renaming `userRole`, `groupBy`, or the
  `role` relation, which would otherwise surface for the first time during a disaster);
- it **asserts the correct no-op** under the single-role invariant.

That is proportionate coverage for a human-operated, DBA-supervised, one-shot recovery tool whose
output is reviewed before anything proceeds. **Condition:** the test must survive, and if its
enclosing `describe` is trimmed, its `beforeAll`/`afterAll` must be preserved (§7, C-3).

### Documented, accepted deviation

`classifyMultiRoleUsers` queries `prisma.userRole.findMany({ where: { userId } })` and
`groupBy({ by: ['userId'] })` **without `tenantId`** — a deviation from `CLAUDE.md`'s absolute
multi-tenancy rule. It is **not exploitable**: `User.id` is a global primary key and a user
belongs to exactly one tenant, so the grouping cannot span tenants; the same "stricter, never
false-passes" property was already accepted for the migration's own guard. I am recording it as
an **accepted deviation** rather than requiring a fix, because changing a dormant DR script inside
a test-repair branch would be an untested production edit — precisely what AC-04 exists to
prevent. Logged as BACKLOG-1 (§8).

---

## 6. Ruling 5 — tenant-isolation & permission-resolution safety review

Reviewed every DELETE and FIX-FIXTURE for the assertion it was actually protecting. Two require
mandatory conditions; one carries a pre-existing weakness worth recording.

### `roleManagement.test.ts` (3) and `roleEditor-t5f01.test.ts` (1) — **conditions apply**

Root fixture in both: a *second* `userRole` row is added to an already-roled admin
(`roleManagement.test.ts:358`, `roleEditor-t5f01.test.ts:258`). PM's fix — assign the in-use role
to a new dedicated user — is correct. Three conditions, because the naive version of that fix can
silently weaken the test:

1. **⚠ The test cannot self-detect a wrong-tenant fixture.** `services/role.service.ts:184` calls
   `roleRepo.countRoleUsage(roleId)` — scoped by `roleId` only, **not** by `tenantId` (it relies on
   the preceding `role.tenantId !== tenantId` ownership check at line 180). So if the replacement
   user were created in the *wrong* tenant, the 409 would **still** fire and the test would still
   pass, while the fixture quietly asserted nothing about tenant scoping. The fixture user **must**
   be created in the same tenant as the role (`tid` / `tidA`). This is the "fixture change silently
   drops a tenant-scoping assertion" failure mode, and it is live here.
2. **Single-role shape must be internally consistent.** `User.roleId` is `Int` (NOT NULL,
   `prisma/schema.prisma:213`). The new user must be created with `roleId: <inUseRoleId>` **and**
   a matching `userRole` row for the same role. Creating the user with one role in `users.roleId`
   and a different one in `user_roles` recreates the exact two-truth drift ADR-0019 exists to kill —
   inside the test suite meant to enforce ADR-0019.
3. **Cleanup must delete the new user.** `UserRole.role` is `onDelete: Restrict`
   (`prisma/schema.prisma:941`); existing `afterAll`s delete `userRole` rows before the role, which
   still works, but a leaked user row pollutes later suites. Extend the existing `afterAll`.

Assertions preserved: the 409-when-in-use business rule is intact (count is still exactly 1); the
403-system-role guard and the 200-delete-unused test are pure collateral and depend on nothing in
this fixture; `roleEditor-t5f01`'s AC-6 tenant-isolation tests are **green today and must stay
untouched**. No exact-count assertions exist in either file that a new fixture user would perturb
(`roleEditor-t5f01.test.ts:137` uses `≥1` and counts `clinic_admin`, which a cloned role does not
affect).

### `pet-medical-degradation.test.ts` (1 DELETE + 2 collateral) — **safe**

The deleted test asserts a **grant** (union produces `emr.view`). The two survivors carry the
security-relevant assertions and both remain: the *deny* case — "custom role without `emr.view`
gets neither field, but still sees the pet" — is the deny-by-default proof, and it is untouched;
the single-role grant case is covered by the doctor test. Removing a retired *grant* path cannot
weaken deny-by-default. **Condition:** delete `unionUser`, its two `userRole.create` calls, its
`userBranch`, and `unionToken` together — `tsconfig.json` sets `noUnusedLocals: true`, so a
half-removed fixture will not compile.

### `appointmentDoctors.test.ts` (1 DELETE) — **safe**

`findDoctorsForBranch` (`models/appointment.repository.ts:30-54`) still matches via
`userRoles: { some: { tenantId, role: { OR: [{ key: 'doctor' }, { sourceRoleId }] } } }`. The
deleted test only exercised `some` matching a *second* row. Coverage that survives: line 97
(`some` matches), line 143 (clone lineage via `sourceRoleId` — the actual TO-BE mechanism), line
107 (non-doctor excluded), line 131 (deactivated excluded), and critically **line 117 — "never
returns a doctor from another tenant"**, which is the tenant-scoping assertion inside the `some`
clause and is green today. No isolation coverage is lost.

### `clinicUsage.test.ts` (3 FIX-FIXTURE) — **safe, with a recorded observation**

The mock is a hand-rolled fake `PrismaClient` that ignores `where` entirely, so these tests never
asserted tenant scoping — nothing isolation-related can be dropped. Changing `findMany` →
`findUnique` is purely mechanical.

**Observation (pre-existing, not introduced here, not a blocker):** the mock grants
`clinic.profile.view` unconditionally, to all three tokens. `routes/clinic.routes.ts:12` guards
`GET /clinic/usage` with `requirePermission('clinic.profile.view')`. So "returns 200 for
doctor/staff/admin" proves the **route wiring** works when the permission is present — it does
**not** prove the real Doctor or Staff role actually holds `clinic.profile.view`. If the matrix
changed, these tests would stay green while production denied. Recorded as BACKLOG-2 (§8) for
`@qa-agent`; fixing it is out of scope here.

### `authService.test.ts` (3 FIX-FIXTURE) — **safe**

Adding `updateMany` to the mock touches no authorization assertion. The three tests continue to
assert admin-vs-staff branch scoping and the zero-branch 403 — the last of which currently throws
a `TypeError` *before* reaching the real 403 path, meaning the fix **restores** an access-control
assertion rather than weakening one.

### `permission.service.test.ts` (8) — **safe, and strengthened**

All eight mocks move to `findUnique`. Per D-1, the happy-path contents assertion is preserved
rather than deleted. The `queries with correct tenantId and userId` REWRITE must assert the
composite key `findUnique({ where: { tenantId_userId: { tenantId, userId } } })` — this is the
tenant-scoping assertion for the entire permission-resolution layer and is the single most
important test in this batch. It must not degrade into asserting only that `findUnique` was called.

---

## 7. Amended acceptance criteria

AC-01, AC-02, AC-03 stand as PM wrote them, with the numeric corrections below. AC-04 is replaced
by AC-04′. AC-05 is new.

```
Task ID: TEST-PARITY-01 (amended)   Actor/role: n/a
Description: Backend Jest suite is fully green on `fix/backend-tests-post-adr-0019`.
Acceptance Criteria:
  - [ ] `npm test` (backend) reports 0 failed.
  - [ ] Final total = starting total − 7 (not −9): 7 DELETE, 8 REWRITE, 12 FIX-FIXTURE,
        1 production fix.
  - [ ] The 28 failures reconcile per-file exactly as in §1/C-2 of this sign-off.
Dependencies: local Postgres up (verified up this session).

Task ID: TEST-PARITY-04′ (REPLACES AC-04)   Actor/role: n/a
Description: Production code is modified only where a correct test proved it wrong, and only
             within the boundary BA authorised.
Acceptance Criteria:
  - [ ] `git diff main --stat` shows exactly ONE production file changed:
        `src/backend/models/invoice.repository.ts`. Everything else is confined to
        `src/backend/tests/**`, `src/backend/__tests__/**`, and docs.
  - [ ] Within that file, only `claimInvoicePaid` changed. Zero changes under
        `services/`, `controllers/`, `routes/`, `prisma/schema.prisma`, or `prisma/migrations/`.
  - [ ] The atomic-claim semantics (`updateMany` + `paymentStatus: { not: 'paid' }` +
        `count !== 1`) are unchanged; the added read is on the failure path, inside the same `tx`,
        and uses the SAME scope as the claim (tenantId + branchId when present).
  - [ ] The change is its own commit, referencing BILL-DEF-01 / SCOPE-AMEND-01, and is called
        out in the PR description as a BA-authorised amendment.
  - [ ] `@db-agent` has reviewed it (repository + money path).
  - [ ] NO test's expected status code was changed to match current behaviour. In particular
        `bill-09` still asserts 404.
  - [ ] Any OTHER production change surfaced during Step 6 is escalated as a new task through
        Step 1–8 — this amendment authorises exactly one file and one function, nothing more.

Task ID: TEST-PARITY-05 (NEW)   Actor/role: clinic user holding `billing.payment`
Description: The payment endpoint distinguishes not-found from already-paid.
Acceptance Criteria:
  - [ ] bill-09 (tenant B pays tenant A's invoice)              → 404, green.
  - [ ] bill-08 (tenant B reads tenant A's invoice)              → 404, still green.
  - [ ] bill-06 (same tenant pays an already-paid invoice)       → 409 INVOICE_ALREADY_PAID.
  - [ ] bill-05 (same tenant pays an unpaid invoice)             → 200.
  - [ ] NEW: same tenant pays a NONEXISTENT invoice id           → 404.
        (Without this case nothing distinguishes the real fix from one that merely
         special-cases tenant mismatch.)
  - [ ] The 409 response body still exposes no invoice data — static message + code only.
Permission(s): billing.payment (route guard unchanged)
Dependencies: TEST-PARITY-01.
```

### Conditions of approval (all must hold before `/write-plan` proceeds)

| # | Condition |
|---|---|
| C-1 | AC-04 is replaced by AC-04′; AC-05 added; AC-01 counts corrected to −7. |
| C-2 | `permission.service.test.ts › returns union of all role permissions as a Set` is **REWRITTEN, not deleted** (D-1). |
| C-3 | `collapse-multi-role.test.ts › does not classify a single-role user at all` is **KEPT verbatim**, with its `beforeAll`/`afterAll` preserved (D-2). Unused fixture vars from the deleted siblings (`systemStaffRoleId`, `customRoleBId`, …) must be removed too — `noUnusedLocals: true`. |
| C-4 | `prisma/scripts/collapse-multi-role.ts` is **not touched** — not deleted, not archived, not "cleaned up" (§5). |
| C-5 | Role-test fixture users are created **in the same tenant as the role**, with `users.roleId` and the `user_roles` row naming the **same** role, and cleaned up in `afterAll` (§6). |
| C-6 | PM doc §0 is corrected: `authService.test.ts` is PR **#53** (`f8b92e2`, HI-02), not PR #54. |
| C-7 | `docs/adr/0019-…md` remains unedited (PM's AC-03 — upheld). |

---

## 8. Backlog raised by this review (NOT this branch)

| ID | Item | Owner | Priority |
|---|---|---|---|
| BACKLOG-1 | `collapse-multi-role.ts` queries `userRole` without `tenantId` (`findMany`, `groupBy`). Not exploitable (global `User.id`, one tenant per user) but deviates from the absolute multi-tenancy rule. Recorded as an accepted deviation; revisit only if the script is ever modified. | `@db-agent` | Could |
| BACKLOG-2 | `clinicUsage.test.ts`'s mock grants `clinic.profile.view` to every token, so the "200 for doctor/staff/admin" tests prove route wiring, not the permission matrix. Consider an integration test against real seeded roles. | `@qa-agent` | Should |
| BACKLOG-3 | `prisma/schema.prisma:225` comment still says "effective perms come from userRoles **union**" — contradicts ADR-0019. Documentation defect on a production file. | `@ba-agent` / `@db-agent` | Should |
| BACKLOG-4 | `services/role.service.ts:184` `countRoleUsage(roleId)` and `findRoleById(roleId)` are not tenant-scoped; they rely on an explicit ownership check at line 180. Defensible (single-row read, no TOCTOU write) but a rule deviation on an RBAC path. | `@db-agent` | Could |
| BACKLOG-5 | **Process gap — the root cause of this whole batch.** Mocks went stale because `findMany` → `findUnique` shipped without updating every mock of that call, and the suite then stayed red for ~2 weeks unnoticed (PR #53 broke `authService.test.ts` on 2026-08-06). Add to `.claude/roadmap/qa-protocols.md`: (a) "did any mocked Prisma call shape change in this PR, and were all mocks updated?" as a Step 7 check; (b) treat a red backend suite on `main` as a ship-blocker, not background noise. PM proposed (a); I am adding (b), which is the one that would actually have caught this. | `@qa-agent` + `@pm-agent` | **Must** |

---

## 9. Definition of Ready

| Criterion | Status |
|---|---|
| Objective stated | ✅ Green backend suite that faithfully encodes ADR-0019, with no security assertion weakened. |
| Actors / roles named | ✅ n/a for test repair; `billing.payment` holder for BILL-DEF-01. |
| Permission codes assigned | ✅ `billing.payment`, `clinic.profile.view`, `emr.view` — all pre-existing, none added or changed. |
| Business rules listed | ✅ One role per user (ADR-0019); deny-by-default; tenant scoping on every query; atomic single-claim payment (HI-08). |
| Exceptions covered | ✅ §2 case table (a)–(d); §6 fixture failure modes. |
| NFR impact | ✅ None. No new query on any success path — the added read executes only on an already-failing request. No new index, endpoint, or dependency. |
| Acceptance criteria testable | ✅ §7, all `@qa-agent`-verifiable. |
| Risks & dependencies recorded | ✅ §7 conditions, §8 backlog. PM's risk register accepted as written, with BACKLOG-5(b) added. |

**Ready for Step 3.5 (`/grill-with-docs`) once the §7 conditions are folded into the PM doc.**

---

## 10. Handoff

Next: **Step 3.5 — `/grill-with-docs` (MANDATORY, cannot be skipped).** Grill priorities, in order:

1. **The AC-04′ amendment** — is one production file in a test-repair branch the right call, or does the reviewability cost outweigh leaving main red? (§3 argues (a); stress it.)
2. **The `claimInvoicePaid` design** — does the failure-path read genuinely preserve the HI-08 atomic-claim guarantee under concurrency, and does scoping it identically to the claim genuinely introduce no new discrimination? This is a money path.
3. **The audit blind spot (§2)** — should the fix also make a cross-tenant payment attempt loggable as *distinct* from a benign double-click, or is that a separate observability item?
4. **KEEP vs archive for `collapse-multi-role.ts`** (§5) — is the migration's `RAISE EXCEPTION` path a real DR dependency, or is the backup-retention window already shorter than 2026-08-05, making it moot?

Then Step 4 `/write-plan` (`@pm-agent`), Step 5 `@ponytail-agent`.

**Ponytail pre-check (informational):** 1 production file · 1 function · ~4 LOC · 0 new endpoints ·
0 new deps · 0 new files · net −7 tests. Comfortably inside all seven criteria.
