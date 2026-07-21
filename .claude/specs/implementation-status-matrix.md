# Implementation Status Matrix

> **Header rule: expand a row before modifying that module.** Before you touch any
> module's code, find (or add) its row here first, confirm the row still matches
> reality, and update it as part of the SAME change — not as an afterthought.
> This matrix is the canonical status source; @pm-agent updates it LAST on every
> task (see CLAUDE.md → Tracking & Documentation).
>
> Current totals as of PR #38 (2026-07-21, "unify user role assignment,
> Plan B: frontend", ADR-0019): replaced Clinic Admin's two conflicting
> role-assignment UIs (legacy hardcoded enum listbox + separate RBAC
> "Roles" section) with a single `ClinicRole`-backed listbox
> (`UserManagementTab.tsx`), fixing the reported bug where cloned custom
> roles were invisible in the picker. `GET /users` now returns
> `role: {id,name,key,isSystem}` + `isPrimaryAdmin: boolean`
> (`user.service.ts` `safe()`), retiring Plan A's transitional
> legacy-string shape — bundled in the same PR as its two consumers
> (`UserManagementTab.tsx`, `AdminBranches.tsx`'s doctor picker, which
> stays key-match-only per ADR-0019) per the Ponytail-prescribed coupling
> fix. The Admin system role is sealed against Clone and self-assignment
> in the UI (D-4: `RoleList.tsx`, `RolePermissionEditor.tsx`). A QA-caught
> P1 regression — a real clinic_admin unable to assign doctor/staff roles
> via the new listbox, because the frontend's grantability check lacked
> the backend's `roles.manage` exemption — was fixed to mirror
> `assertNoRoleEscalation` exactly (`useUserRoles.ts` `isGrantable`).
> Deleted `RolePicker.tsx`, the unrouted dead `AdminUsers.tsx` screen, and
> 3 retired multi-role hooks. Two-axis code review (Standards + Spec) and
> Protocol 5 browser-smoke QA sign-off both attached — see
> `docs/superpowers/specs/2026-07-21-unify-user-role-assignment-plan-b-qa-signoff.md`.
> Plan A (PR #37, backend — retired the multi-role-per-user capability and
> the legacy `User.role` enum column, `roleId` now the sole source of
> truth, cross-tenant BOLA fix on role assignment) merged first as its
> prerequisite. Backend 1015 → 1017 (Task 1's shape-change tests),
> frontend 291 → 279 (net decrease — `RolePicker.tsx`'s and dead
> `AdminUsers.tsx`'s dedicated test files removed, exceeding the new tests
> added) — on top of PR #33 (2026-07-20, "Usage Stats page renders real
> quota instead of fake hardcoded numbers", ADR-0018): added a 4th quota
> field `maxPets` mirroring `maxOwners` across schema, all 3 independent
> quota resolvers (platform-plane, customer-detail override, clinic-plane
> subscription), and enforcement (`assertCanAddPet` on pet creation).
> Fixed the actual reported bug: `AdminUsage.tsx` rendered a hardcoded fake
> `PLAN_LIMITS` constant instead of the tenant's real effective quota — now
> consumes real `caps` from `GET /admin/usage`. Added Max Pets to the
> Platform Console Plan editor + table, per-tenant quota override editor,
> and a 4th Pets `QuotaBar` on the Customer Detail Usage tab (QA-caught gap,
> fixed same-day). Backend 993 → 1021, frontend 283 → 291 — on top of PR
> #28 (2026-07-17, "clinic-admin password type/generate toggle + surface
> real error messages"): `PasswordField`
> reworked as a `usePasswordField()` hook so the toggle can sit in the
> dialog's action row and switch back from generated to typed mode; finished
> the `getErrorMessage()` rollout (platform login, customer list, settings
> pages, `platformApi` 401 interceptor) so real backend error text surfaces.
> No new tests (verified via `tsc --noEmit` + manual check) — counts
> unchanged at 993 backend / 283 frontend — on top of PR #24 (2026-07-16,
> "surface 403 permission-denied on clinic-admin create"): `platform_support`
> accounts lack `platform.customers.manage` so `POST /:id/admin-users`
> correctly 403s, but the frontend only special-cased
> `QUOTA_EXCEEDED`/`USERNAME_CONFLICT` and fell back to a generic error for
> everything else; fixed to surface the real message. Also on top of PR #25
> (2026-07-15, infra): bare-collection Vercel API routing fix
> (`vercel.json`) plus closing the customer-onboarding credential-delivery
> blocker doc as superseded by PR #23. Neither PR #24 nor #25 changed test
> counts. Also on top of the Clinic password UI + first-admin lockout guard
> merge, 2026-07-15/16 (PR #27, ADR-0016): frontend for PR #26's endpoints
> shipped — admin reset-password field in the Edit User modal (self-edit
> routed to Preferences, D-2) and a self-service Change Password card on
> Preferences. New backend guard `assertNotPrimaryAdminDeactivation` blocks
> deactivation AND role-demotion-away-from-admin on the tenant's primary
> admin on both `DELETE /users/:id` and `PUT /users/:id` (D-5); restore
> re-checks seat quota (D-6). Discoverable row-level Deactivate/Restore on
> User Management; platform-plane CO-4 deliberately exempted (D-7). Backend
> tests 979 → 993, frontend 256 → 283 (a live parallel `jest` run showed
> 977/993 passing — 16 failures across 2 suites look like parallel-DB-race
> artifacts, incl. a known pre-existing `roleRouteMatrix` cron-route issue;
> re-verify with `--runInBand` before treating as a regression) — on top of
> the Main Branch
> auto-provisioning + clinic password change merge, PR #26, ADR-0015
> 2026-07-15 amendment: every platform-provisioned tenant now gets a "Main
> Branch" row inside `createCustomer()`'s existing atomic transaction
> (PROV-1), plus an idempotent `backfill-main-branch.ts` script (PROV-2) for
> tenants provisioned before this fix. Clinic-plane password management
> added: self-service `POST /auth/change-password` (PWD-1, BOLA-impossible
> by design — no target-user param) and admin-assisted
> `PATCH /users/:id/password` (PWD-2, `staff.manage`-gated, tenant-scoped,
> 404-not-403 on cross-tenant per ADR-0014). All three password-affecting
> flows (self-service, admin reset, and the existing platform-plane reset)
> now revoke every refresh-token family via `revokeAllForUser` (PWD-3/PWD-0)
> — closes a gap where a stolen/forgotten 30-day refresh token stayed valid
> after a password change — on top of the Clinic Admins tab merge, PR #23,
> ADR-0015, on top of the RETEST-2026-07-13 findings closeout, 2026-07-13,
> PR #22 — independent re-test of PRs #19–#21 found 3 P1 defects: unscoped
> `performedByUser` Prisma relation include with no tenantId filter on the
> care-log performer lookup, missing FK index on
> `DailyInpatientCare.performedBy`, undefined `text-label-lg` Tailwind token
> in `ClinicInpatient.tsx`; plus a `VitalStepper` `+`-button max-clamp gap
> and 4 regression-test gaps — all closed — on top of the Log Care vitals
> modal merge, PR #21, branch `fix/log-care-vitals-modal` — Package B of the
> RecommendByCodex fixup set: heartRateBpm/respRateRpm/feedingStatus/
> medicationGiven input fields on the Log Care wizard, shared `VitalStepper`
> component extracted from ClinicEMR — on top of the Hospitalization branch
> isolation fix, PR #20, ADR-0014 (Package A: BOLA close on single-record
> hospitalization ops), on top of the Billing pipeline fixes merge, PR #19,
> ADR-0013 — Item 3 of the 2026-07 bugfix pipeline: Thai PDF font, Payment
> History receipt modal, Method/Received-by filters, Care History
> `performedBy` name resolution — on top of the Pet Profile Medical tab
> merge, PR #18, ADR-0012, on top of the Care History view, PR #17, on top
> of the remember-me redesign, PR #16, on top of Pet/EMR Item 3, PR #15, on
> top of Pet/EMR Batch A, PR #14, on top of the Codex audit closeout
> 2026-07-09 Batches 1–5, PRs #8–#13, plus the seedCredentialSmoke
> isolation-flake fix 4e78e0b:
> **1015 backend tests, 291 frontend tests** (was 993/283 through PR #27; see
> the PR #37 paragraph above for the most recent change).
> Route-level authorization is machine-verified by
> `src/backend/tests/integration/roleRouteMatrix.test.ts` — that file is the source
> of truth for per-route permission coverage; this matrix does not duplicate it.

## Release status legend
- `implemented` — shipped, no external dependency needed to function.
- `backend-only` — API + data layer shipped, no frontend surface yet.
- `frontend-only` — UI shipped ahead of/without a real backend (placeholder data).
- `bug` — shipped but currently broken; see linked issue/ADR.
- `deferred` — explicitly out of scope for now, tracked, not silently dropped.
- `credential-gated` — implemented in code but inert without external config/
  credentials (S3, PromptPay ID, payment gateway). Not the same as "implemented."

## Matrix

| Area | Screen / API route | Status | Backend evidence | Frontend evidence | Test evidence | Release status |
|---|---|---|---|---|---|---|
| Auth (clinic) | `/auth/login`, `/auth/select-branch` | Username + two-step branch select. "Remember me" recalls username(s) per subdomain (localStorage, picker popup for 2+) — session itself always ends on tab/browser/app close or 8h JWT expiry (sessionStorage-only, no persistent-session opt-in), ADR-0010 | `controllers/auth.controller.ts`, `services/auth.service.ts` | `views/LoginView.tsx`, `utils/rememberedUsernames.ts`, `store/authStore.ts` | `tests/integration/auth.test.ts`, `__tests__/LoginView.rememberMe.test.tsx`, `utils/rememberedUsernames.test.ts`, `store/__tests__/authStore.test.ts` | implemented |
| Auth (platform) | `/platform/auth/login` | Email-based, single-step | `controllers/platform-auth.controller.ts` | `views/platform/PlatformLoginView.tsx` | `tests/integration/seedCredentialSmoke.test.ts` | implemented |
| RBAC — clinic roles | `/clinic/roles/*` | Role editor, custom roles | `routes/role.routes.ts` | `views/clinic/RoleEditorView.tsx` | `tests/integration/roleEditor-t5f01.test.ts` | implemented |
| RBAC — user role assignment | `PUT /users/:id`, `POST /users` | Single-role-per-user model — `roleId` (RBAC Role table) is the sole source of truth, `User.role` enum column retired (ADR-0019, PR #37). Cross-tenant `roleId` 404s (not 403s, existence-leak precedent ADR-0014). `users.roleId` indexed. `GET /users` response `role` is now an object `{id,name,key,isSystem}` + `isPrimaryAdmin: boolean` (was a transitional legacy string). Edit User modal unified into one `ClinicRole`-backed listbox (`RolePicker.tsx` and the old separate "Roles" section deleted) — fixes the cloned-custom-role-invisible bug; Admin system role sealed against Clone/self-assignment (D-4); frontend grantability check (`isGrantable`) mirrors the backend's `roles.manage` exemption exactly (ADR-0019, PR #38, Plan B) | `services/user.service.ts`, `models/user.repository.ts`, `models/role.repository.ts` | `views/admin/UserManagementTab.tsx`, `hooks/useUserRoles.ts`, `components/roles/RoleList.tsx`, `components/roles/RolePermissionEditor.tsx`, `views/admin/AdminBranches.tsx` | `__tests__/userManagement.test.ts`, `tests/scripts/collapse-multi-role.test.ts`, `__tests__/UserManagementTab.test.tsx`, `__tests__/RoleList.test.tsx`, `__tests__/AdminBranches.test.tsx` | implemented |
| RBAC — route authorization | all clinic-mounted routes | Per-role allow/deny sweep, CI-enforced | `middlewares/permission.middleware.ts` | — | `tests/integration/roleRouteMatrix.test.ts` | implemented |
| Vaccination recording | `POST /api/vaccinations` | `vaccination.create` canonical (doctor + clinic_staff, not admin) | `routes/vaccination.routes.ts` | `views/clinic/ClinicEMR.tsx` | `tests/integration/vaccination-create-permission.test.ts` | implemented |
| Grooming status update | `PUT /api/grooming/bookings/:id/status` | Fixed Batch 2 D1 (frontend URL) | `routes/grooming.routes.ts` | `views/clinic/ClinicGrooming.tsx:278` | — | implemented |
| Blood bank registry | `/api/blood-bank/*` | Donor eligibility, bag collection, transfusions | `routes/blood-bank.routes.ts` | `views/admin/AdminBloodBank.tsx` | `tests/integration/phase4.test.ts` | implemented |
| Branch inventory transfers | `/api/inventory/transfers` | Mounted `app.ts:80` | `routes/transfer.routes.ts` | `views/clinic/ClinicInventory.tsx` | — | implemented |
| Inventory barcode scan | Inventory toolbar | ZXing camera scanner opens from ClinicInventory and fills product search; pet/microchip barcode capture remains separate/deferred | `models/product.repository.ts` | `components/BarcodeScanner/*`, `views/clinic/ClinicInventory.tsx` | frontend suite | implemented |
| Billing — invoices/receipts | `/api/invoices/*` | Browser-print receipt + PDF download | `routes/invoice.routes.ts`, `services/pdf.service.ts` | `views/clinic/ClinicBilling.tsx` | `tests/integration/invoice.test.ts`, `tests/integration/pdf.test.ts` | implemented |
| Billing — PromptPay QR | `/api/invoices/*` (QR panel) | 422 without configured `promptpayId` | `services/promptpay-qr.service.ts` | `views/clinic/ClinicBilling.tsx` | `tests/unit/promptpay-qr.test.ts` | credential-gated |
| Billing — card gateway | — | Omise/Stripe not integrated | — | — | — | deferred (Phase 10) |
| Photo upload (pets/owners) | `/api/upload/*` | 503 `STORAGE_NOT_CONFIGURED` without S3 env | `services/upload.service.ts` | `views/clinic/ClinicPets.tsx` | `__tests__/upload.test.ts` | credential-gated |
| Pet/microchip camera barcode capture | Pet/Owner forms | Not built — manual entry/photo upload only | — | `views/clinic/ClinicPets.tsx` | — | deferred |
| Platform — customers | `/platform/customers/*` | Tenant metadata, suspend/reactivate, quotas, per-customer usage (company-type detail contract fixed, ADR-0007 D2) | `routes/platform-customers.routes.ts` | `views/platform/CustomerDetailView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — trial lifecycle | customer create/edit/status | `default_trial_days` setting exists; `Tenant.trialEndsAt` schema/write flow deferred | `controllers/system-settings.controller.ts` | read-only `trialEndsAt` display only when present | `tests/integration/platformContract.test.ts` | deferred (Phase 10, ADR-0003 D2) |
| Platform — company types | `/platform/company-types` | Plane client/path fixed; Customer Detail's `companyTypeId` scalar + picker label bug fixed (ADR-0007 D2) | `routes/platform-company-type.routes.ts` | `views/platform/CustomerDetailView.tsx:42` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — plans/quotas | `/platform/plans/*` | Package + per-tenant quota mgmt (branches/users require min=1 — ADR-0007 D4); 4th dimension `maxPets` added mirroring `maxOwners` (PR #33, ADR-0018) | `routes/platform-plans.routes.ts` | `views/platform/PlatformPlansView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — settings | `/platform/settings/*` | Integration secrets, AES-256-GCM; featureFlags removed (ADR-0007 D3) | `controllers/system-settings.controller.ts` | `views/platform/PlatformSettingsView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — audit log | `/platform/audit/*` | Cross-tenant audit sink | `routes/platform-audit.routes.ts` | `views/platform/PlatformAuditView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — users CRUD | — | 2-role static enum via seed only | — | — | — | deferred (ADR-0004 D6) |
| Platform — per-customer usage | `/platform/customers/:id/usage` | Live branches/users/owners/pets vs effective quota (`maxPets` added PR #33, ADR-0018 — was fake hardcoded `PLAN_LIMITS` on the clinic-side `AdminUsage.tsx` before this fix) | `routes/platform-customers.routes.ts`, `services/usage.service.ts`, `routes/admin.routes.ts` | `views/platform/CustomerDetailView.tsx`, `views/admin/AdminUsage.tsx` | `tests/integration/platformConsole.test.ts`, `__tests__/adminSettings.test.ts` | implemented |
| Platform — clinic admin users | `/platform/customers/:id/admin-users/*` | First `clinic_admin` auto-created in `createCustomer()`'s transaction; ongoing create/list/deactivate/reset-password scoped to `clinic_admin`-role users only (bounded plane-separation exception, ADR-0015) | `routes/platform-customers.routes.ts`, `services/platform-customers.service.ts` | `components/platform/ClinicAdminsTab.tsx` | `tests/integration/platform-customer-admin-users.test.ts` | implemented |
| Platform — cross-tenant usage aggregate | `/platform/usage` | Aggregate dashboard not built | — | — | — | deferred (ADR-0004 D6) |
| Platform — per-tenant provisioning API | `/platform/customers/:id/provisioning` | Backend GET/PUT with encrypted/masked secrets | `routes/platform-customers.routes.ts`, `services/platform-provisioning.service.ts` | — | — | backend-only |
| Platform — provisioning UI | Customer Detail Provisioning tab | Secret-entry form (S3/SMTP/LINE) not built; tab is placeholder | backend API above | `views/platform/CustomerDetailView.tsx` | — | deferred (ADR-0004 D6) |
| Platform — customer deletion | — | Suspend only; delete/retention not built | `routes/platform-customers.routes.ts` (suspend) | — | — | deferred (Phase 10, ADR-0004 D6) |
| i18n (Thai/English) | all clinic screens | 16 screens, no library, EN/TH | `frontend/src/i18n` | all `views/clinic/*` | frontend suite (95 of 143) | implemented |
| Username login (D-1) | `/auth/login` | Replaces email login for clinic plane | `services/auth.service.ts` | `views/LoginView.tsx` | `tests/integration/auth.test.ts` | implemented |
| Company types (D-2) | `/platform/company-types` | See platform row above; ADR-0007 D2 companyTypeId scalar + label bug fixed | `routes/platform-company-type.routes.ts` | `views/platform/CustomerDetailView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Payment history (D-3) | owner/pet billing history | Historical invoice list | `controllers/invoice.controller.ts` | `views/clinic/ClinicPets.tsx` | `tests/integration/invoice.test.ts` | implemented |
| Owner-first browse (D-4/D-5) | pets/owners search | Owner-first navigation flow | `routes/owner.routes.ts` | `views/clinic/ClinicPets.tsx` | `__tests__/owner-delete-reactivate.test.ts` | implemented |
| Payment gateway (Phase 10) | — | Omise/Stripe webhooks | — | — | — | deferred (needs credentials) |
| LINE/SMS dispatch (Phase 11) | — | Real notification dispatch | — | — | — | deferred (needs credentials) |
| Pet edit (Batch A item 1) | `PUT /api/pets/:id` | Edit Pet modal added to `PetDetail`, mirrors `OwnerPanel` edit pattern; backend was already fully wired | `services/pet.service.ts`, `models/pet.repository.ts` | `views/clinic/ClinicPets.tsx` | `__tests__/EditPetModal.test.tsx`, `__tests__/PetDetail.editButton.test.tsx` | implemented |
| Pet weight ↔ EMR sync (Batch A item 2) | `POST/PUT /api/medical-records` | `Pet.weightKg` recomputed in-transaction from latest non-null-weight record on every save; atomic conditional UPDATE-subquery, no pessimistic lock (ADR-0008) | `models/medical-record.repository.ts` | `views/clinic/ClinicEMR.tsx` | `tests/integration/medical-record-weight-sync.test.ts`, `__tests__/ClinicEMR.weightSync.test.tsx` | implemented |
| EMR vitals free-text input (Batch A item 4) | EMR Objective tab | `VitalStepper` numeric `<input>` (blur-commit) alongside +/- buttons; bounds match tightened Zod validation (999.99/999.9/3000/3000) | `services/medical-record.service.ts` | `views/clinic/ClinicEMR.tsx` | `__tests__/VitalStepper.test.tsx` | implemented |
| Inpatient create/edit/delete (item 3) | `POST/PUT/DELETE /api/hospitalizations/:id` | Admit UI added (was fully missing on frontend), edit + care-log-gated hard delete added (reuses `inpatient.manage`, ADR-0009); fixed a pre-existing board-crashing field mismatch (`cageNumber`/`admitReason`/`doctor.name` never existed on the API response) | `services/hospitalization.service.ts`, `models/hospitalization.repository.ts` | `views/clinic/ClinicInpatient.tsx`, `views/clinic/ClinicPets.tsx` | `tests/integration/hospitalization-crud.test.ts`, `__tests__/ClinicInpatient.test.tsx`, `__tests__/PetDetail.admitButton.test.tsx` | implemented |
| Inpatient care-log entry | `POST /api/hospitalizations/:id/care` | **Fixed (PR #17)** — `CareModal`'s payload field names now match `careSchema` (`temperature`→`temperatureC`; removed a `weight` field that had no backend key). Body-temperature input already existed pre-fix; only the wire field name was wrong | `services/hospitalization.service.ts` | `views/clinic/ClinicInpatient.tsx` (`CareModal`) | `tests/integration/phase4.test.ts`, `__tests__/ClinicInpatient.test.tsx` | implemented |
| Inpatient care-log history (LCV-1) | `GET /api/hospitalizations/:id` (existing endpoint, reused) | Read-only "View Care History" button on `CageCard` → `CareHistoryModal`, lists `careLogs` newest-first (already server-sorted). No new endpoint/permission/migration. Scoped to admitted hospitalizations only — board never renders discharged cards (ADR-0011); discharged-admission history deferred to Pet Profile Medical tab. `performedBy` name resolution: **fixed (PR #19, ADR-0013)**, **re-scoped (PR #22)** — resolved via a separate tenant-filtered `User` lookup rather than an unscoped Prisma relation `include` (the include joined on `users.id` only, no `tenantId`, so a malformed/legacy `performedBy` row could have leaked another tenant's staff name); same `{id,name}|null` response shape, falls back to `Staff #<id>` then `—`. FK now has a supporting index (PR #22 migration) | `models/hospitalization.repository.ts` (`findById`), `migrations/*_add_performed_by_user_fk`, `migrations/*_add_performed_by_index` | `views/clinic/ClinicInpatient.tsx` (`CareHistoryModal`) | `tests/integration/phase4.test.ts` (tenant isolation on `GET /:id`), `__tests__/ClinicInpatient.test.tsx` (performer-name fallback chain) | implemented |
| Hospitalization branch isolation (Package A) | `GET/PUT/DELETE /api/hospitalizations/:id`, `POST /api/hospitalizations/:id/care`, `PUT /api/hospitalizations/:id/discharge`, `GET /api/hospitalizations/active` | **Fixed (PR #20, ADR-0014)** — closed a BOLA gap (OWASP API1:2023): single-record ops were scoped by `tenantId` only, letting a branch-scoped `inpatient.view`/`inpatient.manage` holder read/edit/delete/log-care/discharge another branch's admission by guessing the numeric ID. `branchId` is now derived only from `req.context` (never body/path/query) and threaded through get/edit/remove/logCare/discharge; cross-branch-same-tenant access returns 404 (not 403); `/active` no longer trusts `req.query.branchId` over context; all-branch/admin sessions (`branchId` null) unaffected. **PR #22** widened the all-branch-admin regression tests to exercise both Branch A and Branch B on PUT/DELETE/POST-care (previously only GET was dual-branch-tested), and made the discharge-blocked test assert invoice count is unchanged, not just hospitalization status | `controllers/hospitalization.controller.ts`, `services/hospitalization.service.ts`, `models/hospitalization.repository.ts` | — | `tests/integration/hospitalization-branch-isolation.test.ts` (24 tests: cross-branch 404 + DB-state-unchanged, cross-tenant 404, all-branch-admin regression) | implemented |
| Log Care vitals/nursing fields (Package B) | `POST /api/hospitalizations/:id/care` (existing endpoint, reused) | **Added (PR #21)** — Log Care wizard now has input fields for `heartRateBpm`, `respRateRpm`, `feedingStatus` (picklist + "Other" free text), `medicationGiven` (explicit documentation note, not a verified MAR); backend `careSchema` already accepted all four, no backend changes. Numeric-input logic extracted from `ClinicEMR.tsx` into shared `components/VitalStepper.tsx`, reused by both screens (no duplicated stepper logic). **PR #22** fixed the `+` button not clamping to `max` (only blur-commit did, so repeated clicks could exceed the field's ceiling), replaced 3 undefined `text-label-lg` Tailwind tokens with the documented `text-label-md`, and added an explicit test for "Other → preset → Other" feeding-status draft preservation (behavior was already correct, just untested) | — (no backend changes) | `views/clinic/ClinicInpatient.tsx` (`CareModal`), `components/VitalStepper.tsx` (new, shared) | `__tests__/ClinicInpatient.test.tsx`, `__tests__/VitalStepper.test.tsx` | implemented |
| Pet Profile Medical tab (PR #18) | `GET /api/pets/:id` (existing endpoint, reused) | Redesigned as a permission-aware, read-only EMR rollup (Option C hybrid, ADR-0012). `allergies`/`underlyingConditions` stay pet-level `crm.edit` fields, unchanged. `medicalRecords`/`vaccinations` now conditionally included server-side on caller's `emr.view` (closes a pre-existing over-fetch gap where both were always returned regardless of permission); "View all in EMR" drill-in navigates to `ClinicEMR.tsx?petId=<id>` (new `useSearchParams` support there). "Add Vaccination" button hidden when `vaccinations` is server-omitted. No new endpoint/permission/migration | `models/pet.repository.ts` (`findPetById`), `services/pet.service.ts`, `controllers/pet.controller.ts` | `views/clinic/ClinicPets.tsx`, `views/clinic/ClinicEMR.tsx` | `tests/integration/pet-medical-degradation.test.ts`, `__tests__/ClinicPetsMedicalTab.test.tsx`, `__tests__/ClinicEMR.petIdParam.test.tsx` | implemented |
| Billing — Thai PDF font (PR #19, ADR-0013) | `POST /api/invoices/:id/pdf`, prescription PDF | **Fixed** — Thai invoice/prescription PDFs used a Thai-only font subset (`NotoSansThai-Regular.ttf`, later swapped to Sarabun OFL-1.1 after the primary Noto URL 404'd) with zero Latin-character/digit glyph coverage, corrupting mixed Thai/English/numeric text. Glyph-coverage smoke test added for both invoice and prescription PDFs (grill finding F1) | `services/pdf.service.ts`, `assets/fonts/*`, `docs/adr/FONT-LICENSE.txt` | — | `tests/integration/pdf-font-coverage.test.ts` (fontkit glyph assertions), `tests/integration/pdf.test.ts` | implemented |
| Billing — Payment History receipt modal (PR #19, ADR-0013) | `GET /api/invoices/payment-history`, `GET /api/invoices/:id` | Payment History rows now open a read-only receipt modal (reuses existing `GET /:id`, no new endpoint). History-triggered modal deliberately omits the post-sale success-banner copy (grill finding F2). `payment-history` select widened to include `invoice.id` (BA correction) | `controllers/invoice.controller.ts` | `views/clinic/ClinicBilling.tsx` | `__tests__/ClinicBilling.test.tsx`, `tests/integration/invoice.test.ts` | implemented |
| Billing — Payment History filters (PR #19, ADR-0013) | `GET /api/invoices/payment-history?method=&receivedBy=` | Method + Received-by filter dropdowns added; `receivedByOptions` embedded in the existing payment-history response (no new endpoint), tenant+branch scoped, faceted by the active date range (documented behavior, not a bug — grill finding F3) | `controllers/invoice.controller.ts`, `services/invoice.service.ts` | `views/clinic/ClinicBilling.tsx` | `tests/integration/invoice.test.ts`, `__tests__/ClinicBilling.test.tsx` | implemented |

| Main Branch auto-provisioning (PROV-1/PROV-2, PR #26) | `createCustomer()` transaction (no new route); `scripts/backfill-main-branch.ts` (manual, one-time per environment) | **Fixed** — every platform-provisioned tenant previously got zero `Branch` rows, blocking all staff/doctor login. A "Main Branch" row is now created inside the existing atomic transaction, before the role lookup, so the ADR-0015 all-or-nothing guarantee still holds (rollback removes tenant + branch together via cascade FK). Idempotent backfill script covers tenants provisioned before this fix; run manually per environment (Q-G4, not wired into CI/deploy) | `services/platform-customers.service.ts`, `scripts/backfill-main-branch.ts` | — (no frontend change; existing branch-selection UI now has data to show) | `tests/integration/platform-customer-admin-users.test.ts` (CO-1 extension: branch creation, rollback, two-step staff login), `tests/integration/backfill-main-branch.test.ts` | implemented |
| Clinic password management (PWD-0/1/2/3, PR #26) | `POST /auth/change-password`, `PATCH /users/:id/password` | **Added** — no prior way for a clinic user to change their own password or for a clinic_admin to reset a peer/staff/doctor's password. Self-service change requires current password (BOLA-impossible by design, no target-user param); admin reset is `staff.manage`-gated, tenant-scoped `updateMany`, 404-not-403 on cross-tenant (ADR-0014 precedent); a clinic_admin may reset a peer clinic_admin's password (Q-G1). All three password-affecting flows (these two plus the existing platform-plane reset) now revoke every refresh-token family (`revokeAllForUser`) so a stolen 30-day refresh token stops working immediately; the 8h access JWT residual is an accepted, documented gap (Q-G3) | `controllers/auth.controller.ts`, `services/auth.service.ts`, `controllers/user.controller.ts`, `services/user.service.ts`, `models/user.repository.ts`, `models/refresh-token.repository.ts` | — (no frontend UI this batch — backend-only per plan scope) | `tests/integration/password-management.test.ts`, `tests/unit/refresh-token.repository.test.ts`, CO-5 extension in `tests/integration/platform-customer-admin-users.test.ts` | backend-only |

| Clinic password UI (A1/A2, PR #27) | `PATCH /users/:id/password` (existing), `POST /auth/change-password` (existing) | **Added** — frontend for PR #26's backend-only endpoints. A1: admin reset-password field inside the Edit User modal (`staff.manage`-gated), hidden on self-edit and routed to A2 instead (ADR-0016 D-2). A2: self-service Change Password card on Preferences (current+new+confirm). Both surface the server's real error message via the existing `describeSaveError` pattern | — (no backend changes) | `views/admin/UserManagementTab.tsx`, `views/settings/PreferencesPage.tsx`, `hooks/useChangePassword.ts` | `__tests__/UserManagementTab.test.tsx`, `__tests__/PreferencesPage.test.tsx` | implemented |
| First-admin lockout guard (ADMIN-PROT-2, PR #27, ADR-0016) | `DELETE /users/:id`, `PUT /users/:id` | **Added** — `assertNotPrimaryAdminDeactivation` in `user.service.ts` throws 403 on the tenant's primary admin (lowest-id legacy `role='admin'`) when a request would deactivate them OR change `role` away from `'admin'` (D-5, role-demotion bypass closed by grill). Restore (`isActive:false→true`) now re-checks `assertCanAddUser` seat quota (D-6, grill finding). Platform-plane CO-4 (`deactivateTenantAdminUser`) deliberately NOT guarded — documented recovery-path exemption (D-7) | `services/user.service.ts`, `models/user.repository.ts` (`findPrimaryAdminId`) | `views/admin/UserManagementTab.tsx` (disables "Active account" checkbox + lock note for primary admin) | `tests/integration/password-management.test.ts` extension, `__tests__/UserManagementTab.test.tsx` | implemented |
| Discoverable Deactivate/Restore (USER-DISC-1, PR #27) | `DELETE /users/:id`, `PUT /users/:id {isActive:true}` | **Added** — direct Deactivate button on active rows (simple confirm dialog, ADR-0016 D-4), Restore on inactive rows; primary-admin row shows a disabled lock icon instead of Deactivate. Restore surfaces server error (e.g. seat-quota 403) instead of failing silently | — (reuses existing endpoints) | `views/admin/UserManagementTab.tsx` | `__tests__/UserManagementTab.test.tsx` | implemented |

| Billing — VAT configuration (PR #39, ADR-0020) | `GET/PUT /api/settings/clinic` (existing endpoints, extended), `POST /api/invoices` (contract narrowed) | **Added** — per-clinic VAT mode (`none`/`exclusive`/`inclusive`) + editable rate on `TenantSettings` (default `exclusive`/7, zero behavior change for existing tenants), configured by Clinic Admin in Clinic Setting via a toggle (on/off) + radio (Exclusive/Inclusive), reusing `clinic.profile.edit`/`clinic.profile.view` — no new endpoint or permission. `createInvoiceSchema`'s client-suppliable `taxRate` is removed (`.strict()`); `invoice.service.ts`'s `computeVat()` resolves VAT server-side from the tenant's setting instead, closing a per-invoice tampering vector. Cart, receipts (in-app + printed), and the PDF hide the VAT line for `none` and show `(Ex. VAT)`/`(Inc. VAT)` suffixes on the price column and subtotal row for the other two modes. `hospitalization.service.ts`'s discharge-invoice call site updated in lockstep (would break under the narrowed `.strict()` schema otherwise) | `services/invoice.service.ts`, `services/tenant-settings.service.ts`, `controllers/settings.controller.ts`, `services/hospitalization.service.ts`, `services/pdf.service.ts`, `prisma/migrations/20260721134853_add_tenant_settings_vat/` | `views/settings/ClinicProfilePage.tsx`, `views/clinic/ClinicBilling.tsx`, `hooks/useClinicSettings.ts`, `hooks/useInvoices.ts` | `tests/integration/vat-config.test.ts`, `tests/integration/settings-api.test.ts` (TC-S008 permission boundary), `tests/integration/phase4.test.ts`/`pdf.test.ts` (strict-schema fixes), `__tests__/ClinicBilling.test.tsx` (`calcVat()` 3-mode unit tests) | implemented |

Implementer note: this is a starting seed (~30 rows), not exhaustive — the header rule ("expand a row before modifying that module") is the mechanism that keeps it growing accurately over time rather than trying to enumerate everything up front.
