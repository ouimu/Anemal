# Design: Fix Missing Doctor List in Appointment Booking

**Date:** 2026-07-05
**Status:** Approved (brainstorm), pending BA sign-off + grill-with-docs per CLAUDE.md pipeline

## Problem

Creating an appointment shows no doctor in the doctor dropdown. Booking cannot
be saved (doctor is required).

## Root Causes (2, stacked)

1. **Wrong permission gate.** Frontend fetches doctors via `GET /users`
   (`ClinicAppointments.tsx:271`), which requires `staff.view`
   (`user.routes.ts:11`). Only `clinic_admin` holds `staff.view`
   (`seed-rbac.ts:126`) — `clinic_staff` and `doctor` do not
   (`seed-rbac.ts:137`, `:154`). Any non-admin opening the booking form gets a
   403 on this call, so the doctor list renders empty.

2. **No branch/role-lineage scoping.** Even with permission fixed, the
   current code:
   - Does not filter by branch at all — `findUsers(tenantId)`
     (`user.service.ts:38`) returns every tenant user; client only filters by
     legacy `role === 'doctor'` string (`ClinicAppointments.tsx:294`).
   - Does not recognize custom roles cloned from the system "Doctor" role
     (`cloneRole`, `role.service.ts:77`) — `ClinicRole` has no lineage column,
     so a clinic that renames/customizes "Doctor" loses doctor-list
     membership for those users.

## Design

### New endpoint

`GET /api/appointments/doctors?branchId=:branchId`

- Permission: `appointments.view` (held by `clinic_admin`, `clinic_staff`,
  `doctor` — everyone who can open the booking form).
- Returns bookable doctors for the given branch only.

### Doctor membership rule

A user counts as a doctor if **any** of their assigned roles
(`UserRole` → `ClinicRole`) resolves to the Doctor system role:

- `ClinicRole.key === 'doctor'` (system role, or a custom role that happens to
  reuse this key), OR
- `ClinicRole.sourceRoleId` points (directly) to the system Doctor role.

Multi-role users qualify if any one of their roles satisfies this — no need
for all roles to be Doctor-derived.

### Branch scoping

Filter via existing `UserBranch` join table (already populated today by
admin's branch-assignment UI — no change to that assignment flow).

### Schema change

Add nullable `ClinicRole.sourceRoleId Int?` (self-referencing FK to
`ClinicRole.id`). Set by `cloneRole` (`role.service.ts:77`) when cloning
from the system "Doctor" role. One migration, no data backfill needed for
existing clones (they simply won't retroactively count as doctor-derived
until re-cloned or manually linked — acceptable, flagged as known gap below).

### Components touched

- `prisma/schema.prisma` — add `sourceRoleId` column + migration
- `role.service.ts` `cloneRole` — set `sourceRoleId` on the created row
- `appointment.repository.ts` — new `findDoctorsForBranch(tenantId, branchId)`
- `appointment.controller.ts` + `appointment.routes.ts` — new route
- `ClinicAppointments.tsx` — replace `/users` doctor-fetch with new endpoint;
  drop client-side `role === 'doctor'` filter

### Error handling

Empty result (no doctor assigned to branch) is a valid, expected state — not
an error. UI shows "No doctor assigned to this branch — contact your admin"
instead of a blank dropdown with no explanation, and the Save button stays
disabled with that message visible.

### Known gap (out of scope for this fix, call out explicitly)

Existing custom roles already cloned from "Doctor" before this fix will not
have `sourceRoleId` set (no backfill). If a tenant has such a role today, its
users still won't appear as doctors until an admin re-clones the role or a
manual data fix is applied. Not addressed here — flag to BA/PM whether a
backfill migration is warranted based on real tenant data.

## Testing

- RBAC: `clinic_staff` and `doctor` can call the new endpoint (200, not 403);
  `clinic_admin` too.
- Branch scoping: users assigned to branch A don't appear when querying
  branch B.
- Clone lineage: user with a custom role whose `sourceRoleId` → Doctor system
  role is included.
- Multi-role: user with one Doctor-derived role + one non-Doctor role is
  included.
- Tenant isolation: query never crosses `tenantId`.
