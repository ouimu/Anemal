# Brainstorm — Pet Profile "Medical" Tab (Bugfix Pipeline Item 2)

Date: 2026-07-11
Owner: @pm-agent (with @ba-agent input)
Pipeline step: Step 1 of 8 (per CLAUDE.md)

## Problem statement

The Pet Profile "Medical" tab (`ClinicPets.tsx`) is a bare, capped (3 records), minimally-projected
read-only list of `MedicalRecord.assessment` + date, with no add/edit affordance and no way to reach
the full record. It's unclear whether this is a bug (missing edit functionality) or the intended
design (a rollup view whose source of truth is EMR). This item resolves that design question before
any code changes.

## AS-IS (confirmed via codebase investigation)

**Frontend** — `src/frontend/src/views/clinic/ClinicPets.tsx`
- `TABS = ['Overview', 'Medical', 'Vaccinations']` (line 500)
- `PetDetail` fetches `GET /api/pets/:id` via React Query (lines 509-512)
- Medical tab (lines 615-624): renders `pet.medicalRecords` (server-capped to 3), each row =
  `assessment ?? 'Visit'` + formatted `createdAt`. No add/edit UI, no drill-in. Empty state:
  "No medical records yet."
- Separately: an alerts banner (579-584) and the Overview tab (594-613) show `pet.allergies` /
  `pet.underlyingConditions` as plain rows — these fields ARE directly editable via `EditPetModal`
  (textareas, lines 443-444), submitted through `PUT /api/pets/:id` (lines 363-375).
- EMR lives entirely in a separate screen, `ClinicEMR.tsx` — full CRUD (SOAP notes, vitals,
  prescriptions, attachments, anatomy annotation) — **not reachable from Pet Profile today**.

**Backend**
- `src/backend/models/pet.repository.ts` `findPetById` (lines 31-44): includes `medicalRecords`
  `take: 3`, `select: { id, createdAt, assessment, doctorId }` — this exact projection is what
  feeds the Medical tab.
- Prisma `Pet` model: `allergies`, `underlyingConditions` are plain scalar columns (no EMR join).
- Prisma `MedicalRecord` model: SOAP fields + vitals; no allergies/chronicConditions/vaccination
  fields — those live only on `Pet` (allergies/underlyingConditions) or `Vaccination` (separate
  model/tab).
- `medical-record.routes.ts` / `.service.ts`: full CRUD gated by `emr.view/create/edit/attach`
  permissions (distinct permission namespace from `crm.*` used for Pet CRUD).

**Specs**
- `.claude/skills/anemal-screen-specs/references/04-pet-owner.md` documents this tab as
  **"Medical History"** (naming drift vs code's "Medical") and matches the current read-only,
  capped implementation exactly — this is a deliberate older design, not an unbuilt spec.
- `.claude/specs/implementation-status-matrix.md` (Care History / LCV-1, PR #17, ADR-0011):
  explicitly defers "discharged-admission history" to "Pet Profile Medical tab" as future scope —
  there is already an unresolved intent to grow this tab's rollup scope.

## Design question

Should the Medical tab be:
- **(A)** A thin read-only rollup sourced entirely from EMR (+ vaccinations, + inpatient/care
  history later), never separately editable.
- **(B)** Separately editable fields on the Pet record, independent of EMR.
- **(C)** Hybrid: `allergies`/`underlyingConditions` stay pet-level editable safety flags (as
  today, via `crm.edit`); everything else in the tab (SOAP/vitals history, future care-history
  rollup) is strictly EMR-derived read-only, with clear drill-in navigation into `ClinicEMR.tsx`.

## BA input (informal, feeds formal Step 3 sign-off)

@ba-agent's preliminary read: **Option C**. Rationale — FR-03-04 (Pet & Owner/CRM) deliberately
places drug-allergy/condition flags on the Pet record for prescription-safety visibility
independent of any open consult (e.g., a receptionist logging an owner's phone call). FR-05
(EMR & Clinical) owns SOAP/vitals/clinical narrative. Option B would fork clinical data into two
writable stores (source-of-truth hazard); pure Option A would wrongly move allergies under EMR
control, breaking the FR-03-04 safety-visibility guarantee. Full analysis to be formalized at
Step 3 with permission-code mapping and acceptance criteria.

Risks flagged early: permission split between `crm.view` (pet-level, always available to profile
viewers) and `emr.view` (gates the rollup section — must degrade gracefully, not fail the whole
profile, for a `crm.view`-only role); the `take: 3` cap is a UX choice needing an explicit "view
more" affordance rather than silent truncation; naming drift ("Medical" vs "Medical History")
should be reconciled in the same pass.

## Scope framing (bugfix pipeline, not a new phase)

- No schema change anticipated (reuse `MedicalRecord`, `Vaccination`, existing pet/EMR endpoints).
- Estimated touch: `ClinicPets.tsx` (tab content + drill-in link + graceful `emr.view` degradation),
  possibly `pet.repository.ts` projection/cap adjustment, route/permission guard verification,
  `.claude/skills/anemal-screen-specs/references/04-pet-owner.md` update, tests. Roughly 3-5 files,
  0-1 new endpoints (a "view more" / full-history fetch may reuse the existing
  `GET /api/medical-records?petId=...` list endpoint already used by `ClinicEMR.tsx` rather than
  adding a new one).
- Priority: Should (workflow/navigation and correctness-of-intent quality; no active data-loss bug
  today since allergies/conditions already save correctly).

## Next steps

Step 2 (@pm-agent tasks + AC) and Step 3 (@ba-agent formal validate + sign-off, including the
authorization design and gap analysis) follow this brainstorm.
