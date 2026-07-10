# Implementation Status Matrix

> **Header rule: expand a row before modifying that module.** Before you touch any
> module's code, find (or add) its row here first, confirm the row still matches
> reality, and update it as part of the SAME change — not as an afterthought.
> This matrix is the canonical status source; @pm-agent updates it LAST on every
> task (see CLAUDE.md → Tracking & Documentation).
>
> Current totals as of the Pet/EMR Item 3 merge, 2026-07-10 (PR #15, branch
> `feat/inpatient-crud`, on top of Pet/EMR Batch A, PR #14, on top of the Codex audit
> closeout 2026-07-09 Batches 1–5, PRs #8–#13, plus the seedCredentialSmoke
> isolation-flake fix 4e78e0b): **864 backend tests, 181 frontend tests.**
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
| Auth (clinic) | `/auth/login`, `/auth/select-branch` | Username + two-step branch select | `controllers/auth.controller.ts`, `services/auth.service.ts` | `views/LoginView.tsx` | `tests/integration/auth.test.ts` | implemented |
| Auth (platform) | `/platform/auth/login` | Email-based, single-step | `controllers/platform-auth.controller.ts` | `views/platform/PlatformLoginView.tsx` | `tests/integration/seedCredentialSmoke.test.ts` | implemented |
| RBAC — clinic roles | `/clinic/roles/*` | Role editor, custom roles | `routes/role.routes.ts` | `views/clinic/RoleEditorView.tsx` | `tests/integration/roleEditor-t5f01.test.ts` | implemented |
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
| Platform — plans/quotas | `/platform/plans/*` | Package + per-tenant quota mgmt (branches/users require min=1 — ADR-0007 D4) | `routes/platform-plans.routes.ts` | `views/platform/PlatformPlansView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — settings | `/platform/settings/*` | Integration secrets, AES-256-GCM; featureFlags removed (ADR-0007 D3) | `controllers/system-settings.controller.ts` | `views/platform/PlatformSettingsView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — audit log | `/platform/audit/*` | Cross-tenant audit sink | `routes/platform-audit.routes.ts` | `views/platform/PlatformAuditView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — users CRUD | — | 2-role static enum via seed only | — | — | — | deferred (ADR-0004 D6) |
| Platform — per-customer usage | `/platform/customers/:id/usage` | Live branches/users/owners vs effective quota | `routes/platform-customers.routes.ts`, `services/usage.service.ts` | `views/platform/CustomerDetailView.tsx` | — | implemented |
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
| Inpatient care-log entry | `POST /api/hospitalizations/:id/care` | **Known bug, not fixed by item 3** — `CareModal`'s payload field names (`temperature`/`weight`) don't match `careSchema` (`temperatureC`, no `weight` field); every real submission fails Zod validation. Discovered during item-3 recon, deliberately out of that item's scope; flagged as a separate follow-up task | `services/hospitalization.service.ts` | `views/clinic/ClinicInpatient.tsx` (`CareModal`) | `tests/integration/phase4.test.ts` (covers only the correctly-shaped direct-API case, not the frontend's actual payload) | bug |

Implementer note: this is a starting seed (~30 rows), not exhaustive — the header rule ("expand a row before modifying that module") is the mechanism that keeps it growing accurately over time rather than trying to enumerate everything up front.
