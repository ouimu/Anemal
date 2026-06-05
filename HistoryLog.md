# Specification & Schema Sync History Log

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

This document records the modifications, additions, and synchronizations performed to align **AnimalClinic** (VetCare SaaS) with the feature set and system designs proven in **AnimalClinic_Prototype** (VetDocHome). This tracking log serves as the absolute source of truth for **Claude Code** and other AI agents implementing this platform.

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
To elevate the VetCare SaaS platform from a simplified clinic management system into a robust, enterprise-grade cloud system supporting advanced operations like **Multi-Branch Operations, Inpatient Care, Grooming Services, Blood Bank Registries, Loyalty and Membership programs, Audit Logs, and Login Access Controls**.

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
   - **Running Headers/Footers**: Right-aligned running header (`VetCare SaaS System Specification | Confidential`) and page-numbered standard footer layout.
   - **Table Formatting**: 1-inch margins, custom cell padding, bold white text header rows with deep navy/teal background colors, alternating zebra-striped rows, and clean light grey boundaries.
   - **Lists & Bullets**: Indented checklist items (⬜) and acceptance criteria (✅) formatted cleanly for easy readability on tablets or print.

3. **Compilation Success**:
   - The python generator completed successfully under the local system shell using Python 3.11.9.
   - Resulting document size verified at **62.6 KB**, validating structural rich XML composition (not a markdown placeholder).

