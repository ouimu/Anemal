# Brainstorm — Item 1: Inpatient Log Care / Vitals (Step 1)

Date: 2026-07-11. Driven by @pm-agent, autonomous scheduled run (no human present).

## Research findings (AS-IS, verified against code, not assumed)

### 1a. "No body-temperature input" — FALSE as literally stated
`ClinicInpatient.tsx` `CareModal` step 2 ("Record Vitals") already has a `Stepper`
component bound to `entry.temperatureC`, °C, 0.1 step, min 0. It has existed since
commit `2be8021` ("feat(inpatient): fix broken CageCard fields..."). The orphan
uncommitted diff found at task start (now committed as `b6ba152` on this branch)
only fixed the wire field name (`temperature`→`temperatureC`, matching backend
`CareInput.temperatureC`) and removed a `weight` stepper that had no backend field
to receive it (`careSchema` in `hospitalization.service.ts` has no `weight` key).

**Real gap found in its place:** backend `careSchema` (hospitalization.service.ts:22-30)
supports `heartRateBpm`, `respRateRpm`, `feedingStatus`, `medicationGiven` in
addition to `temperatureC` and `notes` — none of these are exposed in the CareModal
UI today. Body temperature (the literal ask) is present and now wired correctly.

### 1b. Log Care history — confirmed GAP, no view exists
Grep across `src/frontend` found no UI that lists `DailyInpatientCare` entries.
`CareModal` is write-only (POST `/api/hospitalizations/:id/care`). `CageCard`
shows only `_count.careLogs` (a bare number) — no drill-in.

Backend already has everything needed to read history:
- `GET /api/hospitalizations/:id` (route existing, `hospitalization.routes.ts:13`)
  → `getHospitalization` → `hospRepo.findById` → `include: { careLogs: { orderBy: {
  recordedAt: 'desc' } } }` (`hospitalization.repository.ts:28`).
- Already tenant-scoped (`tenantId` param threaded through) and RBAC-guarded
  (`requirePermission('inpatient.view')`).
- **No new backend endpoint, no migration required for 1b** — this is a
  frontend-only read of an endpoint that already returns the full care-log array.

## Scope decision (MVP-first, current phase)

In scope for this branch:
1. Keep the already-fixed `temperatureC` field name (done, committed).
2. Add a "Care History" view: from `CageCard`, a new action opens a read-only
   panel/modal listing that hospitalization's `careLogs` (time slot, temp, HR,
   resp rate, feeding status, medication, notes, recordedAt, performedBy) newest
   first, using the existing `GET /:id` endpoint.
3. Doctor/staff name resolution for `performedBy` reuses the existing `doctors`
   id→name map pattern already used for `doctorInCharge` (no new lookup call).

Out of scope, backlog (not this phase, note why):
- Exposing `heartRateBpm`/`respRateRpm`/`feedingStatus`/`medicationGiven` as
  *input* fields on the Log Care modal (a real gap, but a separate, larger UX
  change — multi-field vitals form redesign — not implied by "add body
  temperature input," and 1a's literal ask is already satisfied). Filed to
  `.claude/roadmap/ACTIVE/remaining-tasks.md` backlog.
- Editing/deleting a past care-log entry — no backend support (no PUT/DELETE on
  `/care` sub-resource) and not asked for; read-only history view only.
- Pagination — `careLogs` rows per admission are small (4 slots/day, admissions
  are days, not months); a plain scrollable list is sufficient for MVP.

## Actors / devices
- Actor: Doctor, Nurse/Vet Tech (roles with `inpatient.view`/`inpatient.manage`
  per `anemal-rbac-matrix`). Device: Tablet (primary, touch-first board) + Web.

## Open questions resolved autonomously (no human present)
- Q: New endpoint or reuse `GET /:id`? → Reuse; avoids a new DB-agent-reviewed
  endpoint entirely (Ponytail criterion #7 — API count).
- Q: Modal or inline expand on CageCard? → Modal, consistent with existing
  CareModal/EditModal/AdmitModal pattern already in this file.
