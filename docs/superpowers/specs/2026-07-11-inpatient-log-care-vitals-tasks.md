# Step 2 — @pm-agent Tasks + Acceptance Criteria: Inpatient Log Care / Vitals

Ref: `2026-07-11-inpatient-log-care-vitals-brainstorm.md`

## Task LCV-1 — Care History view (CageCard → "View Care History")

Task ID: LCV-1   Actor/role: Doctor, Nurse/Vet Tech (any role with `inpatient.view`)   Device: Tablet, Web

Description: Add a "View Care History" action button to `CageCard` that opens a
read-only `CareHistoryModal` listing all `DailyInpatientCare` rows for that
hospitalization (fetched via existing `GET /api/hospitalizations/:id`), newest
first, showing: recordedAt (date+time), timeSlot, temperatureC, heartRateBpm,
respRateRpm, feedingStatus, medicationGiven, notes, performedBy (resolved to
staff name via existing doctors id→name map, falls back to "—" if unassigned/
not found).

Acceptance Criteria:
- [ ] "View Care History" button appears on every `CageCard` regardless of
      admission status (admitted or discharged — history should remain visible
      after discharge).
- [ ] Clicking it opens a modal fetching `GET /api/hospitalizations/:id` and
      renders `careLogs` newest-first (already sorted server-side).
- [ ] Each row shows timeSlot, temperature (°C, 1 decimal, "—" if null), heart
      rate (bpm, "—" if null), resp rate (rpm, "—" if null), feeding status
      (text, "—" if null), medication given (text, "—" if null), notes ("—" if
      empty), recordedAt formatted date+time, performedBy resolved name.
- [ ] Empty state: "No care history recorded yet" when `careLogs.length === 0`.
- [ ] Modal is read-only — no edit/delete affordance (matches backend: no
      PUT/DELETE on care sub-resource).
- [ ] Negative/authorization case: a user without `inpatient.view` never sees
      the Inpatient Board at all (route already guarded upstream by
      `requirePermission('inpatient.view')` server-side and route-level guard
      client-side) — verified by existing RBAC test suite, not a new check;
      QA confirms no new client-side permission gap is introduced (the modal
      calls an endpoint already gated, no separate guard needed client-side).
- [ ] Tenant isolation: `GET /:id` already scopes by `tenantId` from
      `req.context` — QA re-confirms with a cross-tenant fetch-attempt test
      (existing pattern in `hospitalization-crud.test.ts`) if not already
      covered; if already covered by existing suite, QA notes so instead of
      duplicating.

Permission(s): `inpatient.view` (read), reuses existing route — no new
permission code needed.

Dependencies: none (backend endpoint pre-exists).

## Task LCV-2 — (already done, folded in) temperatureC field-name fix

Status: DONE, committed `b6ba152` on this branch before pipeline start. Covered
by existing regression test in `ClinicInpatient.test.tsx` (11/11 passing). No
further action; listed here only for traceability in the plan.

## Backlog (not this branch)

- Expose `heartRateBpm`/`respRateRpm`/`feedingStatus`/`medicationGiven` as
  *input* fields on the Log Care modal (currently write-only for
  temperature+notes). Filed to `remaining-tasks.md` backlog — separate,
  larger multi-field form redesign, Should-priority per
  `anemal-functional-reqs` (nice-to-have completeness, not blocking MVP vitals
  logging which already captures the clinically primary field, temperature).
