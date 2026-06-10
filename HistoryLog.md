# Specification & Schema Sync History Log

---

## 📅 Log Entry: 2026-06-10 — Phase 1.5-B: Settings API (S2.1, S2.2-minimal, S2.3, S4.1, S4.2)

### 🎯 Summary
HTTP layer for the Settings module. 10 endpoints at `/api/settings` (clinic profile/notifications/payment/integrations/hours — admin only; personal preferences — all roles) plus a minimal System Settings API at `/admin/system-settings` gated by a **new `superadmin` Role enum value** (user-approved decision; seed login `super@anemal.co`). Test endpoints (`/notifications/test`, `/integrations/test`, `/smtp/test`) are fully stateless with a 10s timeout. Added a **masked-echo guard**: a client saving back the masked `••••••••xxxx` value can never overwrite a stored secret. Tests: 206 total (182 + 24 new, TC-S001–S009).

### 📂 Files Changed
| File | Action |
|---|---|
| `src/backend/prisma/schema.prisma` + `migrations/20260610134121_phase1_5b_settings_api/` (incl. `down.sql`) | `superadmin` enum value; `users.language` + `users.defaultCalendarView` |
| `src/backend/controllers/settings.controller.ts` | **NEW** — per-section `.strict()` zod schemas (body `tenantId` → 400), thin handlers |
| `src/backend/routes/settings.routes.ts` | **NEW** — mounted at `/api/settings` |
| `src/backend/controllers/system-settings.controller.ts` + `routes/system-settings.routes.ts` | **NEW** — minimal S2.2, superadmin-only |
| `src/backend/services/connection-test.service.ts` | **NEW** — stateless LINE / SMS / Lab / SMTP checks, never writes DB |
| `src/backend/services/user-preferences.service.ts` + `models/user.repository.ts` | **NEW service** — tenant-scoped per-user prefs |
| `src/backend/services/tenant-settings.service.ts` | Masked-echo guard for secret fields |
| `src/backend/types/index.ts`, `middlewares/rbac.middleware.ts`, `services/auth.service.ts` | Role unions extended with `superadmin` |
| `src/backend/prisma/seed.ts` | Superadmin seed user (`super@anemal.co` / `SuperPass1!`) |
| `src/backend/app.ts` | Mount `/api/settings` + `/admin/system-settings` |
| `src/backend/tests/integration/settings-api.test.ts` | **NEW** — 24 endpoint tests (TC-S001–S009 + hours/prefs/no-persist) |

### ✅ Verification
- `npx tsc --noEmit` clean; migration applied to `vetclinic_dev`; reseed OK
- All 206 tests pass (24 new) — isolation, RBAC, ciphertext-in-DB, masked responses, stateless test endpoints
- Superadmin ↔ clinic-admin route separation verified both directions (403 each way)

### ➡️ Next Step
Phase 1.5-D — Settings frontend (S3.1 layout, S3.2 profile, S3.3 hours, S3.4 notifications, S3.5 payment page → **unblocks Session C PromptPay QR**, S3.6 integrations, S3.7 system settings page). All APIs are ready.

---

## 📅 Log Entry: 2026-06-10 — Phase 1.5-A: Settings DB + Encryption (S1.1–S1.4, S2.4)

### 🎯 Summary
Database foundation for the Settings & Configuration module. **Design decision (user-approved):** extended the existing `tenant_settings` table instead of creating the roadmap's `clinic_settings` (avoids duplicating logo/phone/address/taxId; `tenant.name` stays the source of truth for clinic name). New: `system_settings` (platform-global, 10 seeded rows, Anemal branding), `settings_audit_log` (field-level trail, `tenantId NULL` = system change), and AES-256-GCM encryption for secret fields (`lineOaToken`, `smsApiKey`, `gbprimepaySecret`, `labApiKey`) — stored as `enc:v1:<iv>:<tag>:<ct>`, masked (`••••••••xxxx`) on read. Tests: 182 total (161 + 21 new).

### 📂 Files Changed
| File | Action |
|---|---|
| `src/backend/prisma/schema.prisma` | Extended `TenantSettings` (12 new cols + `updatedBy` FK); new `SystemSettings`, `SettingsAuditLog` models |
| `src/backend/prisma/migrations/20260610081405_phase1_5a_settings/` | **NEW** — migration + idempotent system_settings seed + `down.sql` (first migration with a down script) |
| `src/backend/utils/encryption.ts` | **NEW** — `encryptField`/`decryptField`/`maskSecret`/`isEncrypted` (AES-256-GCM, versioned format, legacy-plaintext passthrough) |
| `src/backend/config/env.ts` | `SETTINGS_ENCRYPTION_KEY` required at startup (`.env` + `.env.example` updated) |
| `src/backend/models/system-settings.repository.ts` | **NEW** — thin Prisma wrapper (not tenant-scoped; super-admin only at route layer) |
| `src/backend/models/settings-audit.repository.ts` | **NEW** — `createMany` / `list` |
| `src/backend/models/tenant-settings.repository.ts` | Added `upsertSettingsWithAudit` (upsert + audit rows in one `$transaction`) |
| `src/backend/services/tenant-settings.service.ts` | `SECRET_FIELDS` encrypt-on-write / mask-on-read; per-field audit diff; `getDecryptedSettings` for future dispatch code |
| `src/backend/services/system-settings.service.ts` | **NEW** — same pattern, `tenantId: null` audits |
| `src/backend/prisma/seed.ts` | Explicit `tenantSettings` upsert per seeded tenant (S2.4) |
| `src/backend/tests/unit/encryption.test.ts` | **NEW** — roundtrip, unique IV, tamper, masking (TC-S007) |
| `src/backend/tests/integration/settings.test.ts` | **NEW** — ciphertext-in-DB (TC-S005), masked reads (TC-S006), audit rows, isolation, seeds |

### ✅ Verification
- `npx tsc --noEmit` clean; migration applied cleanly to `vetclinic_dev`
- All 182 tests pass (21 new)
- DB direct read confirms `smsApiKey` stored as `enc:v1:...`, never plaintext
- `system_settings` row count = 10 after migration

### ➡️ Next Step
Phase 1.5-B — Backend API (S2.1 clinic settings endpoints, S2.2 system settings endpoints, S2.3 personal preferences). Service layer is ready; controllers/routes + RBAC guards (admin-only PUT, super-admin for system settings) are what remains. After that, S3.5 Payment Page unblocks Session C (PromptPay QR).

---

## 📅 Log Entry: 2026-06-10 — Session B: PDF Receipts + Prescription Slips

### 🎯 Summary
Added server-side PDF generation for invoices and prescription slips using `pdfkit` with NotoSansThai font embed for Thai character support. Two new streaming endpoints and a "Download PDF" button in ClinicBilling alongside the existing "Print Receipt" button. Tests: 161 total (155 + 6 new PDF tests).

### 📂 Files Changed
| File | Action |
|---|---|
| `src/backend/assets/fonts/NotoSansThai-Regular.ttf` | **NEW** — Thai-compatible font for pdfkit (37KB, from Google Fonts) |
| `src/backend/services/pdf.service.ts` | **NEW** — `generateInvoicePdf(tenantId, id)` + `generatePrescriptionPdf(tenantId, id)` → Buffer |
| `src/backend/models/prescription.repository.ts` | Added `findPrescriptionWithDetails()` (drug + medicalRecord + pet + owner) |
| `src/backend/controllers/invoice.controller.ts` | Added `downloadInvoicePdf` handler |
| `src/backend/controllers/prescription.controller.ts` | Added `handleDownloadPrescriptionPdf` handler |
| `src/backend/routes/invoice.routes.ts` | Added `GET /:id/pdf` (before `/:id` to avoid masking) |
| `src/backend/routes/prescription.routes.ts` | Added `GET /:id/pdf` |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | `downloadPdf()` helper + "PDF" button in SuccessModal |
| `src/backend/tests/integration/pdf.test.ts` | **NEW** — 6 tests: happy path + 404 + tenant isolation for both endpoints |

### ✅ Verification
- `npx tsc --noEmit` clean
- All 161 tests pass (6 new PDF tests included)
- Invoice PDF contains `%PDF` magic bytes, `Content-Type: application/pdf`
- Tenant B cannot access Tenant A's invoice or prescription PDF (→ 404)

---

## 📅 Log Entry: 2026-06-10 — Session A: Screen Specs 03–05 written

### 🎯 Summary
Closed the documentation gap for the three Phase-2 screens that shipped without formal specs. Each spec was extracted from the Stitch prototype + the actual shipped component, following the `02-dashboard.md` structure (Layout → header → component anatomy with exact Tailwind classes → Behaviour/API table → deferred items).

### 📂 Files Changed
| File | Action |
|---|---|
| `.claude/skills/anemal-screen-specs/references/03-appointments.md` | **NEW** — calendar grid, status colors, booking panel, detail modal |
| `.claude/skills/anemal-screen-specs/references/04-pet-owner.md` | **NEW** — master/detail split, species chips, 3 modals, tabs |
| `.claude/skills/anemal-screen-specs/references/05-emr.md` | **NEW** — 3-column workspace, SOAP tabs, vital steppers, anatomy canvas, prescriptions |
| `.claude/skills/anemal-screen-specs/SKILL.md` | Index rows 03–05 → Implemented; removed "not specced" warning |
| `CLAUDE.md` / `session-summary.md` / `.claude/roadmap/remaining-tasks.md` / `docs/*.html` | Removed "Screen specs 03–05" from deferred lists; Session A marked done |

### 🐞 Findings recorded as deferred items (no code changed)
- `ClinicEMR.tsx` hardcodes `doctorId: 1` on save — should come from the auth store.
- EMR drug-search input is not wired to any query — `selectedDrug` is unreachable via search until Session D (barcode) wires it.

### ✅ Verification
- No raw hex colors in the three new specs (grep clean); the documented `PEN_COLORS` canvas exception lives only in component code.
- All API endpoints in spec Behaviour tables match the actual `api.*` calls in each view.

---

## 📅 Log Entry: 2026-06-09 — Application rebrand → "Anemal"

### 🎯 Summary
Renamed the product brand to **Anemal** everywhere users and readers see it. Consolidated the prior inconsistent names — "VetClinic Pro", "VetClinic SaaS", "VetClinic", and "VetCare" — into a single brand, and updated the on-screen domain suffix `*.vetclinic.app` / `*.vetcare.app` → `*.anemal.app`.

### 📂 Scope
- **App UI:** `index.html` title, `TopNav`, `AdminLayout`/`ClinicLayout` sidebar brand, `LoginView` (brand ×2 + footer + domain suffix), `AdminUsage`/`SubscriptionTab` domain suffix, `ClinicBilling` receipt header; backend `server.ts` startup log banner.
- **Docs:** README, CLAUDE.md, CHANGELOG, DESIGN, AGENTS, HOW-TO-RUN, session-summary, this log, design-alignment-plan, all `.claude/specs/*` + `screen-specs`, `.claude/roadmap/*`, `.claude/agents/*`, `docs/index.html` + `dashboard.html` + `functional_spec_detailed.html` + `vetcare_functional_spec.tex` (content only).

### 🚫 Deliberately left unchanged
- Read-only `stitch_vet_clinic_design_system/**`, archived `_archive/**`, build output `dist/**`.
- Infra identifiers: npm package names (`vetclinic-frontend`/`-backend`), Docker `vetclinic-pg`, DB `vetclinic_dev`, S3 bucket, JWT secret, localStorage keys (`vetclinic_sidebar_*`, `vetclinic-ui`), and the `vetcare_functional_spec.tex` filename (kept so doc links don't break).
- Descriptive words "veterinary"/"vet".

### ✅ Verification
- `tsc --noEmit` frontend + backend: 0 errors · `npm test`: **155/155** (no code path touched).
- Browser: login page title/brand/footer + `.anemal.app`; clinic sidebar reads **Anemal**; no "VetClinic" string remains in any rendered view.

---

## 📅 Log Entry: 2026-06-09 — Phase 4 Frontend Session B + audit read endpoint

### 🎯 Summary
Completed the remaining Phase 4 admin UI and the loyalty checkout integration; added the missing audit read endpoint.

### 📂 Files Changed
| File | Action |
|---|---|
| `src/backend/services/audit.service.ts` | **NEW** — `listAudit()` (pagination + filters over write-once trail) |
| `src/backend/controllers/audit.controller.ts` | **NEW** — thin `GET` handler |
| `src/backend/routes/audit.routes.ts` | **NEW** — `GET /api/audit` (admin-only) |
| `src/backend/app.ts` | Mounted `/api/audit` |
| `src/backend/tests/integration/phase4.test.ts` | +3 audit tests (paginated read, tenant-scoped, staff 403) → **155 tests** |
| `src/frontend/src/views/admin/AdminBranches.tsx` | Real impl — branch list, create/edit modal, doctor-shifts panel (add/delete) |
| `src/frontend/src/views/admin/AdminBloodBank.tsx` | Real impl — Donors/Bags/Transfusions tabs, register/collect/transfuse modals, expiry badges, client-side compatibility guard |
| `src/frontend/src/views/admin/AdminAudit.tsx` | Real impl — paginated read-only table, filters (user/action/date), expandable JSON diff |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | Loyalty at checkout — balance + tier, redeem (1pt=฿1, ≤20% cap), points-earned toast |

### 🐞 Fix during verification
- **Missing `/api` prefix** on many Session A+B calls (proxy only forwards `/api`, `/auth`, `/users`, `/admin`). Corrected hospitalizations/grooming/branches/blood-bank/audit/reports paths; grooming pet-search switched from non-existent `/owners/search` to `/api/search`. Browser-verified all three admin screens load live data.
- AdminAudit list used a bare `<>` fragment in `.map()` → keyed `<Fragment>`.

### ✅ Verification
- `tsc --noEmit` backend + frontend: 0 errors · `npm test`: **155/155** · browser: Branches/BloodBank/Audit render live data, audit row-expand works.

---

## 📅 Log Entry: 2026-06-09 — Login "Invalid credentials" diagnosis + Clinic ID auto-fill fix

### 🎯 Root cause
Staff (and in fact any role) login failed with *"Invalid credentials"* when the **Clinic ID** field was empty. On `localhost` the subdomain auto-detect needs a 3-part hostname (e.g. `dev-clinic.anemal.app`) and otherwise left the field blank → tenant lookup fails → 401. The seed, password hashes, and backend auth were all verified correct (live login of `staff@dev-clinic.com` / `StaffPass1!` returns a valid token).

### 🔧 Fix
- `src/frontend/src/views/LoginView.tsx` — Clinic ID now defaults to `dev-clinic` on `localhost`/`127.0.0.1` so dev logins don't fail on an empty tenant field. Verified end-to-end in browser preview: staff login → redirect to `/clinic/dashboard`.
- `docs/index.html` + `HOW-TO-RUN.md` — clarified Clinic ID requirement, added both `dev-clinic` (`Pass1!`) and `test-clinic` (`Pass2!`) credential tables with a warning about the suffix difference.

---

## 📅 Log Entry: 2026-06-09 — Phase 4 Frontend Session A

### 🎯 Summary
Built the clinic-side Phase 4 UI and admin dashboard upgrade. Backend report endpoint also added.

### 📂 Files Changed
| File | Action |
|---|---|
| `src/backend/models/report.repository.ts` | Added `branchRevenue()` — per-branch paid invoice aggregate with optional date range |
| `src/backend/services/report.service.ts` | Added `getBranchRevenue()` |
| `src/backend/controllers/report.controller.ts` | Added `getBranchRevenue` handler |
| `src/backend/routes/report.routes.ts` | Added `GET /branch-revenue` route |
| `src/frontend/src/layouts/ClinicLayout.tsx` | Added Inpatient + Grooming nav items |
| `src/frontend/src/layouts/AdminLayout.tsx` | Added Branches, Blood Bank, Audit Log nav items |
| `src/frontend/src/App.tsx` | Added lazy routes for all Phase 4 screens |
| `src/frontend/src/views/clinic/ClinicInpatient.tsx` | **NEW** — Cage board grid, care-log 3-step stepper modal, discharge with confirm |
| `src/frontend/src/views/clinic/ClinicGrooming.tsx` | **NEW** — Day timeline, booking cards, status-cycle, new-booking modal with pet search |
| `src/frontend/src/views/admin/AdminDashboard.tsx` | Added inpatient + grooming KPI cards + branch revenue Recharts bar chart with date range |
| `src/frontend/src/views/admin/AdminBranches.tsx` | **NEW** stub (Session B) |
| `src/frontend/src/views/admin/AdminBloodBank.tsx` | **NEW** stub (Session B) |
| `src/frontend/src/views/admin/AdminAudit.tsx` | **NEW** stub (Session B) |
| `.claude/launch.json` | Created — dev server config for preview tool |

### ✅ Verification
- `tsc --noEmit` backend + frontend: 0 errors
- `npm test`: 152/152 pass (no regressions)
- `vite build`: succeeds, all Phase 4 chunks bundled as lazy splits

---

## 📅 Log Entry: 2026-06-05 — Functional Spec v2.0 — Full Module Detail Expansion

### 🎯 Motivation & Purpose
Expanded functional specification to v2.0. All 13 modules now include: description, process flows, prerequisites, functional requirements table (FR-XX-XX IDs with MUST/SHOULD/COULD priority), additional details, and detailed testing criteria. LaTeX source fully rewritten for xelatex compilation with TikZ architecture diagram, cover page, and proper TOC.

### 📂 Files Changed
| File | Action | Description |
|---|---|---|
| `docs/vetcare_functional_spec.tex` | **UPDATED v2.0** | Full LaTeX rewrite: cover page, TikZ arch diagram, all 13 modules with FR tables, testing criteria, appendices. Compile: `xelatex vetcare_functional_spec.tex` (run twice) |
| `docs/functional_spec_detailed.html` | **UPDATED v2.0** | Added Functional Requirements table and Additional Details to all 13 modules; security hardening checklist in FR-12; transfer flow in FR-06; hard-block prescription safety note in FR-05 |
| `docs/index.html` | **MODIFIED** | Updated spec links to v2.0 |

### 📋 Key Additions Per Module
- **FR-01:** FR table (6 items), rate-limit/brute-force detail, token storage pattern, inactive-admin guard
- **FR-02:** FR table, RLS implementation detail, cross-tenant test suite description
- **FR-03:** FR table (9 items), drug allergy safety rule detail
- **FR-04:** FR table, double-booking algorithm detail, reminder cron idempotency
- **FR-05:** FR table (8 items), hard-block prescription safety box, DICOM/anatomy canvas detail
- **FR-06:** FR table (7 items), multi-branch transfer 6-step flow
- **FR-07:** FR table, VAT formula, PromptPay QR detail, loyalty integration note
- **FR-08:** FR table, cage board color coding, nursing handover immutability, discharge billing
- **FR-09:** FR table, capacity enforcement algorithm, vet-grooming combo invoice
- **FR-10:** FR table, donor eligibility rules (56/30 day), blood type warning behavior
- **FR-11:** FR table, tier upgrade trigger, redemption cap (20%), points immutability
- **FR-12:** FR table, 9-control security hardening table
- **FR-13:** FR table, report isolation detail, Redis cache 30s TTL, materialised snapshot

---

## 📅 Log Entry: 2026-06-05 — Comprehensive Functional Specification Document

### 🎯 Motivation & Purpose
Created full functional specification covering all 13 modules (FR-01 to FR-13), system architecture, infrastructure, SaaS application management, non-functional requirements, integration requirements, testing strategy, and database schema reference.

### 📂 Files Changed
| File | Action | Description |
|---|---|---|
| `docs/vetcare_functional_spec.tex` | **NEW** | LaTeX source — print-ready PDF functional spec (compile with `pdflatex`) |
| `docs/functional_spec_detailed.html` | **REPLACED** | Comprehensive HTML version with sidebar nav, per-module detail: description, workflow, prerequisites, additional details, testing criteria |
| `docs/index.html` | **MODIFIED** | Added nav links + home cards for Detailed Functional Spec and LaTeX source |

### 📋 Modules Covered
FR-01 Auth/RBAC, FR-02 Multi-Tenancy, FR-03 Pet & Owner, FR-04 Appointments, FR-05 EMR, FR-06 Inventory, FR-07 Billing/POS, FR-08 Inpatient, FR-09 Grooming, FR-10 Blood Bank, FR-11 Loyalty, FR-12 Security/Audit, FR-13 Reports. Plus: Architecture, Infrastructure, Application Management (SaaS Platform Level), Testing Strategy, NFRs, DB Schema Reference.

---

## 📅 Log Entry: 2026-06-05 — Phase 3 Commercial (Inventory, Billing/POS, Reports, Subscription)

### 🎯 Motivation & Purpose
Implement Phase 3 so a clinic can run commercially: manage inventory → auto-deduct on dispense → build invoices → take payment → view revenue, plus MVP SaaS plan enforcement. Built strictly on the existing layered architecture (CLAUDE.md).

### 🧭 Scope decisions (locked with user)
- **Inventory = flat tenant-scoped** (`InventoryItem.stockQuantity` kept) + new tenant-scoped `StockMovement` ledger. `branch_inventory`/`branch_id`-in-JWT deferred to **Phase 4**.
- **Commercial integrations = lightweight**: browser-print receipt, placeholder PromptPay QR, manual payment confirm, manual barcode entry (no pdfkit / node-qrcode / camera / gateway).
- **Subscription = MVP**: `planTier` + `GET /api/subscription/status` + 402 user-limit enforcement (no gateway).
- **Analytics = recharts** revenue chart on the dashboard.

### 📂 Files Changed
| File | Action | Description |
|---|---|---|
| `src/backend/prisma/schema.prisma` | **MODIFIED** | New `StockMovement` model; `Invoice` gains `invoiceNo`(unique/tenant), `issuedAt`, `subtotal`, `discount`, `discountReason`, `taxRate`, `notes`, `createdBy`, `updatedAt`; `petId` optional; `PaymentStatus` += `refunded` |
| `prisma/migrations/20260605142920_phase3_commercial/` | **NEW** | Forward migration for the above |
| `src/backend/models/{product,invoice,report,subscription}.repository.ts` | **NEW** | Repository layer (tenant-scoped; raw SQL double-quotes camelCase columns) |
| `src/backend/services/{product,invoice,report,subscription}.service.ts` | **NEW** | Business logic + co-located Zod schemas + `AppError` subclasses |
| `src/backend/controllers/{product,invoice,report,subscription}.controller.ts` | **NEW** | Thin handlers |
| `src/backend/routes/{product,invoice,report,subscription}.routes.ts` | **NEW** | Mounted `/api/products`, `/api/invoices`, `/api/reports`, `/api/subscription` in `app.ts` |
| `src/backend/utils/errors.ts` | **MODIFIED** | `PaymentRequiredError` (402, `PLAN_LIMIT_REACHED`) |
| `src/backend/services/user.service.ts` | **MODIFIED** | Enforce plan user-limit on create |
| `src/backend/models/prescription.repository.ts` | **MODIFIED** | Dispense/restock now writes a `StockMovement` (Task 3.1.2) |
| `src/backend/models/{prescription,appointment}.repository.ts` | **FIXED** | Raw SQL used snake_case columns that don't exist (DB columns are camelCase) — quoted to camelCase so stock-deduction & double-booking checks actually run |
| `src/backend/prisma/seed.ts` | **MODIFIED** | 6 sample products for Tenant A |
| `src/frontend/src/hooks/{useInventory,useInvoices,useReports,useSubscription}.ts` | **NEW** | React Query hooks |
| `src/frontend/src/views/clinic/ClinicInventory.tsx` | **REPLACED** | Full inventory UI (stub → real) |
| `src/frontend/src/views/clinic/ClinicBilling.tsx` | **REPLACED** | Full POS UI (stub → real) |
| `src/frontend/src/views/clinic/ClinicDashboard.tsx` | **MODIFIED** | recharts revenue chart + inventory-alerts + revenue KPIs |
| `src/frontend/src/views/admin/SubscriptionTab.tsx` | **MODIFIED** | Plan usage vs limit |
| `src/frontend/{package.json,vite.config.ts,tsconfig.json}` | **MODIFIED** | recharts dep, `/api` proxy, `skipLibCheck` |
| `.claude/specs/screen-specs/06-inventory.md`, `07-billing-pos.md` | **NEW** | Screen specs |
| `src/backend/__tests__/{inventory,invoice,reports,subscription}.test.ts` | **NEW** | 27 tests (isolation + edge cases) |

### 🐛 Notable finding (fixed)
Prisma `@@map`s table names but **not column names** → DB columns are camelCase. Pre-existing Phase 2 raw SQL (prescription stock-deduct, appointment double-booking) used snake_case and silently failed against the real DB (no Phase 2 DB tests existed). All raw SQL now double-quotes camelCase columns and is covered by tests.

### ✅ Verification
- `prisma migrate deploy` applied `phase3_commercial`; `prisma generate` clean.
- **131 backend tests pass** (104 prior + 27 new); backend `tsc` clean.
- Frontend `tsc` + `vite build` clean (recharts lazy-loads with the dashboard chunk).
- Seed adds 6 products; manual flow ready on dev-clinic.
- ⚠️ `eslint` is not installed in either package (lint scripts exist but no binary) — pre-existing tooling gap, not a Phase 3 regression.

---

## 📅 Log Entry: 2026-06-05 — Bugfix: remember-me, invisible buttons, F5 logout

### 🎯 Motivation & Purpose
Three user-reported frontend defects: (1) "Remember me" did nothing, (2) several dark
`bg-primary` buttons showed no label text, (3) pressing F5 bounced the user back to the
login page instead of reloading the current page.

### 🐞 Root Causes
- **Auth was memory-only** — `authStore` (Zustand) had no persistence/rehydration, so on
  refresh `token` was `null` and `ProtectedRoute` redirected to `/login` (#1, #3).
- **Invalid Tailwind tokens** — Tailwind v3 `flattenColorPalette` generates nested color
  keys as `text-{color}-on`. Clinic views/layouts used the non-existent prefix form
  `text-on-primary` / `text-on-secondary(-container)` / `text-on-error-container` /
  `text-on-primary-fixed`, which produced **no** CSS rule → text inherited dark
  `on-surface` over black `bg-primary` = invisible (#2).

### 📂 Files Changed

| File Path | Action | Description |
|---|---|---|
| `src/frontend/src/store/authStore.ts` | **MODIFIED** | Persist auth to web storage + synchronous rehydrate on load. `setAuth(data, remember)`: remember→localStorage, else sessionStorage; `clearAuth` wipes both. Key `vc_auth`. |
| `src/frontend/src/hooks/useAuth.ts` | **MODIFIED** | `LoginPayload` carries `remember`; stripped from POST body; `onSuccess` passes it to `setAuth`. |
| `src/frontend/src/views/LoginView.tsx` | **MODIFIED** | `handleSubmit` now sends `{ ...form, remember }`. |
| 11 view/layout files | **MODIFIED** | Renamed invalid `text-on-*` classes → valid `text-{color}-on(-container)`; `text-on-primary-fixed`→`text-on-surface`. (ClinicLayout, AdminLayout, TopNav, ClinicDashboard, ClinicAppointments, ClinicEMR, ClinicPets, ClinicProfileTab, ClinicSettingsTab, UserManagementTab, SubscriptionTab) |

### ✅ Verification
`tsc --noEmit` clean · `npm run build` ok · built CSS confirms `text-primary-on`→#fff,
`text-secondary-on-container`→#00714e, and old `text-on-primary` emits 0 rules.

### 🔐 Note
Persisting a JWT in web storage carries XSS exposure — accepted per the explicit
remember-me requirement; sessionStorage limits the window for the non-remember case.

---

## 📅 Log Entry: 2026-06-05 — Compliance Audit vs CODING_RULES & Design Plan

### 🎯 Motivation & Purpose
Validate all development to date against `.claude/specs/CODING_RULES.md` and `design-alignment-plan.md`. Fix clear, localized violations; document larger structural deviations for a directional decision.

### 📂 Files Changed (fixes applied)

| File Path | Action | Description |
|---|---|---|
| `src/frontend/src/views/admin/AdminUsage.tsx` | **MODIFIED** | Replaced emoji KPI icons (🐾👤📅💳) with `MaterialIcon` — fixes CODING_RULES §10 / design-plan rule 3 (Material Symbols only, no emoji) |
| `src/frontend/src/views/clinic/ClinicEMR.tsx` | **MODIFIED** | Removed decorative emoji from `TEMPLATES`; hoisted raw canvas pen hexes into documented `PEN_COLORS` constant (canvas needs literal colors) — fixes raw-hex-in-JSX flag |

### 🔁 Refactor — COMPLETE (branch `refactor/coding-rules-alignment` → remote `ouimu/AnimalClinic`, private)
Git initialised + pushed; baseline `8e628fa` on `main`. All 8 deviations resolved; every step kept 104 backend tests green + tsc clean (backend **and** frontend now type-clean).

| Commit | Deviation | What |
|---|---|---|
| `2c32fe3` | #7 | Removed dead code: unused FE views/components, BE re-export stubs, empty dirs, old SQL migrator |
| `d5f3c7b` | #5 | `utils/errors.ts` (AppError + subclasses), `utils/logger.ts`, global `error-handler` middleware; `server.ts` console.log→logger |
| `22b316a` | #6 | Enabled `noUnusedLocals`/`noUnusedParameters`; fixed fallout |
| `8e29bf8` | #6 | Reparented 8 service error classes onto `AppError` |
| `a11cbf2` | #5 | `validate()` middleware wired into every POST/PUT route; controllers read validated `req.body` + `next(err)`; `.strict()` schemas |
| `8acd8b0`·`34dff52`·`71e3661`·`d78afaa` | #3 | Repository layer for all 11 services — services are now Prisma-free; raw SQL + transactions live in `models/*.repository.ts` |
| `9b3b7da` | #8 | Tokenized admin views (no raw gray/red/green/blue/amber/white utilities) |
| `4ae73ec` | #2 | Renamed BE files to `kebab.layer.ts`; updated all imports |
| `318eb30` | #1 | Flattened `src/backend/src/*` → `src/backend/*` to match §1 exactly |
| `38b8944` | §13 | Removed unused FE imports — frontend tsc now passes clean |

#### Notes / intentionally not changed
- **Shared schemas** (§5 `src/shared/schemas/`): request schemas are validated via the new `validate()` middleware but kept co-located with their service/controller. A true cross-package `src/shared/` requires a workspace/monorepo build setup (separate FE/BE `tsconfig`/Vite); deferred to avoid destabilising the build with no test coverage to catch regressions.
- **Test layout**: tests remain under `tests/` + `__tests__/` (not co-located `*.test.ts`); jest config drives this. Left as-is.
- Canvas pen hexes in `ClinicEMR.tsx` kept as a documented `PEN_COLORS` constant (canvas APIs need literal color values).

---

## 📅 Log Entry: 2026-06-05 — Documentation & Status Sync

### 🎯 Motivation & Purpose
Tracking files were out of sync with the actual codebase state. Phase 1 and Phase 2 were both fully implemented but not marked complete in the roadmap files, task checklists, or HTML dashboards.

### 📂 Files Changed

| File Path | Action | Description |
|---|---|---|
| `.claude/roadmap/phase1-tasks.md` | **MODIFIED** | Marked all tasks [x] complete; updated date to 2026-06-05 |
| `.claude/roadmap/phase2-tasks.md` | **MODIFIED** | Marked completion checklist [x] done; updated date/note |
| `docs/dashboard.html` | **MODIFIED** | Phase 2 → Complete (100%); overall 50%; stats updated (40+ files, 11 API groups, 104 tests, 25 DB tables, 2 phases remaining) |
| `docs/index.html` | **MODIFIED** | Added Phase 2 completion changelog entry |
| `HistoryLog.md` | **MODIFIED** | This entry — documentation sync |

### ✅ Current Status
- **Phase 1**: COMPLETE ✅ — Auth, RBAC, multi-tenancy, Admin section (6 pages), Clinic Dashboard, 74+ tests
- **Phase 2**: COMPLETE ✅ — Pet/Owner CRUD, Appointments + Calendar, EMR + Anatomy Canvas, Prescriptions, Vaccinations; 104 tests passing
- **Phase 3**: NOT STARTED — Inventory, Billing/POS, PDF Receipts, PromptPay, SaaS Subscriptions
- **Phase 4**: NOT STARTED — Multi-branch, Hospitalization, Grooming, Blood Bank, Loyalty, Audit Logs

---

## 📅 Log Entry: 2026-06-04 — Phase 2 Core Clinic Operations Implemented

### 🎯 Motivation & Purpose
Implement Phase 2 backend APIs and frontend views for Pet/Owner management, Appointment scheduling, and EMR (Electronic Medical Record). Goal: clinic can receive patients → record EMR → dispense medication in a complete workflow.

### 📂 Files Changed

| File Path | Action | Description |
|---|---|---|
| `src/backend/prisma/schema.prisma` | **MODIFIED** | Added `Vaccination` + `Attachment` models; added `allergies`, `underlyingConditions`, `color` to Pet; added vital signs + `anatomyAnnotation` to MedicalRecord; wired relations to Tenant |
| `prisma/migrations/20260604145107_phase2_clinical_tables/` | **NEW** | Auto-generated migration for all Phase 2 schema changes |
| `src/backend/src/services/ownerService.ts` | **NEW** | Owner CRUD with duplicate-phone 409 detection |
| `src/backend/src/services/petService.ts` | **NEW** | Pet CRUD with soft-delete, owner validation |
| `src/backend/src/services/searchService.ts` | **NEW** | Quick search across pet name, owner name, phone, microchipId |
| `src/backend/src/services/appointmentService.ts` | **NEW** | Appointment CRUD, raw SQL double-booking overlap check, walk-in |
| `src/backend/src/services/medicalRecordService.ts` | **NEW** | SOAP + vitals + attachments, blocks edit on paid invoices |
| `src/backend/src/services/prescriptionService.ts` | **NEW** | Stock deduction inside serializable transaction (TOCTOU-safe) |
| `src/backend/src/services/vaccinationService.ts` | **NEW** | Vaccination CRUD + due-soon query |
| `src/backend/src/services/usageService.ts` | **MODIFIED** | Added `vaccinationsDueSoon` to clinic summary |
| `src/backend/src/controllers/` | **NEW** | 7 new controllers (owner, pet, search, appointment, medicalRecord, prescription, vaccination) |
| `src/backend/src/routes/` | **NEW** | 7 new route files registered under `/api/*` |
| `src/backend/src/app.ts` | **MODIFIED** | Registered all Phase 2 routes |
| `src/frontend/src/views/clinic/ClinicPets.tsx` | **REPLACED** | Full split-panel UI: owner+pet list, detail panel, tabs (Overview, Medical History, Vaccinations), modals for add owner/pet/vaccination |
| `src/frontend/src/views/clinic/ClinicAppointments.tsx` | **REPLACED** | Calendar grid (day/week), booking form, appointment status modal |
| `src/frontend/src/views/clinic/ClinicEMR.tsx` | **REPLACED** | SOAP editor, vital sign steppers, HTML5 anatomy canvas, prescription panel |
| `src/frontend/src/views/clinic/ClinicDashboard.tsx` | **MODIFIED** | Added "Vaccinations Due Soon" bento card |
| `.claude/roadmap/phase2-tasks.md` | **MODIFIED** | Marked completed tasks |

### ⚠️ Deferred Items
- LINE/SMS reminder cron job (requires external service credentials)
- Real S3 photo upload (photoUrl stored as string; UI accepts URL)
- Konva.js canvas (replaced with lightweight HTML5 Canvas)

### 🐛 Bugs Fixed During QA Review
- Prescription: TOCTOU stock race fixed with conditional `UPDATE ... WHERE stock_quantity >= qty`
- Double-booking: raw SQL overlap query replaces incorrect Prisma logic
- Medical record billed-guard: added `invoices` include to `getMedicalRecord`
- All UPDATE clauses now include `tenantId` for defence-in-depth

### ✅ Verification
- 104 backend tests pass (all Phase 1 tests remain green)
- TypeScript: 0 errors in Phase 2 code (pre-existing React import warnings unchanged)
- Prisma migration applied to local dev DB

---

This document records the modifications, additions, and synchronizations performed to align **AnimalClinic** (Anemal SaaS) with the feature set and system designs proven in **AnimalClinic_Prototype** (VetDocHome). This tracking log serves as the absolute source of truth for **Claude Code** and other AI agents implementing this platform.

---

## 📅 Log Entry: 2026-06-04 — Coding Rules & Developer Guidelines Created

### 🎯 Motivation & Purpose
Establish a single authoritative reference for all developers and AI agents covering architecture, security, validation, error handling, GitHub workflow, and CI/CD standards. Prevents inconsistent implementation patterns across phases.

### 📂 Files Changed

| File Path | Action | Description |
|---|---|---|
| [.claude/specs/CODING_RULES.md](.claude/specs/CODING_RULES.md) | **NEW** | Full coding rules document: 13 sections covering directory structure, layered architecture, TypeScript strict mode, security (JWT/multi-tenant/injection/secrets), Zod validation, typed error handling, DB rules, testing pyramid, frontend component rules, design patterns, GitHub workflow (branch naming, Conventional Commits, PR rules, review checklist), CI/CD & environment (env vars, secrets, deploy checklist). |
| [CLAUDE.md](CLAUDE.md) | **MODIFIED** | Added "Developer Coding Rules" section referencing CODING_RULES.md with bullet summary of all 13 sections. |

---

## 📅 Log Entry: 2026-05-30 — Synchronization & RLS/Remediation Audit

### 🎯 Motivation & Purpose
To elevate the Anemal SaaS platform from a simplified clinic management system into a robust, enterprise-grade cloud system supporting advanced operations like **Multi-Branch Operations, Inpatient Care, Grooming Services, Blood Bank Registries, Loyalty and Membership programs, Audit Logs, and Login Access Controls**.

---

### 📂 File Synchronization Summary

| File Path | Action | Description |
|---|---|---|
| [functional-reqs.md](file:///d:/Development/AnimalClinic/claude/specs/functional-reqs.md) | **MODIFIED** | Added functional specifications FR-08 through FR-13. Expanded FR-03 (Allergies & Pet Reminders) and FR-07 (Retail POS & Discount Engine). |
| [database-schema.sql](file:///d:/Development/AnimalClinic/claude/specs/database-schema.sql) | **MODIFIED** | Added 12 new tables (`branches`, `branch_inventory`, `blood_donors`, `blood_donations`, `blood_transfusions`, `hospitalizations`, `daily_inpatient_care`, `grooming_bookings`, `loyalty_transactions`, `audit_logs`, `doctor_shifts`, `pet_reminders`). Modified core tables to support branches and new relations. Updated Indexes and RLS policies. |
| [phase4-tasks.md](file:///d:/Development/AnimalClinic/claude/roadmap/phase4-tasks.md) | **NEW** | Created a new roadmap phase for "Advanced Operations & Commercial Scaling" (Modules 4.1 to 4.8). |
| [phase1-tasks.md](file:///d:/Development/AnimalClinic/claude/roadmap/phase1-tasks.md) | **MODIFIED** | Updated database setup task to account for multi-branch structures from Phase 1. Linked to Phase 4. |
| [phase2-tasks.md](file:///d:/Development/AnimalClinic/claude/roadmap/phase2-tasks.md) | **MODIFIED** | Updated clinical and scheduling tasks to integrate branch parameters and linked to Phase 4. |
| [phase3-tasks.md](file:///d:/Development/AnimalClinic/claude/roadmap/phase3-tasks.md) | **MODIFIED** | Updated inventory and billing tasks to reflect branch-level inventory structures. Linked to Phase 4. |
| [README.md](file:///d:/Development/AnimalClinic/README.md) | **MODIFIED** | Expanded key capability table, architectural file structure, development timeline, and tech stack details. |
| [HistoryLog.md](file:///d:/Development/AnimalClinic/HistoryLog.md) | **NEW** | Synchronized root copy of this history log for immediate project visibility. |

---

### 🛡️ Subagent Validation & RLS Remediation Logs
An independent validation subagent ran a line-by-line structural audit and recommended 6 critical gaps which we have successfully resolved in `database-schema.sql`, `functional-reqs.md`, and `phase4-tasks.md`:

1. **Critical Security Gap**: Fixed by adding `tenant_isolation_tenants` RLS policy to the `tenants` table (which previously had RLS enabled but lacked a policy, blocking all default queries).
2. **Owner Deactivation Gap**: Added `is_active BOOLEAN DEFAULT TRUE` column to the `owners` table to support deactivating/closing owner profiles.
3. **Doctor Shift Structure**: Created the `doctor_shifts` table, composite unique key constraints, RLS policy, high-performance lookup index, and added shift-management tasks in `phase4-tasks.md`.
4. **Proactive Pet Reminders**: Created the `pet_reminders` table, channel constraints, status flags, RLS policy, and background cron reminder engine tasks.
5. **Reports & Analytics Dashboard**: Added Section `FR-13` specifications and `Module 4.8` tasks for multi-branch revenue reporting and operational dashboard snapshot charts.
6. **High-Performance Production Indexes**: Added 10 high-speed database indexes:
   - POS Barcode scanning index on `products(tenant_id, barcode) WHERE is_active = TRUE`.
   - Branch-level financial date index on `invoices(tenant_id, branch_id, issued_at DESC)`.
   - Clinical performance indexes on vaccinations, attachments, and prescriptions.
   - Cage board status query index on `hospitalizations(tenant_id, branch_id, status)`.
   - Blood bank inventory tracking index on `blood_donations(tenant_id, status, expiry_date)`.

---

### 💡 Architectural Guidelines for AI Agents (Claude Code)

When working on any task from Phase 1 to Phase 4, Claude Code must adhere to these newly synchronized architectural paradigms:

1. **The Multi-Branch Rule**:
   - In addition to isolating data per `tenant_id` (SaaS isolation), you must scope operations per `branch_id` wherever applicable (e.g. scheduling, medical records, billing).
   - A tenant has one or more branches. Users belong to a primary branch but can have their active session checked into other branches.
   
2. **Branch-Level Inventory Management**:
   - The `products` table acts as a global tenant catalog. *Never query or write physical stock quantities directly on the `products` table!*
   - All physical inventory levels, lot numbers, and expiration dates are housed in `branch_inventory`. Stock movement updates (`stock_movements`) must specify both `branch_id` and the product, and must support inter-branch inventory transfers (`destination_branch_id`).

3. **Active Clinical Safety Guards**:
   - Always reference the `pets.allergies` and `pets.underlying_conditions` fields before compiling prescriptions or treatment orders in `medical_records`.
   - Before performing blood transfusions, verify donor compatibility using the `blood_donors` table and track usage via `blood_donations.status`.

4. **Security & Auditing Compliance**:
   - Every state-modifying action (INSERT/UPDATE/DELETE) regarding billing, inventory changes, or role upgrades must create a record in the `audit_logs` table.
   - User sessions must respect `users.allowed_start_time` and `users.allowed_end_time` (e.g. prevent staff logging in during off-hours).

5. **Soft Delete Guideline (FK Constraints)**:
   - Foreign key restraints prevent hard deletes on `owners`, `pets`, or `medical_records` if history exists. Developers **must never** execute hard `DELETE` queries on core CRM records. Use soft deactivations (toggle `is_active = FALSE` or set statuses to `cancelled`/`deceased`/`refunded`).

---
*Last Updated: 2026-05-30 by Antigravity System Synchronizer & Spec Auditor.*

---

## 📅 Log Entry: 2026-05-31 — Native Microsoft Word Specification Compilation

### 🎯 Motivation & Purpose
To deliver a high-fidelity, client-ready, fully detailed Microsoft Word document (`.docx`) containing the entire Functional and Technical specifications. This allows the user, stakeholders, and developers to view the comprehensive specifications offline, print, or distribute them directly within enterprise workflows without requiring Markdown translation tools.

---

### 📂 File Modifications Summary

| File Path | Action | Description |
|---|---|---|
| [System_Specification.docx](file:///d:/Development/AnimalClinic/claude/specs/System_Specification.docx) | **NEW (GENERATED)** | Real Microsoft Word file containing the entire Functional Requirements (FR-01 to FR-13, NFRs, Integrations), full Database Catalog (all 25 tables with types, comments, and RLS policies), Performance Indexing Strategy, and Phase 4 Roadmap tasks. |
| [generate_docx_spec.py](file:///d:/Development/AnimalClinic/claude/specs/generate_docx_spec.py) | **NEW** | Advanced Python script utilizing `python-docx` to programmatically compile, parse, and style the specification document with premium typography, custom cell margins, header shading, Navy/Teal color branding, and automatic page breaks. |

---

### 🛠️ Execution & Verification Details
1. **Dynamic Schema & Requirement Parsing**:
   - The generator dynamically parsed `claude/specs/functional-reqs.md` (73 functional requirement items).
   - The generator parsed `claude/specs/database-schema.sql` (25 relational tables, index strategies, and PostgreSQL RLS scopes).
   - The generator parsed `claude/roadmap/phase4-tasks.md` (Phase 4 sprint tasks, effort, priorities, checklist, and criteria).
2. **Premium Document Layout Details**:
   - **Cover Page**: Center-aligned corporate styling with a primary Navy color accent (#1B365D), subtle metadata block, and clean horizontal line separator.
   - **Running Headers/Footers**: Right-aligned running header (`Anemal SaaS System Specification | Confidential`) and page-numbered standard footer layout.
   - **Table Formatting**: 1-inch margins, custom cell padding, bold white text header rows with deep navy/teal background colors, alternating zebra-striped rows, and clean light grey boundaries.
   - **Lists & Bullets**: Indented checklist items (⬜) and acceptance criteria (✅) formatted cleanly for easy readability on tablets or print.

3. **Compilation Success**:
   - The python generator completed successfully under the local system shell using Python 3.11.9.
   - Resulting document size verified at **62.6 KB**, validating structural rich XML composition (not a markdown placeholder).

---

## 📅 Log Entry: 2026-06-09 — Phase 4 Backend Completion & Verification Wiring

### 🎯 Motivation
Resume the interrupted Phase 4 build. A prior session had scaffolded the full Phase 4 backend (8 modules, layered Route→Controller→Service→Repository) with the data-preserving migration `20260606090000_phase4_multibranch` already applied to the dev DB, but left three gaps: audit middleware unwired, no reminder background worker, and zero Phase 4 tests.

### 📂 Changes
| File | Action | Description |
|---|---|---|
| `src/backend/app.ts` | Modified | Wired `auditMiddleware` globally (after health check, before routes). Reads `req.context` lazily at `res.on('finish')`, so it records only successful authenticated mutations. |
| `src/backend/services/reminder.service.ts` | Modified | Added `dispatchDue()` — cross-tenant scan + mark-sent for the worker (real LINE/SMS deferred). |
| `src/backend/models/reminder.repository.ts` | Modified | Added `listAllDue()` (cross-tenant, system context) + `markSent()`. |
| `src/backend/workers/reminder.worker.ts` | **NEW** | Hourly `setInterval` worker (`.unref()`), runs once on boot. Started from `server.ts` only — never imported by `app.ts`, so tests don't spawn timers. |
| `src/backend/server.ts` | Modified | Calls `startReminderWorker()` after `app.listen`. |
| `src/backend/tests/integration/phase4.test.ts` | **NEW** | Integration + cross-tenant isolation suite: Branch RBAC/isolation, Loyalty earn-on-payment + redeem caps (>points, >20%), Hospitalization admit→care→discharge-billing + post-discharge 409, Blood Bank donor dedup + transfusion compatibility guard (409 `INCOMPATIBLE_BLOOD` unless acknowledged), Reminders due+sent, write-once Audit log assertion. |

### ✅ Verification
- `npx tsc --noEmit` — clean (exit 0) after all wiring.
- Migrations applied to a fresh container + seed; **full suite green: 152 tests / 15 suites pass** (was 131).
- Fixed 3 pre-existing Phase-3 regressions the prior session's flat-stock→`branch_inventory` migration had introduced: `inventory.test.ts` and `invoice.test.ts` read/wrote the dropped `inventoryItem.stockQuantity` (now `branchInventory.stockQty`, tokens given a `branchId`); `reports.test.ts` snapshot needed a `branchId` in the token; `authService.test.ts` mock lacked `prisma.user.update` (new `touchLastLogin`).

### 📌 Still open (next session)
Phase 4 **frontend** (Inpatient cage board, Grooming calendar, Branch/Loyalty/Blood Bank pages, admin dashboard snapshot); `/api/reports/branch-revenue`; real SMS/LINE dispatch in the reminder worker.


---

## 📅 Log Entry: 2026-06-09 — Project Cleanup & Skill Migration Session

### 🎯 Motivation
Reduce token consumption in future sessions by migrating spec content to agent skills, cleaning up obsolete files, updating stale HTML docs, and producing a session-divided remaining task plan.

### 📂 Changes

| File | Action | Description |
|---|---|---|
| `.claude/skills/anemal-coding-rules/` | **NEW** | SKILL.md + `references/coding-rules.md` — full coding standards for @dev-agent + @qa-agent |
| `.claude/skills/anemal-design-system/` | **NEW** | SKILL.md + `references/tokens.md` + `references/sidebar-spec.md` — design system for @uiux-agent + @dev-agent |
| `.claude/skills/anemal-screen-specs/` | **NEW** | SKILL.md + `references/` (6 screen spec files: 00-shared, 01-login, 02-dashboard, 06-inventory, 07-billing, 08-admin) |
| `.claude/skills/anemal-functional-reqs/` | **NEW** | SKILL.md + `references/functional-reqs.md` — FR matrix for @pm-agent |
| `.claude/skills/anemal-db-context/` | **NEW** | SKILL.md + `references/database-schema.sql` — DB context for @db-agent |
| `.claude/specs/CODING_RULES.md` | **DELETED** | Moved into `anemal-coding-rules` skill |
| `.claude/specs/design-system-tokens.md` | **DELETED** | Moved into `anemal-design-system` skill |
| `.claude/specs/sidebar-component-spec.md` | **DELETED** | Moved into `anemal-design-system` skill |
| `.claude/specs/functional-reqs.md` | **DELETED** | Moved into `anemal-functional-reqs` skill |
| `.claude/specs/screen-specs/` | **DELETED** | Moved into `anemal-screen-specs` skill |
| `.claude/specs/generate_docx_spec.py` | **DELETED** | One-time script, no longer needed |
| `.claude/specs/System_Specification.docx` | **DELETED** | Binary duplicate of .md version |
| `.claude/roadmap/phase1-claude-code-guide.md` | **DELETED** | Phase 1-specific CLI guide, Phase 1 complete |
| `.claude/roadmap/phase1-implementation-plan.md` | **DELETED** | Phase 1-specific planning doc, Phase 1 complete |
| `.claude/roadmap/remaining-tasks.md` | **NEW** | Session-divided remaining task plan (7 sessions A–G) |
| `docs/dashboard.html` | **UPDATED** | Phase 4 complete (155 tests, all rows green, deferred items section) |
| `docs/functional_spec_detailed.html` | **UPDATED** | Phase 4 Planned → Complete, version 1.2 |
| `docs/index.html` | **UPDATED** | Added Phase 4 changelog entry |
| `CLAUDE.md` | **UPDATED** | Tech stack confirmed (Node/Express/Prisma), phases show completion status, deferred items listed |
| `session-summary.md` | **UPDATED** | Phase 2/4 headers corrected, deferred items section |

### ✅ Skill Architecture Decision
All 5 skills are **project-level** (`.claude/skills/`), not global — content is Anemal-specific.
Pattern: 3-tier progressive disclosure — SKILL.md description (triggers) → SKILL.md body (critical rules) → `references/` (full content).
This avoids loading 800+ lines of coding rules on every invocation.


---

## 2026-06-10 — Phase 1.5 Settings Module Added

**Action:** Merged Phase 1.5 Settings & Configuration module into project roadmap as 🔴 CRITICAL top priority.

**Files changed:**
- `.claude/roadmap/phase1.5-settings-tasks.md` — **NEW** — Full task spec for Phase 1.5 (14 tasks: S1.1–S1.4, S2.1–S2.4, S3.1–S3.7, S4.1–S4.3)
- `.claude/roadmap/remaining-tasks.md` — Phase 1.5 inserted above Sessions C–G; 4 sub-sessions defined (1.5-A through 1.5-D)
- `CLAUDE.md` — Development Phases table updated; Phase 1.5 added as In Progress CRITICAL

**Rationale:** Sessions C (PromptPay QR), G (LINE/SMS dispatch), and F (Payment Gateway) all require `clinic_settings` DB infrastructure and AES-256 encryption utility. Phase 1.5 must complete before those sessions can begin.

**Tasks added:** 14 tasks (10 Critical, 4 High) | 10 acceptance test cases (TC-S001–TC-S010)
