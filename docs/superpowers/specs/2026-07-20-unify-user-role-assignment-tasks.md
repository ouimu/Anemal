# Unify User Role Assignment — Tasks + Acceptance Criteria

Date: 2026-07-20 · Step 2 (@pm-agent)
Input: `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-design.md` (Status: Approved — brainstorm, D-1..D-6)
Status: DRAFT — awaiting @ba-agent sign-off (Step 3), then `/grill-with-docs` (Step 3.5, MANDATORY) before `/write-plan` (Step 4).

FR reference: FR-14 (Authorization/RBAC — permission catalogue, system roles, configurable custom roles, deny-by-default), FR-14b (Multi-role — see Open Question OQ-1, this design deliberately narrows FR-14b to single-role for the reasons in D-1), FR-01 (Auth & Authorization — user management). Origin: bug report — cloned custom role ("Accountant") invisible in Clinic Admin → Edit User's role listbox, caused by two independent role-storage systems (`User.role` legacy enum vs RBAC `Role`/`UserRole` tables) both feeding the same modal.

## Scope summary (Ponytail pre-check)

| Metric | Count | Limit |
|---|---|---|
| New endpoints | 0 (existing `PUT /users/:id`, `POST /users`, `DELETE /roles/:id/clone`-equivalent reused; request/response *shape* changes, no new routes) | ≤3 |
| Migrations | 1 (drop `User.role` column + `LegacyRole` enum, make `User.roleId` NOT NULL) | — |
| Subsystems | 3 (DB schema, backend user/role services, frontend Edit User + Role Editor UI) | ≤3 |
| Core files touched (design doc estimate) | ~13 backend/frontend files + up to 51 test files referencing `role` in some form (design doc explicit warning — actual count TBC at `/write-plan`) | ≤15 (flag for Ponytail Gate — see note) |
| New dependencies | 0 | ≤5 |
| New files | 0 expected (all edits; `RolePicker.tsx` is a **deletion** candidate, not an addition; a shared `isGrantable()` helper *relocation* — see T-URA-4.1 — may land as a new small file, e.g. `utils/roles.ts`, TBC at write-plan) | ≤15 |

**Scope note for Ponytail Gate:** the design doc itself flags that combined backend+frontend diff may be too large for one PR ("~13 backend files + 51 test files touch `role` in some form") and explicitly defers the 1-PR-vs-2-PR sequencing decision to `/write-plan`. This task breakdown is organized in four groups (URA-1 schema, URA-2 backend, URA-3 frontend, URA-4 shared-helper/cleanup) precisely so `/write-plan` can split them into 2 PRs (backend-first, frontend-second) if the file/LOC count trips the Ponytail Gate. Flagging this explicitly per CLAUDE.md Ponytail criterion #4 (scope size) and #6 (file count) — do not let this slip past Step 5 unexamined.

**Still out of scope (backlog, do NOT touch — per design doc "Explicitly out of scope"):**
- Multi-role-per-user support (D-1) — this task set deliberately narrows single-role even though FR-14b/CR-01 describe multi-role as the target model; see OQ-1 below, this must be explicitly re-confirmed by @ba-agent, not silently accepted.
- Per-custom-role badge color picker.
- `ClinicLayout.tsx` admin/clinic menu routing fix (D-6, `role === 'admin'` string check at `ClinicLayout.tsx:31`) — separate follow-up, tracked but not fixed here.
- "Admin-tier" permission flagging for role-creation-time restrictions (D-5).

---

## URA-1 — Schema: drop legacy `User.role`, make `roleId` authoritative

**Objective:** Eliminate the second, drift-prone role-storage system at the data layer so `roleId` (RBAC `Role`/`UserRole`) is the sole source of truth — closing the root cause of the reported bug, not just its UI symptom.

Verified AS-IS: `User.role` (`LegacyRole` enum: `admin`/`doctor`/`staff`) coexists with `User.roleId Int?` (nullable) pointing at `clinic_roles`. `permission.service.ts` already reads only `Role.key`, never the legacy column (per design doc) — so the column is currently dead weight for authorization, but still live for UI/lockout-guard logic (URA-2 scope).

### T-URA-1.1 Verify zero-NULL `roleId` precondition
- **Files:** none (verification task) — run/re-run `backfill-user-roles.ts` (already run once per design doc) against the dev DB; confirm `SELECT COUNT(*) FROM users WHERE "roleId" IS NULL` returns `0` across all tenants.
- **@db-agent review required.**
- **Test proves done:** verification query output captured in the write-plan execution log; if any tenant has NULL `roleId`, this task blocks URA-1.2 until backfilled — do not proceed to the NOT NULL migration with any NULL row present (would fail the migration outright).

### T-URA-1.2 Migration: drop `User.role`, drop `LegacyRole` enum, `roleId` → NOT NULL
- **Files:** `src/backend/prisma/schema.prisma` — remove `User.role LegacyRole` column, remove the `LegacyRole` enum entirely (confirm no other model references it first), change `User.roleId` from `Int?` to `Int` (NOT NULL). New migration file under `src/backend/prisma/migrations/`.
- **@db-agent review required** (CLAUDE.md: all DB changes; also touches every tenant's `users` table — irreversible column drop, must be reviewed for rollback plan).
- **Test proves done:** migration applies cleanly on the seeded dev DB after T-URA-1.1 passes; `npx prisma validate` passes; every backend test suite that constructs a `User` fixture without `roleId` now fails fast at the DB layer (expected — surfaces exactly which fixtures need the URA-2 update, do not treat as regression, treat as scope map for URA-2/URA-4 test-file updates).

**AC-URA-1:** Given the migration has run, when any `users` table row is queried, then no `role` column exists and `roleId` is present and non-null for every row. **Negative case:** attempting to insert a `User` row without `roleId` fails at the DB constraint level (NOT NULL violation), not silently defaulting to any role.

---

## URA-2 — Backend: `roleId`-based request/response shape, lockout guard re-point, admin-clone lockdown

**Objective:** Every backend surface that read/wrote the legacy `role` string now reads/writes `roleId`; the primary-admin lockout guard keys off `ClinicRole.key === 'clinic_admin'` instead of the string; cloning the Admin system role is rejected server-side as defense-in-depth.

### T-URA-2.1 `user.service.ts`: `roleId`-based create/update, drop legacy mapping
- **Files:** `src/backend/services/user.service.ts` — `createUser`/`updateUser` accept `roleId: number` instead of `role: string`; delete `LEGACY_ROLE_TO_SYSTEM_KEY` map (lines ~18-23) and its two lookup call sites (lines ~91-95, ~135-139); both call sites resolve the role row directly via `roleId` (e.g. `roleRepo.findRoleById(roleId)`) instead of via the legacy-key lookup.
- **Test proves done:** extend `userManagement.test.ts` (or equivalent) — `createUser`/`updateUser` accept `roleId` and persist the correct `clinic_roles` FK; passing an unknown/non-existent `roleId` returns the existing 400-equivalent error (mirroring today's `Unknown role: ${body.role}` behavior, now keyed on id not string); `LEGACY_ROLE_TO_SYSTEM_KEY` identifier no longer exists in the file (grep-level regression guard).

### T-URA-2.2 `user.service.ts`: re-point primary-admin lockout guard
- **Files:** `src/backend/services/user.service.ts` — `assertNotPrimaryAdminDeactivation` (current signature `change: { isActive?: boolean; role?: string }`, line ~41-53) changes to accept `change: { isActive?: boolean; roleId?: number }`; the guard condition (`change.role !== undefined && change.role !== 'admin'`, line 52) changes to load the target role row for `change.roleId` and compare `role.key !== 'clinic_admin'`. Both call sites (`updateUser` line ~126, `deactivateUser`/`removeUser` line ~283) updated to pass `roleId` instead of `role`.
- **Test proves done:** re-point `user-primary-admin-protection.test.ts` (per design doc, "Testing" section) — existing coverage (block deactivation of primary admin; block role-demotion-away-from-admin) now asserts against `roleId`-driven role-key comparison instead of the string; add one new case — demoting the primary admin to a **custom role cloned from Doctor** (any non-`clinic_admin`-key role) is still blocked, proving the guard checks the role's `key`, not just "is it literally the seeded Admin role."

### T-URA-2.3 `user.service.ts`: `safe()` response shape + `isPrimaryAdmin` flag
- **Files:** `src/backend/services/user.service.ts` — `safe()` (line ~60-65) returns `role: { id, name, key, isSystem }` object instead of a bare string; `listUsers`/`getUserById` gain `isPrimaryAdmin: boolean` per returned user, computed server-side via the existing `findPrimaryAdminId` helper (already used internally by the lockout guard) — frontend must never re-derive primary-admin status from a role string (design doc explicit requirement, closes a client-trust gap).
- **Test proves done:** extend `userManagement.test.ts` — `GET /users` and `GET /users/:id` responses include the nested `role` object (not a string) and a boolean `isPrimaryAdmin` that is `true` for exactly one user per tenant (the lowest-id `clinic_admin`-keyed user) and `false` for all others, including other users who also hold the Admin role.

### T-URA-2.4 `role.service.ts`: reject cloning the Admin system role
- **Files:** `src/backend/services/role.service.ts` — `cloneRole()` (line 77-109): after resolving `sourceRole` (line 83), add a check — if `sourceRole.key === 'clinic_admin'`, throw `ForbiddenError` (403) before any further work (existing-name check, permission-filtering, `createRole` call). Defense-in-depth backstop behind the frontend change in URA-3 (D-4: Admin must stay a hard boundary, never leak into custom roles via clone).
- **Test proves done:** new test in `roleManagement.test.ts` (or equivalent) — `cloneRole('clinic_admin', ...)` (or the route-level `POST` equivalent) returns 403 regardless of caller's own permission set (even a user who holds every permission Admin holds cannot clone Admin itself — the rule is on the *source role identity*, not on the caller's power); cloning any other system role (`doctor`, `clinic_staff`) is unaffected (regression check).

### T-URA-2.5 Controllers: zod schema updates
- **Files:** `src/backend/controllers/user.controller.ts` — request-body schemas for create/update-user endpoints change `role: z.string()` → `roleId: z.number().int().positive()`. `src/backend/controllers/role.controller.ts` — confirm no schema references the legacy `role` string (cloneRole takes a role *name*, unaffected by this change per design doc, verify at write-plan).
- **Test proves done:** extend the relevant controller-level contract test — a request body with the old `role: 'doctor'` shape is now rejected with the standard 400 validation-error shape (proves no silent backward-compatible acceptance of the dead shape); a request with `roleId: <valid id>` succeeds.

**AC-URA-2:** Given a Clinic Admin calls `PUT /users/:id` with a `roleId` pointing at a custom role cloned from Doctor, when the target user is not the tenant's primary admin, then the update succeeds and the response's `role` object reflects the new custom role. **Negative/authorization case:** given the target user IS the tenant's primary admin (lowest-id `clinic_admin`-keyed user), when any caller (including another admin) attempts to change that user's `roleId` to any role whose `key !== 'clinic_admin'`, then the request is rejected 403 exactly as today's string-based guard rejects it — this is the regression this task must NOT introduce (guard must keep working identically post-migration, per design doc D-2 rationale).

---

## URA-3 — Frontend: unify the Edit User modal into one RBAC-backed listbox

**Objective:** Replace the two-UI role assignment (hardcoded 3-option `<select>` + separate `RolePicker` "Roles" section) with a single listbox sourced from the same RBAC `Role` table that already powers custom-role cloning — closing the reported bug (cloned roles invisible in the listbox) at its actual origin.

### T-URA-3.1 `UserManagementTab.tsx`: unified listbox
- **Files:** `src/frontend/src/views/admin/UserManagementTab.tsx` — replace the hardcoded 3-option `<select>` with a listbox populated from `useClinicRolesQuery()` (existing hook, currently used by `RolePicker`), filtered through `isGrantable()` (relocated per T-URA-4.1). Hide the `clinic_admin`-key role from the list when `isNew` (matches current new-user-creation behavior exactly per D-5 — no new flagging system). Remove the entire "Roles" section block (`<Can perm="staff.assign_role"><RolePicker .../></Can>` and surrounding `<hr>`s).
- **Test proves done:** extend `UserManagementTab.test.tsx` — the listbox renders every role returned by `useClinicRolesQuery()` including a cloned custom role (reproduces the exact reported-bug scenario: "Accountant" now appears); the `clinic_admin` role option is absent when creating a new user; the "Roles" section / `RolePicker` no longer renders anywhere in this component (grep/DOM-query regression guard).

### T-URA-3.2 `UserManagementTab.tsx`: self-demotion confirmation
- **Files:** `src/frontend/src/views/admin/UserManagementTab.tsx` — reuse `RolePicker`'s `SelfDemotionDialog` + `isAdminLevelRole()` heuristic (moved/imported per T-URA-4.1 if `RolePicker.tsx` is deleted before this lands — confirm ordering at write-plan); trigger it when the acting user changes their *own* `roleId` away from an admin-level role via the unified listbox.
- **Test proves done:** extend `UserManagementTab.test.tsx` — acting user selecting a non-admin role for themselves in the listbox shows the confirmation dialog before submit; confirming proceeds with the change; canceling reverts the listbox selection; changing a *different* user's role never triggers this dialog (scope check — self-only).

### T-URA-3.3 `UserManagementTab.tsx`: `isPrimaryAdmin`-flag-driven UI
- **Files:** `src/frontend/src/views/admin/UserManagementTab.tsx` — `primaryAdminId` computation switches from client-side `users.filter(u => u.role === 'admin')` to reading the `isPrimaryAdmin` boolean added to the API response in T-URA-2.3. `ROLE_COLORS`/`AVATAR_BG` keep the 3 existing keyed colors for `clinic_admin`/`doctor`/`clinic_staff` and add one neutral fallback style for any other (custom) role — no per-role color picker (explicit out-of-scope per design doc).
- **Test proves done:** extend `UserManagementTab.test.tsx` — the locked/primary-admin icon renders on exactly the user whose API response has `isPrimaryAdmin: true`, not derived from any local role-string comparison (regression guard: mock a response where a *non-lowest-id* user also holds `clinic_admin` role and confirm the icon does NOT appear on them, proving the client trusts the server flag); a user with a custom (non-system) role renders the neutral fallback badge color, not an error or blank badge.

### T-URA-3.4 `RoleList.tsx`: hide Clone button for the Admin role row
- **Files:** `src/frontend/src/views/clinic/RoleEditorView.tsx` (confirm `RoleList.tsx` is a sub-component within this file or a separate file at write-plan — design doc names it `RoleList.tsx`) — remove the "Clone" button specifically for the row where `role.key === 'clinic_admin'` (currently shown for any `role.isSystem` row); Doctor and Staff system-role rows keep their Clone button unchanged.
- **Test proves done:** extend `RoleEditorView.test.tsx` (or `RoleList`-specific test) — the Admin system-role row renders without a Clone button/action; Doctor and Staff system-role rows still render theirs (regression check); this is the frontend half of the URA-2.4 backend backstop — both must independently hold (defense-in-depth means a test proving the UI hides it AND a separate test proving the API rejects it even if the UI were bypassed).

**AC-URA-3:** Given a Clinic Admin opens Edit User for a staff member, when they open the role listbox, then it shows every role available to the tenant — the 3 system roles (Admin hidden only if `isNew`) plus every custom cloned role (e.g. "Accountant") — sourced from one list, not two separate UI sections. **Negative/authorization case:** given a non-admin user without `staff.assign_role` permission views (or is routed to) this screen, then the role listbox is not editable/visible per the existing `<Can perm="staff.assign_role">` guard convention (verify this guard is preserved on the unified listbox, not accidentally dropped when the `RolePicker`-wrapping `<Can>` block was removed — this is the single highest-risk regression in URA-3, flag explicitly for `/grill-with-docs`).

---

## URA-4 — Shared helper extraction + dead-code cleanup

**Objective:** `isGrantable()` currently lives inside `RolePicker.tsx`; both the old "Roles" section and the new unified listbox need it, so it must be extracted before `RolePicker.tsx` can be safely deleted.

### T-URA-4.1 Extract `isGrantable()` into a shared helper
- **Files:** new/existing shared location — `src/frontend/src/hooks/useUserRoles.ts` or `src/frontend/src/utils/roles.ts` (exact choice deferred to write-plan per design doc's own "e.g." hedge) — move `isGrantable()` (currently in `RolePicker.tsx`) here unchanged in behavior; both `RolePicker.tsx` (if still present transitionally) and `UserManagementTab.tsx` import from the shared location.
- **Test proves done:** unit test on the extracted `isGrantable()` covering its existing behavior (permission-subset check — caller can only see/grant roles whose permissions are a subset of their own, per `anemal-rbac-matrix` custom-role safety rule #1) migrates unchanged from wherever it's currently tested; `UserManagementTab.test.tsx` (T-URA-3.1) imports and exercises the same shared function, not a re-implementation.

### T-URA-4.2 Delete `RolePicker.tsx` and its now-unused mutations
- **Files:** `src/frontend/src/views/admin/RolePicker.tsx` (or wherever it resides — confirm at write-plan) — delete the file and its `useAssignRoleMutation`/`useRemoveRoleMutation` hooks **only if** a repo-wide search confirms `UserManagementTab.tsx` was the only call site (design doc: "not blocking this change if something else still references them" — so this task is conditional, not required for URA-1..3 to ship).
- **Test proves done:** repo-wide grep for `RolePicker`/`useAssignRoleMutation`/`useRemoveRoleMutation` returns zero remaining references before deletion; if any remain, this task is deferred to backlog (documented, not silently dropped) and URA-3 ships with `RolePicker.tsx` present-but-unused.

**AC-URA-4:** Given `isGrantable()` is extracted, when both the Role Editor's clone flow and the unified Edit User listbox filter available roles, then they produce identical results for the same caller/permission-set (single implementation, no drift — this is the same class of bug this whole feature fixes, applied preventively to the new shared logic).

---

## Cross-cutting requirements (all tasks)

- **Permissions:** no new permission codes. Role assignment continues to ride `staff.assign_role` (existing, per `anemal-rbac-matrix` — verify guard survives the `RolePicker` removal, called out as the top URA-3 risk above). Role cloning continues to ride whatever permission currently guards `POST` clone (confirm at write-plan) plus the new server-side Admin-source rejection (URA-2.4). Deny-by-default preserved.
- **Multi-tenancy:** `roleId` resolution (`roleRepo.findRoleById`, `findPrimaryAdminId`) must remain tenant-scoped exactly as today — `@db-agent` reviews the migration (URA-1) and any repository-layer changes; `@qa-agent` runs isolation tests confirming a `roleId` from tenant A cannot be assigned to a user in tenant B.
- **RBAC regression coverage (per `anemal-rbac-matrix` review checklist):** each of the 3 system roles keeps its existing effective access after the migration (no permission drift from the column drop — permissions were already sourced from `Role.key`, so this should be a no-op, but must be proven, not assumed).
- **i18n:** no new user-facing copy identified in the design doc beyond existing listbox/role labels already localized; flag at write-plan if any new string (e.g. a "role cannot be cloned" error toast) is needed.
- **Design system:** unified listbox keeps existing 44×44px touch targets (Compassionate Care System) — no new component, existing `<select>`/listbox pattern reused.
- **Test-file blast radius:** design doc warns ~51 test files reference `role` in some form. This task set does not enumerate each one — `/write-plan` must produce or reference a concrete file list before Ponytail Gate, since this is the single largest risk to the ≤15-files criterion.

---

## Open questions for `@ba-agent` (Step 3 validation)

| # | Question | Why it matters |
|---|---|---|
| OQ-1 | The design doc's D-1 ("single role per user, not multi-role") appears to conflict with `anemal-functional-reqs`' documented FR-14b/CR-01 ("A clinic user may hold multiple roles... effective permissions = union") and `anemal-rbac-matrix`'s "Multi-role users (CR-01)" section, which describes `user_roles` as already supporting N roles per user with union-of-permissions resolution. Is D-1 a deliberate, scoped-down product decision for *this* modal only (i.e., the UI still only lets an admin pick one role even though the underlying `user_roles` join table could hold more), or does it contradict a previously shipped/planned capability? | If `user_roles` already allows multiple rows per user in production and any code path relies on that, forcing the Edit User modal to single-select could silently strip additional roles on next save (`replaceUserRole` is a single-role replace per the design doc itself, D-3 rationale calls this out as "still correct for single-role replace" — confirm no user in production currently holds >1 role, or this "still correct" claim is false and is itself the highest-severity risk in this entire change). |
| OQ-2 | D-3 mandates dropping `User.role` and `LegacyRole` enum with "no dual-write period" in the same deploy window as the backend `roleId` changes. Is a single combined deploy (backend + migration same window) acceptable given `roleId` is currently nullable and any in-flight request during deploy that still sends the legacy `role` string would 400 under the new schema? What is the rollback plan if URA-1's migration needs to be reverted post-deploy (column drop is not trivially reversible without a backup restore)? | CLAUDE.md multi-tenancy is ABSOLUTE and this is a schema change touching every tenant's `users` table; @db-agent sign-off should explicitly address rollback, not just forward migration. |
| OQ-3 | T-URA-2.3 adds `isPrimaryAdmin` to `listUsers`/`getUserById` responses. Does any existing frontend code (outside `UserManagementTab.tsx`) currently parse the `role` field as a bare string and would break silently (not just visibly) when it becomes a nested object? | Design doc scopes the frontend change to `UserManagementTab.tsx` + `RolePicker.tsx` + `RoleList.tsx`, but the backend response-shape change (string → object) is global to every consumer of `GET /users`/`GET /users/:id` — a repo-wide search for other consumers should happen before write-plan, not be discovered at QA. |
| OQ-4 | Confirm the exact guard-preservation requirement flagged in AC-URA-3's negative case — does `staff.assign_role` currently gate the *entire* role-editing control, or only the separate "Roles" section that is being deleted? If the legacy `<select>` was editable by anyone who could open Edit User (i.e., gated by a broader "can edit users" permission, not `staff.assign_role` specifically), the unified listbox's permission gating needs to be decided, not assumed to inherit `RolePicker`'s guard. | This is the single highest-risk regression identified in this task breakdown (top of URA-3) — a permission-gating mistake here is a security regression, not just a UX bug, and must be resolved before `/grill-with-docs` treats it as closed. |

---

## Dependencies

- URA-2.* depends on URA-1.1/URA-1.2 (migration) landing first — `roleId` must be NOT NULL before backend code can drop its nullable-handling paths.
- URA-2.2 (lockout guard re-point) depends on URA-2.1 (`roleId`-based create/update) landing first — the guard's new signature needs `roleId` to already be the accepted shape.
- URA-3.1/3.2/3.3 depend on URA-2.3 (`isPrimaryAdmin` flag + `role` object in response) and URA-2.1 (`roleId` accepted on write) landing first.
- URA-3.4 depends on URA-2.4 (backend clone-rejection) landing first if the two are to ship together as defense-in-depth (design doc frames backend as primary, frontend as backstop — sequencing confirmed at write-plan).
- URA-4.1 (extract `isGrantable()`) must land before URA-3.1 (unified listbox needs the shared helper) and before URA-4.2 (deletion needs the extraction done first).
- URA-4.2 is conditional (see task) and does not block URA-1..3 shipping.
- OQ-1 through OQ-4 must be resolved at Step 3 (`@ba-agent` sign-off) before `/grill-with-docs` (Step 3.5) — OQ-1 and OQ-4 in particular are not administrative questions, they are potential design-correctness gaps that `/grill-with-docs` should stress-test explicitly if @ba-agent's answer doesn't fully close them.
