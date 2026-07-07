# Platform Console — API & Screen Inventory

## Proposed API surface (`/platform/*`, requirePlane('platform'))

| Method + path | Permission | Purpose |
|---|---|---|
| GET `/platform/customers` | `platform.customers.view` | list tenants + plan + usage summary |
| POST `/platform/customers` | `platform.customers.manage` | create tenant (name, subdomain, plan, trial) |
| GET `/platform/customers/:id` | `platform.customers.view` | tenant detail + quota + usage |
| PUT `/platform/customers/:id` | `platform.customers.manage` | update tenant (name, subdomain, active) |
| POST `/platform/customers/:id/suspend` | `platform.customers.manage` | suspend (blocks clinic logins) |
| POST `/platform/customers/:id/reactivate` | `platform.customers.manage` | reactivate |
| PUT `/platform/customers/:id/quota` | `platform.quotas.manage` | override max_branches/users/owners |
| PUT `/platform/customers/:id/provisioning` | `platform.provisioning.manage` | S3 prefix, base providers, LINE binding — **DEFERRED to its own grilled task (ADR-0004 D6):** needs masking UX + write-only display design + verification against Batch 1 redaction before a UI is built. Placeholder text in `CustomerDetailView.tsx`'s Provisioning tab names the currently-available `/platform/settings` endpoint instead. |
| DELETE `/platform/customers/:id` | n/a | **NOT IMPLEMENTED — DEFERRED to Phase 10 (ADR-0004 D6):** suspend/reactivate cover the operational need today. Soft-delete + retention policy is recorded as the hard constraint for when this is built — see `anemal-platform-console/SKILL.md:82`. |
| GET/POST/PUT `/platform/plans` | `platform.plans.view\|manage` | plan CRUD |
| GET/PUT `/platform/settings` | `platform.settings.view\|edit` | app/SMTP/maintenance/feature flags (maps to existing system-settings) |
| GET/POST/PUT `/platform/users` | `platform.users.manage` | platform operator CRUD — **DEFERRED (ADR-0004 D6):** operators are a 2-role static enum managed via seed today; CRUD is its own privilege-escalation surface needing its own grilled pipeline cycle. Backlog. |
| GET `/platform/usage` | `platform.usage.view` | cross-tenant usage vs quota — **DEFERRED (ADR-0004 D6):** per-customer usage (shipped, see Customer Detail's Usage tab) satisfies the current operational need; the cross-tenant aggregate view is deferred. |
| GET `/platform/audit` | `platform.audit.view` | platform audit trail |
| POST `/platform/auth/login` | public | platform login (separate from clinic /auth/login) |

Standard response envelope `{ success, data, meta }` / `{ success, error:{code,message} }`.

## Proposed screens (PlatformLayout, `/platform/*`)

| Screen | Route | Notes |
|---|---|---|
| Platform Login | `/platform/login` | separate surface from clinic login |
| Customers (Tenants) | `/platform/customers` | table: name, subdomain, plan, branches/users/owners used vs cap, status |
| Customer Detail | `/platform/customers/:id` | tabs: Overview · Plan & Quota · Provisioning · Usage |
| Plans / Packages | `/platform/plans` | define/edit packages + quotas + feature flags |
| Platform Settings | `/platform/settings` | App · Email/SMTP · Feature Flags (reuse SystemSettingsPage content) |
| Platform Users | `/platform/users` | operators + platform roles |
| Usage & Audit | `/platform/usage` | aggregate dashboards + audit log |

## Migration note
- Move the current `superadmin`-gated `SystemSettingsPage` and `system-settings.routes` under the
  platform plane; the clinic app keeps only clinic-scoped settings.
- Today's clinic `/admin/*` pages that are actually clinic-admin (Profile, Users, Branches,
  Subscription) move to `/clinic-admin/*`; nothing clinic-admin lives under `/platform/*`.
