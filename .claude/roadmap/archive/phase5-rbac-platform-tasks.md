# Phase 5 — RBAC, Platform Console & Structure Restructure (Task Breakdown)

> Source spec: `.claude/specs/RBAC_Platform_Restructure_Spec.md` (SPEC-RBAC-PLATFORM-01)
> Skills: `anemal-rbac-matrix` · `anemal-platform-console` · `anemal-ba-toolkit`
> Status: 🔲 Not started · Owner: @pm-agent (sequencing) · Implement: @db/@dev/@uiux/@qa
> Decisions: D1 separate Platform Console · D2 configurable roles per clinic · D3 plan-only this round

Each task is atomic with acceptance criteria testable by @qa-agent. Sub-phases are ordered;
within a sub-phase, tasks marked `∥` may run in parallel. **Run the QA protocol
(`.claude/roadmap/qa-protocols.md`) at the end of every task.**

---

## 5-A — RBAC Foundation (DB + backend)  ·  @db-agent, @dev-agent

### T-5A-01 · Permission & role schema
Add `permissions`, `roles`, `role_permissions`; add `users.role_id`. Migration + `down` script.
- AC: tables exist; `users.role_id` FK -> `roles.id`; composite/unique indexes per `anemal-db-context`.
- AC: legacy `users.role` retained (not dropped) for back-compat.

### T-5A-02 · Seed permissions & system roles
Seed the full permission catalogue and the 3 system roles (`clinic_admin`, `doctor`, `clinic_staff`)
with the default grid from `anemal-rbac-matrix/references/permission-matrix.md`.
- AC: seeding is idempotent; re-running does not duplicate rows.
- AC: each system role's permission set exactly matches the matrix.

### T-5A-03 · Permission resolution + cache
Service that resolves a user's permission set from `role_id`, cached in Redis keyed by
`roleId:permVersion`; invalidated on `perm_version` bump.
- AC: cache hit adds < 5 ms; bumping `perm_version` re-resolves on next request.

### T-5A-04 · `permission.middleware.ts`  ∥ with T-5A-05
`requirePermission('module.action')` returns 403 `FORBIDDEN` when the resolved set lacks the code.
- AC: unit tests for allow + deny; integration test on one sample route.

### T-5A-05 · JWT payload extension  ∥
Add `roleId` + `permVersion` to the clinic token; keep `userId, tenantId, branchId`. Update
`auth.service`, `signToken`, types.
- AC: existing tokens without `roleId` handled gracefully during rollover (fallback to legacy role -> system role).

### T-5A-06 · Migrate existing users
Data migration mapping `admin->clinic_admin`, `doctor->doctor`, `staff->clinic_staff`; set `role_id`.
- AC: every active user has a non-null `role_id`; counts per role match pre-migration role counts.

---

## 5-B — Enforce permissions on clinic APIs (backend + QA)  ·  @dev-agent, @qa-agent

### T-5B-00 · Regression guard FIRST (blocker for the rest of 5-B)
@qa-agent writes tests asserting each system role keeps its **current** endpoint access.
- AC: tests pass on today's behaviour BEFORE any enforcement is added (baseline locked).

### T-5B-01..n · Apply `requirePlane('clinic') + requirePermission(...)` per route
Using the route->permission map in `permission-matrix.md`, guard every clinic route
(appointments, pet/owner, medical-record, prescription, product, invoice, report, hospitalization,
grooming, blood-bank, loyalty, branch, settings, user, audit).
- AC: doctor->`billing.create` = 403; staff->`emr.edit` = 403; admin keeps clinic config; all per matrix.
- AC: tenant/branch isolation tests still pass (no regression).

### T-5B-02 · Deprecate `rbac.middleware`
Convert `rbacMiddleware(['admin'])` call sites to permission checks; leave a thin shim or remove.
- AC: no route relies on raw role-array checks except plane separation.

### T-5B-03 · Clinic role management API (configurable roles)
`rbac.routes`: list permissions, list/create/clone/edit/delete tenant custom roles, assign perms,
assign role to user. Guarded by `roles.manage`.
- AC: clinic_admin can only grant permissions they hold (no escalation); system roles immutable.
- AC: editing a role bumps `perm_version`; deleting a role in use is blocked.

---

## 5-C — Platform plane split (DB + backend)  ·  @db-agent, @dev-agent

### T-5C-01 · `platform_users` table + seed first super admin
- AC: table has no `tenant_id`; one `platform_super_admin` seeded from env (not hardcoded secret).

### T-5C-02 · Platform auth + `plane.middleware.ts`
`POST /platform/auth/login`; platform token `{ platformUserId, plane:'platform', role }`;
`requirePlane('platform'|'clinic')`.
- AC: platform token -> clinic route = 403; clinic token -> `/platform/*` = 403.

### T-5C-03 · Move `superadmin` user(s) to platform
Migrate any existing `users.role='superadmin'` into `platform_users`; remove `superadmin` from the
clinic role enum/usages.
- AC: no clinic `users` row has role superadmin; system-settings reachable only via platform plane.

---

## 5-D — Platform Console domain APIs (backend)  ·  @db-agent, @dev-agent

### T-5D-01 · `plans` + `tenant_quotas` schema + seed default plans
- AC: `tenants.plan_id` FK; default plans seeded (starter/professional/clinic_plus).

### T-5D-02 · Customer (tenant) management API
list/create/update/suspend/reactivate per `platform-domain.md`.
- AC: suspend blocks that tenant's clinic logins immediately; all actions audited.

### T-5D-03 · Plan + quota APIs ∥ T-5D-04
plan CRUD; per-tenant quota override.
- AC: effective quota = override ?? plan default.

### T-5D-04 · Quota enforcement ∥
Enforce `max_branches`/`max_users`/`max_owners` at create time (extend `usage.service`).
- AC: over-limit create -> `409 QUOTA_EXCEEDED` with the cap; existing over-limit tenants grandfathered.

### T-5D-05 · Per-tenant provisioning + platform settings
Move `system-settings` under platform; provisioning endpoints (S3 prefix, base providers).
- AC: platform plane never queries clinical/PII tables (QA stop-criteria check).

---

## 5-E — Frontend restructure & guards (frontend)  ·  @uiux-agent, @dev-agent

### T-5E-01 · authStore upgrade
Carry `plane`, `roleId`, `permissions[]`, `branchId`. Hydrate from login response.
- AC: refresh preserves permissions; clinic vs platform sessions don't collide in storage.

### T-5E-02 · Guards: `RequireAuth`, `RequirePlane`, `RequirePermission`, `<Can>`, `usePermissions`
Replace `ProtectedRoute` (auth-only).
- AC: a clinic user without `staff.manage` cannot open the Staff screen (redirect) and the nav item is hidden.

### T-5E-03 · Route-tree reorg into three shells
`/clinic/*` (ops), `/clinic-admin/*` (clinic config — migrate today's clinic-admin `/admin` + clinic `/settings`),
`/platform/*` (PlatformLayout). Keep redirects from legacy paths.
- AC: clinic Dashboard reachable only by clinic plane; system settings only by platform plane (brief req #2).
- AC: no dead/duplicate settings surfaces remain (one clinic settings area).

---

## 5-F — Role-management & Platform Console UI (frontend)  ·  @uiux-agent, @dev-agent

### T-5F-01 · Clinic Role Editor (`/clinic-admin/roles`)
List roles, clone system role, toggle permissions (grouped by module), assign role to staff.
Touch-first, ≥44px, tokens only.
- AC: matches `anemal-design-system`; only permissions the admin holds are toggleable.

### T-5F-02 · Platform Console screens
Customers, Customer Detail (Overview/Plan&Quota/Provisioning/Usage), Plans, Platform Settings,
Platform Users, Usage & Audit (per `platform-domain.md`).
- AC: quota edit reflects on the clinic immediately; all screens render at 768/1024.

---

## 5-G — QA hardening & cleanup (QA)  ·  @qa-agent

### T-5G-01 · Permission-matrix test suite
Parametrised tests covering every row of the matrix (allow + deny) for the 3 system roles + 1 custom role.
- AC: full matrix covered; CI green.

### T-5G-02 · Plane-isolation + privilege-escalation tests
Cross-plane 403s; custom-role cannot exceed creator; suspended tenant blocked.
- AC: all pass; mapped to QA stop criteria.

### T-5G-03 · Structure cleanup
Quarantine `_archive/`, remove stray `nul`, consolidate settings stacks, delete dead frontend tabs.
- AC: exactly two settings stacks; no `_archive` under `src`; build + tests green.

### T-5G-04 · Docs (LAST step — required by CLAUDE.md tracking rule)
Update `docs/index.html` (phase table, Upcoming Work, Roadmap History) and
`docs/functional_spec_detailed.html` (new FRs/endpoints); update `HistoryLog.md`.
- AC: docs reflect Phase 5 final state; Upcoming Work edited last before commit.

---

## Definition of Done (phase)
All 8 acceptance criteria in SPEC section 12 met · no access regression for migrated users ·
permission-matrix + plane-isolation suites green · structure cleaned · docs updated.

---

## CR-01 — Multi-role users & role assignment (folds into 5-A / 5-B / 5-F)

### T-5A-07 · `user_roles` join table + migrate  (@db-agent)
Create `user_roles` (see SPEC §15 DDL); backfill one row per existing user from `users.role_id`.
Keep `users.role_id` as nullable primary/display role.
- AC: every existing user has exactly one `user_roles` row post-migration (zero behaviour change).
- AC: `down` script drops the table; composite index `(tenant_id, user_id)` present.

### T-5B-04 · Union permission resolution + role-assignment API  (@dev-agent, @qa-agent)
Resolve effective permissions as the **union** across `user_roles`; cache by `userId`+`permSetVersion`.
Add `POST /users/:id/roles` and `DELETE /users/:id/roles/:roleId` guarded by `staff.assign_role`.
- AC: user with `doctor`+`clinic_staff` can both write EMR and create invoices.
- AC: removing the last role → `409`; no-escalation (BR-5) → `403`; editing a role updates holders' access next request.
- AC: `staff.assign_role` added to seed; matrix tests cover allow+deny.

### T-5F-03 · Multi-role assignment UI in user editor  (@uiux-agent, @dev-agent)
In the Clinic Admin user editor, allow selecting **multiple** roles (multi-select chips/checklist),
showing only roles the admin may grant (BR-5). ≥44px targets, tokens only.
- AC: assigning 2+ roles persists and reflects in the user's effective access; last-role removal blocked in UI.
