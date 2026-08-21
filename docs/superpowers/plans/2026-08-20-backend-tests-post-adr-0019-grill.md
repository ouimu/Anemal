# Grill Record — Backend Test Repair (post-ADR-0019)

**Pipeline step:** 3.5 (`/grill-with-docs`) — MANDATORY gate before `/write-plan`
**Date:** 2026-08-20
**Branch:** `fix/backend-tests-post-adr-0019`
**Inputs:**
- `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-pm-tasks.md` (@pm-agent, Step 1+2)
- `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-ba-signoff.md` (@ba-agent, Step 3 — APPROVED WITH CONDITIONS, C-1..C-5, AC-04′, AC-05)

**Outcome:** ALL FINDINGS RESOLVED — gate PASSED, `/write-plan` unblocked.

---

## 1. The problem in one line

28 backend tests fail on `main` @ `1e6f374`. Production code is correct in 27 of
those; the tests are stale. The 28th is a real production defect.

Two independent stale-test causes, not one:

| Cause | Suites |
|---|---|
| **ADR-0019 retired multi-role.** Schema enforces `@@unique([tenantId, userId])`; `resolvePermissions` uses `findUnique`. Tests still mock `findMany` and seed multi-role fixtures via `userRole.createMany`, which now violates the constraint — cascading into unrelated-looking failures. | permission.service, collapse-multi-role, roleManagement, roleEditor-t5f01, pet-medical-degradation, appointmentDoctors, clinicUsage |
| **PR #53 security fix.** `f8b92e2` (HI-02) changed `touchLastLogin` from `prisma.user.update` to `prisma.user.updateMany` to close a check/use gap. The mock at `tests/unit/authService.test.ts:9` was never given an `updateMany` stub. | authService |

**Correction to the PM doc (C-1):** @pm-agent attributed the `authService`
failures to PR #54. That is wrong. `git show --stat 56107e3` shows PR #54 touched
17 files, **zero** of them backend — docs plus `src/frontend/` only — and the
backend was already 28-red at `13e74ed`, before #54 existed. The correct cause is
PR #53 as above. Recorded so Step 6 does not go hunting for role logic that isn't
there.

---

## 2. THE finding — the fix can introduce the very leak that does not exist today

This is the most important output of this gate.

**Today's behaviour is wrong but safe.** `models/invoice.repository.ts:188-204`:

```ts
const claimed = await tx.invoice.updateMany({
  where: { id, tenantId, ...(branchId != null ? { branchId } : {}), paymentStatus: { not: 'paid' } },
  data: { paymentStatus: 'paid', paymentMethod, paidAt: new Date() },
})
if (claimed.count !== 1) throw new ConflictError('Invoice is already paid', 'INVOICE_ALREADY_PAID')
```

`count !== 1` conflates four cases — already-paid-in-my-tenant, wrong-tenant,
wrong-branch-same-tenant, and nonexistent — and reports all as `409
INVOICE_ALREADY_PAID`. Because they are **indistinguishable**, there is no
cross-tenant existence oracle. Isolation is intact: the claim is tenant+branch
scoped, matches 0 rows, writes nothing, and throws before any read.

**The naive fix breaks that.** If the `count === 0` branch performs an existence
check that is *not* tenant-scoped, then:

- wrong-tenant → row found → "exists but not claimable" → **409**
- nonexistent → no row → **404**

…which is a working cross-tenant existence oracle on a money endpoint. That is
strictly worse than the bug being repaired. A reviewer skimming the diff would
see a test going green and a plausible-looking existence check.

**Required end state — all three, jointly:**

| Case | Status |
|---|---|
| wrong tenant | **404** |
| wrong branch, same tenant | **404** |
| nonexistent id | **404** |
| already paid, my tenant + branch | **409** |

**Binding constraints for `/write-plan`:**
1. The existence check MUST use the **identical** tenant+branch scope as the
   atomic claim. Same `where` scoping, no wider.
2. It MUST run **only** on the `count === 0` path. A pre-check would reintroduce
   the TOCTOU race that HI-08's atomic single-statement claim exists to close.
3. `409` may only ever be returned for an invoice inside the caller's own
   tenant+branch scope. `409` is the only status that reveals anything, and it
   must reveal only the caller's own data.

**Bonus:** the fix also closes @ba-agent's Moderate-severity detection gap for
free. Cross-tenant probes currently log as `INVOICE_ALREADY_PAID`,
indistinguishable from a benign double-tap on a tablet; after the fix they log as
404s. No separate audit-logging work is needed in this branch.

---

## 3. Human rulings (asked in plain language, both "recommended" taken)

**R-1 — the 7 retired-requirement tests: DELETE, but document the loss.**
Delete them, and record in the branch docs exactly which coverage was dropped and
why, so a later reader sees a deliberate decision rather than erosion. Rejected
alternative: rewriting them to single-role semantics, which risks tests that
strain to assert something that no longer exists.

**R-2 — codify the red-suite rule.** The backend suite sat red for roughly two
weeks after PR #53 with nobody noticing. A red backend suite on `main` now blocks
the next merge, wired into the Step 8 finish-branch gate. This promotes
@ba-agent's BACKLOG-5 from a backlog note to an orchestration rule, and is the
half of the proposal that would actually have caught this. It requires a
CLAUDE.md edit — permitted, since it is a genuine orchestration-rule change.

---

## 4. @ba-agent conditions carried into `/write-plan`

- **C-5 — the fixture trap that would make a test pass while asserting nothing.**
  `services/role.service.ts:184` calls `roleRepo.countRoleUsage(roleId)` with no
  tenant scope. The live path is covered by the `role.tenantId !== tenantId`
  check two lines above, so this is defence-in-depth rather than an active hole —
  but for the *tests* it is a real trap: a fixture user created in the wrong
  tenant still triggers the 409, so `roleManagement` / `roleEditor-t5f01` would
  pass while asserting nothing about scoping. Fixtures must keep `users.roleId`
  and the `user_roles` row naming the same role, so the repair does not recreate
  the two-truth drift ADR-0019 exists to kill.
- **AC-04′** — production edits confined to one file
  (`models/invoice.repository.ts`), one function (`claimInvoicePaid`), with the
  HI-08 atomic claim unchanged.
- **AC-05** — same tenant + nonexistent id → 404. Without this, nothing
  distinguishes a real fix from one that merely special-cases tenant mismatch.
  Extended by this gate to require the wrong-branch and already-paid cases too
  (see §2 table).

**Revised dispositions (BA, reconciled against live runs):**
DELETE 7 / REWRITE 8 / FIX-FIXTURE 12 / PRODUCTION FIX 1 = **28 exactly**.

Two BA changes to PM's dispositions, both accepted:
- `permission.service › returns union of all role permissions as a Set`:
  DELETE → **REWRITE**. It is the only positive happy-path assertion in the file;
  deleting it would leave permission resolution — the backbone of every
  `requirePermission` guard — with no positive assertion on its core behaviour.
- `collapse-multi-role › does not classify a single-role user at all`:
  DELETE → **KEEP**. It is green today; it seeds a single `userRole.create`,
  which is legal under the constraint.

---

## 5. `collapse-multi-role` script: KEEP — claim independently verified

@ba-agent's decisive fact was checked against the source rather than taken on
trust. `prisma/migrations/20260805090000_enforce_one_role_per_user/migration.sql`
names the script **by literal path inside a runtime `RAISE EXCEPTION`**:

> `Run prisma/scripts/collapse-multi-role.ts (see its ambiguous-case report) or resolve manually before re-running this migration (see HI-06).`

The migration fails closed on ambiguous data — 2+ system roles, or 2+ custom
roles with no system-role match — and explicitly refuses to "decide business
identity for a human". Restore any pre-2026-08-05 snapshot, replay migrations,
and an operator needs that file. It is a live remediation path, not history.

The "untested script" concern dissolves: the one kept test imports it and runs it
against the live schema, which catches Prisma/schema bit-rot — the actual risk for
a dormant script. Rejected alternative: dropping the unique index in `beforeAll`
to seed impossible fixtures — unsafe under parallel workers, and a crashed test
would leave the core RBAC invariant switched off.

---

## 6. Tenant-isolation / RBAC review

- The only production change is a status code on a failure path. No query gains
  scope, no route or permission changes.
- The change is isolation-**improving**: cross-tenant payment attempts become
  distinguishable in logs, and §2's constraints guarantee no new oracle.
- Deleted tests: all 7 assert multi-role union, which the schema now makes
  unrepresentable. None of them is the sole guard of a tenant-isolation property
  — C-5 covers the remaining risk in the suites that keep their isolation intent.
- `permissionsLoaded`-style loading-vs-authorization confusion has no analogue
  here; `hasPermission` and the guards are untouched.

---

## 7. Scope-creep check

In scope: 27 stale tests + 1 production status-code fix + the CLAUDE.md rule from
R-2. Explicitly out: audit logging for payment probes (backlog — the fix already
closes the detection gap), making `countRoleUsage` tenant-scoped (backlog,
defence-in-depth), and the 8 zero-collecting frontend test files (already a
separate cloud session).

---

## 8. Carried into `/write-plan`

1. Fix `claimInvoicePaid` per §2 — identical scope, failure path only, all four
   cases in the table.
2. Tests for **all four** cases, not just bill-09.
3. DELETE 7 / REWRITE 8 / FIX-FIXTURE 12 per BA's reconciled table.
4. Document the deleted coverage explicitly (R-1).
5. Add `updateMany` to the `authService` mock (C-1 — nothing to do with roles).
6. Fixtures must satisfy C-5.
7. CLAUDE.md: red backend suite on `main` blocks the next merge (R-2).

**Gate status: PASSED.**
