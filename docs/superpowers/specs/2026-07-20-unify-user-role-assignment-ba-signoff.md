# BA Sign-off — Unify User Role Assignment (Edit User Modal)

Date: 2026-07-20
Owner: @ba-agent
Pipeline step: Step 3 of 8 (formal validation + sign-off)
Inputs: `2026-07-20-unify-user-role-assignment-design.md`, `2026-07-20-unify-user-role-assignment-tasks.md`
Method: `anemal-ba-toolkit` working method; every AS-IS claim independently re-verified against code AND the live dev database (docker `vetclinic-pg`, `vetclinic_dev`, queried 2026-07-20) — nothing taken from the design spec on trust.

---

## 1. Verdict

**SIGN-OFF GRANTED (APPROVE WITH CHANGES) — corrections CORR-1..CORR-5 are binding on the tasks doc and `/write-plan`.**

**Updated 2026-07-20 (same day):** the product owner has since (1) confirmed the OQ-1 supersession and decided the multi-role collapse rule (system role wins; ambiguous cases → manual-resolution report — see §3 OQ-1 survivor rule), and (2) asked BA to decide F-1's mechanism — **option (a), auth-confined legacy-string mapper, is the recommendation** (see §4 F-1 option analysis). Both decisions are recorded as design-doc amendments D-7/D-8. `/grill-with-docs` (Step 3.5) still runs next — it now stress-tests these decisions rather than making them. `/write-plan` remains blocked until the grill runs and all remaining findings are resolved.

---

## 2. Independent verification (code + live DB, 2026-07-20)

| # | Claim / question | Verified | Evidence |
|---|---|---|---|
| V1 | Multi-role is **shipped end-to-end**, not unused DB flexibility | CONFIRMED | Routes `POST /clinic/roles/users/:userId/roles` + `DELETE .../:roleId` (`role.routes.ts:41-44`, guarded `staff.assign_role`); server-side no-escalation subset check (`role.service.ts:216-225`); `RolePicker.tsx` UI + `useUserRoles.ts` hooks (T-5F-03); permission union in `permission.service.ts`; tests `user-roles-t5f03.test.ts`, `RolePicker.test.tsx`; documented FR-14b (`anemal-functional-reqs` SKILL.md:76) + CR-01 (`anemal-rbac-matrix` SKILL.md:65-71, permission-matrix.md §5) |
| V2 | A real user currently holds >1 role | **CONFIRMED — YES** | Dev DB: `user_roles` has 8 rows across 7 users; userId 2 (`doctor_a`) holds **two** roles: `Doctor` (system, id 2) + `Accountant` (custom, id 393, key `tenant_1_accountant`) — this is literally the bug-report tenant's data |
| V3 | T-URA-1.1 precondition ("backfill already run, zero NULLs") holds today | **REFUTED** | Dev DB: `SELECT COUNT(*) FROM users WHERE "roleId" IS NULL` → **5** (`staff_a`, `doctor_a`, `admin_b`, `doctor_b`, `staff_b`). The design doc's "already run once" claim is stale; T-URA-1.1 currently FAILS and correctly blocks T-URA-1.2 |
| V4 | Legacy `<select>` gating (OQ-4) | CONFIRMED — **not** gated by `staff.assign_role` | Client: `UserManagementTab.tsx:101-109` — the `<select>` has **no** `<Can>` wrapper of any kind; the Edit button opening the modal (`:378-381`) is also un-wrapped. Only the separate RolePicker block is wrapped: `<Can perm="staff.assign_role">` at `:150-156`. Server: the select saves via `PUT /users/:id` → `staff.manage` (`user.routes.ts:15`); RolePicker saves via role routes → `staff.assign_role` (`role.routes.ts:41-44`) |
| V5 | `updateUser` performs **no** no-escalation check on role change | CONFIRMED | `user.service.ts:134-142` — maps legacy string → system role, calls `replaceUserRole`; no caller-permission subset check anywhere in `user.service.ts`. The only subset enforcement lives in `role.service.ts` (assign path) and client-side `isGrantable()` (`RolePicker.tsx:31`) — which is UX, not a boundary |
| V6 | Lockout guard reads legacy string | CONFIRMED | `user.service.ts:41-55` (`change.role !== 'admin'`, line 52); call sites `:126`, `:283` — matches T-URA-2.2 exactly |
| V7 | `LEGACY_ROLE_TO_SYSTEM_KEY` + call sites match T-URA-2.1's line estimates | CONFIRMED | `user.service.ts:18-22`, `:91-95`, `:135-141` |
| V8 | Design doc's backend file list is complete | **REFUTED — auth plane omitted** (F-1) | `auth.service.ts` reads `user.role` at lines 65, 75, 95, 112, 177, 208, 310: the legacy string is embedded in the **JWT `role` claim**, the login response, and gates the **admin branch-selection bypass** (`user.role === 'admin'`, line 65). Also `user.service.ts:275` (`assignUserBranches` response). None of these appear in the design doc; the column drop breaks compile here |
| V9 | Frontend consumers of the **auth-store** `role` (distinct from OQ-3's user-list role) — list re-swept 2026-07-20 and now complete: **nine** files | CONFIRMED | Routing/behavior: `ClinicLayout.tsx:22,31`, `AdminLayout.tsx:26,33` (`role !== 'admin'` guard — missed in first pass), `useAuth.ts:71,107,124,157`, `SettingsLayout.tsx:24,33`, `BranchSwitcher.tsx:16,25`, `LoginView.tsx:11,44`, `PreferencesPage.tsx:44,45`. Display-only: `ProfileMenu.tsx:16,100`. Store: `authStore.ts:16-18` (field marked "Transitional — keep until T-5B-02"). Backend JWT-claim readers: `rbac.middleware.ts:13` (referenced only by its own unit test — dead, deletion candidate) and `permission.middleware.ts:152` (**platform**-plane role — different token, unaffected by the clinic `User.role` drop) |
| V10 | `GET /users` response consumers beyond `UserManagementTab.tsx` (OQ-3) | CONFIRMED — see §3 OQ-3 | Grep of `src/frontend/src`, 2026-07-20 |
| V11 | `cloneRole` / clone route shape matches T-URA-2.4/3.4 | CONFIRMED | `role.service.ts:67-109` (no admin-source rejection today), `role.routes.ts:32` (`roles.manage`) |
| V12 | Physical table names | Minor doc correction | `ClinicRole` maps to table `roles` (not `clinic_roles`); `UserRole` maps to `user_roles` (`schema.prisma:859-870`). Any raw-SQL verification queries in the tasks doc must use `roles`/`user_roles` |
| V13 | Rollback precedent exists in repo | CONFIRMED | `prisma/migrations/20260614163551_rbac_foundation/down.sql` — hand-written down scripts are an established pattern here |

---

## 3. Open-question resolutions

### OQ-1 — Is D-1 (single role per user) a scope regression? → **YES, it is a real regression of a shipped capability — approvable only as an explicit, documented supersession with the four conditions below (CORR-1)**

**(a) Data check — do not assume:** ran against the live dev DB. **One user actively holds two roles**: userId 2 (`doctor_a`) = `Doctor` + custom `Accountant` (V2). Multi-role is not hypothetical; it is the exact state the bug reporter created. There is no production environment yet (pre-launch), so blast radius is dev/demo data only — but the *capability* is real and exercised.

**(b) Intentional capability or vestigial flexibility?** Intentional and shipped (V1): dedicated endpoints with their own permission gate and server-side no-escalation enforcement, a dedicated UI (RolePicker), dedicated tests (T-5F-03), and union-of-permissions resolution in `permission.service.ts`. FR-14b/CR-01 describe what the code actually does today. **This is not vestigial.**

**Verdict:** D-1 contradicts FR-14b/CR-01 as shipped. However, the design's rationale is coherent — "combine access by cloning a role with the right permission mix" is a workable substitute (clinic admins can already build a combined-permission custom role via clone + `updateRolePermissions`, both no-escalation-checked), and single-role eliminates the exact class of drift (two role-truth systems) that caused this bug. The legacy `<select>`'s `replaceUserRole` already silently wipes extra roles today (design doc's own data-loss warning), so multi-role and the legacy modal were never actually compatible. **I accept D-1 as a deliberate supersession, NOT a silent narrowing**, conditional on **CORR-1**:

1. **Human re-confirmation at `/grill-with-docs`** that FR-14b/CR-01 multi-role is being retired (the brainstorm approved D-1, but the FR conflict was discovered after — the product owner must see this trade-off stated plainly: "doctor_a loses the Accountant add-on role; the replacement is a cloned 'Doctor + Accounting' role").
2. **Doc supersession task added:** update `anemal-functional-reqs` (FR-14b) and `anemal-rbac-matrix` (SKILL.md CR-01 section + permission-matrix.md §5) in the same change, so the docs never again describe a capability the product doesn't have. @pm-agent owns per CLAUDE.md; the content comes from this sign-off.
3. **Retire the multi-role write endpoints server-side** — `POST /clinic/roles/users/:userId/roles` and `DELETE /clinic/roles/users/:userId/roles/:roleId` must be **removed** (not merely have their UI deleted). The tasks doc's T-URA-4.2 treats RolePicker deletion as conditional frontend cleanup; that is insufficient. Server is the security boundary: leaving live multi-role write endpoints while the UI and `roleId` column assume single-role recreates the two-truth drift this whole change exists to kill (anyone with `staff.assign_role` could re-create a 2-role user via curl, and the new UI would silently misreport them). `GET /users/:userId/roles` may stay (read-only) or collapse into the new `role` object — decide at write-plan.
4. **Migration must reconcile `user_roles` to exactly one row per user (the `roleId` row) and emit a report of stripped roles.** This is a security requirement, not hygiene: `permission.service.ts` resolves permissions as the **union of `user_roles`** — if the migration sets `roleId = Doctor` for userId 2 but leaves the Accountant row in `user_roles`, the user retains Accountant permissions **invisibly** (UI shows "Doctor", server grants more). Invisible standing permissions are exactly the anti-pattern the RBAC skill forbids. The reconciliation report (user, kept role, stripped roles) goes to the migration PR so an admin can deliberately re-provision combined clones where needed.

**Survivor rule — DECIDED by the product owner, 2026-07-20 (binding migration rule, supersedes my earlier roleId-first proposal):**

For **every** user found holding >1 `user_roles` row at cutover (not just userId 2 — same rule for any others discovered):

1. **Pre-check task (extend T-URA-1.1):** before the column-drop migration, query for all users with >1 `user_roles` row (`SELECT "userId", COUNT(*) FROM user_roles GROUP BY "userId" HAVING COUNT(*) > 1`).
2. **System role wins:** if the user holds one system role (`isSystem = true`: Admin/Doctor/Staff) plus any custom role(s), collapse to the **system** role — set `roleId` to it, delete the other `user_roles` rows. Applied to today's data: userId 2 keeps **Doctor**, the **Accountant** assignment is dropped — exactly the owner's decision.
3. **Ambiguous cases halt, never guess:** if a user holds 2+ system roles, or 2+ custom roles with no system role, do **not** silently pick one — emit the case into a pre-migration report for manual resolution; the migration does not proceed for that tenant until resolved.
4. **Auditable, not silent:** every collapse is logged (`userId`, kept role, roles removed) and the log/report attached to the migration PR, so a clinic admin can deliberately re-provision a combined cloned role (e.g. "Doctor + Accounting") where the dropped assignment was real access someone needs.

This makes CORR-1 condition 4's reconciliation concrete: the collapse script + report IS the reconciliation, and the ambiguity rule guarantees determinism without silent data-loss decisions.

### OQ-2 — Rollback plan for the irreversible column drop → **Roll-forward-only is ACCEPTABLE at pre-launch scale, with three binding conditions (CORR-2)**

Context verified: no production tenants exist (Phases 10-11 blocked on credentials; dev DB has ~7 users). A dual-write/compat period would be engineering for a traffic profile that doesn't exist — rejected per ponytail and the design's own D-3 rationale. Conditions:

1. **Backup before migrate, every environment:** `pg_dump` (or volume snapshot) immediately before applying the migration, noted as a step in the migration task itself. This is the actual rollback mechanism; name it, don't imply it.
2. **Hand-written `down.sql`** following the repo's own `rbac_foundation/down.sql` precedent (V13): re-add `role` column + `LegacyRole` enum, repopulate via `roleRef.key` reverse mapping (`clinic_admin`→`admin`, `doctor`→`doctor`, everything else including custom roles→`staff`), re-nullable `roleId`. Document that it is **lossy for custom-role users** — that is fine for an emergency escape hatch whose real fallback is the backup.
3. **T-URA-1.1 is currently failing (V3)** — 5 users have NULL `roleId` in the dev DB *right now*, including the multi-role user. The tasks doc's gate is correctly designed and must not be weakened; the design doc's "already run once" phrasing must not lull anyone into skipping the re-run. Re-running `backfill-user-roles.ts` + the OQ-1 condition-4 reconciliation are both part of the forward migration procedure.

Also confirmed: in-flight requests sending the old `role: string` during the deploy window will 400 — acceptable for a dev-scale combined deploy window; no mitigation needed beyond deploying backend+migration together as the design already specifies.

### OQ-3 — Other consumers of `GET /users`' `role` field → **Four found; two break, one is dead code that breaks compile/tests, one is unaffected — plus the auth-plane family the question didn't ask about (F-1)**

| Consumer | Usage | Impact when `role` becomes `{ id, name, key, isSystem }` | Required action |
|---|---|---|---|
| `AdminBranches.tsx:206` | `users.filter(u => u.role === 'doctor')` to build the doctor picker | **Silent break** — filter matches nothing, doctor list renders empty, no error | Must be updated in URA-3 scope (`u.role.key === 'doctor'`). Note: custom roles cloned from Doctor won't have key `doctor` — flag at grill whether the picker should match on key or on a permission (e.g. holders of `emr.edit`); key-match preserves today's behavior |
| `AdminUsers.tsx` (`:22,29,30,66,73-74,116,166,179-180`) | Full legacy user-management screen; reads `u.role` string AND writes `role: form.role` on POST/PUT | **Not routed** — absent from `App.tsx` routes (superseded by `UserManagementTab`); referenced only by `AdminViews.i18n.test.tsx`. Still compiled: its POST/PUT would 400 under the new zod schema, and TS types break | **Delete the file + its i18n test** as part of URA-3/URA-4 cleanup (dead code, second drifted copy of the same modal — the very disease this change treats). If any doubt at write-plan, updating it is the fallback; deleting is the recommendation |
| `ClinicGrooming.tsx:78` | `api.get('/users?role=staff')` | **No functional break** — the `?role=` param is already ignored server-side (`listUsers` takes no role filter, `user.controller.ts:36-41`) and the component never reads `u.role` | Optional: drop the dead query param while touching nearby code; not required |
| `AdminAudit.tsx:49` | Fetches users for name lookup; never reads `role` | No break | None |

**Beyond the question's framing:** the login/JWT `role` (from `auth.service.ts`, not `GET /users`) feeds seven more frontend sites (V9). Those are D-6's declared out-of-scope consumers — legitimate to defer, **but only if F-1 (below) keeps their input contract stable.**

### OQ-4 — Does `staff.assign_role` gate the legacy `<select>`? → **NO — and the unified listbox as currently tasked would ship a privilege-escalation path. Two mandatory additions (CORR-3)**

Precise current state (V4, V5):

- **Client:** the legacy `<select>` (`UserManagementTab.tsx:103-108`) has no permission wrapper at all; only the RolePicker block is inside `<Can perm="staff.assign_role">` (`:150-156`).
- **Server:** the select's save path `PUT /users/:id` is gated by **`staff.manage`** (`user.routes.ts:15`) with **no no-escalation check** in `updateUser` (`user.service.ts:134-142`). The RolePicker path is gated by **`staff.assign_role`** (`role.routes.ts:41-44`) **with** the subset check (`role.service.ts:216-225`).

So today there are two different server-side gates for "change a user's role" depending on which UI is used — itself a latent inconsistency. Under the tasks doc as written, the unified listbox rides `PUT /users/:id`, which means:

1. **Gate downgrade:** role assignment (now including custom roles) would be controlled by `staff.manage` alone. In the default matrix both codes are clinic_admin-only, so system-role tenants see no change — but custom roles can split the two codes, and the documented model (permission-matrix.md §5) says role assignment requires `staff.assign_role`. Deny-by-default means we honor the documented gate, not the accident.
2. **Escalation hole (the real security regression):** the legacy select could only assign the 3 system roles; the unified listbox exposes **every** role. `isGrantable()` filters client-side only. A caller holding `staff.manage` but with a limited permission set could PUT a `roleId` for a role whose permissions exceed their own — server accepts it (V5). That violates custom-role safety rule #1 (`anemal-rbac-matrix`) at the security boundary.

**Mandatory additions (CORR-3), new backend sub-tasks under URA-2:**

- **T-URA-2.6 (new):** when `body.roleId` is present on `PUT /users/:id` (and on `POST /users` if the create listbox offers custom roles), the caller must hold **`staff.assign_role`** in addition to the route's `staff.manage`. Implement as an in-service permission check on the role-change branch (route-level middleware can't be conditional on body shape) — 403 on failure. Name changes with `roleId` absent stay `staff.manage`-only, preserving today's "edit name without assign_role" behavior.
- **T-URA-2.7 (new):** port the no-escalation subset check from `role.service.ts:216-225` into the `updateUser`/`createUser` role-change branch (or extract it to a shared server-side helper both services call — mirroring what URA-4.1 does for the frontend `isGrantable()`, and for the same anti-drift reason). Test: a caller with a limited custom role attempting to assign a role containing a permission they lack → 403; the same assignment by a clinic_admin → 200.
- The existing `<Can perm="staff.assign_role">` must wrap (or disable) the unified listbox in T-URA-3.1 — the tasks doc's AC-URA-3 negative case already gestures at this; make it an explicit assertion in the test, with the server checks above as the actual boundary.

---

## 4. New finding beyond the four OQs

### F-1 — Auth plane omitted from the design (BLOCKER until amended; CORR-4)

The design doc's backend-changes list (`user.service.ts`, `role.service.ts`, controllers, `user.repository.ts`) omits **`auth.service.ts`**, which reads `user.role` at 7+ sites (V8) and:

- embeds the legacy string in the **JWT `role` claim** and every login/refresh/me response;
- gates the **admin branch-selection bypass** on `user.role === 'admin'` (`auth.service.ts:65-68`) — a login-flow behavior, not cosmetics;
- feeds the seven frontend routing checks (V9) that D-6 defers.

Dropping the column without amending this breaks compile at best; re-pointing it naively to `roleRef.key` breaks admin login routing at worst (frontend compares `'admin'`, the key is `'clinic_admin'`; a custom-role user has a tenant-specific key matching nothing).

**Option analysis (requested by product owner, 2026-07-20):**

| Option | What changes | Blast radius | Verdict |
|---|---|---|---|
| **(a) Legacy-string mapper confined to `auth.service.ts`** — derive the existing `role` claim from `roleRef.key`: `clinic_admin`→`'admin'`, `doctor`→`'doctor'`, anything else (incl. `clinic_staff` and every custom role)→`'staff'` | One private helper (`toLegacyRoleString(key)`) in `auth.service.ts`; its 7+ `user.role` reads route through it; auth-path user lookups add `include: { roleRef: { select: { key } } }`; admin branch-selection bypass (`:65-68`) keys off the mapper | **1 backend service file** (+ its repository include + auth tests). Zero frontend changes; JWT/login contract byte-identical; live 8h tokens stay valid; `rbac.middleware` untouched; **D-6 fully preserved** | **RECOMMENDED** |
| **(b) JWT claim becomes `roleKey`; frontend checks `roleKey === 'clinic_admin'`** | `JwtPayload` type, `signToken`/`signPendingToken` call sites, `auth.middleware` context, `rbac.middleware.ts:13`, `authStore.ts`, plus **all nine** V9 frontend files | ~12+ files across both planes' shared types — and two of the nine are `ClinicLayout.tsx:31` and `AdminLayout.tsx:33`, i.e. **option (b) forces touching the exact admin-menu routing logic D-6 defers** (cannot be avoided). Also needs a token-compat window (in-flight 8h tokens carry `role`, new code reads `roleKey`) or a forced re-login, and every frontend check needs a custom-key fallback rule (`tenant_1_accountant` matches nothing) | Rejected for this change — it is the *correct end-state*, but it **is** D-6, and doing it here un-bounds the scope the design deliberately bounded |
| **(c) Carry both claims (`role` + `roleKey`) transitionally** | Both of the above, minus frontend edits now | Two representations of the same truth in every token — the exact dual-truth drift disease this whole change exists to cure, reintroduced at the token layer | Rejected on principle |

**Recommendation: (a)**, recorded as design amendment D-8 and new task **T-URA-2.8**. It keeps D-6 legitimately deferred (this sign-off confirms explicitly: option (a) does **not** force touching menu-routing logic — `ClinicLayout`/`AdminLayout`/`useAuth`/`LoginView` inputs stay byte-identical), costs one pure function, and leaves option (b) as the documented implementation path *for* the D-6 follow-up, where the nine-file frontend sweep belongs. Tests for T-URA-2.8: admin login still skips branch selection; a custom-role (`Accountant`) user logs in, gets claim `'staff'`, routes to the clinic dashboard, and still resolves their real permissions via the unchanged `permSetVersion`/permission-resolution path. Two accepted, documented consequences: (1) `ProfileMenu.tsx:100` shows the mapped word (a Custom-role user displays "staff", not "Accountant") — cosmetic, real role name is one `/auth/me` field away in the D-6 follow-up; (2) a custom-role user cloned from Doctor routes to the clinic (non-admin) dashboard — identical to today, since custom-role users already carry legacy `'staff'`/`'doctor'` strings.

### F-2 — Minor doc corrections (CORR-5)

- Raw-SQL verification queries in T-URA-1.1 must target tables `users`/`user_roles`/`roles` — there is no `clinic_roles` table (V12).
- Tasks-doc scope table should count the new sub-tasks (T-URA-2.6..2.8, endpoint removal, `AdminUsers.tsx` deletion, doc supersession) — this strengthens the already-flagged 2-PR expectation at Ponytail Gate; it does not change my verdict, since deletions dominate the additions.

---

## 5. Requirement-readiness check (Definition of Ready)

| Criterion | Status |
|---|---|
| Objective stated | ✅ Single role-truth system; kills the drift class behind the bug |
| Actors & roles | ✅ Clinic Admin (`staff.manage` + `staff.assign_role`); no platform-plane involvement — planes stay separated |
| Permission codes assigned | ✅ after CORR-3 (`staff.assign_role` explicitly on the role-change branch; no new codes; deny-by-default preserved) |
| Exception cases | ✅ after CORR-1.4 (multi-role reconciliation), CORR-2.3 (NULL-roleId gate), F-1 (custom-role login claim) |
| NFR impact | ✅ none material — permission cache/`permSetVersion` mechanics unchanged; one extra role-row load in `updateUser` guard path |
| Acceptance criteria testable | ✅ AC-URA-1..4 are testable as written; CORR-3 adds the two missing security ACs |
| Dependencies & risks recorded | ✅ tasks-doc Dependencies section + this document |

## 6. Conditions summary (binding)

| ID | Condition | Where it lands |
|---|---|---|
| CORR-1 | OQ-1 supersession package: ~~grill confirmation~~ **owner confirmed 2026-07-20** (multi-role retired; collapse rule decided — see OQ-1 survivor rule / design D-7); remaining: FR/RBAC doc updates, multi-role endpoint removal, collapse script + pre-migration ambiguity report + audit log | tasks doc (new sub-tasks); grill re-verifies rather than decides |
| CORR-2 | Backup-before-migrate step; lossy `down.sql`; T-URA-1.1 re-run mandatory (currently failing) | URA-1 tasks |
| CORR-3 | `staff.assign_role` required on role-change branch of `PUT /users/:id`/`POST /users`; server-side no-escalation subset check; `<Can>` on the unified listbox | new T-URA-2.6/2.7 + T-URA-3.1 |
| CORR-4 | Auth-plane amendment **decided: option (a)** — legacy-compatible claim mapper confined to `auth.service.ts`; admin-bypass re-point; tests; option (b) documented as the D-6 follow-up path | design doc amendment D-8 + new T-URA-2.8 |
| CORR-5 | Table-name corrections; scope-table recount; `AdminUsers.tsx` + i18n test deletion; `AdminBranches.tsx` doctor-filter fix in URA-3 scope | tasks doc edits |

Hand-off: to @pm-agent to fold CORR-1..CORR-5 into the tasks doc, then to the human-driven `/grill-with-docs` (Step 3.5) with OQ-1's supersession and F-1 as named agenda items.
