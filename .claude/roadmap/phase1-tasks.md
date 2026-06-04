# Phase 1 Tasks — Foundation & Security

**Phase:** 1 of 4  
**Duration:** Week 1–4  
**Focus:** รากฐานระบบ, Authentication, Multi-tenancy, Base Layout  
**Agent Responsible:** DB-Agent, Dev-Agent, UIUX-Agent  

---

## 🎯 Phase 1 Goal

สร้างโครงสร้างพื้นฐานที่ปลอดภัยและถูกต้องก่อนพัฒนา Feature จริง  
เมื่อจบ Phase 1 ระบบต้องสามารถ: Login → เห็น Dashboard ว่าง → ออกได้  
โดยข้อมูลแต่ละคลินิกแยกกันอย่างสมบูรณ์

---

## Module 1.1: Database Foundation

### Task 1.1.1 — Create Core Schema
**Agent:** @db-agent  
**Effort:** M (3 days)  
**Priority:** Critical

- [x] รัน `database-schema.sql` ใน PostgreSQL dev environment
- [x] ตรวจสอบว่า Foreign Keys, Indexes, Constraints ถูกต้องทั้งหมด
- [x] เปิดใช้งาน Row Level Security (RLS) ทุก table
- [x] เขียน seed data สำหรับ testing (2 Tenants, แต่ละ Tenant มี 1 admin + 1 doctor + 1 staff)

**Acceptance Criteria:**
- ✅ Schema รัน error-free ใน fresh PostgreSQL instance
- ✅ RLS policy บังคับให้แต่ละ tenant เห็นเฉพาะข้อมูลตัวเอง
- ✅ Seed data โหลดสำเร็จ

---

### Task 1.1.2 — Prisma ORM Setup
**Agent:** @dev-agent  
**Effort:** S (1 day)  
**Priority:** Critical

- [x] ติดตั้ง Prisma และสร้าง `schema.prisma` ให้ตรงกับ database-schema.sql
- [x] ตั้งค่า `DATABASE_URL` ใน `.env`
- [x] รัน `prisma db pull` แล้ว introspect schema
- [x] สร้าง Prisma Client singleton ที่ใส่ tenant context middleware
- [x] อัปเดตโครงสร้าง DB เพิ่มเติมเพื่อเตรียมการรองรับโครงสร้าง Multi-Branch และ RLS

**Acceptance Criteria:**
- ✅ `prisma generate` สำเร็จ ไม่มี error
- ✅ Prisma Client inject `tenant_id` อัตโนมัติผ่าน middleware

---

## Module 1.2: Authentication & JWT

### Task 1.2.1 — Auth API: Login & Token
**Agent:** @dev-agent  
**Effort:** M (2 days)  
**Priority:** Critical

- [x] `POST /api/auth/login` — รับ email + password, ตรวจสอบ bcrypt, ออก JWT
- [x] JWT payload ต้องมี: `{ userId, tenantId, role, exp }`
- [x] `POST /api/auth/refresh` — รับ Refresh Token ออก Access Token ใหม่
- [x] `POST /api/auth/logout` — blacklist Refresh Token (ใช้ Redis หรือ DB table)

**Acceptance Criteria:**
- ✅ Login สำเร็จ → ได้ `accessToken` (8h) + `refreshToken` (30d)
- ✅ Token มี `tenantId` ทุกครั้ง
- ✅ Login ผิดรหัส → 401 (ไม่บอกว่า email ถูกหรือเปล่า)
- ✅ Brute force protection (rate limit 5 attempts / 15 min)

---

### Task 1.2.2 — Middleware: Tenant Guard & RBAC
**Agent:** @dev-agent  
**Effort:** M (2 days)  
**Priority:** Critical

- [x] `auth.middleware.ts` — ตรวจสอบ JWT, reject expired/invalid
- [x] `tenant.middleware.ts` — extract `tenantId` จาก token → inject ใน req
- [x] `rbac.middleware.ts` — factory function `requireRole('admin', 'doctor')` etc.
- [x] Set PostgreSQL `app.current_tenant_id` session variable สำหรับ RLS

**Acceptance Criteria:**
- ✅ Request ไม่มี token → 401
- ✅ Request มี token แต่ role ไม่พอ → 403
- ✅ RLS session variable ถูก set ก่อน Query ทุกครั้ง

---

### Task 1.2.3 — User Management API
**Agent:** @dev-agent  
**Effort:** M (2 days)  
**Priority:** High

- [x] `GET /api/users` — ดูรายชื่อ user ใน tenant (Admin เท่านั้น)
- [x] `POST /api/users` — เพิ่ม user ใหม่ใน tenant
- [x] `PUT /api/users/:id` — แก้ไข user (name, role, is_active)
- [x] `DELETE /api/users/:id` — soft delete (set is_active = false)

**Acceptance Criteria:**
- ✅ Admin เห็นเฉพาะ user ใน tenant ตัวเอง
- ✅ Staff ไม่สามารถเรียก User Management API ได้ → 403
- ✅ ไม่สามารถปิด Admin คนสุดท้ายของ Tenant

---

## Module 1.3: Clinic Onboarding

### Task 1.3.1 — Tenant Registration
**Agent:** @dev-agent  
**Effort:** M (3 days)  
**Priority:** High

- [x] `POST /api/onboarding/register` — สร้าง Tenant ใหม่ + Admin user แรก
- [x] ตรวจสอบ subdomain ซ้ำ
- [x] ส่ง Email ยืนยัน (nodemailer / SendGrid)
- [x] Trial period 30 วัน (set `trial_ends_at`)

**Acceptance Criteria:**
- ✅ สร้าง Tenant + Admin สำเร็จใน transaction เดียว (all-or-nothing)
- ✅ Subdomain ซ้ำ → 409 Conflict
- ✅ ส่ง Welcome Email สำเร็จ

---

## Module 1.4: Base Layout & Navigation

### Task 1.4.1 — Frontend Base Layout (Tablet + Web)
**Agent:** @dev-agent + @uiux-agent  
**Effort:** L (4 days)  
**Priority:** High  
**Design Reference:** `.claude/specs/screen-specs/00-shared-layout.md` · `stitch_vet_clinic_design_system/dashboard_overview_1024x768/code.html`

- [x] React Router setup: Protected routes
- [x] Base Layout: fixed sidebar + fixed TopNav + offset main content
- [x] Sidebar: collapsible w-56 → w-14, Compassionate Care System reskin
- [x] TopNav: h-16 fixed bar, search center, notifications + avatar right
- [x] Material Symbols Outlined icons throughout (no emoji)
- [ ] Bottom Navigation Bar (Tablet only) — deferred to Phase 2

**Acceptance Criteria:**
- ✅ Layout ปรับตัวได้ระหว่าง Tablet (≤1024px) และ Desktop
- ✅ Sidebar collapse/expand animation เรียบ (transition-all duration-200)
- ✅ All navigation items มี Material Symbols icon + label
- ✅ Active nav item: border-r-4 border-primary bg-surface-container-low (white sidebar)
- ✅ Content offset: ml-56 pt-16 (expanded) | ml-14 pt-16 (collapsed)

---

### Task 1.4.2 — Dashboard Screen (Empty State → Bento Grid)
**Agent:** @dev-agent  
**Effort:** M (2 days)  
**Priority:** High  
**Design Reference:** `.claude/specs/screen-specs/02-dashboard.md` · `stitch_vet_clinic_design_system/dashboard_overview_1024x768/code.html`

- [x] Dashboard หน้าหลัก — 12-col bento grid layout
- [x] Stat cards: glass-card, border-l-4 accent, real API data (appointmentsToday, etc.)
- [x] Today's Schedule table stub (Phase 2 will populate)
- [x] Waiting Queue stub + stat totals
- [x] Quick Actions: 4 Material icon cards → Appointments, Pets, EMR, Billing
- [x] "New Appointment" CTA in page header

**Acceptance Criteria:**
- ✅ Dashboard โหลดได้ ไม่ crash แม้ข้อมูลว่าง
- ✅ Quick action cards ≥ 88px height, icons ≥ 28px
- ✅ Bento grid responsive: full 12-col desktop, stacked on tablet
- ✅ All colors use design system tokens (no gray-* / indigo-*)

---

## Module 1.5: QA & Security Validation

### Task 1.5.1 — Security Test Suite
**Agent:** @qa-agent  
**Effort:** M (2 days)  
**Priority:** Critical

- [x] เขียน Test Suite: Cross-tenant isolation (ทดสอบทุก API endpoint)
- [x] เขียน Test: JWT manipulation attempts
- [x] เขียน Test: Role bypass attempts
- [x] รัน OWASP basic check

**Acceptance Criteria:**
- ✅ ผ่าน Cross-tenant isolation tests 100%
- ✅ ไม่มี data leakage ระหว่าง Tenant

---

## Phase 1 Completion Checklist

- [x] ทุก Task ผ่าน Acceptance Criteria
- [x] QA Security Test Suite pass 100%
- [x] Postman Collection สำหรับ Auth APIs ครบ
- [x] README.md อัปเดต setup instructions
- [x] Demo: Login → Dashboard → Logout ทำงานได้บน iPad จริง

---

**Next Phase:** [Phase 2 — Core Clinic Operations](./phase2-tasks.md)

*Last Updated: 2026-06-05 — Phase 1 COMPLETE*
