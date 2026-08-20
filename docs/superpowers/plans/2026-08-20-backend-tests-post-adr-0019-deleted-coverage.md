# Deleted Test Coverage — Backend Test Suite Repair Post-ADR-0019

**Branch:** `fix/backend-tests-post-adr-0019`
**Related:** ADR-0019 (single role per user), Step 4 plan
`docs/superpowers/plans/2026-08-20-backend-tests-post-adr-0019.md` (Group 0, Task 0.1),
BA sign-off §4 "Confirmed as written", grill §6.

ADR-0019 (D-7) enforces exactly one role per user via a unique constraint on
`user_roles (tenantId, userId)`. The seven tests below constructed their
precondition — a single user holding two or more `user_roles` rows — which is
now illegal at the database level and can no longer be built in a live-schema
integration test. Each row records the test, why it is gone, and what still
covers the requirement it verified (per BA §6 / grill §6).

| # | File | Test | Reason (ADR-0019) | What still covers the surviving requirement |
|---|---|---|---|---|
| 1 | `tests/scripts/collapse-multi-role.test.ts` | `classifyMultiRoleUsers › classifies a system+custom user as auto-collapsible, keeping the system role` | Precondition is a user with two `user_roles` rows (one system, one custom) — unconstructable under the new unique constraint. | None — the migration `20260805090000_enforce_one_role_per_user` makes multi-role state impossible to create going forward; there is nothing left to classify. `does not classify a single-role user at all` remains as the sole regression guard that the classifier still imports and runs cleanly against the live schema. |
| 2 | `tests/scripts/collapse-multi-role.test.ts` | `classifyMultiRoleUsers › classifies a 2-system-role user as ambiguous` | Same precondition class (two system roles on one user) — unconstructable. | Same as above. |
| 3 | `tests/scripts/collapse-multi-role.test.ts` | `classifyMultiRoleUsers › classifies a 2-custom-role user with no system role as ambiguous` | Same precondition class (two custom roles on one user) — unconstructable. | Same as above. |
| 4 | `tests/scripts/collapse-multi-role.test.ts` | `collapseMultiRoleUsers › collapses an auto-collapsible user to the system role and logs it` | Exercises the collapse script's write path against an auto-collapsible multi-role user — same unconstructable precondition. | The collapse script (`prisma/scripts/collapse-multi-role.ts`) is kept, untouched, and behaviorally frozen — it was a one-time migration aid for the ADR-0019 cutover, not a live code path. No further coverage is needed because the script is not invoked by any runtime path post-migration. |
| 5 | `tests/scripts/collapse-multi-role.test.ts` | `collapseMultiRoleUsers › leaves an ambiguous user untouched and reports it` | Same precondition class as #4. | Same as #4. |
| 6 | `tests/integration/pet-medical-degradation.test.ts` | `multi-role union: no-emr custom role + doctor role still resolves emr.view and sees both fields (CR-01)` | Asserted that `resolvePermissions` unions permissions across a user's multiple roles. ADR-0019 retires the union: a user has exactly one role, so `permission.service.ts#resolvePermissions` now does a single `userRole.findUnique` (see `services/permission.service.ts`), not a `findMany` + union. The "custom no-emr + doctor" combination on one user is unconstructable. | `resolvePermissions` for a user's single assigned role is covered by the rewritten `tests/unit/permission.service.test.ts` (`returns the assigned role's permission codes as a Set`, `queries with correct tenantId and userId`). The two remaining `pet-medical-degradation.test.ts` tests (`doctor (has emr.view) sees medicalRecords and vaccinations`, `custom role without emr.view gets neither field, but still sees the pet`) continue to prove the emr.view gate itself works correctly for a single-role user in each direction (has the permission / lacks it). |
| 7 | `tests/integration/appointmentDoctors.test.ts` | `findDoctorsForBranch (repository) › includes a multi-role user if any one role is Doctor-derived` | Asserted a user holding both a non-doctor role and a doctor role still appears in the doctor list. Precondition (two `user_roles` rows on one user) is unconstructable. | `findDoctorsForBranch`'s doctor-lineage matching (system Doctor role, Doctor-derived custom role via `sourceRoleId`) remains covered by `includes a user whose custom role is cloned (sourceRoleId) from the system Doctor role` and the other surviving repository tests in the same file — the multi-role angle specifically is gone because a single-role user is now definitionally either Doctor-derived or not, with no union case to test. |

## Accepted gap

No test coverage for `classifyMultiRoleUsers`'s and `collapseMultiRoleUsers`'s
ambiguous/auto-collapsible branches survives this cleanup. This is an
intentional, explicitly accepted gap, not a silent drop: the script's
precondition (a user with 2+ roles) cannot exist in a live schema after the
`20260805090000_enforce_one_role_per_user` migration, so the branches are
unreachable in current and future runtime data. The script itself is
untouched and remains available for historical/audit reference; it is not on
any live code path.

## AC reference

Satisfies `TEST-PARITY-03` (Task 0.1 of the Step-4 execution plan).
