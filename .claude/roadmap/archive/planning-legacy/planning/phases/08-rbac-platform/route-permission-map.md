# Frontend Route → Permission Code Mapping

> Owner: @ba-agent · Created 2026-06-16 (PRE-4) · Source of truth for the `<RequirePermission>`
> guards added to `App.tsx` in PRE-3. Permission codes are authoritative per
> `anemal-rbac-matrix` → `references/permission-matrix.md` and verified against the actual
> per-route `requirePermission(...)` guards in `src/backend/routes/*.routes.ts`.

## How to read this table

- **Required Permission Code** = the code to pass to `<RequirePermission perm="...">` on the
  frontend route. The server remains the security boundary; these guards are UX-only (hide the
  screen / redirect to `/403`).
- `—` = no permission code required; the **plane gate alone is sufficient** (any authenticated
  clinic user reaches the route). Use only `<RequireAuth>` + `<RequirePlane plane="clinic">`.
- A screen aggregating several backend endpoints is gated on its **lowest-privilege entry
  permission** (the `.view` code that lets the user open the screen at all). Write actions inside
  the screen are gated per-control with `<Can perm="...">`, not at the route level.

---

## `/clinic/*` (plane=clinic, ops — any clinic role with the module permission)

| Frontend Route | HTTP Endpoints Used | Required Permission Code | Notes |
|---|---|---|---|
| `/clinic/dashboard` | GET `/reports/snapshot`, GET `/dashboard` aggregates | `dashboard.view` | All three system roles hold `dashboard.view`; effectively any clinic user. |
| `/clinic/appointments` | GET/POST `/appointments`, PUT `/appointments/:id/status`, `/reminders` | `appointments.view` | Open = view; create/edit gated per-control (`appointments.create/edit`). Doctor has view-only. |
| `/clinic/pets` | GET/POST/PUT `/pets`, `/owners`, GET `/search`, `/loyalty` | `crm.view` | Doctor view-only; write controls gated `crm.create/edit/delete`. |
| `/clinic/emr` | GET/POST/PUT `/medical-records`, `/vaccinations`, POST `/medical-records/:id/attachments` | `emr.view` | Open = view (all roles). Note authoring gated `emr.create/edit`; staff blocked from authoring, may `emr.attach`. |
| `/clinic/inventory` | GET/POST/PUT `/products`, stock-in/movements, `/transfers` | `inventory.view` | Doctor view-only; write gated `inventory.create/edit/adjust`. |
| `/clinic/billing` | GET/POST `/invoices`, PUT `/invoices/:id/payment`, `/prescriptions` (dispense) | `billing.view` | **Doctor has no billing access** → route should deny for doctor. Gate on `billing.view` (doctor lacks write but holds view per matrix; if business wants doctors off the screen entirely, gate `billing.create`). See Open Question Q1. |
| `/clinic/inpatient` | GET/POST `/hospitalization`, care, discharge | `inpatient.view` | All roles view; manage gated `inpatient.manage`. |
| `/clinic/grooming` | GET/POST `/grooming/bookings`, PUT status | `grooming.view` | **Doctor has no grooming access** (matrix: doctor = `—`). Gate `grooming.view`; doctor will hit `/403`. |

## `/clinic-admin/*` (plane=clinic, clinic config — `clinic_admin` or custom role with config perms)

| Frontend Route | HTTP Endpoints Used | Required Permission Code | Notes |
|---|---|---|---|
| `/clinic-admin/dashboard` | GET `/clinic/usage`, GET `/admin/usage` | `clinic.profile.view` | Admin landing. All clinic roles hold `clinic.profile.view`, but the screen is reached via the admin shell; use `clinic.profile.view` as the minimum gate. See Q2. |
| `/clinic-admin/profile` | GET `/settings/clinic`, PUT `/settings/clinic` | `clinic.profile.view` | View gates the route; the Save/edit control gates `clinic.profile.edit` (clinic_admin only). |
| `/clinic-admin/users` | GET/POST/PUT/DELETE `/users/*` | `staff.view` | View gates route (clinic_admin only by default); CRUD controls gate `staff.manage`. Role-assignment controls gate `staff.assign_role` + `roles.view` (CR-01). |
| `/clinic-admin/branches` | GET/POST/PUT `/branches/*`, shifts | `clinic.branch.view` | View gates route; create/edit + shift controls gate `clinic.branch.manage`. |
| `/clinic-admin/settings` | GET/PUT `/admin/settings`, PUT `/settings/clinic/notifications`,`/payment`,`/integrations`,`/hours` | `clinic.profile.view` | Aggregates several config tabs. Each tab's write control gates its specific code: `clinic.hours.edit`, `clinic.payment.edit`, `clinic.integrations.edit`. |
| `/clinic-admin/usage` | GET `/admin/usage`, GET `/clinic/usage` | `clinic.profile.view` | Read-only usage vs. quota for the clinic. |
| `/clinic-admin/subscription` | GET `/subscription/status` | `clinic.profile.view` | Read-only plan info for the clinic (matrix: `subscription /status` → `clinic.profile.view`). |
| `/clinic-admin/blood-bank` | GET/POST `/blood-bank/donors`,`/collections`,`/transfusions` | `bloodbank.view` | View gates route; donor/collection/transfusion writes gate `bloodbank.manage`. (Clinical-adjacent; lives under admin shell currently — see Q3.) |
| `/clinic-admin/audit` | GET `/audit` | `audit.view` | **clinic_admin only** — doctor/staff denied (`—` in matrix). |
| `/clinic-admin/roles` *(planned, T-5F)* | GET `/roles`, POST `/roles/clone`, PUT `/roles/:id/permissions`, DELETE `/roles/:id` | `roles.view` | View gates route (clinic_admin only); clone/edit/delete + assign-perm controls gate `roles.manage`. Route not yet in App.tsx. |

## `/platform/*` (plane=platform)

| Frontend Route | HTTP Endpoints Used | Required Permission Code | Notes |
|---|---|---|---|
| `/platform/*` (all) | `/platform/customers`, `/platform/plans`, `/platform/system-settings` | — | **No permission codes on the platform plane in Phase 8** (see spec §"Platform-Plane Authorization — Phase 8 Decision"). Gate with `<RequireAuth>` + `<RequirePlane plane="platform">` only. `platformGetMe` returns `permissions:[]` by design. |

## `/settings/*` (plane=clinic, legacy shell — being folded into `/clinic-admin/*`)

| Frontend Route | HTTP Endpoints Used | Required Permission Code | Notes |
|---|---|---|---|
| `/settings/clinic-profile` | GET/PUT `/settings/clinic` | `clinic.profile.view` | Edit control gates `clinic.profile.edit`. |
| `/settings/hours` | PUT `/settings/clinic/hours` | `clinic.hours.edit` | clinic_admin only. |
| `/settings/payment` | PUT `/settings/clinic/payment` | `clinic.payment.edit` | clinic_admin only. |
| `/settings/integrations` | PUT `/settings/clinic/integrations` | `clinic.integrations.edit` | clinic_admin only. |
| `/settings/notifications` | PUT `/settings/clinic/notifications` | `clinic.integrations.edit` | Notifications config = integration keys; clinic_admin only. |
| `/settings/preferences` | GET/PUT `/settings/personal` | — | Personal preferences — any authenticated clinic user (matrix: `/personal` = no permission). |
| `/settings/system` | GET/PUT `/system-settings/*` | — *(platform plane)* | **Platform-plane screen mis-located under `/settings`.** `system-settings.routes` requires `requirePlane('platform')`; a clinic token cannot reach it. Move under `/platform/*`. See Q4. |

---

## Open questions / flags for @pm-agent

- **Q1 — Doctor on `/clinic/billing`:** matrix grants doctor `billing.view` (read) but "Doctor has no
  billing/POS access" is stated as a key business decision. If doctors should not see the billing
  screen at all, gate the route on `billing.create` (or a dedicated `billing.access`); otherwise
  `billing.view` lets them open a read-only screen. **Recommend confirming with product.**
- **Q2 — Admin dashboard gate:** `/clinic-admin/dashboard` currently has no admin-specific entry
  permission; `clinic.profile.view` is held by all roles, so the plane+shell is the only real gate.
  If clinic-admin landing must exclude doctor/staff, introduce an admin-area gate (e.g. require
  `staff.view` OR `clinic.profile.edit`). **Flagged, not blocking.**
- **Q3 — Blood bank placement:** `bloodbank.*` is clinical-adjacent (doctor holds `bloodbank.manage`)
  yet the screen sits under the `/clinic-admin/*` shell. Consider moving to `/clinic/*` so doctors
  reach it. Mapping above gates on `bloodbank.view` regardless of shell.
- **Q4 — `/settings/system` is platform-plane:** it must not live in the clinic settings shell;
  belongs under `/platform/*`. Backend already enforces `requirePlane('platform')`, so a clinic user
  is blocked server-side, but the route should be removed from the clinic frontend.
- **`/clinic-admin/roles`** is referenced in the brief's example but is **not yet present in
  App.tsx** — it arrives with T-5F (role editor). Listed here so PRE-3 can stub the guard now.

## Verification basis

Backend per-route guards confirmed by static extraction of `requirePermission(...)` across all 30
`*.routes.ts` files (94 occurrences). Every clinic and clinic-admin module has server-side permission
enforcement; the gap this map closes is the **frontend** route layer in `App.tsx`, where
`/clinic/*` and `/clinic-admin/*` currently carry only `RequirePlane` and no `RequirePermission`.
