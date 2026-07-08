---
name: anemal-platform-console
description: >
  Platform (SaaS application) admin domain for Anemal — the SuperAdmin Console that operates the
  product across all tenants. Use this skill for anything platform-plane: customer/tenant
  provisioning, plan/package management, per-customer quotas (max branches/staff/customers),
  per-tenant integration provisioning (S3, SMTP, base providers), platform settings, platform
  users, maintenance mode, cross-tenant usage/audit. Trigger when work involves
  /platform/*, platform_users, plans, tenant_quotas, or "manage customers/packages/limits". Do NOT
  use for clinic-side settings (that is anemal-rbac-matrix + clinic-settings).
---

# Anemal Platform Console

## Purpose & boundary
The Platform Console is the **application-level** admin surface, fully separated from the clinic app
(Decision D1). It manages the *business of the SaaS*, never clinical/PII data.

**Hard boundary:** platform APIs operate on tenant **metadata, plan, quota, provisioning, and
aggregate usage** — never on `pets`, `owners`, `medical_records`, `invoices`, etc. Reading clinic
clinical/PII data from the platform plane is a stop-ship violation (see QA stop criteria).

## Identity & access
- Separate identity table `platform_users` (no `tenant_id`).
- Platform token: `{ platformUserId, plane:'platform', role }`. No `tenantId`, no `branchId`.
- `requirePlane('platform')` gates every `/platform/*` route; a clinic token gets 403.
- Platform roles: `platform_super_admin` (full), `platform_support` (read-only/diagnostic, later).

## Capabilities

| # | Capability | Operations | Entities |
|---|---|---|---|
| P1 | Customer (Tenant) management | list / create / update / suspend / reactivate; set name, subdomain, plan, company type | `tenants` |
| P2 | Plan / Package management | define plans (name, price, quotas, features); edit; retire | `plans` |
| P3 | Quota / scope per customer | set/override max_branches, max_users, max_owners per tenant | `tenant_quotas` (overrides `plans`) |
| P4 | Per-tenant provisioning | Backend API for S3 bucket/prefix, base provider keys, LINE channel binding, rotate secrets; customer-detail UI is placeholder/deferred | `tenant_provisioning` |
| P5 | Platform settings | app name, base URL, maintenance mode, trial days, SMTP (feature flags removed, ADR-0007 D3 — no consumer; re-add with real persistence when a flag-reading feature ships) | `system_settings` |
| P6 | Platform users | seed/static platform operators today; CRUD UI/API deferred | `platform_users` |
| P7 | Usage & audit | per-customer usage vs quota, platform audit trail; cross-tenant usage dashboard deferred | `usage.service`, `platform_audit_logs` |

## Platform permission codes
`platform.customers.view|manage` · `platform.plans.view|manage` · `platform.quotas.manage` ·
`platform.provisioning.manage` · `platform.settings.view|edit` · `platform.users.manage` ·
`platform.usage.view` · `platform.audit.view`.
Default: `platform_super_admin` = all; `platform_support` = all `.view` only.

## Quota model (the commercial core)
- Effective quota = `tenant_quotas.<field>` if set, else `plans.<field>` of the tenant's plan.
- Enforced at **create time** for quota-consuming actions:

| Action | Quota | Failure |
|---|---|---|
| Clinic Admin creates a branch | `max_branches` | `409 QUOTA_EXCEEDED` |
| Clinic Admin creates a user/staff | `max_users` | `409 QUOTA_EXCEEDED` |
| Clinic creates an owner (customer) | `max_owners` (NULL=unlimited) | `409 QUOTA_EXCEEDED` |

- Existing over-limit tenants are **grandfathered**: enforce on new creates only; surface an
  "over plan" flag to the platform (R6).
- Reuse and extend `usage.service` for the current-count side of each check.

## Provisioning split (who owns what)
| Config | Owner plane | Surface |
|---|---|---|
| Clinic name/logo/address/hours/PromptPay QR | clinic | `/clinic-admin/*` |
| Clinic's own LINE/SMS/Lab keys (clinic-supplied, encrypted) | clinic | `/clinic-admin/integrations` |
| Plan, quota overrides, subdomain, company type, active/suspended | platform | `/platform/customers` |
| Trial lifecycle | platform | Deferred to Phase 10; `default_trial_days` exists in platform settings but `Tenant.trialEndsAt` is not in the current schema |
| S3 bucket/prefix, SMTP, base providers, LINE binding | platform | Backend: `/platform/customers/:id/provisioning`; UI: deferred placeholder in customer detail |
| Maintenance, global SMTP defaults | platform | `/platform/settings` (feature flags removed, ADR-0007 D3) |

## Default plans (seed)
| key | name | max_branches | max_users | max_owners |
|---|---|---|---|---|
| `starter` | Starter | 1 | 5 | 500 |
| `professional` | Professional | 3 | 20 | 5000 |
| `clinic_plus` | Clinic+ | 10 | 100 | NULL (unlimited) |

> Values are a starting proposal; confirm with product/commercial before seeding.

## Audit & safety
- Every platform mutation (tenant create/suspend, plan/quota change, provisioning, settings) writes
  to `platform_audit_logs` or the relevant settings audit sink with the acting `platform_user`.
- Suspending a tenant must immediately block that tenant's clinic logins.
- Deleting a tenant is soft-delete + retention window, never hard-delete of clinical data on click.
