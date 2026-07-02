# Anemal Permission Matrix (Authoritative)

> Source of truth for permission codes, default role mappings, and route guards. Seed data and
> enforcement applied per the route map below. Keep this file and the seed migration in sync.

## 1. Action vocabulary

| Action | Meaning |
|---|---|
| `view` | Read / list |
| `create` | Add a new record |
| `edit` | Modify an existing record |
| `delete` | Remove / cancel / void |
| `export` | Download / print / PDF |
| `dispense` | Hand out drugs & deduct stock (clinical-commerce) |
| `adjust` | Stock movement / correction |
| `manage` | create+edit+delete bundle for config-style modules |

## 2. Permission catalogue + default grid

Legend: `E` = granted (write-level for that code) · `V` = granted (read) · `-` = denied.
Columns are the three **system clinic roles**. Custom roles start as a clone of one of these.

| Code | Module | clinic_admin | doctor | clinic_staff |
|---|---|:---:|:---:|:---:|
| `dashboard.view` | Dashboard | V | V | V |
| `appointments.view` | Appointments | V | V | V |
| `appointments.create` | Appointments | E | - | E |
| `appointments.edit` | Appointments | E | - | E |
| `appointments.delete` | Appointments | E | - | E |
| `crm.view` | Pet & Owner | V | V | V |
| `crm.create` | Pet & Owner | E | - | E |
| `crm.edit` | Pet & Owner | E | - | E |
| `crm.delete` | Pet & Owner | E | - | - |
| `emr.view` | EMR / Clinical | V | V | V |
| `emr.create` | EMR / Clinical | - | E | - |
| `emr.edit` | EMR / Clinical | - | E | - |
| `emr.attach` | EMR (lab/X-ray files) | - | E | V |
| `vaccination.create` | EMR / Clinical (vaccination only) | - | E | E |
| `prescriptions.view` | Prescriptions | V | V | V |
| `prescriptions.create` | Prescriptions (write Rx) | - | E | - |
| `prescriptions.dispense` | Prescriptions (hand out + deduct) | - | E | E |
| `inventory.view` | Inventory | V | V | V |
| `inventory.create` | Inventory | E | - | E |
| `inventory.edit` | Inventory | E | - | E |
| `inventory.adjust` | Inventory (stock movement) | E | - | E |
| `billing.view` | Billing / POS | V | V | V |
| `billing.create` | Billing (create invoice) | E | - | E |
| `billing.payment` | Billing (record payment) | E | - | E |
| `billing.void` | Billing (void / refund) | E | - | - |
| `inpatient.view` | Inpatient | V | V | V |
| `inpatient.manage` | Inpatient | E | E | E |
| `grooming.view` | Grooming | V | - | V |
| `grooming.manage` | Grooming | E | - | E |
| `bloodbank.view` | Blood Bank | V | V | V |
| `bloodbank.manage` | Blood Bank | E | E | - |
| `loyalty.view` | Loyalty | V | - | V |
| `loyalty.manage` | Loyalty | E | - | E |
| `reports.revenue.view` | Reports — Revenue | E | - | V |
| `reports.inventory.view` | Reports — Inventory | E | V | V |
| `reports.cost.view` | Reports — Cost analysis | E | - | V |
| `reports.export` | Reports — export | E | - | V |
| `clinic.profile.view` | Clinic settings | V | V | V |
| `clinic.profile.edit` | Clinic settings (name/logo/addr/taxId) | E | - | - |
| `clinic.branch.view` | Branches | V | V | V |
| `clinic.branch.manage` | Branches (create/edit) | E | - | - |
| `clinic.hours.edit` | Operating hours | E | - | - |
| `clinic.payment.edit` | PromptPay / QR | E | - | - |
| `clinic.integrations.edit` | LINE / SMS / Lab keys | E | - | - |
| `staff.view` | Staff / users | V | - | - |
| `staff.manage` | Staff / users (CRUD) | E | - | - |
| `roles.view` | Roles | V | - | - |
| `roles.manage` | Roles (custom roles + assign perms) | E | - | - |
| `audit.view` | Audit log | V | - | - |

### Notes on key business decisions
- **Doctor has no billing/POS access** — clinical only. Billing is Staff/Admin.
- **Staff cannot write EMR clinical notes** (`emr.create/edit` denied) but can `emr.view` and
  `emr.attach` (upload lab/X-ray) and `prescriptions.dispense` (hand out what the doctor ordered).
- **Only clinic_admin** edits clinic config, manages staff/roles, sees revenue & cost reports, audit.
- **Doctor sees inventory (read)** to check stock when prescribing, but does not adjust it.
- **Vaccination administration uses its own `vaccination.create` code**, separate from
  `emr.create` (full SOAP-note/medical-record creation). `clinic_staff` holds
  `vaccination.create` (vet techs administer vaccines under doctor supervision) but NOT
  `emr.create` — they cannot write medical-record/SOAP notes.

## 3. Route -> permission map

> `@dev-agent`: replace bare `authMiddleware`/`rbacMiddleware(['admin'])` with
> `requirePlane('clinic')` + the permission below. Methodless rows = apply to all methods.

| Route file | Method + path | Permission |
|---|---|---|
| `appointment.routes` | GET `/` `/:id` | `appointments.view` |
| | POST `/` | `appointments.create` |
| | PUT `/:id` | `appointments.edit` |
| | DELETE `/:id` | `appointments.delete` |
| `pet.routes` / `owner.routes` | GET | `crm.view` |
| | POST | `crm.create` |
| | PUT | `crm.edit` |
| `medical-record.routes` | GET | `emr.view` |
| | POST `/` , PUT `/:id` | `emr.create` / `emr.edit` |
| | POST `/:id/attachments` | `emr.attach` |
| `vaccination.routes` | GET | `emr.view` |
| | POST `/` | `vaccination.create` |
| `prescription.routes` | GET | `prescriptions.view` |
| | POST (write) | `prescriptions.create` |
| | POST `/dispense` | `prescriptions.dispense` |
| `product.routes` | GET | `inventory.view` |
| | POST/PUT | `inventory.create` / `inventory.edit` |
| | stock movement | `inventory.adjust` |
| `invoice.routes` | GET | `billing.view` |
| | POST `/` | `billing.create` |
| | PUT `/:id/payment` | `billing.payment` |
| `report.routes` | GET `/revenue` `/snapshot` `/branch-revenue` | `reports.revenue.view` |
| | GET `/inventory-usage` | `reports.inventory.view` |
| | GET `/top-services` | `reports.revenue.view` |
| `hospitalization.routes` | GET / write | `inpatient.view` / `inpatient.manage` |
| `grooming.routes` | GET / write | `grooming.view` / `grooming.manage` |
| `blood-bank.routes` | GET / write | `bloodbank.view` / `bloodbank.manage` |
| `loyalty.routes` | GET / write | `loyalty.view` / `loyalty.manage` |
| `branch.routes` | GET | `clinic.branch.view` |
| | POST/PUT + shifts | `clinic.branch.manage` |
| `settings.routes` (`/clinic`) | GET | `clinic.profile.view` |
| | PUT `/clinic` | `clinic.profile.edit` |
| | PUT `/clinic/hours` | `clinic.hours.edit` |
| | PUT `/clinic/payment` | `clinic.payment.edit` |
| | PUT `/clinic/notifications` `/clinic/integrations` | `clinic.integrations.edit` |
| | GET/PUT `/personal` | (any authenticated clinic role — no permission) |
| `user.routes` | GET | `staff.view` |
| | POST/PUT/DELETE | `staff.manage` |
| `rbac.routes` (NEW) | GET roles/permissions | `roles.view` |
| | POST/PUT/DELETE roles | `roles.manage` |
| `audit.routes` | GET | `audit.view` |
| `subscription.routes` `/status` | GET | `clinic.profile.view` (read-only plan info for clinic) |

Platform-plane routes (`/platform/*`, `system-settings.routes`) use `requirePlane('platform')` and
platform permissions — see `anemal-platform-console` skill.

## 4. Migration mapping (existing -> new)

| Legacy `users.role` | New system role | Notes |
|---|---|---|
| `admin` | `clinic_admin` | gains explicit clinic config + reports + staff/roles perms |
| `doctor` | `doctor` | gains explicit clinical perms; loses implicit billing it never should have had |
| `staff` | `clinic_staff` | gains explicit ops/commerce perms |
| `superadmin` | moved to `platform_users` as `platform_super_admin` | leaves the tenant `users` table |

**Regression guard (write BEFORE enforcement):** for each system role, assert that the
set of endpoints it could reach before enforcement it can still reach post-enforcement (no lockout), and
that the newly-denied combinations (doctor->billing, staff->emr.edit) now return 403.

## 5. Multi-role addendum (CR-01)

Users are linked to roles many-to-many via `user_roles`; `users.role_id` becomes an optional
display/primary role only. Effective permission set = union of all assigned roles.

New permission code (add to the catalogue):

| Code | Module | clinic_admin | doctor | clinic_staff |
|---|---|:---:|:---:|:---:|
| `staff.assign_role` | Staff / users | E | - | - |

Runtime rule: assigning a role requires `staff.assign_role` + `roles.view`, and the assigned role's
permissions must be ⊆ the assigner's effective permissions (no escalation). A user must retain ≥ 1 role.
Route map: `POST/DELETE /users/:id/roles` → `staff.assign_role`.

## 6. Applying seed-rbac.ts changes to production

`seedRbac()` (`src/backend/prisma/seed-rbac.ts`) has NO automatic trigger in this repo — no
Dockerfile, CI/CD workflow, or app-boot hook runs it. After any change to `PERMISSIONS` or
`SYSTEM_ROLES`, an operator must manually run `npm run db:seed` against the target database.

**Before running in production**, diff current system-role grants against the updated seed
file to catch any permission that was manually granted outside the seed (re-running
`seedRbac()` deletes any `RolePermission` row on a system role whose code is not in the
current seed definition — see `seed-rbac.ts:228-236`):

```sql
SELECT cr.key AS role, rp."permissionCode"
FROM "role_permissions" rp
JOIN "clinic_roles" cr ON cr.id = rp."roleId"
WHERE cr."isSystem" = true
ORDER BY cr.key, rp."permissionCode";
```

Compare the output against `SYSTEM_ROLES` in `seed-rbac.ts`. Any code present in prod but
absent from the seed file will be revoked on the next `npm run db:seed` run — confirm that's
intended before proceeding.
