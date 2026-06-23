# Review By Codex

Date: 2026-06-22  
Repository: `D:\Development\AnimalClinic`

## Scope

This review covers the application as currently implemented across clinic and platform features, with emphasis on role behavior, implemented workflows, build/test health, authorization, tenant isolation, and feature completeness.

Not included: phases or items that are explicitly future work or not implemented yet, such as payment gateway integrations and LINE/SMS dispatch. The findings below focus on code paths and screens that already exist in the application.

## Verification Run

| Area | Command | Result |
| --- | --- | --- |
| Backend build | `npm run build` in `src/backend` | Passed |
| Backend tests | `npm test` in `src/backend` | Passed, but emitted repeated audit write errors for platform mutations |
| Frontend build | `npm run build` in `src/frontend` | Failed |
| Frontend tests | `npm test -- --run` in `src/frontend` | Failed: 1 test failed, 94 passed |
| Git status | `git status --short` | Blocked by Git dubious ownership safety check |

Frontend build failures:

- `src/__tests__/PlatformConsole.test.tsx:282` and `src/__tests__/PlatformConsole.test.tsx:295`: `Array.at()` is used but the TypeScript lib target does not include ES2022.
- `src/views/clinic/ClinicInpatient.tsx:37`: `STATUS_LABELS` is declared but unused.

Frontend test failure:

- `src/__tests__/Dashboard.i18n.test.tsx:22`: `screen.getByText(/นัดหมายวันนี้/i)` matches multiple elements.
- Test output also shows runtime errors from `src/frontend/src/views/platform/CustomerDetailView.tsx:255`, where `UsageTab` reads `.current` from an undefined value.

Backend test warning/error output:

- Platform mutation routes trigger `audit log write failed` errors because the clinic audit middleware attempts to write `AuditLog` rows without a `tenantId`.

## Role And Feature Walkthrough

### Platform Super Admin / Platform Operator

Implemented surfaces reviewed:

- Platform login and authenticated platform shell.
- Customer list/detail.
- Customer provisioning and quotas.
- Plan/package management.
- Platform settings.
- Platform audit page.
- Platform usage/customer detail tabs.

Main issues found:

- Platform routes only check platform plane, not platform permission codes.
- Platform settings frontend and backend contracts do not match.
- Generic clinic audit middleware fails for platform mutations.
- Platform auth state is memory-only and is lost on browser refresh.
- Platform customer detail test output shows a runtime error in the usage tab.

### Clinic Admin

Implemented surfaces reviewed:

- Clinic admin users page.
- Role editor and permission model.
- Clinic settings layout.
- Branch-aware clinic context.
- Reports and audit-related areas.

Main issues found:

- Routed user management page still uses a legacy single-role workflow.
- Multi-role UI exists elsewhere but is not integrated into the routed user management page.
- User role read endpoint expected by frontend hooks is missing.
- Role assignment endpoint is guarded by `roles.manage`, but the RBAC matrix requires `staff.assign_role`.
- Clinic user creation/update is still legacy-role oriented and may not create `user_roles` rows.
- Old clinic `/settings/system` page remains present even though system settings moved to platform plane.

### Doctor / Veterinarian

Implemented surfaces reviewed:

- Dashboard.
- Appointment workflow.
- Pet profile and EMR.
- Prescription panel.
- Inpatient-related frontend code.

Main issues found:

- Appointment and EMR repository paths are not consistently branch-scoped.
- EMR prescription add flow is not usable from the UI because drug search does not select a product.
- Medical record creation can create records without a branch id even though the schema supports branch scoping.
- Frontend build is blocked by an unused inpatient constant.

### Clinic Staff / Reception / Operations

Implemented surfaces reviewed:

- CRM/customer and pet management.
- Appointment list and updates.
- Inventory and stock movement flows.
- Billing/POS invoices and payments.
- Grooming and operational screens where present.

Main issues found:

- Invoice listing, invoice detail, and payment recording are tenant-scoped but not branch-scoped.
- Appointment listing and status updates are tenant-scoped but not consistently branch-scoped.
- Reports mix branch-specific and tenant-wide numbers.
- Some update/delete repository operations rely on prior service checks instead of including tenant/branch in the write `where` clause.

## Findings And Amend Plan

### P0 - Frontend Cannot Build

Evidence:

- `src/__tests__/PlatformConsole.test.tsx:282`
- `src/__tests__/PlatformConsole.test.tsx:295`
- `src/views/clinic/ClinicInpatient.tsx:37`

Issue:

The frontend TypeScript build fails because tests use `Array.at()` without an ES2022 lib target, and `ClinicInpatient.tsx` has an unused `STATUS_LABELS` constant.

Impact:

The application cannot pass frontend build verification or CI as-is.

Claude Code amend plan:

1. Replace `Array.at()` in tests with index access or update the frontend TypeScript lib target deliberately.
2. Remove or use `STATUS_LABELS` in `ClinicInpatient.tsx`.
3. Re-run `npm run build` and `npm test -- --run` in `src/frontend`.

### P0 - Platform Settings Screen Cannot Save Or Load Correctly

Evidence:

- `src/frontend/src/hooks/usePlatformSettings.ts`
- `src/frontend/src/views/platform/PlatformSettingsView.tsx`
- `src/backend/routes/system-settings.routes.ts`
- `src/backend/controllers/system-settings.controller.ts`

Issue:

The platform settings UI expects `GET /platform/settings` to return one aggregate settings object and expects `PUT /platform/settings` to save a partial settings object. The backend exposes row/key-based routes: `GET /platform/settings`, `GET /platform/settings/:key`, and `PUT /platform/settings/:key`. There is no aggregate `PUT /platform/settings`.

Impact:

The implemented platform settings page cannot reliably load the shape it expects and cannot save through the endpoint it calls.

Claude Code amend plan:

1. Decide one contract: aggregate settings object or key/value rows.
2. Update backend routes/controllers or frontend hook/form to match that contract.
3. Add tests for loading and saving SMTP, storage, security, and maintenance settings.

### P0 - Platform Routes Lack Platform Permission Enforcement

Evidence:

- `src/backend/routes/platform-customers.routes.ts`
- `src/backend/routes/platform-plans.routes.ts`
- `src/backend/routes/platform-audit.routes.ts`
- `src/backend/routes/system-settings.routes.ts`
- `src/backend/services/platform-auth.service.ts`

Issue:

Platform routes use `requirePlane('platform')`, but do not enforce platform permissions such as `platform.customers.manage`, `platform.plans.manage`, `platform.settings.edit`, or `platform.audit.view`. `platformGetMe` returns `permissions: []`, and the service comments indicate the platform RBAC permission model is not implemented yet.

Impact:

Any authenticated platform-plane user can access or mutate platform resources that should be role-restricted. This breaks the implemented platform roles model and makes read-only/support roles unsafe.

Claude Code amend plan:

1. Implement platform role permission resolution for platform users.
2. Add a platform `requirePermission` guard or extend the existing guard to support platform permission codes.
3. Apply route-level permissions according to the platform RBAC matrix.
4. Add tests proving support/read-only users cannot mutate customers, plans, quotas, settings, or audit data.

### P0 - Branch Isolation Is Incomplete For Implemented Clinic Workflows

Evidence:

- `src/backend/models/appointment.repository.ts`
- `src/backend/controllers/appointment.controller.ts`
- `src/backend/models/invoice.repository.ts`
- `src/backend/controllers/invoice.controller.ts`
- `src/backend/models/medical-record.repository.ts`
- `src/backend/services/report.service.ts`

Issue:

Several branch-scoped workflows filter only by `tenantId` and do not consistently include `branchId`. This affects appointments, invoices, payments, EMR records, and parts of reports.

Examples:

- Appointment list/detail/conflict checks are tenant-scoped but not branch-scoped.
- Invoice list/detail/payment recording are tenant-scoped but not branch-scoped.
- Medical record creation sets `tenantId` but does not consistently set `branchId`.
- Reports mix branch-specific inventory with tenant-wide revenue and invoice values.

Impact:

Users in one branch may see or act on another branch's operational data. This violates the implemented multi-branch isolation rules.

Claude Code amend plan:

1. Thread `branchId` from authenticated context into appointment, invoice, EMR, payment, and report service/repository calls.
2. Include `tenantId` and `branchId` in all branch-scoped reads, writes, updates, and deletes.
3. Define explicit exceptions for tenant-wide admin reports, if allowed.
4. Add cross-branch negative tests for each affected module.

### P0 - Platform Mutations Fail Generic Audit Logging

Evidence:

- `src/backend/middlewares/audit.middleware.ts`
- `src/backend/models/audit.repository.ts`
- `src/backend/prisma/schema.prisma`

Issue:

The generic audit middleware writes to clinic `AuditLog` using `ctx.tenantId`. Platform users have no tenant id, so platform mutations trigger Prisma validation errors. The schema has a separate `PlatformAuditLog`, but the generic middleware does not route platform events there.

Impact:

Backend tests pass but emit repeated audit errors. Platform audit coverage is unreliable for exactly the operations where auditability matters most.

Claude Code amend plan:

1. Update audit middleware to detect platform plane requests.
2. Write platform events to `PlatformAuditLog`, or skip generic audit where explicit platform audit logging already exists.
3. Add tests that platform customer, plan, quota, and settings mutations create valid platform audit records without console errors.

### P1 - Multi-Role User Management Is Incomplete In The Routed UI

Evidence:

- `src/frontend/src/App.tsx`
- `src/frontend/src/views/admin/AdminUsers.tsx`
- `src/frontend/src/views/admin/UserManagementTab.tsx`
- `src/frontend/src/hooks/useUserRoles.ts`
- `src/backend/routes/clinic.routes.ts`
- `src/frontend/src/views/clinic/RoleEditorView.tsx`

Issue:

The routed clinic user management screen is `AdminUsers`, which still uses a legacy single-role modal and role options such as `admin`, `doctor`, and `staff`. A newer multi-role component exists in `UserManagementTab`, but it does not appear to be the routed page. The frontend hook expects `GET /clinic/users/:userId/roles`, but the backend does not expose that route. `RoleEditorView` also has an unimplemented `handleAssignStaff` path.

Impact:

The implemented RBAC/multi-role feature is not complete from the actual clinic admin workflow. Staff role assignment is inconsistent and partly unreachable.

Claude Code amend plan:

1. Integrate `RolePicker` into the routed clinic users page.
2. Add the missing `GET /clinic/users/:userId/roles` endpoint.
3. Remove or migrate legacy single-role create/update behavior.
4. Wire staff assignment from the role editor or remove the unfinished control.
5. Add UI and backend tests for multi-role assignment and removal.

### P1 - Role Assignment Uses The Wrong Permission Code

Evidence:

- `src/backend/routes/role.routes.ts`
- `src/backend/tests/user-roles-t5f03.test.ts`

Issue:

Assigning and removing user roles is guarded by `roles.manage`. The RBAC matrix requires `staff.assign_role` for `POST /users/:id/roles` and `DELETE /users/:id/roles`.

Impact:

Role editing and staff role assignment cannot be delegated independently. This violates the implemented permission catalogue and makes clinic admin access control less precise.

Claude Code amend plan:

1. Change assign/remove user-role route guards to `staff.assign_role`.
2. Keep role definition create/update/delete under `roles.manage`.
3. Add tests proving a user with `staff.assign_role` can assign allowed roles but cannot edit role definitions.
4. Preserve existing no-escalation and at-least-one-role protections.

### P1 - Clinic User Creation May Not Create RBAC Join Rows

Evidence:

- `src/backend/controllers/user.controller.ts`
- `src/backend/services/user.service.ts`
- `src/backend/models/user.repository.ts`

Issue:

Clinic user create/update still accepts legacy role values. The repository creates a `User`, but does not create a `user_roles` row in the normal create path found during review.

Impact:

Newly created clinic users may be able to log in but have no permissions resolved by the RBAC guard, depending on the route. This makes user onboarding unreliable after the RBAC migration.

Claude Code amend plan:

1. Make role assignment explicit during user creation.
2. Create `user_roles` rows transactionally with the user.
3. Stop relying on legacy `User.role` for authorization decisions.
4. Add tests for newly created doctor, staff, and clinic admin users accessing their expected routes.

### P1 - EMR Prescription Add Flow Is Not Usable From UI

Evidence:

- `src/frontend/src/views/clinic/ClinicEMR.tsx`
- Existing backend prescription and inventory routes are present.

Issue:

The prescription panel has a drug search input and `selectedDrug` state, but the input does not query/render/select products. No path calls `setDrug(...)`, so the selected drug remains null and prescription creation cannot proceed from the UI.

Impact:

Doctors cannot complete an implemented prescription workflow from the EMR screen.

Claude Code amend plan:

1. Wire drug search to the product/inventory API.
2. Render selectable medicine/vaccine results.
3. Set the selected product and validate branch stock before submitting.
4. Add UI tests for adding and clearing a prescription item.

### P1 - Auth Security Requirements Are Incomplete

Evidence:

- `src/backend/config/env.ts`
- `src/backend/routes/auth.routes.ts`
- `src/backend/services/auth.service.ts`
- `src/backend/package.json`

Issue:

The default bcrypt cost is `10`, while the non-functional requirements require at least `12`. Auth routes expose login/me/switch-branch, but no refresh-token endpoint was found. No login rate-limiting dependency or middleware was found.

Impact:

The implemented auth module falls short of the project security requirements.

Claude Code amend plan:

1. Raise default bcrypt rounds to at least `12`.
2. Add refresh token storage/rotation and a refresh endpoint.
3. Add login rate limiting.
4. Add tests for lockout/rate limit behavior and refresh rotation.

### P2 - Stale Clinic System Settings Route Remains After Platform Split

Evidence:

- `src/frontend/src/App.tsx`
- `src/frontend/src/views/settings/SystemSettingsPage.tsx`
- `src/frontend/src/hooks/useSystemSettings.ts`

Issue:

The clinic route `/settings/system` still renders a system settings page that checks for a removed `superadmin` clinic role and calls `/admin/system-settings`. System settings now live in platform plane under `/platform/settings`.

Impact:

This stale route creates a dead or misleading screen for clinic users and duplicates the platform settings concept.

Claude Code amend plan:

1. Remove the clinic `/settings/system` route or redirect it to the platform settings area.
2. Delete or migrate `SystemSettingsPage` and `useSystemSettings`.
3. Ensure clinic settings contain only clinic-plane configuration.

### P2 - Platform Auth State Is Lost On Refresh

Evidence:

- `src/frontend/src/store/platformAuthStore.ts`
- `src/frontend/src/layouts/PlatformLayout.tsx`

Issue:

The platform auth store keeps token/user state only in memory. Refreshing a platform route clears the token and redirects to `/platform/login`.

Impact:

Platform users are logged out on every browser refresh, unlike the clinic auth experience.

Claude Code amend plan:

1. Persist platform auth state to session storage or local storage.
2. Rehydrate state before route guard redirects.
3. Add a test for refreshing or reloading an authenticated platform route.

### P2 - Some Repository Writes Do Not Include Tenant/Branch In The Write Filter

Evidence:

- `src/backend/models/user.repository.ts`
- `src/backend/models/appointment.repository.ts`
- `src/backend/models/prescription.repository.ts`
- `src/backend/models/role.repository.ts`

Issue:

Some update/delete methods write by primary id only after a service-level tenant check. Project database rules require tenant-scoped writes to include tenant context in the write `where` clause where possible.

Impact:

Practical risk is reduced by globally unique IDs and prior service checks, but this violates the repository safety pattern and weakens defense in depth.

Claude Code amend plan:

1. Convert affected update/delete calls to scoped `updateMany`/`deleteMany` or composite where patterns.
2. Include `tenantId` and `branchId` where the model is branch-scoped.
3. Add tests proving cross-tenant ids are not updated or deleted.

## Recommended Claude Code Execution Order

1. Unblock frontend build and test failures.
2. Fix platform settings contract because the screen is currently unusable.
3. Implement platform permission enforcement and platform audit routing.
4. Close branch isolation gaps for appointments, invoices, EMR, payments, and reports.
5. Complete multi-role user management in the routed clinic admin flow.
6. Correct role assignment permission from `roles.manage` to `staff.assign_role`.
7. Make clinic user creation create RBAC join rows.
8. Wire the EMR prescription product search and selection flow.
9. Complete auth hardening: bcrypt default, refresh tokens, and login rate limiting.
10. Remove stale clinic system settings route and persist platform auth state.
11. Tighten tenant/branch scoping in repository write filters.

## Final Notes

The backend build and test suite are mostly healthy, but the audit errors during backend tests should be treated as defects, not ignored noise. The frontend is currently blocked at build time, so fixing build/test health should be the first amendment before deeper feature work.

The highest-risk functional defects are platform authorization, branch isolation, and platform settings. These affect security and basic operability of implemented screens.
