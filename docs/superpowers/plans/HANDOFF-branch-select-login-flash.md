# HANDOFF — branch-select login flash fix

**Updated:** 2026-08-20
**Branch:** `fix/branch-select-login-flash` (pushed, tracking `origin/`)
**Commit:** `c75550a`
**PR:** https://github.com/ouimu/Anemal/pull/54 (open, not merged)

## Current pipeline step

**STEP 8 — `/anemal-finish-branch`, partially complete. Paused waiting on a human
decision: the PR needs to be merged.**

Steps 1 through 7 are all complete and signed off. The finish-branch skill forbids
merging without being asked, so the flow stops here by design — not because anything
is broken.

| Step | Gate | Status |
|---|---|---|
| 1+2 | @pm-agent scope + AC | ✅ 13 AC |
| 3 | @ba-agent | ✅ APPROVED WITH CONDITIONS — C1/C2/C3 all resolved at the grill |
| 3.5 | `/grill-with-docs` | ✅ PASSED — human rulings + 4 findings resolved, ADR-0024 recorded |
| 4 | `/write-plan` | ✅ 20 tasks |
| 5 | @ponytail-agent | ✅ APPROVE, 7/7 criteria clear |
| 6 | `/execute-plan` (@dev-agent) | ✅ + 3 QA findings fixed on a second pass |
| 7 | @qa-agent | ✅ APPROVE **unconditional** (3 rounds: BLOCK → conditional → unconditional) |
| 7 | P5 browser smoke / T20 | ✅ 9/9 PASS against seeded DB, 768×1024 + 1024×768 |
| 8 | `/anemal-finish-branch` | ⏸ PR open, **awaiting merge** |

## Exact next action

1. Merge https://github.com/ouimu/Anemal/pull/54 (human, or on explicit instruction:
   `gh pr merge 54 --squash`).
2. `git checkout main && git pull`
3. Re-run the frontend suite on `main`: `cd src/frontend && npx vitest run`.
   **Expected: 330 passed, 8 test files failing at collection** (pre-existing — see
   Known-red below). If the passing count is below 330, stop and investigate before
   starting anything else.
4. Invoke the **`anemal-HTML-updater`** skill — this is Step 8's last act and is easy to
   forget once the PR is merged. Do not invoke it before the merge.
5. Per CLAUDE.md Tracking rules, @pm-agent then refreshes, in this order:
   `.claude/roadmap/phase-history.md` → `.claude/roadmap/index.md` header →
   `.claude/roadmap/ACTIVE/remaining-tasks.md` header → README.md "Last updated" footer →
   `.claude/specs/implementation-status-matrix.md` → the HTML in
   `docs/index.html` and `docs/functional_spec_detailed.html`.
6. Delete this handoff file once the above is done.

## Known-red BEFORE this branch — do not attribute to it

Both verified identical on `main` @ `13e74ed`, and this branch touches no backend file:

- **Backend: 28 failed / 1265 passed.** Incomplete Prisma mocks in the test files
  (`prisma.userRole.findUnique is not a function`). Survives `prisma generate`.
  Filed as a separate task.
- **Frontend: 8 test files fail at collection**, contributing 0 tests each
  (`No "QueryClient" export is defined on the @tanstack/react-query mock`). Dashboard,
  Pets, Appointments, Branches, ClinicSettings and PetDetail therefore have **no**
  coverage while looking fine in the suite count. Filed as a separate task.

Fixed in passing while running the gate: the local `vetclinic_test` database was one
migration behind (`20260806090000_add_stock_movement_lot_expiry`); `prisma migrate deploy`
applied it and took backend failures from 49 → 28.

## Documents produced

- `docs/adr/0024-login-identity-resolution-is-atomic.md` — the accepted decision
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-pm-tasks.md` — Step 2
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-ba-signoff.md` — Step 3
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-grill.md` — Step 3.5
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash.md` — Step 4 plan
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-ponytail.md` — Step 5
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-qa-signoff.md` — Step 7
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-smoke.md` — P5 / T20

## Backlog raised, deliberately not in this branch

`AUTH-BL-1` (`refreshPermissions()` 401 → `clearAuth()` + hard redirect), `AUTH-BL-2`
(non-ok non-401 → bare return leaves `permissionsLoaded` stuck `false`), `AUTH-BL-3`
(`/403` is an unrecoverable dead end for a legitimately zero-permission session).
QA additionally carried forward **F-5** (vacuous `sessionStorage` assertion at
`useAuth.test.ts:208`), **N-1** (untested malformed-body path in `fetchMe`) and **N-2**
(likely won't-fix) for the next auth-touching branch.
