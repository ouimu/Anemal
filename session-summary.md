# Session Summary — Anemal
> Last updated: 2026-06-09 | อ่านไฟล์นี้ก่อนเริ่ม session ใหม่ทุกครั้ง
>
> **Status:** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ · **Phase 4 ✅ backend (155 tests) + frontend Sessions A & B complete**
> Dev DB: Docker `vetclinic-pg` (postgres:16) — **must run with `-p 5432:5432`**. `cd src/backend && npm run db:migrate / db:seed / npm test`.

---

## 🚧 Phase 4 — Advanced Operations (backend DONE this session)

**Backend (complete, typecheck clean):** Branch + doctor-shifts, inter-branch inventory Transfers, Hospitalization (admit→care(time-slots)→discharge auto-bill), Blood Bank (donor registry + collection bags + transfusion compatibility guard), Grooming bookings, Loyalty (earn-on-payment, tiered, redeem capped 20%), Proactive Reminders (+ hourly background worker `workers/reminder.worker.ts`), write-once Audit logging (`auditMiddleware` wired globally in `app.ts`).
- Migration `20260606090000_phase4_multibranch` (data-preserving) **applied**. Seed is Phase-4-aware (2 branches for dev-clinic, per-branch `branch_inventory`, users get `branchId`).
- `branchId` now embedded in JWT + `req.context`. `branch_inventory` is the stock source of truth.
- Tests: `tests/integration/phase4.test.ts` — branch RBAC/isolation, loyalty earn+caps, hospitalization lifecycle, blood-bank guard, reminders, audit write. **All green: 152 tests / 15 suites pass** (was 131; fixed 3 Phase-3 regressions from the flat-stock→branch_inventory migration).

**Session A (2026-06-09):** `GET /api/reports/branch-revenue`; nav wiring; `ClinicInpatient` (cage board + 3-step care modal + discharge); `ClinicGrooming` (day timeline + booking modal + status cycle); `AdminDashboard` upgrade (inpatient/grooming KPIs + branch revenue chart).

**Session B (2026-06-09):** `GET /api/audit` (admin-only, paginated) + audit service/controller/route; `AdminBranches` (CRUD + doctor shifts); `AdminBloodBank` (3 tabs + register/collect/transfuse + compatibility guard); `AdminAudit` (read-only table + filters + JSON-diff expand); Loyalty at POS checkout in `ClinicBilling` (balance/tier, redeem ≤20%, earned toast). **155 backend tests pass.** Fixed missing `/api` prefix on several frontend calls (proxy only forwards `/api|/auth|/users|/admin`).

**Still TODO:** real LINE/SMS dispatch in reminder worker (currently marks `sent`); barcode/PromptPay/PDF deferred items. Dev-proxy quirk: full-page load of `/admin/*` hits backend — production static serve is unaffected.

---

## ✅ สิ่งที่ตัดสินใจและทำเสร็จแล้ว

### Tech Stack (ยืนยันแล้ว ห้ามเปลี่ยน)
- **Backend:** Node.js + Express + Prisma ORM
- **Database:** PostgreSQL 15+
- **Auth:** JWT (`{ userId, tenantId, role }`) — token อายุ 8h — เก็บใน memory (ไม่ใช้ localStorage)
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **State management:** Zustand (UI state) + TanStack Query (server state)
- **Multi-tenancy:** Shared DB, Shared Schema — `tenant_id` discriminator ทุก table

### Architecture ที่ยืนยันแล้ว
- Middleware ดึง `tenant_id` จาก JWT แนบใน `req.context` — ทุก repo function รับ `tenantId` เป็น param ห้าม derive ข้างใน
- Routing แบ่ง 2 zone: `/admin/*` (AdminLayout, role=admin) และ `/clinic/*` (ClinicLayout, role=doctor|staff)
- Login detect subdomain จาก `window.location.hostname` อัตโนมัติ
- Role-based redirect: admin → `/admin/dashboard`, doctor/staff → `/clinic/dashboard`
- Brand color scale: `brand-50..900` (primary `#0369a1`)
- AdminLayout sidebar: slate-900 | ClinicLayout sidebar: brand-700, collapsible, left/right-hand mode

---

## 📦 Phase 1 — Foundation (เสร็จแล้ว ✅)

### API ที่ implement แล้ว
- `POST /auth/login` — bcrypt verify → JWT sign
- `authMiddleware` — JWT verify + `req.context`
- `rbacMiddleware` — role gate factory (403 ถ้าไม่ผ่าน)
- `GET/PUT /admin/settings` — TenantSettings upsert (admin only)
- `GET /admin/usage` — aggregate counts (pets, owners, users, appointments, invoices)
- `GET/POST/PUT/DELETE /users` — CRUD + soft-delete (`isActive=false`) (admin only)

### Frontend ที่ implement แล้ว
- LoginView (gradient bg, white card, subdomain auto-detect, show/hide password)
- AdminLayout + 6 admin pages: Dashboard, Users, Usage, Profile, Settings, Subscription
- ClinicLayout + ClinicDashboard (4 KPI cards + quick-action tiles)
- 5 clinic stub pages (Appointments, Pets, EMR, Inventory, Billing — แสดง 🚧 placeholder)
- React Router v6 nested routes + lazy loading + ProtectedRoute

### Tests
- 74 test cases ใน 5 test suites — ทั้งหมด pass ✅
- หมายเหตุ: tests ต้องการ live PostgreSQL (ไม่ใช้ mock DB)

### Git
- Tag `v0.1.0` รอ smoke test บน live PostgreSQL ก่อน push

---

## 🐛 Known Issues จาก Phase 1 (ต้องแก้ใน Phase 2)

1. **`ClinicDashboard` เรียก `/admin/usage`** — doctor/staff ไม่มีสิทธิ์ → ต้องสร้าง `GET /clinic/usage` endpoint ใหม่
2. **`src/components/Sidebar.tsx`** — ไฟล์ legacy ใช้ route paths เก่า → ลบหรือ clean up
3. **Logo upload** — ปัจจุบัน FileReader preview เท่านั้น → ต้องทำ S3 pre-signed URL upload จริง

---

## 🔜 Phase 2 — Core Clinic Operations (ยังไม่เริ่ม)

### สิ่งที่ต้องทำ (ตามลำดับ)
1. **Fix Phase 1 bugs** (3 รายการข้างบน)
2. **Owner & Pet API** — CRUD + S3 photo upload + Quick Search (name/phone/microchip)
3. **Appointment API** — double-booking detection, walk-in queue
4. **Appointment Calendar UI** — day/week toggle, filter by doctor/room
5. **LINE/SMS reminder** — cron job ทำงาน 08:00 ทุกวัน (LINE Messaging API + Twilio)
6. **EMR API** — SOAP notes + timeline
7. **Anatomy Canvas** — Konva.js, SVG templates (dog/cat), stylus annotation → save as JSON
8. **Prescription module** — สั่งยาตัดสต็อกอัตโนมัติ
9. **Vaccination timeline** — due-soon alerts

---

## ✅ Phase 3 — Commercial & Billing (เสร็จแล้ว)

**ทำแล้ว:** Inventory API `/api/products` (CRUD + stock-in + alerts + movements) + tenant-scoped `StockMovement` ledger; auto-deduct ตอนจ่ายยา; Billing `/api/invoices` (auto-pull จาก visit + retail deduction + `INV-YYYY-MM-NNNN` + VAT 7% + payment); Reports `/api/reports/*` + dashboard recharts; Subscription `/api/subscription/status` + 402 plan limit. UI: ClinicInventory, ClinicBilling (POS + print), dashboard charts, SubscriptionTab usage. 131 tests pass.

**Deferred → Phase 4:** branch-level stock (`branch_inventory`) + transfers, barcode camera (ZXing), PDF receipt (pdfkit) + email, PromptPay QR จริง + Omise/Stripe gateway, subscription billing tables/cron.

---

## 🔜 Phase 4 — Advanced Operations (spec-only, ยังไม่เริ่ม)

- Multi-branch management + inter-branch inventory transfers
- Doctor shift scheduling
- Inpatient care (cage board)
- Grooming scheduler
- Loyalty/membership system
- Audit logs (write-once)
- Login time-window restriction (`allowed_start_time` / `allowed_end_time`)
- Blood bank: donor registry + transfusion safety guards

> **หมายเหตุ:** Phase 4 tables มีใน `database-schema.sql` แล้ว แต่ยังไม่อยู่ใน Prisma schema (spec-only)

---

## ⚠️ สิ่งสำคัญที่ต้องระวัง

- **`branch_id` ยังไม่อยู่ใน JWT** — ต้องเพิ่มก่อน implement multi-branch features
- **`branch_inventory`** คือ source of truth สำหรับ stock — ห้ามอ่าน/เขียนจาก `products` table โดยตรง
- **`audit_logs`** — ทุก state-modifying call (billing, inventory, EMR, role change) ต้อง write ด้วย
- **Google API Key** — มีการ paste ลงใน chat โดยไม่ตั้งใจ → ควร revoke ที่ console.cloud.google.com

---

## 🗂️ Database Tables (Phase 1 Prisma Schema — ใช้งานได้จริง)

`tenants`, `tenant_settings`, `users`, `owners`, `pets`, `appointments`, `medical_records`, `prescriptions`, `prescription_items`, `products`, `invoices`, `invoice_items`

(Phase 4 tables อยู่ใน `.claude/specs/database-schema.sql` เท่านั้น)

---

## 🔑 Test Credentials (หลัง seed)

| Subdomain | Email | Password | Role |
|-----------|-------|----------|------|
| dev-clinic | admin@dev-clinic.com | AdminPass1! | admin |
| dev-clinic | doctor@dev-clinic.com | DoctorPass1! | doctor |
| dev-clinic | staff@dev-clinic.com | StaffPass1! | staff |
| test-clinic | admin@test-clinic.com | AdminPass2! | admin |

---

## 🚀 How to Run

```powershell
# Backend
cd src\backend
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev          # → http://localhost:4000

# Frontend
cd src\frontend
npm install
npm run dev          # → http://localhost:5173

# Tests (ต้องมี live PostgreSQL)
cd src\backend
npm test
```

---

## 📂 ไฟล์สำคัญ

| ไฟล์ | ใช้ทำอะไร |
|------|-----------|
| `CLAUDE.md` | Project instructions สำหรับ Claude |
| `DESIGN.md` | UI design system, color tokens |
| `CHANGELOG.md` | บันทึกการเปลี่ยนแปลงตามเวอร์ชัน |
| `HistoryLog.md` | log การตัดสินใจและเหตุการณ์สำคัญ |
| `HOW-TO-RUN.md` | คู่มือ setup environment |
| `.claude/specs/database-schema.sql` | Full DB schema (รวม Phase 4) |
| `.claude/docs/phase1-implementation-log.md` | บันทึกสิ่งที่ทำใน Phase 1 ทั้งหมด |
| `docs/index.html` | Project documentation portal (static) |
| `docs/dashboard.html` | Project dashboard แสดง progress (static) |
