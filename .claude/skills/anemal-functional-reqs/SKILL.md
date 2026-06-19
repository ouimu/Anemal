---
name: anemal-functional-reqs
description: >
  Anemal functional and non-functional requirements reference for @pm-agent. Use this
  skill whenever validating scope, writing user stories, reviewing a feature request,
  checking Must/Should/Could priority, resolving disputes about what the system should
  do, or assessing whether a proposed implementation matches agreed requirements. Also
  trigger when discussing integrations, NFRs, or user roles. If someone asks "is this
  in scope?" or "what is the priority of X?" this skill has the answer.
---

# Anemal Functional Requirements

## System snapshot

- **Platform:** Multi-tenant SaaS — Web (counter/reception) + Tablet (touch-first, clinic floor)
- **Multi-branch:** Yes — `branch_id` scoping within a tenant
- **Roles:** Admin (full tenant) · Doctor (clinical) · Staff (ops + billing)

## Module index

| Module | FR IDs | Core Must items |
|---|---|---|
| Auth & Authorization | FR-01 | JWT with tenant/branch/role, 8h TTL, RBAC, user management |
| Multi-tenancy & Branch | FR-02 | Strict `tenant_id` isolation, subdomain per clinic, branch setup |
| Pet & Owner (CRM) | FR-03 | Full CRUD, drug allergies, vaccination timeline, quick search |
| Appointment & Scheduler | FR-04 | Weekly/daily calendar, double-booking block, walk-in queue |
| EMR & Clinical | FR-05 | SOAP notes, vital signs, prescriptions with real-time stock check |
| Inventory | FR-06 | Per-branch stock, auto-deduct on prescription, min-stock + expiry alerts |
| Billing & POS | FR-07 | Invoice from EMR, retail POS, PromptPay QR, 7% VAT receipts |
| Inpatient | FR-08 | Admit/daily care time slots/discharge with auto-billing |
| Grooming | FR-09 | Grooming queue booking + daily capacity tracking |
| Blood Bank | FR-10 | Donor registry, collection/transfusion logs with donor matching |
| Loyalty & Membership | FR-11 | Tiered membership, points accrual, redemption at checkout |
| Security & Audit | FR-12 | Audit logs for all data changes and financial transactions |
| Reports & Analytics | FR-13 | Revenue reports (Must); trend graphs, real-time dashboard (Should) |

## Non-functional requirements (key)

| NFR | Requirement |
|---|---|
| Performance | Search < 500ms; page load < 2s on 3G |
| Security | HTTPS all endpoints; bcrypt cost ≥ 12; data encrypted at rest |
| Availability | Uptime ≥ 99.5% |
| Backup | Daily automated backup; 30-day retention |
| Touch UX | All interactive elements ≥ 44×44px |
| Scalability | ≥ 1,000 concurrent tenants |
| Offline | Basic tablet data capture when internet lost |

## Integration requirements

| System | Priority |
|---|---|
| PromptPay QR + Omise/Stripe | Must |
| AWS S3 / Cloudflare R2 | Must |
| LINE Messaging API | Should |
| Cornerstone.js (DICOM) | Should |
| Twilio SMS | Could |

## Reference file

Full FR matrix with all IDs and requirement text (Thai + English): `references/functional-reqs.md`

Use FR IDs (e.g. FR-04-06) as stable references in tickets and user stories.

---

## Authorization & Platform additions (designed, SPEC-RBAC-PLATFORM-01)

Roles are evolving from the flat `Admin/Doctor/Staff` set to a **two-plane** model.
Authoritative detail in skills `anemal-rbac-matrix` and `anemal-platform-console`.

| Module | FR IDs | Core Must items |
|---|---|---|
| Authorization (RBAC) | FR-14 | Permission catalogue `<module>.<action>`; system roles seeded; **configurable custom roles per clinic**; deny-by-default; `requirePermission` on every route; view vs edit separation |
| Multi-role (RBAC) | FR-14b | A clinic user may hold **multiple roles**; effective permissions = union; **Clinic Admin assigns roles** (`staff.assign_role`, no escalation, ≥1 role). CR-01 |
| Platform Console (SaaS) | FR-15 | Separate platform plane (`/platform/*`, `platform_users`, no tenant); customer (tenant) CRUD; **plan/package management**; **per-customer quotas** (max branches/staff/owners); per-tenant provisioning; platform settings; cross-tenant usage/audit |
| Plan & Quota | FR-16 | `plans` + `tenant_quotas`; effective quota = override ?? plan; enforced at create-time → `409 QUOTA_EXCEEDED` |

**Role taxonomy (TO-BE):**
- Clinic plane: `clinic_admin` (clinic config, staff, roles, reports, integration keys) · `doctor` (EMR/clinical, prescriptions) · `clinic_staff` (appointments, CRM, inventory, POS/billing, dispense) · + clinic-defined custom roles.
- Platform plane: `platform_super_admin` · `platform_support` (read-only, later).

**Access intent (brief req #2):** clinic Dashboard = clinic plane only; system/platform settings = platform plane only.
