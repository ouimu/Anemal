# PM-Agent Task Breakdown: Fix Missing Doctor List in Appointment Booking

**Branch:** fix/appointment-doctor-list
**Spec:** docs/superpowers/specs/2026-07-05-appointment-doctor-list-design.md
**Pipeline status:** Step 2 output. Requires Step 3 (@ba-agent sign-off) and Step 3.5 (/grill-with-docs) before /write-plan.

## Scope ruling

In scope (bug fix, current phase — no new phase needed): new scoped endpoint, schema lineage column, cloneRole fix, frontend switch, empty-state UI.

Backlog (out of scope, per spec's "Known gap"): retroactive sourceRoleId backfill for roles already cloned from Doctor before this fix ships. DB-2 below is a read-only check, not a backfill.

## Acceptance Criteria (feature-level)

- [ ] clinic_staff and doctor role users get 200 (not 403) on new doctors endpoint
- [ ] clinic_admin also gets 200
- [ ] User with ClinicRole.key === 'doctor' included
- [ ] User with custom role whose sourceRoleId resolves to system Doctor role included
- [ ] User with one Doctor-derived role + one unrelated role included (multi-role OR)
- [ ] User assigned to Branch A excluded when querying branchId=B (and vice versa)
- [ ] Response never crosses tenantId (cross-tenant isolation test)
- [ ] Missing appointments.view permission → 403 (negative case)
- [ ] Booking form dropdown populates for clinic_staff and doctor roles
- [ ] Branch with zero assigned doctors: UI shows "No doctor assigned to this branch — contact your admin", Save disabled
- [ ] cloneRole from system "Doctor" sets sourceRoleId on new custom role
- [ ] cloneRole from any other source leaves sourceRoleId null

## Task Breakdown

```
Task ID: DB-1   Owner: @db-agent
Add nullable self-referencing sourceRoleId column to ClinicRole
(src/backend/prisma/schema.prisma, model ClinicRole ~line 811).
Field: sourceRoleId Int? + relation "RoleLineage" (self-ref), ON DELETE SET NULL.
Migration only, no backfill/data script (existing rows stay null per spec's known gap).
AC:
  - Migration applies cleanly to dev DB
  - FK nullable, ON DELETE SET NULL
  - Existing seed/tests pass unmodified
  - Prisma Client regenerated, no type errors elsewhere
Dependencies: none

Task ID: DB-2   Owner: @db-agent
Read-only check: any tenant currently has a custom role cloned from Doctor
pre-migration (would silently miss lineage post-fix)? Report count/tenant
list to @pm-agent/@ba-agent for backlog-vs-blocker call. No schema/data change.
Dependencies: DB-1

Task ID: DEV-1   Owner: @dev-agent
Update cloneRole (src/backend/services/role.service.ts:77) to set sourceRoleId
when sourceRoleName resolves to system Doctor role. Update createRole
(src/backend/models/role.repository.ts:78) to accept/persist optional sourceRoleId.
AC:
  - clone('Doctor', ...) sets sourceRoleId = system Doctor role id
  - clone(<other>, ...) leaves sourceRoleId null
  - Existing cloneRole tests (roleManagement.test.ts, roleEditor-t5f01.test.ts) still pass
  - New unit test: positive + negative lineage case
Dependencies: DB-1

Task ID: DEV-2   Owner: @dev-agent
Add findDoctorsForBranch(tenantId, branchId: number | null) to
appointment.repository.ts. Join User -> UserRole -> ClinicRole where
key==='doctor' OR sourceRoleId -> system Doctor role id, scoped via
UserBranch(tenantId, branchId) when branchId is non-null (null = no branch
filter, all branches — same null-means-all-branches convention as
findInRange). Also filter User.isActive=true. tenantId filtered at every
join step. Select only { id, name } (no email/phone/username).
AC:
  - branchId non-null: only users assigned to that branch (via UserBranch)
  - branchId null: no branch filter, doctors across all tenant branches
  - Includes key==='doctor' and sourceRoleId-derived roles
  - Multi-role: any one qualifying role includes the user (OR)
  - Excludes isActive=false users
  - Cross-tenant isolation: no leak even on branchId collision
  - Empty array (not throw) when zero doctors assigned
  - Response shape strictly { id, name } — no other user fields
Dependencies: DB-1

Task ID: DEV-3   Owner: @dev-agent
Add listBookableDoctors(tenantId, branchId: number | null) to
appointment.service.ts — thin pass-through to repository. No branchId
validation needed (it comes from req.context, already trusted — see DEV-4).
AC:
  - Passes branchId through unmodified (null or number)
  - Valid call returns repository result unmodified
Dependencies: DEV-2

Task ID: DEV-4   Owner: @dev-agent
Add GET /api/appointments/doctors (no query param). Controller
handleListDoctors in appointment.controller.ts uses the existing
branchOf(req) helper (appointment.controller.ts:7) for branch scope —
same pattern as listAppointments/createAppointment. Route in
appointment.routes.ts gated by requirePlane('clinic') +
requirePermission('appointments.view') (same gate as existing GET / list).
AC:
  - 200 for clinic_admin, doctor, clinic_staff
  - 403 for role/plane lacking appointments.view
  - Branch scope from req.context.branchId only; no client-supplied branchId
    accepted or read from query string (grill Q1 / BA-1 / BA-2)
  - branchId=null (all-branches admin token) returns doctors across all
    tenant branches, not an error
  - Response shape { success: true, data: Doctor[] } matches existing convention
Dependencies: DEV-3

Task ID: DEV-5   Owner: @dev-agent
Update ClinicAppointments.tsx: replace doctor-fetch at line 271
(GET /users) with GET /appointments/doctors (no params — branch resolved
server-side). Remove client-side role==='doctor' filter at line 294 —
server now returns only bookable doctors.
AC:
  - Doctor dropdown populates for clinic_staff and doctor roles
  - Filter-by-doctor dropdown (~351-352) still works off new data source
  - No remaining role==='doctor' string filter in this file
  - No branchId param sent by client (grill Q1)
Dependencies: DEV-4

Task ID: UIUX-1   Owner: @uiux-agent
Empty-state design for BookingForm when doctors array empty for selected
branch: "No doctor assigned to this branch — contact your admin", Save
stays disabled, replaces bare empty <select> (lines 165-167).
AC:
  - i18n key added (Thai + English, Phase 9 convention)
  - Disabled Save + message meets 44x44px tap target / Compassionate Care tokens (no raw hex)
  - Empty state visually distinct from loading state
Dependencies: DEV-5

Task ID: QA-1   Owner: @qa-agent
Full RBAC + isolation + regression verification per .claude/roadmap/qa-protocols.md.
AC:
  - Permission matrix: 200 for 3 clinic roles, 403 for role/plane without appointments.view
  - Tenant isolation: cross-tenant branchId collision returns empty, not leaked data
  - Branch scoping: branch A vs B doctor sets don't leak
  - Lineage: key==='doctor' + sourceRoleId-derived both included; unrelated custom role excluded
  - Multi-role OR test passes
  - Empty-branch UI state verified
  - Regression: existing appointment list/create/status endpoints unaffected
Dependencies: DEV-1, DEV-2, DEV-3, DEV-4, DEV-5, UIUX-1
```

## Notes for next pipeline steps

- Step 3 (@ba-agent): validate doctor-membership OR-rule + branch scoping; rule on DB-2 finding (backlog vs blocker).
- Step 3.5 (/grill-with-docs, mandatory): stress-test — (a) sourceRoleId self-ref FK cascade on role deletion, (b) ON DELETE SET NULL vs RESTRICT if system Doctor role ever deleted, (c) OR-membership join query perf at scale, (d) should branchId default to req.context.branchId when omitted instead of required query param.
- No /write-plan until BA sign-off + grill findings resolved.
