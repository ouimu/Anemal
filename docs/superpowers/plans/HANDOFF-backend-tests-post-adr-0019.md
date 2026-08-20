# HANDOFF — backend test repair (post-ADR-0019)

**Updated:** 2026-08-21
**Branch:** `fix/backend-tests-post-adr-0019` (local only — NOT yet pushed)
**Commit:** `4b15f46`
**PR:** none yet

## Current pipeline step

**STEP 7 complete (QA APPROVE). STEP 8 not started.**

| Step | Gate | Status |
|---|---|---|
| 1+2 | @pm-agent scope + dispositions | ✅ |
| 3 | @ba-agent | ✅ APPROVED WITH CONDITIONS — C-1..C-5 resolved |
| 3.5 | `/grill-with-docs` | ✅ PASSED — ADR-0025 recorded |
| 4 | `/write-plan` | ✅ |
| 5 | @ponytail-agent | ✅ APPROVE 7/7 |
| 6 | `/execute-plan` (@dev-agent) | ✅ |
| 7 | @qa-agent | ✅ **APPROVE** — mutation-tested |
| 8 | `/anemal-finish-branch` | ⛔ not started |

## Exact next action

1. A second @qa-agent review was spawned by the coordinator in parallel with the one
   that approved (the approving review was engaged by @dev-agent). If its result has
   not been reconciled, do that first — it is an independent second opinion on the
   same diff, not a re-run to be discarded.
2. Invoke the **`anemal-finish-branch`** skill. Preflight will need
   `git push -u origin fix/backend-tests-post-adr-0019` first — the branch has never
   been pushed.
3. At the skill's step 5, `main` will be RED (28 failures). **This branch qualifies for
   the self-fix exemption** — its own suite is green and it resolves exactly those
   failures. Note the pre-existing red state in the PR body.
4. After merge: `git checkout main && git pull`, re-run the backend suite, expect
   **1289 passing / 0 failing / 91 suites**.
5. Invoke `anemal-HTML-updater` and do the CLAUDE.md Tracking refresh (phase-history,
   roadmap index, implementation-status-matrix, README footer, docs/index.html).
6. Delete this handoff file.

## Verified state at commit `4b15f46`

- Backend: **1289 passing, 0 failing, 91/91 suites** (was 28 failing / 1293 total).
- `tsc --noEmit` in `src/backend`: exit 0.
- Frontend: 330 passing, untouched by this branch.
- Backend `eslint` **cannot run at all** — eslint 9 flat-config migration error.
  Verified via `git stash` to fail identically without this branch. Pre-existing
  tooling breakage, out of scope, do not treat as a regression.

## Load-bearing facts a future session must not undo

- **`bill-19` must not be pruned as redundant with `bill-17`.** QA proved by injected
  regression that deleting *only* the claim's branch clause leaves both `bill-17` and
  `bill-18` passing. `bill-17` reuses an invoice earlier tests already paid, so an
  unscoped claim still matches zero rows via `paymentStatus: { not: 'paid' }` and still
  404s. `bill-19` uses a fresh unpaid invoice and asserts the row stays unpaid, making
  it the **only** test covering the claim's branch scoping. The comment above it says so
  — keep it.
- **The existence check in `claimInvoicePaid` must never widen its scope.** ADR-0025
  constraint 1: any lookup wider than the atomic claim (dropping the branch clause,
  reusing a generic `findInvoiceById`, adding an early existence guard) reintroduces a
  cross-tenant existence oracle on a money endpoint. It must also stay on the
  `count === 0` path only — hoisting it reopens the TOCTOU race HI-08 closed.
- **`prisma/scripts/collapse-multi-role.ts` stays.** Migration
  `20260805090000_enforce_one_role_per_user` names it by literal path in a runtime
  `RAISE EXCEPTION` and delegates the ambiguous case to it. Live remediation path.
- **The red-suite exemption covers deletion, not just turning green.** A green-only
  reading would deadlock precisely the branch that repairs `main` — it would have
  deadlocked this one, since 7 of `main`'s failures are resolved by deletion.

## Documents produced

- `docs/adr/0025-payment-claim-failure-distinguishes-not-found-from-conflict.md`
- `docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019-pm-tasks.md` (Step 1+2)
- `...-ba-signoff.md` (Step 3) · `...-grill.md` (Step 3.5) · `...-.md` plan (Step 4)
- `...-ponytail.md` (Step 5) · `...-qa-signoff.md` (Step 7)
- `...-deleted-coverage.md` — the human-mandated record of what the 7 deletions dropped

## Backlog raised, deliberately not in this branch

- `task_b29b82b3` — payment route has no RBAC-deny / plane test (gap identical on `main`).
- `services/role.service.ts:184` `countRoleUsage(roleId)` is not tenant-scoped; guarded
  upstream by the `role.tenantId !== tenantId` check, so defence-in-depth, not a leak.
- `prisma/schema.prisma:225` still comments "effective perms come from userRoles union",
  which ADR-0019 retired.
- Audit logging for repeated payment-probe failures.
- Backend `eslint` is unrunnable (declared script, no flat config).
- Separate cloud session: 8 frontend test files collecting 0 tests.
