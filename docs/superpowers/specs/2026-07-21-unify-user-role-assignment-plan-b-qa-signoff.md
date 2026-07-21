# QA Sign-off — Unify User Role Assignment, Plan B (Frontend)

**Branch:** `feature/unify-user-role-assignment-frontend` · **Verdict: APPROVE ✅**

## Two-axis code review (Standards + Spec)

Ran in parallel per `/code-review` (Standards + Spec axes). Findings and fixes, commit `a6524b8`:

**Standards (3 hard violations, all fixed):**
1. `assignUserBranches`'s inline ternary re-duplicating the deleted legacy-role mapper → extracted named `toLegacyRoleString3Way` helper.
2. `isGrantable`/`isAdminLevelRole` copy-pasted from deleted `RolePicker.tsx` into `UserManagementTab.tsx` → moved into `useUserRoles.ts`, imported by both consumers.
3. `'clinic_admin'` sealed-role magic string duplicated across `RoleList.tsx` (×2) and `UserManagementTab.tsx` → single `SEALED_ROLE_KEY` const.

**Spec (3 minor findings, all fixed):**
1. Hardcoded English `"Select…"` placeholder → `common.select` i18n key (en + th).
2. `ClinicGrooming.tsx`'s `StaffUser.role` still typed `string` (stale, unused) → updated to `{ key: string }`.
3. Clone-hint banner copy ("Clone to create a customisable version") still shown on the sealed Admin row even though the button was hidden → copy now conditional on `onClone`.

No scope creep found; all 9 plan tasks matched their spec sections; backend footprint confirmed exactly Task 1's 3 files.

## QA pass (tenant isolation + RBAC/D-4 verification)

Full backend (1017 tests) and frontend (278→279 tests) suites re-run, `tsc --noEmit` clean both sides.

**P1 regression found + fixed (commit `ed667a1`):** `isGrantable()` required the caller hold every permission of a role with no `roles.manage` exemption. Since `clinic_admin` deliberately lacks clinical-only codes (`emr.create`, `vaccination.create`, `prescriptions.create`), a real clinic_admin could not assign `doctor`/`clinic_staff` in the new unified listbox — a core-workflow break the backend's `assertNoRoleEscalation` already prevents via its `roles.manage` exemption (T-URA-2.7). Fixed to mirror the backend gate exactly, preserving the D-4 sealed carve-out (`clinic_admin` never gets the exemption). New regression test added to `UserManagementTab.test.tsx`.

Verified intact: cross-tenant `roleId` → 404 not 403; no-escalation subset check; D-4 seal on both backend (assign-path) and frontend (Clone button + hint copy + create-mode listbox); `isPrimaryAdmin` uniqueness; self-demotion dialog + backend enforcement; `AdminBranches.tsx` doctor picker stays key-match only per ADR-0019.

## Protocol 5 — Browser Smoke (manual, gated)

Per `.claude/roadmap/qa-protocols.md` Protocol 5, run via `anemal-smoke-walkthrough` against a locally seeded dev DB (`npm run db:seed`, tenant `dev-clinic`, `admin_a`/`AdminPass1!`).

| Role | Page | Status | Detail |
|---|---|---|---|
| clinic_admin | Login (dev-clinic/admin_a) | OK | Correct nav for role, no plane/role leakage |
| clinic_admin | Users & Roles — Edit User modal | OK | Unified listbox shows Clinic Admin, Clinic Staff, Doctor, and custom "Accountant" role — both the originally reported bug (cloned roles invisible) and the QA P1 fix (admin can assign doctor/staff) confirmed live |
| clinic_admin | Users & Roles — role change (write path) | OK | `PUT /users/2` → 200, `PATCH /users/2/branch` → 200, no console/network errors; test edit reverted after |
| clinic_admin | Role Editor | OK | Clone button hidden on Clinic Admin row only (D-4), present on Clinic Staff/Doctor rows |
| clinic_admin | Branches → Doctor Shifts picker | OK | `role.key === 'doctor'` filter renders "Doctor A" correctly against the new role-object response shape, no crash |

No errors found. Sign-off artifact attached per Protocol 5 requirement — branch cleared to proceed to Step 8.

## Disposition

**QA-Agent Approval: ✅ APPROVE.** All automated suites, type checks, tenant-isolation/RBAC/D-4 enforcement, and the mandatory browser-smoke gate are green. Cleared for `/anemal-finish-branch`.
