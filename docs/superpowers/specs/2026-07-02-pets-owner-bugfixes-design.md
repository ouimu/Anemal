# Pets & Owner Bug Fixes — Design Spec

**Date:** 2026-07-02
**Status:** Approved (brainstorm + grill + BA sign-off with permission-split revision)

## Bug 1 — Add Owner form: Last Name input overflows card

**File:** `src/frontend/src/views/clinic/ClinicPets.tsx:62-65` (`AddOwnerModal`)

Both First/Last Name `<input>` share `className="flex-1 ..."` with no `min-w-0`. Flex children default to `min-width: auto`, so a child won't shrink below its content's intrinsic width — with a long value (or the Thai label `นามสกุล`, longer than `ชื่อ`), the Last Name input overflows the `max-w-md` card.

**Fix:** add `min-w-0` to both inputs' className.

## Bug 2 — Pet Overview tab shows only 3 of 10 fields

**Files:** `src/frontend/src/views/clinic/ClinicPets.tsx` — `AddPetModal` (~line 82, 109-121), Overview tab render (~line 312-317).

Add Pet form already collects: `name, species, breed, color, gender, birthDate, microchipId, allergies, underlyingConditions, photoUrl`. Overview tab renders only Weight, Color, Date of birth.

`Pet.weightKg` column already exists (`schema.prisma:255`, nullable `Decimal(5,2)`) — no schema/migration needed. It's read by Overview (`pet.weightKg`, line 315) but never collected in `AddPetModal`.

**Fix:**
1. Add `weightKg` number input to `AddPetModal` form state + submit payload. Add i18n key `clinic.pets.weightOptional` (EN + TH), following the existing `breedOptional`/`allergiesOptional` pattern (`i18n/index.ts:177,180,469,472`).
2. Expand Overview tab to render: species, breed, gender, birthDate, weightKg, color, microchipId, allergies, underlyingConditions. Labels hardcoded English, matching existing AS-IS Overview labels ("Weight", "Color", "Date of birth"). Owner block stays unchanged (`ClinicPets.tsx:282-291`).

## Bug 3 — "Access denied: missing permission 'emr.create'" on vaccination save

**Root cause:** RBAC works as designed — `clinic_staff` (system role, `tenantId: null`, shared across all tenants, `src/backend/prisma/seed-rbac.ts:150-168`) never had `emr.create`; only `doctor` does. The real defect is the frontend "Add Vaccination" button (`ClinicPets.tsx:338-344`) has no permission guard, so any role sees it and hits a 403 on save.

**Decision (BA-flagged gap, resolved):** `emr.create` also guards `POST /api/medical-records` (`medical-record.routes.ts:16`), not just vaccinations (`vaccination.routes.ts:14`). Granting `emr.create` outright to `clinic_staff` would also let them create full SOAP notes — undesired. **Resolution: introduce a new, narrower `vaccination.create` permission** guarding only the vaccination route.

**Fix:**
1. Add `vaccination.create` to the `Permission` catalog in `seed-rbac.ts`.
2. Grant `vaccination.create` to both `doctor` and `clinic_staff` in their `seed-rbac.ts` role definitions. `clinic_admin` stays without it (unchanged, intentional — business-ops role, not clinical).
3. Change `vaccination.routes.ts:14` guard from `requirePermission('emr.create')` to `requirePermission('vaccination.create')`. `medical-record.routes.ts` is untouched — still `emr.create`, doctor-only.
4. Frontend: wrap "Add Vaccination" button in `components/Can.tsx` (the live component, used by `UserManagementTab.tsx:6,133`) with `perm="vaccination.create"` — NOT `guards/Can.tsx` (dead code, self-tested only, not imported by `App.tsx` or any view).
5. Update `.claude/skills/anemal-rbac-matrix/` docs (`permission-matrix.md`, `RBAC_index.md`, `SKILL.md`) to add `vaccination.create` and its grants.

**Deploy considerations (no CI/CD auto-seed exists in this repo — no Dockerfile/workflows/root package.json found; `seedRbac()` only runs via manual `npm run db:seed`):**
- Runbook step: after merge, ops manually runs `npm run db:seed` against prod once.
- Safety: `seedRbac()` sync-deletes `RolePermission` rows on system roles (`isSystem: true`) not present in its current seed def (`seed-rbac.ts:230-236`) — never touches tenant custom roles (`tenantId` set), confirmed safe for tenant isolation. Pre-deploy step: read-only query of current prod `RolePermission` rows for the 3 system roles (`doctor`, `clinic_staff`, `clinic_admin`), diffed against the updated `seed-rbac.ts`, to surface any unexpected revocation before running seed.

## Acceptance Criteria

- **Bug 1:** Typing a long last name (or switching to Thai locale) does not visually overflow the Add Owner card.
- **Bug 2:** Creating a pet with all fields filled, then viewing Overview tab, shows all 9 fields (species/breed/gender/birthDate/weightKg/color/microchipId/allergies/underlyingConditions).
- **Bug 3:**
  - `clinic_staff` user: Add Vaccination button visible; `POST /api/vaccinations` returns 201.
  - `clinic_staff` user: `POST /api/medical-records` still returns 403 (unchanged — confirms `emr.create` was NOT granted).
  - `clinic_admin` user: Add Vaccination button hidden (not just disabled) — this is an intended UX change, not a regression, flag to QA.
  - `doctor` user: unaffected, both vaccination and medical-record creation still work.
  - Tenant isolation: tenant custom roles' `RolePermission` rows unchanged after seed re-run.
