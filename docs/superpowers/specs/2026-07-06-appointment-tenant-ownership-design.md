# Appointment tenant-ownership validation — design

## Problem

`createAppointment()` and `createWalkIn()` in `src/backend/services/appointment.service.ts`
accept client-supplied `doctorId` and `petId` and pass them straight to
`prisma.appointment.create` (`src/backend/models/appointment.repository.ts`) without
verifying either belongs to `req.context.tenantId`. A clinic user can POST another
tenant's `doctorId`/`petId` and the record is created; the foreign doctor/pet can later
surface via `include` on tenant-scoped reads (`findInRange`, `findById`).

Discovered during QA review of the appointment doctor-list fix (`fix/appointment-doctor-list`),
separate from that fix's scope.

## Fix

- `appointment.repository.ts`: add `findDoctorById(tenantId, id)` — tenant-scoped,
  `isActive`, doctor-role match (same OR-match logic already used by
  `findDoctorsForBranch`: system `doctor` role or custom role with matching `sourceRoleId`).
- `appointment.service.ts`:
  - `createAppointment`: before the conflict check, verify pet via existing
    `petRepo.findPetById(tenantId, petId)` and doctor via new `findDoctorById`.
    Throw `AppointmentError('Pet not found', 404)` / `AppointmentError('Doctor not found', 404)`
    on mismatch. Matches `pet.service.ts`'s `findOwner` 404 convention already in the codebase.
  - `createWalkIn`: same two checks, same order (pet then doctor).
- No schema change. No new endpoint.

## Tests

Integration tests, both endpoints, both fields:
- POST `/api/appointments` with cross-tenant `doctorId` → 404
- POST `/api/appointments` with cross-tenant `petId` → 404
- POST `/api/appointments/walk-in` with cross-tenant `doctorId` → 404
- POST `/api/appointments/walk-in` with cross-tenant `petId` → 404

## Out of scope

- Branch-scoping the doctor check (existing `findDoctorsForBranch` branch filter is a
  separate concern from tenant ownership; not required to close this gap).
- Any change to `findInRange`/`findById` read-side includes.
