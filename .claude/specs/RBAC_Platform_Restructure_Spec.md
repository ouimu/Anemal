# Anemal — RBAC, Platform Console & Structure Restructure Specification

> **Spec ID:** SPEC-RBAC-PLATFORM-01 · **Status:** Historical (Phase 5 implemented) · **Owner:** @ba-agent
> **Created:** 2026-06-13 · **Phase:** Phase 5 — Authorization & Platform Separation
> **Authoritative references:** `anemal-rbac-matrix` skill · `anemal-platform-console` skill · `phase5-rbac-platform-tasks.md`
>
> **Staleness note (2026-07-09, Codex audit remediation):** this TO-BE design predates several
> permission codes added after Phase 5 shipped — `vaccination.create`, `staff.assign_branch`,
> `clinic.settings.manage` — none of which are listed here. Do not treat this document's
> permission catalogue as current; the `anemal-rbac-matrix` skill (`.claude/skills/anemal-rbac-matrix/references/permission-matrix.md`)
> is the single canonical, continuously-updated source for the permission catalogue and role
> matrix. This spec remains useful for the historical TO-BE rationale/narrative only.

This is a **business-analysis specification**, not an implementation. It defines the TO-BE
authorization model, the Platform/Clinic separation, the target application structure, and the
phased path to get there. Claude Code (`@dev-agent`, `@db-agent`, `@uiux-agent`, `@qa-agent`)
implements from `phase5-rbac-platform-tasks.md`.

---

## 1. Executive Summary

Anemal today is a working multi-tenant clinic system (4 phases + Phase 1.5 complete, ~226 tests).
Its **authorization model has not kept pace with the product**. Three problems block the next
stage of the SaaS:

1. **Authorization is coarse and inconsistent.** Clinical and transactional API routes (`pets`,
   `medical-records`, `invoices`, `appointments`, `reports`, `prescriptions`) carry **no role
   check at all** — any authenticated user (Doctor, Staff) has identical write access. The
   frontend `ProtectedRoute` checks *login only*, never role. The "Doctor vs Staff" and
   "view vs edit" distinction the business needs does not exist in code.
2. **The application plane and the clinic plane are fused.** `superadmin` is modelled as a
   *role inside a tenant*. Platform concerns (customer provisioning, plan/quota limits, per-tenant
   API provisioning) have no home and partly leak into the clinic `/admin` and `/settings` screens.
3. **The structure is disorganised.** Three overlapping settings stacks
   (`admin.routes`+`tenant-settings`, `settings.routes`, `system-settings.routes`), a `/admin`
   area that mixes clinic-admin and platform concerns, duplicate frontend surfaces
   (`AdminSettings`, `ClinicSettingsTab`, `/settings/*`), and stray artefacts (`_archive/`, `nul`).

**This spec proposes Phase 5:** introduce a **two-plane authorization model** (Platform vs Clinic),
a **configurable permission matrix** (fixed system roles + clinic-defined custom roles), a separate
**Platform Console**, and a **clean module structure**. Decisions confirmed with the product owner:

| # | Decision | Choice |
|---|----------|--------|
| D1 | SuperAdmin placement | **Separate Platform Console** (`/platform/*`, own layout, future separate deploy) |
| D2 | RBAC granularity | **Configurable roles per clinic** — system roles seeded, clinic_admin may clone & customize |
| D3 | This deliverable's scope | **Plan + docs + BA agent + skills only** — no production code; Claude Code implements next |

---

## 2. Business Context & Objectives

| Objective | Business value |
|---|---|
| Enforce least-privilege per role | Protects PII, financial data, and clinical records; supports PDPA/audit posture |
| Clear Doctor vs Staff vs Clinic-Admin duties | Matches real clinic operating model; reduces accidental data edits |
| Configurable roles per clinic | Larger clinics (cashier, receptionist, vet tech) can model their own org without code change -> sales lever for the Professional/Clinic+ tiers |
| Dedicated Platform Console | Lets Anemal operate the SaaS (onboard customers, set quotas, manage packages) safely, isolated from clinic data |
| Plan-based quotas (branches/staff/customers) | Enables tiered pricing enforcement — the commercial core of the subscription model |
| Organised structure | Lowers maintenance cost and onboarding time; removes duplicate/ambiguous code paths |

**Primary stakeholders:** Clinic Admin, Doctor, Clinic Staff (tenant plane) · Platform Super Admin,
Platform Support (application plane) · Anemal product & engineering team.

---

## 3. Scope

**In scope (Phase 5):**

- Two authorization planes (Platform, Clinic) with separated identity & tokens.
- Permission catalogue + configurable roles (`permissions`, `roles`, `role_permissions`, `user_roles`).
- Default permission matrix for the three system clinic roles.
- Permission enforcement across **all** existing clinic APIs and the frontend.
- Platform Console domain: customer (tenant) management, plan/package management, per-customer
  quota/scope, per-tenant integration provisioning, platform settings, cross-tenant usage/audit.
- Plan quotas: max branches, max clinic users (staff), max owners/customers, feature flags.
- Application structure cleanup (backend modules + frontend shells + route namespaces).

**Out of scope (deferred / later milestones):**

- Billing/charging engine for subscriptions (invoicing the *clinics* for the SaaS) — quota
  enforcement only; payment collection is a later milestone.
- SSO / external IdP, MFA — noted as future NFR.
- Support-impersonation (platform user logging in *as* a clinic) — designed for, gated behind a
  later flag.
- Field-level permissions inside a record (only module x action granularity in v1).

---

## 4. Assumptions

1. A user belongs to **exactly one plane** (a person is either a platform operator or a clinic user; cross-plane is not modelled).
2. A clinic user may hold **one or more roles** within their clinic (multi-role; CR-01). Effective permissions = the **union** of all assigned roles. A **Clinic Admin assigns/removes** a user's roles; a user must always keep **at least one** active role.
3. Branches remain **tenant-scoped**; "how many branches a customer can create" is a **plan/quota cap** set by the Platform plane and enforced when a Clinic Admin creates a branch.
4. Permission checks are **server-authoritative**; the frontend hides/disables UI for UX only and never as the security boundary.
5. Existing data (current `admin`/`doctor`/`staff` users) must be **migrated** to the new role model with equivalent permissions — no clinic loses access on rollout.
6. PostgreSQL + Prisma + JWT stack is retained (per project tech-stack rules); no new infra mandated beyond Redis (already present) for permission-set caching.

---

## 5. AS-IS -> TO-BE Gap Analysis

### 5.1 Authorization

| # | AS-IS (today) | Gap / risk | TO-BE (Phase 5) |
|---|---------------|------------|-----------------|
| G1 | Roles hardcoded enum `admin\|doctor\|staff\|superadmin` | No fine permissions; no custom roles | Permission catalogue + `roles`/`role_permissions`; clinic-configurable |
| G2 | Clinical/transaction routes have **no** `rbacMiddleware` | Doctor & Staff have identical write rights -> clinical & financial data exposure | `requirePermission('<module>.<action>')` on every route |
| G3 | `ProtectedRoute` checks auth only, never role | Any logged-in user reaches any screen; comments claim role gating that does not exist | `RequireAuth` + `RequirePlane` + `RequirePermission` guards |
| G4 | `superadmin` is a tenant role | Platform ops fused with a tenant; weak isolation of application-level power | Separate **Platform plane**: `platform_users`, plane-scoped JWT (no `tenantId`) |
| G5 | View vs edit not distinguished | Business cannot grant read-only access (e.g. Staff viewing EMR) | `view` vs `create/edit/delete/export` actions in the matrix |
| G6 | Quotas (branches/staff/customers) not enforced | Plan tiers unenforced -> revenue leakage; runaway resource use | `plans` + `tenant_quotas`; enforced at create-time |

### 5.2 Structure

| # | AS-IS | Gap | TO-BE |
|---|-------|-----|-------|
| G7 | 3 settings stacks (`tenant-settings`, `settings`, `system-settings`) | Ambiguous ownership, duplicated logic | 2 clear stacks: **clinic-settings** (tenant) + **platform-settings** (global) |
| G8 | `/admin/*` mixes clinic-admin & platform pages; legacy tabs duplicate `/settings/*` | Confusing IA; dead code | `/clinic/*` (ops) · `/clinic-admin/*` (clinic config) · `/platform/*` (app) |
| G9 | `_archive/`, `nul`, prototype dirs in repo | Noise, accidental edits | Removed / quarantined outside `src` |
| G10 | `authStore` ignores `branchId`; no permission state | Branch switch & UI gating impossible client-side | Auth store carries `plane`, `roleId`, `permissions[]`, `branchId` |

---

## 6. TO-BE Authorization Model

### 6.1 Two planes

```
+-------------------------- PLATFORM PLANE ----------------------------+
|  Identity: platform_users (NO tenant_id)                            |
|  Token:    { platformUserId, plane:'platform', role }              |
|  App:      Platform Console  ->  /platform/*                        |
|  Roles:    platform_super_admin · platform_support (read-only,later)|
+--------------------------------------------------------------------+
                 manages ^ quotas, plans, provisioning
                         |  (never reads clinic clinical/PII data directly)
+--------------------------- CLINIC PLANE ----------------------------+
|  Identity: users (tenant_id, branch_id, role_id)                   |
|  Token:    { userId, tenantId, branchId, permSetVersion }          |
|  Apps:     Clinic Ops -> /clinic/*   ·  Clinic Config -> /clinic-admin/* |
|  System roles: clinic_admin · doctor · clinic_staff  (+ custom)    |
+--------------------------------------------------------------------+
```

**Plane separation rule (ABSOLUTE):** a Platform token must never satisfy a Clinic-plane route and
vice versa. Enforced by a `requirePlane()` middleware before any permission check.

### 6.2 Clinic roles (system defaults)

| Role | Mandate (business) | Cannot (by default) |
|---|---|---|
| `clinic_admin` | Clinic-level configuration: clinic info, branches, logo, PromptPay QR, staff/user management, integration keys, all reports | write clinical EMR notes |
| `doctor` | Clinical work: pet history, EMR/SOAP, lab & X-ray results, diagnosis, prescriptions/medication orders | POS/billing, edit clinic config, manage staff |
| `clinic_staff` | Front-desk & commerce: appointments, CRM, stock, POS/billing, drug dispensing, operational reports | write clinical notes/diagnosis, edit clinic config, manage staff |

These three are **seeded system roles** (`is_system = true`). A Clinic Admin may **clone** any system
role into a **custom role** (e.g. "Receptionist", "Cashier", "Senior Vet Tech") and toggle individual
permissions — this satisfies D2 (configurable per clinic).

### 6.3 Permission model

- **Permission code** = `<module>.<action>` (e.g. `billing.create`, `emr.edit`, `reports.revenue.view`).
- **Actions:** `view`, `create`, `edit`, `delete`, `export`, plus domain verbs (`dispense`, `adjust`, `approve`).
- A **role** is a named set of permission codes, scoped to a tenant (or `tenant_id = NULL` for the system templates).
- A **user** is linked to **one or more roles** via the `user_roles` join table (CR-01). Effective permission set = **union** of every assigned role's permissions (most-permissive wins; no deny-permissions in v1). `users.role_id` is retained only as an optional *primary/display* role; the legacy `users.role` string is kept during migration as a coarse "role type", then deprecated.

**Full default matrix:** see the `anemal-rbac-matrix` skill -> `references/permission-matrix.md`
(authoritative). Summary of the most security-relevant rows:

| Module (action) | clinic_admin | doctor | clinic_staff |
|---|:---:|:---:|:---:|
| Dashboard (view) | Y | Y | Y |
| Appointments (manage) | Y | view own | Y |
| Pet & Owner CRM (manage) | Y | view | Y |
| **EMR / clinical notes (edit)** | view | **Y** | view |
| Lab / X-ray results (edit) | view | **Y** | view |
| **Prescriptions — write Rx (create)** | view | **Y** | dispense only |
| Inventory / stock (manage) | Y | view | Y |
| **Billing / POS (create)** | Y | — | **Y** |
| Reports — revenue (view) | Y | — | Y |
| Reports — inventory/cost (view) | Y | view inv. | Y |
| **Clinic settings — profile/branch/logo/QR (edit)** | **Y** | — | — |
| **Staff / user management (manage)** | **Y** | — | — |
| **Integration keys — LINE/SMS/Lab (edit)** | **Y** | — | — |
| Audit log (view) | Y | — | — |

Legend: Y = full (view+write for that module) · "view" = read-only · — = no access.

### 6.4 Enforcement points

1. **API (authoritative):** `requirePlane('clinic')` -> `requirePermission('billing.create')` middleware,
   reading the user's resolved permission set (cached in Redis, keyed by `roleId` + `permVersion`).
2. **UI (cosmetic):** `usePermissions()` hook + `<Can perm="billing.create">` wrapper to hide/disable
   controls and a `<RequirePermission>` route guard. Never the security boundary.
3. **Data:** existing tenant/branch isolation rules (`anemal-db-context`) remain in force *underneath*
   permissions — permissions narrow *what* a tenant user may do; isolation guarantees *whose* data.

---

## 7. Platform Console (SuperAdmin) — Domain

Full domain spec: `anemal-platform-console` skill. Capability summary:

| Capability | Description | Key entities |
|---|---|---|
| Customer (Tenant) management | Create / update / suspend / delete clinics; subdomain; trial; activation | `tenants` |
| Package / Plan management | Define plans (name, price, quotas, feature flags); add/edit/retire | `plans` |
| Scope / quota per customer | Cap max **branches**, max **clinic users (staff)**, max **owners/customers**; per-tenant overrides | `tenant_quotas` |
| Per-tenant provisioning | Provision/rotate infra-level config separated per clinic: S3 prefix/bucket, base provider keys, LINE channel binding | `tenant_settings`, `system_settings` |
| Platform settings | App name, base URL, maintenance mode, trial days, SMTP, feature flags | `system_settings` |
| Platform users | Manage platform operators & their platform roles | `platform_users` |
| Usage & audit | Cross-tenant usage vs quota; platform-level audit trail | `usage` views, `audit_logs` |

**Quota enforcement rule:** every create operation that consumes a quota (new branch, new clinic user,
new owner) must check the tenant's effective quota (`tenant_quotas` overriding `plans` defaults) and
return `409 QUOTA_EXCEEDED` with the limit when full.

**Provisioning split (who owns which config):**

| Config | Owner | Where |
|---|---|---|
| Clinic name, address, logo, operating hours, PromptPay QR | **Clinic Admin** | `/clinic-admin/*` |
| Clinic's own LINE OA token, SMS key, Lab API key (clinic-supplied) | **Clinic Admin** (encrypted) | `/clinic-admin/integrations` |
| Plan, quotas, subdomain, trial, active/suspended | **Platform** | `/platform/customers` |
| S3 bucket/prefix, SMTP, base provider, maintenance, feature flags | **Platform** | `/platform/settings` |

---

## 8. TO-BE Application Structure

### 8.1 Backend (`src/backend`)

```
middlewares/
  auth.middleware.ts          # verify token -> req.context (existing)
  plane.middleware.ts         # NEW: requirePlane('platform'|'clinic')
  permission.middleware.ts    # NEW: requirePermission('module.action')
  rbac.middleware.ts          # DEPRECATED -> thin shim over permission.middleware during migration
modules/                      # NEW: group by domain (controllers+services+repos+routes per module)
  rbac/                       # roles, permissions, role_permissions, role management API
  platform/                   # tenants, plans, quotas, platform-settings, platform-users
  clinic-settings/            # MERGE of tenant-settings + settings (clinic-scoped config)
  ... (existing domains may stay flat initially; consolidation is incremental — see plan)
```

> Restructure is **incremental**, not big-bang (see section 10 risk R3). New modules (`rbac`,
> `platform`, `clinic-settings`) are created cleanly; existing domain files are migrated
> route-by-route as permissions are applied.

### 8.2 Frontend (`src/frontend/src`)

```
app/                          # route trees per plane
  clinic/        -> /clinic/*        (ClinicLayout — ops: dashboard, appts, pets, emr, inventory, billing)
  clinic-admin/  -> /clinic-admin/*  (ClinicAdminLayout — clinic config, staff, roles, integrations, reports)
  platform/      -> /platform/*      (PlatformLayout — customers, plans, quotas, platform settings)
components/
  guards/RequireAuth.tsx · RequirePlane.tsx · RequirePermission.tsx · Can.tsx
hooks/usePermissions.ts
store/authStore.ts            # carries plane, roleId, permissions[], branchId
views/
  clinic/ · clinic-admin/ · platform/    # reorganised from views/clinic + views/admin + views/settings
```

**Route-access policy (decision-aligned):**

| Path | Plane | Who |
|---|---|---|
| `/clinic/*` | clinic | any clinic role with the relevant module permission |
| `/clinic-admin/*` | clinic | `clinic_admin` (or custom role with config permissions) |
| `/platform/*` | platform | `platform_super_admin` / `platform_support` only |
| `/login` (clinic) · `/platform/login` | — | public |

The clinic **Dashboard** is reachable only by clinic-plane users; the **Platform Console** and global
**system settings** are reachable only by platform-plane users — satisfying requirement #2 in the brief.

---

## 9. Data Model Changes (proposed DDL — for @db-agent)

> Proposed only. `@db-agent` finalises against `references/database-schema.sql` and writes migrations
> with `down` scripts (per `anemal-db-context` rules). Composite indexes lead with `tenant_id`.

```sql
-- Permission catalogue (global, seeded)
CREATE TABLE permissions (
  code        VARCHAR(80) PRIMARY KEY,     -- 'billing.create'
  module      VARCHAR(50) NOT NULL,        -- 'billing'
  action      VARCHAR(30) NOT NULL,        -- 'create'
  description VARCHAR(255)
);

-- Roles: tenant_id NULL = system template; else clinic-defined custom role
CREATE TABLE roles (
  id           SERIAL PRIMARY KEY,
  tenant_id    INT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system
  name         VARCHAR(80) NOT NULL,
  key          VARCHAR(50),                 -- 'clinic_admin' for system roles
  is_system    BOOLEAN DEFAULT FALSE,
  description  VARCHAR(255),
  perm_version INT DEFAULT 1,               -- bumped on permission change -> busts JWT/Redis cache
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_role_name UNIQUE (tenant_id, name)
);

CREATE TABLE role_permissions (
  role_id         INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code VARCHAR(80) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

-- users gains role_id (keep legacy role string during migration)
ALTER TABLE users ADD COLUMN role_id INT REFERENCES roles(id);

-- Platform plane identity (NOT tenant-scoped)
CREATE TABLE platform_users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL CHECK (role IN ('platform_super_admin','platform_support')),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plans (packages) — replace the bare tenants.plan string
CREATE TABLE plans (
  id           SERIAL PRIMARY KEY,
  key          VARCHAR(50) UNIQUE NOT NULL,   -- 'starter','professional','clinic_plus'
  name         VARCHAR(100) NOT NULL,
  price_month  NUMERIC(10,2) DEFAULT 0,
  max_branches INT DEFAULT 1,
  max_users    INT DEFAULT 5,                 -- clinic staff/doctors
  max_owners   INT,                           -- NULL = unlimited
  features     JSONB DEFAULT '{}',            -- feature flags
  is_active    BOOLEAN DEFAULT TRUE
);
ALTER TABLE tenants ADD COLUMN plan_id INT REFERENCES plans(id);

-- Per-tenant quota overrides (NULL field = inherit plan)
CREATE TABLE tenant_quotas (
  tenant_id    INT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_branches INT,
  max_users    INT,
  max_owners   INT,
  updated_by   INT,                              -- platform_users.id
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Migration of existing users:** seed system roles, map `role='admin' -> clinic_admin`,
`'doctor' -> doctor`, `'staff' -> clinic_staff`; move any `superadmin` user into `platform_users`
as `platform_super_admin`.

---

## 10. Risks, Constraints & Dependencies

| # | Risk / constraint | Impact | Mitigation |
|---|---|---|---|
| R1 | Applying permissions to currently-open routes can lock out real users | High | Migrate users to equivalent roles *first*; ship enforcement behind tests proving each system role keeps current access |
| R2 | JWT bloat if all permissions embedded | Med | Embed `roleId`+`permVersion`; resolve permission set server-side (Redis cache), invalidate on `perm_version` bump |
| R3 | Big-bang restructure breaks 226 passing tests | High | Incremental: new modules added clean; existing files moved route-by-route; keep test suite green each step |
| R4 | Configurable roles -> privilege-escalation bugs | High | Clinic Admin can only grant permissions they themselves hold; system roles immutable; deny-by-default |
| R5 | Platform plane could read clinic PII | High/compliance | Plane separation; platform APIs operate on tenant *metadata/quota*, not clinical/PII tables; impersonation gated + audited |
| R6 | Quota enforcement retro-applied to over-limit tenants | Med | Grandfather existing usage; enforce on *new* creates only; surface "over plan" warning to platform |
| R7 | Two login surfaces (clinic vs platform) confuse users | Low | Separate subdomain/route for platform; clear messaging |

**Dependencies:** Redis (present) for permission cache · existing `audit_logs` for permission/quota
events · existing encryption util (`enc:v1`) for platform-provisioned secrets · `usage.service`
extended for quota checks.

---

## 11. Non-Functional Requirements (delta)

| NFR | Requirement for Phase 5 |
|---|---|
| Security | Deny-by-default; server-authoritative permission checks; plane isolation; no privilege escalation via custom roles |
| Auditability | Every role/permission/quota/plan change and every platform action written to `audit_logs` |
| Performance | Permission resolution adds < 5 ms/request (Redis-cached set); no extra round-trip on the hot path |
| Maintainability | One settings stack per plane; one enforcement mechanism (`requirePermission`) |
| Scalability | Permission model supports custom roles for >= 1,000 tenants without schema change |
| Compatibility | Zero access regression for existing users on rollout (R1) |

---

## 12. Acceptance Criteria (phase-level)

1. A `doctor` cannot create an invoice (`403`) and a `clinic_staff` cannot edit an EMR clinical note (`403`), via API and hidden in UI.
2. A `clinic_admin` can edit clinic profile, manage staff, and edit integration keys; a `doctor`/`staff` cannot.
3. A Clinic Admin can clone the `doctor` role into a custom "Vet Tech" role, remove `prescriptions.create`, assign it to a user, and that user is blocked from writing prescriptions.
4. A platform token cannot reach any `/clinic/*` or clinic `/api` route; a clinic token cannot reach any `/platform/*` route (both `403`/redirect).
5. Creating a branch beyond the tenant's effective `max_branches` returns `409 QUOTA_EXCEEDED`; within limit succeeds.
6. The Platform Console can create a customer, assign a plan, override a quota, and the override takes effect on the clinic immediately.
7. All pre-existing tenant-isolation tests still pass; new permission-matrix and plane-isolation tests pass; **no access regression** for migrated users.
8. Structure: exactly two settings stacks remain; `/clinic`, `/clinic-admin`, `/platform` route trees exist; `_archive/` and stray files removed from `src` paths.

---

## 13. Phased Delivery (summary)

| Sub-phase | Title | Layer | Output |
|---|---|---|---|
| 5-A | RBAC foundation | DB + backend | `permissions`, `roles`, `role_permissions`, `users.role_id`, seed matrix, `permission.middleware` |
| 5-B | Enforce permissions on clinic APIs | backend + QA | every route guarded; migration of users; no regression |
| 5-C | Platform plane split | DB + backend | `platform_users`, platform auth, plane-scoped JWT, `plane.middleware` |
| 5-D | Platform Console domain APIs | backend | `plans`, `tenant_quotas`, customer/plan/quota/provisioning APIs + quota enforcement |
| 5-E | Frontend restructure & guards | frontend | three shells, `RequirePlane`/`RequirePermission`/`Can`, route reorg, authStore upgrade |
| 5-F | Role-management & Platform Console UI | frontend | clinic role editor; platform customer/plan/quota screens |
| 5-G | QA hardening & cleanup | QA | permission-matrix tests, plane-isolation tests, structure cleanup, docs |

Detailed, atomic, developer-ready tasks with acceptance criteria:
**`.claude/roadmap/archive/phase5-rbac-platform-tasks.md`** (archived 2026-07-09; shipped as Phase 8).

---

## 14. Next Steps

1. `@db-agent` reviews section 9 DDL and produces migration set (5-A, 5-C, 5-D) with `down` scripts.
2. `@dev-agent` implements `permission.middleware` + `plane.middleware` and the permission seed (5-A).
3. `@qa-agent` writes the regression guard (each system role keeps today's access) **before** 5-B enforcement.
4. `@uiux-agent` specs the three shells, the clinic role editor, and the Platform Console screens.
5. `@pm-agent` sequences 5-A...5-G into the roadmap and updates `docs/index.html` Upcoming Work.

---

## Platform-Plane Authorization — Phase 8 Decision

> Added 2026-06-16 by @ba-agent (PRE-4). Governs how `/platform/*` is gated in Phase 8.

**Decision (Phase 8):** The platform plane (`/platform/*`) uses role-string gating only. Any token with `plane:'platform'` and `role:'platform_super_admin'` has full access to all platform console routes. No permission codes are defined or enforced on the platform plane in this phase.

**Rationale:** The platform console is operated by a small, trusted team. Granular platform RBAC (e.g., read-only support vs. billing admin) is deferred to Phase 10 when a second platform role type is introduced. Until then, `requirePlane('platform')` is the sole authorization gate.

**Implication for frontend:** The platform shell (`/platform/*` in App.tsx) MUST NOT use `<RequirePermission>` guards — only `<RequireAuth>` + `<RequirePlane plane="platform">`. `platformGetMe` returning `permissions:[]` is intentional and correct for this phase.

**Deferred:** Platform permission codes and multi-role support on the platform plane — Phase 10.

---

## 15. Change Record CR-01 — Multi-role users & role assignment by Clinic Admin

> Added 2026-06-13 by @ba-agent. Supersedes the original single-role Assumption #2.

### Objective
Larger clinics need a person to act in **several capacities** (e.g. a vet who also runs the front
desk, or a senior staff who is also a cashier and stock manager). Allow a clinic user to hold
**multiple roles** within their own clinic, and let the **Clinic Admin assign** which roles each
user has — without code changes. This deepens the configurable-RBAC value (decision D2).

### Business rules
| # | Rule |
|---|---|
| BR-1 | A user may have 1..N roles, all scoped to their own tenant (no cross-tenant roles). |
| BR-2 | A user's **effective permissions = union** of all assigned roles' permissions (most-permissive wins; v1 has no deny-permissions, so union is safe and unambiguous). |
| BR-3 | A user must always keep **≥ 1 active role**; removing the last role is blocked. |
| BR-4 | Only a user with `staff.assign_role` (Clinic Admin by default) may assign/remove roles. |
| BR-5 | **No escalation:** the assigner may only grant roles whose permission set is a **subset of the assigner's own** effective permissions. |
| BR-6 | Assigning/removing a role, or editing a role's permissions, **re-resolves** the affected users' permission sets (bump `permSetVersion`; invalidate Redis cache by `userId`). |
| BR-7 | Deactivating or deleting a role that is still assigned is blocked until users are reassigned (reuse the role-in-use guard). |

### Data model delta (for @db-agent)
```sql
-- Many-to-many: a user holds one or more roles within their tenant
CREATE TABLE user_roles (
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role_id     INT NOT NULL REFERENCES roles(id)  ON DELETE RESTRICT,
  assigned_by INT REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_tenant_user ON user_roles (tenant_id, user_id);
```
- `users.role_id` is **retained** as an optional *primary/display* role (nullable); it is no longer
  the source of truth for permissions — `user_roles` is.
- Migration: for every existing user, insert one `user_roles` row from their current `role_id`
  (= today's single role). Zero behaviour change on day one.

### Authorization & token delta
- JWT drops `roleId` as an authorization input; it carries `userId` + `permSetVersion`. The server
  resolves the **union** of permissions from `user_roles` (Redis cache keyed by `userId`).
- `permSetVersion` = a per-user counter bumped whenever the user's role set changes or any of their
  roles' `perm_version` changes (or compute as a hash of `{roleId:perm_version}` pairs).

### New permission code
| Code | Module | clinic_admin | doctor | clinic_staff |
|---|---|:---:|:---:|:---:|
| `staff.assign_role` | Staff / users | E | – | – |
Assigning roles requires `staff.assign_role` **and** `roles.view` (to list assignable roles), plus
the BR-5 subset check at runtime.

### Acceptance criteria (adds to §12)
9. A Clinic Admin assigns both `doctor` and `clinic_staff` to one user; that user can write EMR
   notes **and** create invoices (union), confirmed via API and UI.
10. Removing a user's only remaining role is rejected (`409`/validation), user keeps access.
11. A non-admin user holding `staff.assign_role` cannot grant a role containing a permission they
    themselves lack (BR-5 → `403`).
12. Editing a role's permissions immediately changes the effective access of every user holding it
    (next request, no re-login required).

### Affected Phase 5 tasks
5-A → add `user_roles` (T-5A-07); 5-B → role-assignment API + union resolution (T-5B-04);
5-F → multi-role UI in the user editor (T-5F-03). See `phase5-rbac-platform-tasks.md`.
