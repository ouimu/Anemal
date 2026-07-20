# Unify User Role Assignment — Tasks + Acceptance Criteria

Date: 2026-07-20 · Step 2 (@pm-agent) · **Revised 2026-07-20 to fold in BA sign-off CORR-1..CORR-5**
Input: `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-design.md` (amended same day with D-7, D-8), `docs/superpowers/specs/2026-07-20-unify-user-role-assignment-ba-signoff.md` (commit `9349cbe`)
Status: **BA sign-off GRANTED — APPROVE WITH CHANGES** (verdict: CORR-1..CORR-5 binding on this doc and `/write-plan`). This revision folds all five corrections in. Ready for `/grill-with-docs` (Step 3.5, MANDATORY) — per the sign-off doc, grill now **stress-tests** the OQ-1 supersession (D-7) and F-1 auth-plane decision (D-8) rather than deciding them fresh; both are named agenda items for that session, not settled facts to skip past.

FR reference: FR-14 (Authorization/RBAC — permission catalogue, system roles, configurable custom roles, deny-by-default), FR-01 (Auth & Authorization — user management). **FR-14b/CR-01 (multi-role) is being retired by this change** — see URA-5 (doc supersession) and the former OQ-1, now resolved as D-7. Origin: bug report — cloned custom role ("Accountant") invisible in Clinic Admin → Edit User's role listbox, caused by two independent role-storage systems (`User.role` legacy enum vs RBAC `Role`/`UserRole` tables) both feeding the same modal. BA's independent DB verification (2026-07-20) additionally found this is not a hypothetical bug: `doctor_a` (userId 2) actively holds **two** roles (`Doctor` + custom `Accountant`) in the dev DB today — the exact scenario the bug reporter created.

## Scope summary (Ponytail pre-check) — revised post-BA-signoff

| Metric | Count | Limit |
|---|---|---|
| New endpoints | **0 added.** **2 REMOVED** (`POST /clinic/roles/users/:userId/roles`, `DELETE /clinic/roles/users/:userId/roles/:roleId` — CORR-1.3, D-7) | ≤3 |
| Migrations | 1 combined migration: multi-role collapse (D-7) + `roleId` NOT NULL + drop `User.role`/`LegacyRole` (unchanged from original, now with a pre-migration collapse/report step folded in) | — |
| Subsystems | 3 (DB schema, backend user/role/auth services, frontend Edit User + Role Editor + Admin Branches UI) — **auth plane (`auth.service.ts`) now explicitly in scope per D-8/F-1**, was omitted in the original design doc | ≤3 |
| Core files touched | Backend: `user.service.ts`, `role.service.ts`, `auth.service.ts` (new), `user.controller.ts`, `role.controller.ts`, `user.repository.ts`, `role.routes.ts` (endpoint removal), migration script + report tooling (new). Frontend: `UserManagementTab.tsx`, `RolePicker.tsx` (delete), `RoleList.tsx`/`RoleEditorView.tsx`, `AdminBranches.tsx` (new — doctor-filter fix), `AdminUsers.tsx` (new — deletion, dead code) + its i18n test (deletion). Docs: `anemal-functional-reqs` SKILL.md, `anemal-rbac-matrix` SKILL.md + `permission-matrix.md` (new — doc supersession). **Net file count likely still trips ≤15 even after this revision — deletions (RolePicker, AdminUsers, i18n test) partially offset additions (auth.service.ts, migration script, doc updates); exact count deferred to `/write-plan` per F-2/CORR-5.** | ≤15 (flag for Ponytail Gate, unchanged conclusion from original draft, reasons updated) |
| New dependencies | 0 | ≤5 |
| New files | Migration collapse-script/report tooling (new, required by D-7); `auth.service.ts`'s `toLegacyRoleString()` is a new **function**, not a new file (D-8, option (a)). Shared `isGrantable()`/no-escalation helper extraction (URA-4.1) unchanged. | ≤15 |

**Scope note for Ponytail Gate (updated):** the BA sign-off independently confirms the original draft's warning was, if anything, understated — F-1 found an entire omitted subsystem (`auth.service.ts`, 7+ read sites) and OQ-1 turned into a real, live-data multi-role retirement requiring a migration script + audit report, not just a code change. This further strengthens the case for `/write-plan` splitting into 2 PRs (backend+migration first, frontend second) — now recommend `/write-plan` treat this as the default expectation rather than a contingency, given deletions (2 endpoints, `RolePicker.tsx`, `AdminUsers.tsx`, its i18n test) are now large enough to be their own reviewable unit alongside the schema migration.

**Still out of scope (backlog, do NOT touch — per design doc "Explicitly out of scope", unchanged by BA sign-off):**
- Per-custom-role badge color picker.
- `ClinicLayout.tsx`/`AdminLayout.tsx` admin/clinic menu routing fix (D-6) — separate follow-up. BA sign-off F-1 explicitly confirms option (a) (D-8) does **not** force touching this, keeping D-6 legitimately deferred; option (b) (JWT claim rename) is documented as the future implementation path for that follow-up, not this change.
- "Admin-tier" permission flagging for role-creation-time restrictions (D-5).
- Multi-role-per-user support is no longer merely "out of scope" — it is **being actively retired** by this change (D-7). This is a materially different statement than the original draft's D-1 bullet and must not be read as "unrelated, pre-existing limitation."

---

## URA-1 — Schema: drop legacy `User.role`, collapse multi-role, make `roleId` authoritative

**Objective:** Eliminate the second, drift-prone role-storage system at the data layer so `roleId` (RBAC `Role`/`UserRole`) is the sole source of truth — closing the root cause of the reported bug — **and** deterministically retire the shipped-but-now-superseded multi-role capability (D-7) without silent data loss.

Verified AS-IS (BA sign-off V1-V3, 2026-07-20, live dev DB `vetclinic_dev`): `User.role` (`LegacyRole` enum) coexists with `User.roleId Int?` (nullable). Multi-role is real and shipped end-to-end (dedicated routes, no-escalation check, `RolePicker` UI, T-5F-03 tests, FR-14b/CR-01 docs) — **not** vestigial flexibility. `permission.service.ts` resolves the **union** of all `user_roles` rows per user.

### T-URA-1.1 Verify zero-NULL `roleId` precondition — **corrected, currently FAILING (CORR-2.3)**
- **Files:** none (verification task) — re-run `backfill-user-roles.ts` against the dev DB; confirm `SELECT COUNT(*) FROM users WHERE "roleId" IS NULL` returns `0` across all tenants.
- **⚠️ Design doc's "backfill already run once, zero NULLs" claim is STALE and REFUTED (BA sign-off V3).** Live dev DB has **5** users with NULL `roleId` right now: `staff_a`, `doctor_a`, `admin_b`, `doctor_b`, `staff_b`. This task is a **hard precondition that currently fails** — treat it as an open blocker, not a formality, and do not let `/write-plan` inherit the design doc's stale assumption. Re-run the backfill script and re-verify before touching T-URA-1.2/T-URA-1.3.
- **@db-agent review required.**
- **Test proves done:** verification query (against tables `users`/`user_roles`/`roles` — **not** `clinic_roles`, per BA sign-off V12/F-2 table-name correction) output captured in the write-plan execution log, showing `0` NULL `roleId` rows post-backfill.

### T-URA-1.2 Multi-role pre-check + collapse-ambiguity scan — **new, extends T-URA-1.1 (CORR-1 survivor-rule pre-check, D-7)**
- **Files:** none (verification/reporting task, feeds T-URA-1.3's script). Query: `SELECT "userId", COUNT(*) FROM user_roles GROUP BY "userId" HAVING COUNT(*) > 1` against every tenant.
- **Purpose:** enumerate every user holding >1 `user_roles` row before the collapse script runs, classifying each into: (a) one system role + one-or-more custom roles → auto-collapsible (system wins), or (b) 2+ system roles, or 2+ custom-only roles with no system role → **ambiguous, halts, goes to the manual-resolution report, migration does not proceed for that tenant until resolved** (D-7 survivor rule, decided by product owner 2026-07-20).
- **Test proves done:** against the live dev DB, this scan must surface at minimum `userId 2` (`doctor_a`: Doctor + Accountant) in bucket (a); the query and its classification logic are unit-testable against a seeded fixture covering all three buckets (single-role/no-op, auto-collapsible, ambiguous).

### T-URA-1.3 Multi-role collapse migration script + audit report — **new (CORR-1.4, D-7 survivor rule)**
- **Files:** new migration-support script (location TBC at write-plan, e.g. `src/backend/prisma/scripts/collapse-multi-role.ts`, following the existing `backfill-user-roles.ts` pattern/location).
- **Behavior (binding, per design D-7 / BA sign-off §3 OQ-1 survivor rule):**
  1. For every user in T-URA-1.2's auto-collapsible bucket: set `roleId` to the **system** role (`isSystem = true`), then delete the user's other `user_roles` row(s). Applied to today's data: `doctor_a` keeps **Doctor**, the **Accountant** assignment is dropped.
  2. For every user in the ambiguous bucket: do **not** touch their `user_roles` rows; emit them into a separate **manual-resolution report**; that tenant's migration does not proceed until an admin resolves it (script must be able to run tenant-by-tenant or skip ambiguous tenants without blocking clean tenants).
  3. **Every collapse is logged**: `userId`, kept role, removed role(s), timestamp. The log/report is attached to the migration PR (per CLAUDE.md doc-tracking convention, @pm-agent references it in the PR description at Step 8).
  4. This step **must run before** T-URA-1.4's `roleId` NOT NULL + column-drop migration, since it is what guarantees "exactly one `user_roles` row per user" going into that step (design doc's "reconcile `user_roles` to exactly one row per user" requirement, CORR-1.4).
- **Test proves done:** run against a seeded fixture reproducing the dev DB's actual state (`doctor_a` holding Doctor+Accountant, plus a synthetic 2-system-role case and a synthetic 2-custom-role case) — asserts (1) the auto-collapsible case ends with exactly one `user_roles` row (the system role) and a log entry recording the removed Accountant role; (2) the two ambiguous cases are left untouched, appear in the manual-resolution report, and do not silently resolve; (3) `permission.service.ts`'s union-of-roles resolution for the collapsed user now reflects only the surviving role's permissions (proves the invisible-standing-permission risk CORR-1.4 was written to close is actually closed, not just that a DB row was deleted).

### T-URA-1.4 Migration: drop `User.role`, drop `LegacyRole` enum, `roleId` → NOT NULL, remove multi-role write endpoints
- **Files:** `src/backend/prisma/schema.prisma` — remove `User.role LegacyRole` column, remove the `LegacyRole` enum entirely, change `User.roleId` from `Int?` to `Int` (NOT NULL). New migration file under `src/backend/prisma/migrations/`, run only after T-URA-1.1 (zero NULLs) and T-URA-1.3 (multi-role collapsed) both pass for a given environment.
- **Files (added, CORR-1.3):** `src/backend/routes/role.routes.ts` — **remove** `POST /clinic/roles/users/:userId/roles` and `DELETE /clinic/roles/users/:userId/roles/:roleId` (lines ~41-44 per BA sign-off V1) and their controller/service handlers. This is a hard requirement, not UI-cleanup-conditional: leaving these routes live after `roleId` becomes single-source-of-truth would let anyone with `staff.assign_role` re-create a multi-role user via direct API call, silently reintroducing the exact drift this change exists to kill (BA sign-off §3 OQ-1 condition 3). `GET /clinic/roles/users/:userId/roles` (read-only) may stay, or collapse into the new `role` object on the user response — decide at write-plan.
- **@db-agent review required** (CLAUDE.md: all DB changes; irreversible column drop across every tenant's `users` table).
- **Down-migration / rollback (CORR-2, OQ-2 resolution — roll-forward-only accepted at pre-launch scale):**
  1. **Backup before migrate, every environment** — `pg_dump` (or volume snapshot) immediately before applying, as an explicit step in this task, not implied.
  2. **Hand-written `down.sql`**, following the repo's existing `rbac_foundation/down.sql` precedent (BA sign-off V13): re-add `role` column + `LegacyRole` enum, repopulate via the **reverse** of `auth.service.ts`'s new mapper (T-URA-2.8) — `clinic_admin`→`'admin'`, `doctor`→`'doctor'`, everything else (incl. `clinic_staff` and every custom role, **including any role a collapse in T-URA-1.3 removed**)→`'staff'`; re-nullable `roleId`. Document explicitly that this is **lossy for custom-role users** (their real role identity does not round-trip) — acceptable for an emergency escape hatch whose actual fallback is the backup, not the down-script.
  3. No dual-write/compat period (confirmed acceptable by BA: no production tenants exist yet, pre-launch, ~7 dev users; in-flight requests sending the old `role: string` shape during the deploy window will 400 — accepted, deploy backend+migration together in one window as already specified).
- **Test proves done:** migration applies cleanly on the seeded dev DB after T-URA-1.1 and T-URA-1.3 both pass; `npx prisma validate` passes; the two removed routes return 404 (not 403 — the route no longer exists) when called; every backend test suite constructing a `User` fixture without `roleId` fails fast at the DB layer (expected, surfaces exactly which fixtures need URA-2/URA-4 updates — treat as scope map, not regression).

**AC-URA-1:** Given the full URA-1 sequence has run (backfill → multi-role collapse → column-drop migration), when any `users` table row is queried, then no `role` column exists, `roleId` is present and non-null for every row, and every user has exactly one `user_roles` row matching their `roleId`. **Negative case:** attempting to insert a `User` row without `roleId` fails at the DB constraint level; attempting to call either removed multi-role write endpoint returns 404; a tenant with an unresolved ambiguous multi-role case (2+ system roles) is excluded from the column-drop migration until manually resolved, per T-URA-1.3.

---

## URA-2 — Backend: `roleId`-based request/response shape, lockout guard re-point, admin-clone lockdown, permission-gate hardening, auth-plane compatibility

**Objective:** Every backend surface that read/wrote the legacy `role` string now reads/writes `roleId`; the primary-admin lockout guard keys off `ClinicRole.key === 'clinic_admin'`; cloning the Admin system role is rejected server-side; the unified listbox's write path gets the permission gate and no-escalation check the legacy `<select>` never had (BA-found security gap); the JWT/login `role` claim keeps working without touching the auth plane's frontend consumers.

### T-URA-2.1 `user.service.ts`: `roleId`-based create/update, drop legacy mapping
*(unchanged from original draft)*
- **Files:** `src/backend/services/user.service.ts` — `createUser`/`updateUser` accept `roleId: number` instead of `role: string`; delete `LEGACY_ROLE_TO_SYSTEM_KEY` map (lines ~18-22, confirmed by BA sign-off V7) and its two lookup call sites (lines ~91-95, ~135-141); both call sites resolve the role row directly via `roleId`.
- **Test proves done:** extend `userManagement.test.ts` — `createUser`/`updateUser` accept `roleId` and persist the correct FK to `roles`; unknown/non-existent `roleId` returns the existing 400-equivalent error; `LEGACY_ROLE_TO_SYSTEM_KEY` identifier no longer exists in the file.

### T-URA-2.2 `user.service.ts`: re-point primary-admin lockout guard
*(unchanged from original draft, BA sign-off V6 confirms line numbers)*
- **Files:** `src/backend/services/user.service.ts` — `assertNotPrimaryAdminDeactivation` (lines ~41-55) changes to accept `change: { isActive?: boolean; roleId?: number }`; guard condition (line 52) loads the target role row for `change.roleId` and compares `role.key !== 'clinic_admin'`. Call sites at lines ~126, ~283 updated.
- **Test proves done:** re-point `user-primary-admin-protection.test.ts`; add case — demoting the primary admin to a custom role cloned from Doctor is still blocked (proves key-comparison, not identity-comparison).

### T-URA-2.3 `user.service.ts`: `safe()` response shape + `isPrimaryAdmin` flag
*(unchanged from original draft)*
- **Files:** `src/backend/services/user.service.ts` — `safe()` returns `role: { id, name, key, isSystem }`; `listUsers`/`getUserById` gain `isPrimaryAdmin: boolean` via `findPrimaryAdminId`.
- **Test proves done:** `GET /users`/`GET /users/:id` responses include the nested `role` object and correct `isPrimaryAdmin` boolean.

### T-URA-2.4 `role.service.ts`: reject cloning the Admin system role
*(unchanged from original draft, BA sign-off V11 confirms current shape has no such check)*
- **Files:** `src/backend/services/role.service.ts` — `cloneRole()` (lines 77-109): after resolving `sourceRole`, throw `ForbiddenError` (403) if `sourceRole.key === 'clinic_admin'`, before any further work.
- **Test proves done:** cloning `clinic_admin` returns 403 regardless of caller's own permission set; cloning `doctor`/`clinic_staff` unaffected.

### T-URA-2.5 Controllers: zod schema updates
*(unchanged from original draft)*
- **Files:** `src/backend/controllers/user.controller.ts` — `role: z.string()` → `roleId: z.number().int().positive()`. `src/backend/controllers/role.controller.ts` — confirm no legacy-string schema remains.
- **Test proves done:** old `role: 'doctor'` shape now rejected (400); `roleId: <valid id>` succeeds.

### T-URA-2.6 Permission gate on the role-change branch — **new (CORR-3, closes BA-found privilege-escalation gap)**
- **Files:** `src/backend/services/user.service.ts` — when `body.roleId` is present on `updateUser` (and on `createUser` if the create listbox offers custom roles), the caller must additionally hold **`staff.assign_role`**, on top of the route's existing `staff.manage` gate on `PUT /users/:id`. Implement as an in-service check on the role-change branch specifically (route-level middleware cannot be conditional on request-body shape). 403 on failure. Name-only edits (no `roleId` in the body) remain `staff.manage`-only — preserves today's "edit name without assign_role" behavior.
- **Why this is required, not optional:** BA sign-off V4/V5 confirmed the legacy `<select>`'s save path (`PUT /users/:id` → `staff.manage`) has **no** `staff.assign_role` check today, unlike the RolePicker path (`role.routes.ts` → `staff.assign_role` + subset check). Under the original tasks-doc draft, the unified listbox would have inherited the weaker gate while also exposing **every** role (not just 3 system roles) — a real escalation path, not a hypothetical one.
- **Test proves done:** a caller holding `staff.manage` but not `staff.assign_role` attempting to change `roleId` via `PUT /users/:id` gets 403; the same caller successfully changing the user's name (no `roleId` in body) still succeeds; a caller holding both permissions succeeds at a role change.

### T-URA-2.7 No-escalation subset check ported into `updateUser`/`createUser` — **new (CORR-3)**
- **Files:** `src/backend/services/user.service.ts` — port the no-escalation subset check that today only exists in `role.service.ts` (lines ~216-225 per BA sign-off V5) into the role-change branch of `updateUser`/`createUser`, or extract it into a shared server-side helper both services call (mirroring URA-4.1's frontend `isGrantable()` extraction, same anti-drift rationale — one implementation, not two that can silently diverge).
- **Test proves done:** a caller with a limited custom role attempting to assign a target role containing a permission they themselves lack → 403; the identical assignment performed by a `clinic_admin`-role caller → 200. Test both `updateUser` and `createUser` role-assignment paths.

### T-URA-2.8 `auth.service.ts`: legacy-compatible JWT `role` claim mapper — **new (CORR-4, design amendment D-8)**
- **Files:** `src/backend/services/auth.service.ts` — the design doc's original file list omitted this service entirely (BA sign-off F-1); it reads `user.role` at 7+ sites (lines ~65, 75, 95, 112, 177, 208, 310 per BA sign-off V8), embedding the legacy string in the JWT `role` claim, every login/refresh/me response, and gating the admin branch-selection bypass (`user.role === 'admin'`, line ~65).
- **Implementation (option (a), the BA-recommended and product-owner-decided path — D-8):** add one private helper `toLegacyRoleString(roleKey: string): 'admin' | 'doctor' | 'staff'` — `clinic_admin`→`'admin'`, `doctor`→`'doctor'`, **everything else** (including `clinic_staff` and every custom/cloned role) →`'staff'`. Route all 7+ `user.role` reads through it; auth-path user lookups add `include: { roleRef: { select: { key: true } } }` (or equivalent) to have `roleKey` available; the admin branch-selection bypass keys off the mapper's output instead of the dropped column directly.
- **Explicitly NOT in scope for this task (that is option (b), the D-6 follow-up):** renaming the JWT claim to `roleKey`, touching `JwtPayload`, `ClinicLayout.tsx`, `AdminLayout.tsx`, `useAuth.ts`, `SettingsLayout.tsx`, `BranchSwitcher.tsx`, `LoginView.tsx`, `PreferencesPage.tsx`, `ProfileMenu.tsx`, `authStore.ts`, or `rbac.middleware.ts` (the nine V9 frontend files + one dead backend file) — all nine stay byte-identical input-contract-wise under option (a); do not touch them in this task.
- **Test proves done:** admin login still skips branch selection (regression on the bypass); a custom-role (`Accountant`) user logs in, receives claim `role: 'staff'`, routes to the clinic (non-admin) dashboard, and their **real** permissions still resolve correctly via the unchanged `permSetVersion`/permission-resolution path (i.e., the mapped claim affects only routing/display, never authorization — permission checks must never read this claim, confirm they don't). Explicitly accepted, documented consequences (not defects): (1) `ProfileMenu.tsx` displays the mapped word ("staff") for a custom-role user, not their real role name ("Accountant") — cosmetic, deferred to the D-6 follow-up; (2) a custom-role user cloned from Doctor still routes to the clinic dashboard, identical to today's behavior for `'staff'`/`'doctor'` legacy strings.

### T-URA-2.9 `rbac.middleware.ts:13` dead-code check — **new, minor (BA sign-off V9)**
- **Files:** `src/backend/middlewares/rbac.middleware.ts` — BA sign-off flagged line 13 as referenced only by its own unit test, a deletion candidate. Confirm at write-plan whether this is truly dead (zero non-test references) before deleting; if any live reference is found, leave it and note why.
- **Test proves done:** repo-wide grep confirms zero non-test references before any deletion; if deleted, its own unit test is deleted with it (no orphaned test file).

**AC-URA-2:** Given a Clinic Admin holding both `staff.manage` and `staff.assign_role` calls `PUT /users/:id` with a `roleId` pointing at a custom role cloned from Doctor, when the target user is not the tenant's primary admin and the assigned role's permissions are a subset of the caller's own, then the update succeeds and the response's `role` object reflects the new custom role. **Negative/authorization cases (three, all must hold):** (1) a caller holding `staff.manage` but lacking `staff.assign_role` attempting any `roleId` change gets 403 (T-URA-2.6); (2) a caller holding `staff.assign_role` but attempting to assign a role whose permissions exceed their own gets 403 (T-URA-2.7); (3) any caller (including another admin) attempting to change the tenant's primary-admin user's `roleId` to a role whose `key !== 'clinic_admin'` gets 403 exactly as today's string-based guard rejects it (T-URA-2.2 — must not regress).

---

## URA-3 — Frontend: unify the Edit User modal, fix downstream role-shape consumers

**Objective:** Replace the two-UI role assignment with a single RBAC-backed listbox, close the client-side gate gap the server-side URA-2.6/2.7 changes now also enforce, and fix (or delete) every frontend consumer of the `role` field shape change identified by BA's OQ-3 sweep.

### T-URA-3.1 `UserManagementTab.tsx`: unified listbox — **gate requirement strengthened (CORR-3)**
- **Files:** `src/frontend/src/views/admin/UserManagementTab.tsx` — replace the hardcoded 3-option `<select>` (currently **unwrapped by any `<Can>` guard at all**, per BA sign-off V4 — lines ~101-109 and the Edit-button entry point at ~378-381) with a listbox populated from `useClinicRolesQuery()`, filtered through `isGrantable()` (relocated per T-URA-4.1). Hide the `clinic_admin`-key role from the list when `isNew`. Remove the "Roles" section block (`<Can perm="staff.assign_role"><RolePicker .../></Can>` and surrounding `<hr>`s).
- **Mandatory (was implicit, now explicit per CORR-3):** the unified listbox itself must be wrapped in (or otherwise gated by) `<Can perm="staff.assign_role">` — the legacy `<select>` never was, and copying that gap forward into a listbox that now exposes every role (not just 3 system roles) would be a client-side echo of the server escalation hole T-URA-2.6/2.7 close. The server-side checks are the actual security boundary; this is defense-in-depth, but it must exist and be tested, not assumed to inherit from `RolePicker`'s old wrapper.
- **Test proves done:** listbox renders every role including a cloned custom role (reproduces the reported bug fix, e.g. "Accountant" now appears); `clinic_admin` option absent when `isNew`; "Roles"/`RolePicker` section no longer renders; **new explicit assertion:** a user without `staff.assign_role` sees the listbox disabled/hidden (not merely relying on the server to reject the write) — this is the test BA sign-off says AC-URA-3's negative case only "gestures at" in the original draft; make it a first-class assertion here.

### T-URA-3.2 `UserManagementTab.tsx`: self-demotion confirmation
*(unchanged from original draft)*
- **Files:** `src/frontend/src/views/admin/UserManagementTab.tsx` — reuse `RolePicker`'s `SelfDemotionDialog` + `isAdminLevelRole()` heuristic; trigger when the acting user changes their own `roleId` away from an admin-level role.
- **Test proves done:** self-role-change to non-admin shows confirmation; confirm proceeds, cancel reverts; changing a different user's role never triggers it.

### T-URA-3.3 `UserManagementTab.tsx`: `isPrimaryAdmin`-flag-driven UI
*(unchanged from original draft)*
- **Files:** `src/frontend/src/views/admin/UserManagementTab.tsx` — `primaryAdminId` reads the server `isPrimaryAdmin` flag (T-URA-2.3) instead of client-side `role === 'admin'` filtering. `ROLE_COLORS`/`AVATAR_BG` keep 3 keyed colors + one neutral fallback for custom roles.
- **Test proves done:** lock icon renders on exactly the `isPrimaryAdmin: true` user (mock a case where a non-lowest-id user also holds `clinic_admin` and confirm icon does NOT appear there); custom-role user renders neutral fallback badge.

### T-URA-3.4 `RoleList.tsx`: hide Clone button for the Admin role row
*(unchanged from original draft)*
- **Files:** `src/frontend/src/views/clinic/RoleEditorView.tsx` (confirm `RoleList.tsx` location at write-plan) — remove Clone button for `role.key === 'clinic_admin'` row only; Doctor/Staff system rows keep theirs.
- **Test proves done:** Admin row has no Clone action; Doctor/Staff rows still do. Frontend half of the URA-2.4 backend defense-in-depth pair.

### T-URA-3.5 `AdminBranches.tsx:206` doctor-filter fix — **new (CORR-5, BA sign-off OQ-3)**
- **Files:** `src/frontend/src/views/admin/AdminBranches.tsx` (line ~206) — `users.filter(u => u.role === 'doctor')` silently breaks once `role` becomes `{ id, name, key, isSystem }` (filter matches nothing, doctor picker renders empty, **no error thrown** — this is a silent-break class of bug, exactly the kind this whole change is meant to eliminate, not reintroduce). Fix to `u.role.key === 'doctor'`.
- **⚑ Flag for `/grill-with-docs`:** a custom role cloned from Doctor will have a tenant-scoped key (e.g. `tenant_1_senior_vet`), not literally `'doctor'`, so key-match preserves today's exact behavior (only the literal system Doctor role appears in this picker) but does **not** include custom vet-type roles. Whether the doctor picker should instead match on a permission (e.g. holders of `emr.edit`) is a real product question the design doc didn't address — BA sign-off raises it explicitly, grill session should decide key-match (matches current scope, ship as-is) vs permission-match (larger change, likely backlog) rather than this task silently picking one.
- **Test proves done:** doctor picker renders the same set of users pre- and post-migration for today's data (regression guard using key-match); explicit test asserting a user with a non-`doctor`-key custom role is excluded, documenting the current (key-match) behavior so a future permission-match change is a deliberate diff, not a silent one.

### T-URA-3.6 Delete `AdminUsers.tsx` (dead code) + its i18n test — **new (CORR-5, BA sign-off OQ-3)**
- **Files:** `src/frontend/src/views/admin/AdminUsers.tsx` (confirm exact path at write-plan) — legacy full user-management screen, **not routed** in `App.tsx` (superseded by `UserManagementTab.tsx`), referenced only by `AdminViews.i18n.test.tsx`. Reads `u.role` as a string and writes `role: form.role` on POST/PUT at multiple lines (BA sign-off: `:22,29,30,66,73-74,116,166,179-180`) — under the new zod schema (T-URA-2.5) its writes would 400, and its TS types break outright once `role` becomes an object. BA sign-off recommendation: **delete**, not update — it is a second, drifted copy of the exact modal this change unifies, i.e. the same disease.
- **Files:** its dedicated i18n test (`AdminViews.i18n.test.tsx` or the relevant subset within it) deleted alongside.
- **Test proves done:** repo-wide grep confirms `AdminUsers.tsx` has zero non-test references (route table, imports) before deletion; the deleted i18n test's remaining assertions (if the test file also covers other still-live admin views) are preserved, not wholesale-deleted if the file is shared.

### T-URA-3.7 `ClinicGrooming.tsx:78` dead query param — **optional cleanup, not blocking (BA sign-off OQ-3)**
- **Files:** `src/frontend/src/views/clinic/ClinicGrooming.tsx` (line ~78) — `api.get('/users?role=staff')`; the `?role=` param is already ignored server-side (`listUsers` takes no role filter) and the component never reads `u.role`, so there is no functional break. Optional: drop the dead param while touching nearby code. Not required for this change to ship; may be deferred.
- **Test proves done:** N/A if deferred; if done, confirm the API call still returns the expected user list with the param removed.

**AC-URA-3:** Given a Clinic Admin holding `staff.assign_role` opens Edit User for a staff member, when they open the role listbox, then it shows every role available to the tenant — sourced from one list, not two — with the listbox itself visibly gated by `staff.assign_role` (T-URA-3.1). **Negative/authorization case:** given a user without `staff.assign_role`, the listbox is disabled/hidden client-side (T-URA-3.1) **and** any attempted direct API write is independently rejected server-side (T-URA-2.6/2.7) — both layers tested, neither assumed to cover for the other. **Regression case:** the Admin Branches doctor picker (T-URA-3.5) and the deletion of `AdminUsers.tsx` (T-URA-3.6) do not change any other screen's behavior for today's data.

---

## URA-4 — Shared helper extraction + dead-code cleanup

*(largely unchanged from original draft; URA-4.2's conditionality is now more clearly bounded by URA-3.6's separate, unconditional `AdminUsers.tsx` deletion — the two are different files, do not conflate them)*

### T-URA-4.1 Extract `isGrantable()` into a shared helper
- **Files:** `src/frontend/src/hooks/useUserRoles.ts` or `src/frontend/src/utils/roles.ts` (exact choice deferred to write-plan) — move `isGrantable()` out of `RolePicker.tsx` unchanged in behavior; both the (transitional, if still present) `RolePicker.tsx` and `UserManagementTab.tsx` import from the shared location.
- **Test proves done:** unit test on the extracted function covers its existing subset-check behavior unchanged; `UserManagementTab.test.tsx` (T-URA-3.1) exercises the same shared function, not a re-implementation.

### T-URA-4.2 Delete `RolePicker.tsx` and its now-unused mutations — conditional, unchanged from original draft
- **Files:** `src/frontend/src/views/admin/RolePicker.tsx` — delete the file and its `useAssignRoleMutation`/`useRemoveRoleMutation` hooks **only if** a repo-wide search confirms `UserManagementTab.tsx` was the only call site. Note: since URA-1.4 removes the backend endpoints these mutations call, `useAssignRoleMutation`/`useRemoveRoleMutation` become dead regardless of whether `RolePicker.tsx` itself is deleted — flag this at write-plan as a forcing function (the mutations can no longer function once the endpoints are gone, independent of UI cleanup timing).
- **Test proves done:** repo-wide grep for `RolePicker`/`useAssignRoleMutation`/`useRemoveRoleMutation` returns zero remaining references before deletion; if any remain, deferred to backlog (documented).

**AC-URA-4:** Given `isGrantable()` is extracted, when both the Role Editor's clone flow and the unified Edit User listbox filter available roles, then they produce identical results for the same caller/permission-set.

---

## URA-5 — Documentation supersession (FR-14b / CR-01 multi-role retirement) — **new group (CORR-1.2)**

**Objective:** Update the two skill/spec documents that currently describe multi-role-per-user as a shipped capability, so they never again describe access the product doesn't have — the exact "docs describe a capability the code doesn't have" failure mode this whole change exists to close, now applied to project documentation itself.

### T-URA-5.1 `anemal-functional-reqs` FR-14b update
- **Files:** `.claude/skills/anemal-functional-reqs/SKILL.md` (FR-14b, currently line ~76 per BA sign-off) — mark FR-14b as **retired/superseded** by this change, with a pointer to this tasks doc and the design doc's D-7 amendment. State plainly: users hold exactly one role; combined access is achieved by cloning a role with the right permission mix, not by stacking roles.
- **Test proves done:** N/A (doc-only); reviewed by @ba-agent as part of Step 3.5/Step 7 doc-accuracy checks.

### T-URA-5.2 `anemal-rbac-matrix` CR-01 + permission-matrix.md §5 update
- **Files:** `.claude/skills/anemal-rbac-matrix/SKILL.md` ("Multi-role users (CR-01)" section, currently lines ~65-71) and `references/permission-matrix.md` §5 — replace the "A user holds 1..N roles... union of all assigned roles" description with the single-role model: one `roleId` per user, permission set = that role's permissions only (no union). Update the "Custom-role safety rules" list if any rule's wording assumed multi-role (e.g. rule #3 "a user must always have a role" stays true, but any union-specific phrasing is corrected).
- **Test proves done:** N/A (doc-only); @qa-agent's RBAC review checklist (per `anemal-rbac-matrix` "Review checklist") is re-read against the corrected doc during Step 7 to confirm no test still asserts union-of-multiple-roles behavior as expected/passing.

**AC-URA-5:** Given URA-1..URA-4 have shipped, when any engineer reads `anemal-functional-reqs` or `anemal-rbac-matrix`, then neither document describes multi-role-per-user as current or planned behavior — both explicitly state single-role-per-user with a dated note pointing to this change as the retirement point.

---

## Cross-cutting requirements (all tasks)

- **Permissions:** no new permission *codes* introduced, but the **enforcement surface changes materially** — `staff.assign_role` now gates the role-change branch of `PUT /users/:id`/`POST /users` in addition to its existing gate on the (now-removed) multi-role routes (T-URA-2.6); a no-escalation subset check now exists on that same branch server-side (T-URA-2.7), closing a gap that existed even before this change (BA sign-off V5). Deny-by-default preserved throughout.
- **Multi-tenancy:** `roleId` resolution (`roleRepo.findRoleById`, `findPrimaryAdminId`) remains tenant-scoped exactly as today — `@db-agent` reviews the migration (URA-1, including the collapse script T-URA-1.3) and any repository-layer changes; `@qa-agent` runs isolation tests confirming a `roleId` from tenant A cannot be assigned to a user in tenant B, and that the multi-role collapse script (T-URA-1.3) never cross-references `user_roles` rows across tenants.
- **RBAC regression coverage (per `anemal-rbac-matrix` review checklist):** each of the 3 system roles keeps its existing effective access after the migration; additionally, per T-URA-1.3's test requirement, the collapsed multi-role user (`doctor_a`) must be proven to have **lost** the Accountant-specific permissions post-collapse (not retained invisibly via a stray `user_roles` row) — this is the single most safety-critical test in the whole task set per BA sign-off CORR-1.4.
- **i18n:** no new user-facing copy identified beyond existing listbox/role labels already localized; flag at write-plan if the manual-resolution report (T-URA-1.3) or any new error toast (e.g. a 403 from T-URA-2.6/2.7) needs new Thai/English keys.
- **Design system:** unified listbox keeps existing 44×44px touch targets — no new component.
- **Test-file blast radius:** design doc + BA sign-off both warn of a large existing-test-file footprint (~51 files referencing `role`). This task set does not enumerate each one — `/write-plan` must produce a concrete file list before Ponytail Gate.
- **Doc supersession (new, CORR-1.2):** URA-5 is not optional cleanup — it is a binding condition of BA sign-off, on equal footing with the code changes, and must not be dropped if `/write-plan` splits this into multiple PRs.

---

## Open questions — status after BA sign-off (2026-07-20)

All four original open questions are **resolved** by the BA sign-off and recorded as design-doc amendments D-7/D-8. Per the sign-off doc's own framing, `/grill-with-docs` (Step 3.5, next) now **stress-tests** these resolutions rather than deciding them fresh — they are not rubber-stamped, they are the named agenda items for that session.

| # | Original question | Resolution | Binding artifact |
|---|---|---|---|
| OQ-1 | Does D-1 (single role) regress shipped FR-14b/CR-01 multi-role? | **YES, confirmed regression of live, exercised capability** (`doctor_a` holds 2 roles today). Accepted as a deliberate, documented supersession — not a silent narrowing — conditional on the 4-part CORR-1 package (doc supersession URA-5, endpoint removal T-URA-1.4, collapse script + report T-URA-1.2/1.3, all folded into this doc). Survivor rule (system role wins; ambiguous cases halt into a manual report) decided by product owner same day. | Design doc D-7; this doc URA-1, URA-5 |
| OQ-2 | Rollback plan for the irreversible `User.role` column drop? | Roll-forward-only accepted at pre-launch scale (no production tenants), conditional on backup-before-migrate + hand-written lossy `down.sql` + T-URA-1.1's currently-failing precondition being genuinely re-verified, not assumed. | This doc T-URA-1.4 |
| OQ-3 | Other consumers of `GET /users`' `role` field beyond `UserManagementTab.tsx`? | Four found: `AdminBranches.tsx` (silent break, fixed T-URA-3.5), `AdminUsers.tsx` (dead code, deleted T-URA-3.6), `ClinicGrooming.tsx` (no break, optional cleanup T-URA-3.7), `AdminAudit.tsx` (no break, no action). Plus the **auth-plane** family (7+ sites, distinct question) → see F-1/D-8 below. | This doc T-URA-3.5, T-URA-3.6, T-URA-3.7 |
| OQ-4 | Does `staff.assign_role` gate the legacy `<select>`? | **NO** — confirmed gap. The unified listbox as originally tasked would have shipped a real privilege-escalation path (every role exposed, weaker `staff.manage`-only server gate, no subset check). Closed by CORR-3: T-URA-2.6 (permission gate), T-URA-2.7 (no-escalation check), T-URA-3.1 (explicit client-side `<Can>` assertion). | This doc T-URA-2.6, T-URA-2.7, T-URA-3.1 |
| F-1 (new) | Design doc omitted `auth.service.ts` (JWT `role` claim, admin-login bypass) — dropping the column breaks login/compile. | Option (a) — legacy-string mapper confined to `auth.service.ts`, byte-identical JWT contract, zero frontend changes, D-6 stays deferred — recommended by BA, decided by product owner. Option (b) (JWT claim rename) documented as the future D-6 follow-up path, not this change. | Design doc D-8; this doc T-URA-2.8 |

---

## Dependencies

- T-URA-1.2 (multi-role pre-check) depends on T-URA-1.1 (zero-NULL `roleId`) — both must pass before T-URA-1.3 runs.
- T-URA-1.3 (collapse script) depends on T-URA-1.2's classification output; must complete (or explicitly skip ambiguous tenants) before T-URA-1.4 (NOT NULL + column drop + endpoint removal) runs.
- URA-2.* depends on T-URA-1.4 landing first — `roleId` must be NOT NULL and the legacy column gone before backend code can drop its nullable-handling paths.
- T-URA-2.2 (lockout guard re-point) depends on T-URA-2.1 (`roleId`-based create/update) landing first.
- T-URA-2.6/T-URA-2.7 (permission gate + no-escalation check) should land together — a permission gate without the subset check, or vice versa, leaves half the escalation hole open.
- T-URA-2.8 (auth mapper) has **no dependency** on T-URA-2.1..2.7 — it reads `roleRef.key` directly and can be implemented/tested independently, but must land in the same deploy window as T-URA-1.4 (column drop) since `auth.service.ts` reads the dropped column today and would break compile otherwise.
- URA-3.1/3.2/3.3 depend on T-URA-2.3 (`isPrimaryAdmin` + `role` object) and T-URA-2.1 (`roleId` accepted on write); T-URA-3.1 additionally depends on T-URA-2.6/2.7 landing in the same window (client gate + server gate should ship together, not client-first-server-later, to avoid a window where the UI implies a permission boundary the server doesn't yet enforce).
- T-URA-3.4 depends on T-URA-2.4 (backend clone-rejection) landing first for the defense-in-depth pair to be complete.
- T-URA-3.5 (`AdminBranches.tsx` fix) and T-URA-3.6 (`AdminUsers.tsx` deletion) depend on T-URA-2.3 (response shape change) landing — both are consumers of the changed shape.
- URA-4.1 (extract `isGrantable()`) must land before URA-3.1 (unified listbox needs the shared helper) and before URA-4.2.
- URA-4.2 remains conditional on no other call sites, but is now also **forced** once T-URA-1.4 removes the multi-role endpoints (its mutations become non-functional regardless of UI-cleanup timing) — treat as effectively non-optional once T-URA-1.4 ships, not purely conditional as in the original draft.
- URA-5 (doc supersession) has no code dependency but is a binding sign-off condition (CORR-1.2) — must ship in the same change set as URA-1's D-7 collapse, not deferred to a later PR, per BA sign-off framing that all of CORR-1's four parts travel together.
- All items above are inputs to `/grill-with-docs` (Step 3.5, next) — OQ-1's supersession (D-7) and F-1's auth-plane decision (D-8) are explicitly named agenda items per the BA sign-off hand-off, to be stress-tested, not re-litigated from scratch.
