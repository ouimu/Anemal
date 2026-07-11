# ADR-0012: Pet Profile Medical tab stays a permission-aware, read-only EMR rollup

Date: 2026-07-11
Status: Accepted (autonomous scheduled run, no human present)

## Context

The Pet Profile "Medical" tab (`ClinicPets.tsx`) was a bare, silently-capped
(3 records), minimally-projected read-only list with no way to see more and
no server-side permission boundary matching the dedicated EMR/Vaccination
endpoints' own guards (`GET /api/pets/:id` returned `medicalRecords` and a
full, uncapped `vaccinations` embed regardless of the caller's `emr.*`
permission). Item 2 of the 2026-07 bugfix pipeline resolved whether this tab
should become separately editable (fork clinical data onto the Pet record)
or stay derived from EMR.

## Decision

Option C (hybrid), BA-signed-off:

1. `Pet.allergies` / `Pet.underlyingConditions` remain pet-level scalar
   fields, editable via `crm.edit` through the existing `EditPetModal` →
   `PUT /api/pets/:id` path — unchanged. These are CRM safety flags
   (FR-03-04), not clinical narrative, and must stay writable independent
   of any open EMR consult (e.g., a receptionist logging an owner-reported
   allergy over the phone).
2. The tab's record list becomes an explicit, capped-with-visible-affordance,
   read-only rollup of `MedicalRecord` rows, with a drill-in link to
   `ClinicEMR.tsx?petId=<id>` (`ClinicEMR.tsx` gained `useSearchParams`
   support to read this, mirroring `ClinicRecordVaccination.tsx`'s existing
   convention).
3. Server-side, `GET /api/pets/:id` omits BOTH `medicalRecords` and
   `vaccinations` when the caller lacks `emr.view` — matching the permission
   floor of the dedicated `medical-record.routes` / `vaccination.routes` GET
   endpoints — closing a pre-existing over-fetch gap where the embedded
   include ignored the caller's `emr.*` permission entirely.
4. The Vaccinations tab's "Add Vaccination" button is hidden whenever
   `vaccinations` is server-omitted (i.e., no `emr.view`), even though
   `vaccination.create` is a separate permission code — resolution favors
   the clinical-safety argument (adding a vaccination record blind, without
   visibility into the pet's existing vaccination history, risks duplicate
   or conflicting entries) over the argument that a separately-held write
   permission should always surface its own UI.
5. Empty-state messaging (no records vs. no permission) is driven by the
   client's own `hasPermission('emr.view')` (auth store), not by payload
   shape — avoiding a new tri-state API contract.

## Rejected alternatives

- **Option A** (pure EMR-derived rollup, allergies/conditions moved under
  `emr.*`) — breaks FR-03-04's non-clinical safety-visibility guarantee: a
  `crm.*`-only receptionist role would lose the ability to record/see
  allergy flags outside a consult.
- **Option B** (medical info separately editable on the Pet record,
  independent of EMR) — forks clinical data into two writable stores;
  classic source-of-truth hazard for every downstream FR-05 feature
  (prescription checks, lab trending, referral export).

## Consequences

- No schema change, no new endpoints, no new permission codes, no
  migrations.
- Touches `ClinicPets.tsx`, `ClinicEMR.tsx` (new `?petId=` handling),
  `pet.repository.ts`/`pet.service.ts`/`pet.controller.ts`
  (permission-conditional include), `pet-medical-degradation.test.ts` (new
  integration test), and `.claude/skills/anemal-screen-specs/references/04-pet-owner.md`.
- Folding discharged-admission/inpatient care history into this rollup (per
  ADR-0011's deferral from Item 1) remains a separate future item, not
  bundled here.
- Backlog (unchanged, not this item): structuring free-text allergies into
  discrete/coded entries for automated prescription allergy checks
  (FR-05-05); permission-cache staleness on live role edits (pre-existing,
  global, 5-minute `resolvePermissions` cache window).
