# System Specification Document

---

## 1. Introduction

**Project:** VetCare Clinic Management SaaS (VetCare)

**Version:** 1.1 (2026-05-30)

**Target Audience:**
- Development team
- QA / testers
- Stakeholders & product owners
- External auditors (security, compliance)

**Purpose:** This document consolidates the functional requirements, technical architecture, database design, and roadmap for the VetCare multi‑tenant, multi‑branch veterinary clinic management platform. It is intended for direct import into Microsoft Word (Markdown → Word conversion) and serves as the single source of truth for future development, onboarding, and compliance audits.

---

## 2. Functional Specification

### 2.1 System Overview

VetCare is a SaaS solution supporting **Web** and **Tablet** clients for veterinary clinics, with full multi‑tenant isolation, multi‑branch capabilities, and a rich set of clinical, operational, and business features.

### 2.2 Functional Requirements Summary

| ID | Requirement (Thai) | Priority |
|----|--------------------|----------|
| FR-01-01 | ระบบรองรับการ Login ด้วย email + password | Must |
| FR-01-02 | JWT Token ต้องฝัง `tenant_id`, `branch_id`, `user_id`, `role` ไว้ทุกครั้ง | Must |
| FR-01-03 | Token หมดอายุใน 8 ชั่วโมง (clinic work day) พร้อม Refresh Token | Must |
| FR-01-04 | Role‑based Access Control (Admin/Doctor/Staff) | Must |
| FR-01-05 | Admin สามารถเพิ่ม/ลบ/ปิดการใช้งาน User และกำหนดสิทธิ์รายบุคคลได้ | Must |
| FR-01-06 | รองรับการจำกัดเวลาเข้าใช้งานของพนักงานรายบุคคล (Login Time Window Restrictions) | Should |
| FR-02-01 | แต่ละคลินิกมี subdomain เฉพาะ (e.g., `abc-clinic.vetcare.app`) | Must |
| FR-02-02 | ข้อมูลทุก Table ต้องแยกด้วย `tenant_id` อย่างเด็ดขาด | Must |
| FR-02-03 | ไม่มีทางที่ user คนหนึ่งจะเห็นข้อมูลของคลินิกอื่น | Must |
| FR-02-04 | รองรับโครงสร้าง Multi‑Branch ภายใต้ Tenant เดียวกัน โดยแยกข้อมูลธุรกรรมด้วย `branch_id` | Must |
| FR-02-05 | Admin สามารถกำหนดข้อมูลสาขา เวลาเปิด‑ปิด ที่อยู่ เบอร์โทรศัพท์ และเวรการทำงานของหมอ (Doctor Shifts) แยกรายสาขาได้ | Must |
| FR-02-06 | Super Admin (System level) ดูภาพรวมทุก Tenant ได้ | Should |
| FR-03‑01 … FR-13‑03 | *(see functional‑reqs.md for complete list)* | *(see table)* |

> **Note:** The complete functional matrix (all 73 FR entries) is available in `functional‑reqs.md`. The table above illustrates the pattern.

### 2.3 Feature Highlights

- **Authentication & Authorization** – JWT with tenant/branch claims, time‑window login restrictions.
- **Multi‑Tenant & Multi‑Branch** – Tenant‑level RLS, branch isolation, sub‑domain routing.
- **Pet & Owner CRM** – Smart onboarding via ID‑card reader, photo capture, allergy & condition tracking.
- **Appointment Scheduler** – Weekly/Daily calendars, double‑booking protection, LINE/SMS reminders.
- **Electronic Medical Record (EMR)** – SOAP notes, vitals, DICOM imaging via Cornerstone.js, prescription & lab integration.
- **Inventory & Transfer** – Branch‑level stock, automatic depletion on dispensing, transfer approvals.
- **Billing & POS** – Automated invoice generation, multi‑payment methods, discount engine.
- **Inpatient Management** – Admission, daily care plans, discharge billing.
- **Grooming & Blood Bank** – Queue management, capacity tracking, donor registry.
- **Loyalty & Membership** – Tiered benefits, points accumulation, redemption.
- **Security & Auditing** – Detailed activity logs, immutable transaction trails.
- **Analytics Dashboard** – Revenue, service popularity, real‑time operational metrics.

---

## 3. Technical Specification

### 3.1 Architecture Overview

- **Front‑end:** Responsive SPA (React) with Tablet‑optimized UI, served via CDN.
- **Back‑end:** Node.js (Express) API layer, JWT authentication, role‑based middleware.
- **Database:** PostgreSQL 15 on AWS RDS (Multi‑AZ, automated backups).
- **Storage:** AWS S3 (images, DICOM files) with Cloudflare R2 as CDN fallback.
- **Messaging / Notification:** LINE Messaging API, Twilio SMS, PromptPay QR generator service.
- **CI/CD:** GitHub Actions → Docker images → ECS Fargate.
- **Observability:** CloudWatch logs, Prometheus metrics, Grafana dashboards.

### 3.2 Database Schema (excerpt)

*Full schema is defined in `database‑schema.sql`. Below are representative tables with key constraints and RLS policies.*

```sql
-- tenants table (single row per clinic)
CREATE TABLE tenants (
    tenant_id      UUID PRIMARY KEY,
    name           TEXT NOT NULL,
    subdomain      TEXT UNIQUE NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- branches belonging to a tenant
CREATE TABLE branches (
    branch_id      UUID PRIMARY KEY,
    tenant_id      UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    address        TEXT,
    opening_hours  JSONB,
    CONSTRAINT uq_branch UNIQUE (tenant_id, name)
);

-- Pets
CREATE TABLE pets (
    pet_id         UUID PRIMARY KEY,
    tenant_id      UUID NOT NULL,
    owner_id       UUID NOT NULL,
    name           TEXT NOT NULL,
    species        TEXT,
    breed          TEXT,
    birth_date     DATE,
    gender         TEXT,
    microchip_id   TEXT,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on every table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
-- ... (repeat for all 23 tables)

-- RLS policy example – tenant isolation
CREATE POLICY tenant_isolation ON tenants
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY tenant_isolation ON branches
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY tenant_isolation ON pets
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
-- ... similar policies for branch_id where applicable
```

### 3.3 Indexing Strategy

| Table | Columns Indexed | Index Type | Reason |
|-------|----------------|------------|--------|
| pets | tenant_id, microchip_id | B‑tree | Fast lookup by tenant and microchip.
| appointments | tenant_id, branch_id, scheduled_at | B‑tree + BRIN (date) | Calendar queries across branches.
| inventory_stock | tenant_id, branch_id, product_id | B‑tree | Real‑time stock depletion.
| invoices | tenant_id, created_at | B‑tree | Revenue reporting.
| audit_logs | tenant_id, event_time | BRIN | Efficient range scans for large audit tables.

All indexes are created **CONCURRENTLY** in production to avoid downtime.

### 3.4 Security Controls

- **Transport:** Enforced HTTPS with HSTS.
- **Password Hashing:** bcrypt cost ≥ 12.
- **Data‑at‑Rest Encryption:** AWS‑managed RDS encryption.
- **JWT Claims:** `tenant_id`, `branch_id`, `user_id`, `role` (signed with RSA‑256).
- **Audit Trail:** `audit_logs` immutable (append‑only) table with GPG‑signed entries.
- **Backup & Recovery:** Daily RDS snapshots retained 30 days; point‑in‑time restore enabled.

---

## 4. Roadmap – Phase 4 Tasks

*(Extracted from `phase4‑tasks.md`)*

| Sprint | Feature | Description | Owner |
|--------|---------|-------------|-------|
| 1 | Inpatient Management Enhancements | Advanced care plans, automated discharge billing, integration with inventory for medication dispensing. | Backend Team |
| 2 | Grooming Capacity Optimization | Real‑time queue visualization, auto‑scaling of groomer slots based on historical demand. | Front‑end Team |
| 3 | Blood Bank Regulatory Compliance | Add donor eligibility checks, expiration alerts, GDPR‑compliant data handling. | Compliance Lead |
| 4 | Loyalty Tier Engine Refactor | Dynamic tier rules, points redemption API, analytics dashboard widgets. | Product Team |
| 5 | Security Audits & Pen‑Test Prep | Harden RLS policies, add anomaly detection on audit logs. | Security Engineer |
| 6 | Multi‑Branch Transfer Workflow UI | Drag‑and‑drop UI for inter‑branch stock moves, approval chain notifications. | UX Designer |

### Milestones
- **M1 (Week 2):** Inpatient module beta release.
- **M2 (Week 4):** Grooming queue live.
- **M3 (Week 6):** Blood bank compliance checklist complete.
- **M4 (Week 8):** Loyalty engine v2.
- **M5 (Week 10):** Security hardening sign‑off.
- **M6 (Week 12):** Full multi‑branch transfer UI.

---

## 5. Appendices

### 5.1 Glossary
- **Tenant:** A single veterinary clinic organization.
- **Branch:** Physical location of a tenant (e.g., individual clinic site).
- **RLS:** Row‑Level Security – PostgreSQL feature restricting rows per session.
- **JWT:** JSON Web Token – authentication token.

### 5.2 Reference Documents
- `functional‑reqs.md`
- `database‑schema.sql`
- `phase4‑tasks.md`
- `README.md`
- `HistoryLog.md`

---

*Document generated automatically on 2026‑05‑31. All sections reflect the latest codebase state in `d:/Development/AnimalClinic`.*
