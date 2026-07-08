# Platform Console — API & Screen Inventory

## Current API surface (`/platform/*`, `authMiddleware` + `requirePlane('platform')`)

| Method + path | Permission | Purpose |
|---|---|---|
| GET `/platform/customers` | `platform.customers.view` | list tenants + plan name + user count + computed active/suspended status |
| POST `/platform/customers` | `platform.customers.manage` | create tenant (name, subdomain, plan, optional company type). Trial lifecycle is deferred to Phase 10 and is not accepted in the current write payload. |
| GET `/platform/customers/:id` | `platform.customers.view` | tenant detail + plan/quota + company type + contact metadata |
| PUT `/platform/customers/:id` | `platform.customers.manage` | update tenant metadata (name, subdomain, plan, company type). Active/suspended state is handled by suspend/reactivate endpoints. |
| POST `/platform/customers/:id/suspend` | `platform.customers.manage` | suspend (blocks clinic logins) |
| POST `/platform/customers/:id/reactivate` | `platform.customers.manage` | reactivate |
| PUT `/platform/customers/:id/quota` | `platform.quotas.manage` | override max_branches/users/owners |
| GET `/platform/customers/:id/usage` | `platform.usage.view` | per-customer live counts (branches/users/owners) vs effective plan/quota caps |
| GET `/platform/customers/:id/provisioning` | `platform.provisioning.manage` | backend API returns per-tenant provisioning with secrets masked; 404 if none exists |
| PUT `/platform/customers/:id/provisioning` | `platform.provisioning.manage` | backend API creates/updates per-tenant S3/SMS/SMTP/LINE provisioning with encrypted secrets; customer-detail UI remains a deferred placeholder |
| DELETE `/platform/customers/:id` | n/a | **NOT IMPLEMENTED — DEFERRED to Phase 10 (ADR-0004 D6):** suspend/reactivate cover the operational need today. Soft-delete + retention policy is recorded as the hard constraint for when this is built — see `anemal-platform-console/SKILL.md:82`. |
| GET/POST/PUT `/platform/plans` | `platform.plans.view\|manage` | plan CRUD |
| GET/PUT `/platform/settings` | `platform.settings.view\|edit` | app/SMTP/maintenance/default-trial settings (feature flags removed, ADR-0007 D3 — no consumer; re-add with real persistence when a flag-reading feature ships). |
| GET/POST/PUT `/platform/users` | `platform.users.manage` | platform operator CRUD — **DEFERRED (ADR-0004 D6):** operators are a 2-role static enum managed via seed today; CRUD is its own privilege-escalation surface needing its own grilled pipeline cycle. Backlog. |
| GET `/platform/usage` | `platform.usage.view` | cross-tenant usage vs quota — **DEFERRED (ADR-0004 D6):** per-customer usage (shipped, see Customer Detail's Usage tab) satisfies the current operational need; the cross-tenant aggregate view is deferred. |
| GET `/platform/audit` | `platform.audit.view` | platform audit trail |
| POST `/platform/auth/login` | public | platform login (separate from clinic /auth/login) |

Standard response envelope `{ success, data, meta }` / `{ success, error:{code,message} }`.

## Current screens (PlatformLayout, `/platform/*`)

| Screen | Route | Notes |
|---|---|---|
| Platform Login | `/platform/login` | separate surface from clinic login |
| Customers (Tenants) | `/platform/customers` | table: name, subdomain, plan, status, user count |
| Customer Detail | `/platform/customers/:id` | tabs: Overview · Plan & Quota · Provisioning · Usage |
| Plans / Packages | `/platform/plans` | define/edit packages + quotas + boolean feature flags; UI validation must keep branch/user caps positive because backend rejects zero/blank values |
| Platform Settings | `/platform/settings` | App · Email/SMTP · Maintenance · default trial days; feature flags removed (ADR-0007 D3) |
| Platform Audit | `/platform/audit` | audit log screen |
| Platform Users | `/platform/users` | **Deferred** — no current route |
| Cross-tenant Usage | `/platform/usage` | **Deferred** — per-customer Usage tab is shipped instead |

## Migration note
- Move the current `superadmin`-gated `SystemSettingsPage` and `system-settings.routes` under the
  platform plane; the clinic app keeps only clinic-scoped settings.
- Today's clinic `/admin/*` pages that are actually clinic-admin (Profile, Users, Branches,
  Subscription) move to `/clinic-admin/*`; nothing clinic-admin lives under `/platform/*`.
- **Settings audit actor identity (ADR-0007 D5):** `settings_audit_log.changedBy` FKs clinic
  `users(id)`. Platform JWTs carry `{platformUserId, plane, role}` — no `userId` field at all — so
  a platform-plane settings write always stores `changedBy = NULL` by design (writing a
  `platformUserId` there would risk an id-collision bug, not a fix). The real actor for a
  platform-plane write is recorded in the companion `platform_audit_logs` row instead.
