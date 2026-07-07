# Implementation Status Matrix

> **Header rule: expand a row before modifying that module.** Before you touch any
> module's code, find (or add) its row here first, confirm the row still matches
> reality, and update it as part of the SAME change — not as an afterthought.
> This matrix is the canonical status source; @pm-agent updates it LAST on every
> task (see CLAUDE.md → Tracking & Documentation).
>
> Current totals as of this batch (Codex Audit Batches 1–4): **832 backend tests,
> 143 frontend tests.** Route-level authorization is machine-verified by
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
| Inventory barcode scan | Pets/Inventory barcode field | Manual text field, no camera scan | `models/product.repository.ts` | `views/clinic/ClinicPets.tsx`, `views/clinic/ClinicInventory.tsx` | — | deferred |
| Billing — invoices/receipts | `/api/invoices/*` | Browser-print receipt + PDF download | `routes/invoice.routes.ts`, `services/pdf.service.ts` | `views/clinic/ClinicBilling.tsx` | `tests/integration/invoice.test.ts`, `tests/integration/pdf.test.ts` | implemented |
| Billing — PromptPay QR | `/api/invoices/*` (QR panel) | 422 without configured `promptpayId` | `services/promptpay-qr.service.ts` | `views/clinic/ClinicBilling.tsx` | `tests/unit/promptpay-qr.test.ts` | credential-gated |
| Billing — card gateway | — | Omise/Stripe not integrated | — | — | — | deferred (Phase 10) |
| Photo upload (pets/owners) | `/api/upload/*` | 503 `STORAGE_NOT_CONFIGURED` without S3 env | `services/upload.service.ts` | `views/clinic/ClinicPets.tsx` | `__tests__/upload.test.ts` | credential-gated |
| Camera barcode capture | Pet/Inventory forms | Not built — manual entry only | — | — | — | deferred |
| Platform — customers | `/platform/customers/*` | Tenant provisioning, quotas | `routes/platform-customers.routes.ts` | `views/platform/CustomerDetailView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — company types | `/platform/company-types` | Fixed Batch 2 D2 (client) | `routes/platform-company-type.routes.ts` | `views/platform/CustomerDetailView.tsx:42` | — | implemented |
| Platform — plans/quotas | `/platform/plans/*` | Package + per-tenant quota mgmt | `routes/platform-plans.routes.ts` | `views/platform/PlatformPlansView.tsx` | `tests/integration/platformContract.test.ts` | implemented |
| Platform — settings | `/platform/settings/*` | Integration secrets, AES-256-GCM | `controllers/system-settings.controller.ts` | `views/platform/PlatformSettingsView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — audit log | `/platform/audit/*` | Cross-tenant audit sink | `routes/platform-audit.routes.ts` | `views/platform/PlatformAuditView.tsx` | `tests/integration/auditRedaction.test.ts` | implemented |
| Platform — users CRUD | — | 2-role static enum via seed only | — | — | — | deferred (ADR-0004 D6) |
| Platform — usage aggregate | — | Per-customer usage shipped; cross-tenant aggregate not | `routes/platform-customers.routes.ts` (per-customer) | `views/platform/CustomerDetailView.tsx` | — | deferred (ADR-0004 D6) |
| Platform — provisioning UI | — | Secret-entry form (S3/SMTP/LINE) not built | — | — | — | deferred (ADR-0004 D6) |
| Platform — customer deletion | — | Suspend only; delete/retention not built | `routes/platform-customers.routes.ts` (suspend) | — | — | deferred (Phase 10, ADR-0004 D6) |
| i18n (Thai/English) | all clinic screens | 16 screens, no library, EN/TH | `frontend/src/i18n` | all `views/clinic/*` | frontend suite (95 of 143) | implemented |
| Username login (D-1) | `/auth/login` | Replaces email login for clinic plane | `services/auth.service.ts` | `views/LoginView.tsx` | `tests/integration/auth.test.ts` | implemented |
| Company types (D-2) | `/platform/company-types` | See platform row above | — | — | — | implemented |
| Payment history (D-3) | owner/pet billing history | Historical invoice list | `controllers/invoice.controller.ts` | `views/clinic/ClinicPets.tsx` | `tests/integration/invoice.test.ts` | implemented |
| Owner-first browse (D-4/D-5) | pets/owners search | Owner-first navigation flow | `routes/owner.routes.ts` | `views/clinic/ClinicPets.tsx` | `__tests__/owner-delete-reactivate.test.ts` | implemented |
| Payment gateway (Phase 10) | — | Omise/Stripe webhooks | — | — | — | deferred (needs credentials) |
| LINE/SMS dispatch (Phase 11) | — | Real notification dispatch | — | — | — | deferred (needs credentials) |

Implementer note: this is a starting seed (~30 rows), not exhaustive — the header rule ("expand a row before modifying that module") is the mechanism that keeps it growing accurately over time rather than trying to enumerate everything up front.
