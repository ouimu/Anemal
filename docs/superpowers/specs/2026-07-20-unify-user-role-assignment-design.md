# Design: Unify User Role Assignment (Edit User Modal)

**Date:** 2026-07-20
**Status:** Approved (brainstorm) — pending @pm-agent task breakdown, @ba-agent sign-off, /grill-with-docs
**Origin:** Bug report — cloned custom role ("Accountant") did not appear in Clinic Admin → Edit User's role listbox.

## Problem

Two independent role-storage systems coexist on `User`:

1. **Legacy `role` enum column** (`admin` | `doctor` | `staff`) — drives the Edit User modal's role `<select>`, avatar/badge colors, list filters, the primary-admin lockout guard, and the `ClinicLayout` admin-vs-clinic routing split.
2. **RBAC `Role`/`UserRole` tables** (Phase 8) — the actual permission-resolution source of truth (`permission.service.ts` never reads the legacy column). Custom roles cloned via Role Editor live only here.

The Edit User modal exposes both: a hardcoded 3-option listbox bound to (1), plus a separate "Roles" section (`RolePicker`) bound to (2). Cloned roles only show in the second section, which reads as a bug and duplicates UI. Worse: saving the legacy listbox calls `replaceUserRole()`, which **wipes any custom role assignment** the user held (single-role replace, not additive) — an active data-loss risk independent of this fix.

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | **Single role per user**, not multi-role. | Combining access is done by cloning a role with the right permission mix, not by stacking multiple roles on one user. Matches existing clone workflow. |
| D-2 | **Primary-admin lockout guard** re-points to `ClinicRole.key === 'clinic_admin'` instead of the legacy string. | Guard must keep working once the legacy column is gone. |
| D-3 | **Drop `User.role` column and `LegacyRole` enum entirely.** `roleId` (NOT NULL) becomes the sole source of truth. | Backend is already half-migrated (admin-checks in `user.service.ts` already read `Role.key`); keeping a synced denormalized column reintroduces the same drift that caused this bug. |
| D-4 | **Admin permissions are sealed — cloning from the Admin system role is forbidden.** To grant admin-equivalent access, assign the real Admin role; never via a clone. | User directive: Admin must stay a hard boundary, not something that leaks into custom roles. |
| D-5 | **New-user creation still hides the Admin role** from the listbox (same as today), but no new "admin-tier" flagging system for custom roles. | Matches current behavior exactly; flagging custom-role power level is unrequested scope (YAGNI). |
| D-6 | **Admin-vs-clinic menu routing** (`ClinicLayout.tsx:31`, checks `role === 'admin'`) is **out of scope** for this change — tracked as a related follow-up, not fixed here. | Same root cause, but a separate mechanism; keeps this change bounded. |
| D-7 | **Multi-role collapse rule at migration** (2026-07-20 amendment, product-owner decision — resolves BA sign-off OQ-1): FR-14b/CR-01 multi-role is retired. For any user with >1 `user_roles` row at cutover: keep the **system** role over any custom role (userId 2 keeps Doctor, drops Accountant); 2+ system roles or 2+ custom-only roles → **halt into a pre-migration report for manual resolution**, never silently pick; every collapse logged (userId, kept role, removed roles) and attached to the migration PR. Multi-role write endpoints (`POST/DELETE /clinic/roles/users/:userId/roles`) are removed server-side in the same change. | Silent stripping would leave invisible union-permissions or unexplained access loss; the report makes the trade-off auditable and lets admins re-provision combined cloned roles deliberately. Leaving the endpoints live would be an API backdoor recreating the two-truth drift. |
| D-8 | **Auth-plane compatibility** (2026-07-20 amendment — resolves BA sign-off F-1): `auth.service.ts` derives the existing JWT/login `role` claim from `roleRef.key` via one private mapper (`clinic_admin`→`'admin'`, `doctor`→`'doctor'`, else→`'staff'`); the admin branch-selection bypass keys off the same mapper. JWT contract and all nine frontend `role` consumers stay byte-identical; switching the claim to `roleKey` (option b) is the documented implementation path for the D-6 follow-up, not this change. | The legacy column feeds the JWT claim and admin login bypass at 7+ sites in `auth.service.ts`; dropping the column without this breaks login. Option (b) would force touching `ClinicLayout`/`AdminLayout` routing — exactly what D-6 defers. |

## Data model changes

- `prisma/schema.prisma`: remove `User.role` (`LegacyRole` enum) column; make `User.roleId` `Int` (NOT NULL, currently `Int?`).
- Migration: re-run `backfill-user-roles.ts` first to guarantee every `User.roleId` is populated (idempotent, already run once), verify zero NULLs, then drop the column in a Prisma migration.
- Remove the `LegacyRole` enum from schema.prisma once no column references it.

## Backend changes

- `user.service.ts`:
  - `createUser`/`updateUser` accept `roleId: number` instead of `role: string`; drop `LEGACY_ROLE_TO_SYSTEM_KEY` mapping entirely.
  - `assertNotPrimaryAdminDeactivation`: change `change.role !== 'admin'` check to compare against the target role's `key !== 'clinic_admin'` (requires loading the role row, not just an id, when a role change is requested).
  - `safe()`: return `role: { id, name, key, isSystem }` instead of a string.
  - Add `isPrimaryAdmin: boolean` to `listUsers`/`getUserById` responses (computed server-side via existing `findPrimaryAdminId`), so the frontend never re-derives primary-admin status from a role string.
- `role.service.ts`:
  - `cloneRole()`: reject when `sourceRole.key === 'clinic_admin'` → 403 `ForbiddenError`. Defense-in-depth backstop behind the UI change below.
- `user.controller.ts` / `role.controller.ts`: update zod schemas (`role: z.string()` → `roleId: z.number().int().positive()`) on the affected request bodies.
- `user.repository.ts`: `replaceUserRole` stays (still correct for single-role replace); the `createUserWithRole` transaction is unaffected structurally, just passes `roleId` directly instead of resolving via the legacy map.

## Frontend changes

- `UserManagementTab.tsx`:
  - Replace hardcoded `<select>` (3 options) with a listbox populated from `useClinicRolesQuery()` (existing hook, already used by `RolePicker`), filtered through the existing `isGrantable()` check (moved out of `RolePicker.tsx` into a shared helper, e.g. `hooks/useUserRoles.ts` or a small `utils/roles.ts`, so both call sites use one implementation).
  - Hide the `clinic_admin` role from the list when `isNew` (same rule as today).
  - Remove the entire "Roles" section block (`<Can perm="staff.assign_role"><RolePicker .../></Can>` and its surrounding `<hr>`s).
  - Self-demotion confirmation: reuse `RolePicker`'s `SelfDemotionDialog` + `isAdminLevelRole()` heuristic — trigger it when the acting user changes their *own* role away from an admin-level one.
  - `primaryAdminId` computation switches from client-side `users.filter(u => u.role === 'admin')` to reading the new `isPrimaryAdmin` flag from the API response.
  - `ROLE_COLORS` / `AVATAR_BG`: keep the 3 existing keyed colors for `clinic_admin`/`doctor`/`clinic_staff`; add one neutral fallback style for any other (custom) role — no per-role color picker.
- `RolePicker.tsx`: no longer used by `UserManagementTab`. Check for other call sites; if none remain, delete the file and its now-unused mutations (`useAssignRoleMutation`, `useRemoveRoleMutation`) in a follow-up cleanup pass — not blocking this change if something else still references them.
- `RoleList.tsx` (Role Editor screen): remove the "Clone" button for the row where `role.key === 'clinic_admin'` (currently shown for any `role.isSystem` row).

## Migration / rollout order

1. Ship backend changes behind the new `roleId`-based request/response shape.
2. Re-run `backfill-user-roles.ts`, verify zero NULL `roleId`.
3. Drop `User.role` column + `LegacyRole` enum in the same deploy window (no dual-write period — small enough blast radius per D-3).
4. Ship frontend changes (listbox unification, RolePicker removal, clone-admin restriction).

Steps 1–3 and step 4 could ship as two PRs if `/write-plan` + Ponytail Gate decide the combined diff is too large (likely, given ~13 backend files + 51 test files touch `role` in some form) — sequencing decision left to the planning step, not fixed here.

## Explicitly out of scope

- Multi-role-per-user support (D-1).
- Per-custom-role badge color picker.
- `ClinicLayout.tsx` admin/clinic menu routing fix (D-6) — separate follow-up.
- "Admin-tier" permission flagging for creation-time restrictions (D-5).

## Testing

- Backend: primary-admin lockout tests (`user-primary-admin-protection.test.ts`) re-pointed to `roleId`; clone-admin-rejection test added to `roleManagement.test.ts` (or equivalent); full `userManagement.test.ts` / `rbac.test.ts` suites updated for the `role` → `roleId` request/response shape change.
- Frontend: `UserManagementTab.test.tsx` updated for the unified listbox, self-demotion dialog, and `isPrimaryAdmin`-flag-driven lock icon; clone-button-hidden-for-admin-row test added to `RoleList`/`RoleEditorView` coverage.
