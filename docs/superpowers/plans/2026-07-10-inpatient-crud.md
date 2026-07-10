# Write-Plan — Item 3: Inpatient Create/Edit/Delete

> Step 4, per CLAUDE.md Standard Pipeline. Input: `docs/superpowers/specs/2026-07-10-inpatient-crud-design.md`
> (Steps 1-3.5 sign-off, zero open findings). Branch: `feat/inpatient-crud` (new, off `main`
> post Batch-A merge). TDD per task (red → green) per `superpowers:tdd` skill, `@dev-agent` scope.

## Task list

**A — Backend: edit + delete**

- A1. `hospitalization.service.ts`: add `editSchema = admitSchema.omit({ petId: true })`; add `.max(99999999.99)` to `admitSchema.dailyRate` (§3.6). Add `editHospitalization(tenantId, id, data)` — guard `status === 'admitted'` else 409 (mirrors `discharge`/`logCare` guard). Add `deleteHospitalization(tenantId, id)` — guard `status === 'admitted'` else 409 "Cannot delete a discharged admission…"; guard `careLogs.length === 0` (via `_count`) else 409 "Cannot delete an admission with care history…" (§3.2).
  Test first: `tests/integration/hospitalization-crud.test.ts` — edit success, edit-while-discharged 409, delete success (zero care logs), delete-with-care-logs 409, delete-discharged 409, cross-tenant 404 for both (§3.7).
- A2. `hospitalization.repository.ts`: add `update(tenantId, id, data)` (tenant-scoped `updateMany` + refetch, same shape as `markDischarged`). Add `remove(tenantId, id)` (tenant-scoped `deleteMany`). Add `_count: { select: { careLogs: true } }` to `findActive`'s existing `include` (AC3).
- A3. `hospitalization.controller.ts`: add `edit`/`remove` handlers (mirror `discharge`'s try/catch/`next` shape).
- A4. `hospitalization.routes.ts`: add `router.put('/:id', requirePlane('clinic'), requirePermission('inpatient.manage'), validate(editSchema), ctrl.edit)` and `router.delete('/:id', requirePlane('clinic'), requirePermission('inpatient.manage'), ctrl.remove)`.

**B — Frontend: fix board, add Admit/Edit/Delete UI**

- B1. `ClinicInpatient.tsx`: fix `Hospitalization` interface to match real API shape (`cageNo`, `reason`, `doctorInCharge: number | null`, `_count: { careLogs: number }`, drop `lastCareAt`/`assignedDoctorId`/`admitReason`/`cageNumber`/`doctor` object). Fix `CageCard` to render `cageNo`/`reason`, resolve doctor name from a fetched doctors map (`GET /api/appointments/doctors`, id→name), remove the "Last care" line (§2.3).
- B2. `ClinicInpatient.tsx`: add `EditModal` (mirrors `CareModal`'s structure, single-step form: reason/cageNo/doctorInCharge/dailyRate/notes, submits `PUT /:id`), launched from a new "Edit" button on `CageCard` (only for `status === 'admitted'`).
- B3. `ClinicInpatient.tsx`: add Delete button on `CageCard`, rendered only when `_count.careLogs === 0`; `window.confirm` guard (matches existing `handleDischarge` pattern); calls `DELETE /:id`, invalidates `['inpatient-active']`.
- B4. `ClinicPets.tsx` `PetDetail`: add "Admit to Inpatient" button (gated `inpatient.manage`, only shown when pet has no active admission — reuse `GET /api/hospitalizations/active` filtered client-side, or skip the check and let the backend accept multiple concurrent admissions for the same pet since the schema doesn't prevent it — **decision: skip the active-admission check, out of scope**, admitting an already-admitted pet twice is an edge case the backend doesn't prevent today and preventing it is a new business rule not requested by this item) + new `AdmitModal` (reason*/cageNo/doctorInCharge/dailyRate/notes, petId pre-filled from context, submits `POST /api/hospitalizations`).
- B5. Frontend tests: `ClinicInpatient.test.tsx` (or extend existing coverage if any) — `CageCard` renders real fields without crashing, Edit modal submits, Delete button hidden/shown per care-log count, Delete confirms+calls API. `AdmitModal.test.tsx` (or colocated) — renders from `PetDetail`, submits `POST /api/hospitalizations` with `petId`.

**C — Docs**

- C1. ADR for the §3.2 delete-scope decision (care-log-gated hard delete vs soft cancel) — `docs/adr/0009-inpatient-delete-scope.md`.
- C2. `.claude/specs/implementation-status-matrix.md` row update (Step 8, folded into finish-branch per CLAUDE.md Tracking rules — @pm-agent updates last).

## Test plan
Backend: new `hospitalization-crud.test.ts` (≥8 cases per §Task A1) + full existing suite green (no regression to `logCare`/`discharge`/`listActive`/`getHospitalization`).
Frontend: new/extended `ClinicInpatient` + `AdmitModal` tests + full existing suite green.

## Out of scope (explicitly, logged per grill/BA decisions above)
- Doctor relation migration (schema change) — §2.2.
- `lastCareAt` aggregate — §2.3.
- Reassigning `petId` on edit — §1 PETFIX-3c.
- Preventing duplicate concurrent admissions for the same pet — B4 above.
- Admit-from-board (pet-search picker inside `ClinicInpatient.tsx`) — §3.5.
