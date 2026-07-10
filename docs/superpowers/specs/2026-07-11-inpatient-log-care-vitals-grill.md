# Step 3.5 — /grill-with-docs findings (MANDATORY gate): Inpatient Log Care History

Autonomous scheduled run, no human present. Findings raised against my own
Step 1-2 docs and BA-signed design, each interrogated against actual code,
resolved without blocking. This IS the pipeline-required grill (self-directed,
since no human is available to interview) — every finding below was found by
adversarially re-reading the schema/routes/controllers, not assumed.

## Finding 1 (CRITICAL — design defect caught) — `performedBy` is NOT a doctor id

`DailyInpatientCare.performedBy` (schema.prisma:642) is set from
`req.context!.userId` (hospitalization.controller.ts `logCare` → passed to
`svc.logCare(..., req.context!.userId)`) — i.e. it is a `User.id` of *whoever
was logged in when they saved the care entry* (any staff role with
`inpatient.manage`, not necessarily a Doctor).

The brainstorm doc's plan to resolve it via the existing `doctors` id→name map
(`GET /api/appointments/doctors`, used for `doctorInCharge`) is **wrong on two
counts**:
1. `listBookableDoctors` returns Doctor-role users only — a Nurse/Vet Tech who
   logged the care would never appear in it, silently rendering as
   "Unassigned" even though they performed real care (misleading clinical
   record).
2. Even setting that aside, resolving *all* staff names would require
   `GET /users` (`user.routes.ts:11`), gated by `staff.view` — a permission
   Doctor/Nurse roles holding only `inpatient.view` do not have per
   `anemal-rbac-matrix`. Calling it would 403 for exactly the roles this
   feature targets, or silently require granting a new permission dependency
   this branch never scoped.

**Resolution (adopted, no new endpoint/permission):** Care History rows show
`Staff #<performedBy>` (or "—" if null) — not a resolved name. This is a
documented MVP limitation, not a bug: it costs zero new endpoints/permissions/
migrations (keeps Ponytail criteria #3/#7 clean). Filed to
`remaining-tasks.md` backlog: "resolve performedBy to a real name" needs
either (a) a proper FK relation + join added to `DailyInpatientCare` (schema
migration), or (b) a name-lookup endpoint whose permission floor is
`inpatient.view` — real design work, out of scope here.

**Docs corrected:** task LCV-1's AC "performedBy (resolved to staff name via
existing doctors id→name map...)" is WRONG and is being corrected in
`-tasks.md` before `/write-plan`.

## Finding 2 — stale cache after logging new care

`CareModal`'s mutation `onSuccess` invalidates only `['inpatient-active']`
(refreshes the board's `_count.careLogs` badge). If a `CareHistoryModal` is
open (or reopened) for the same hospitalization right after logging care, its
own query — if keyed `['hospitalization', id]` — would serve a stale
react-query cache entry unless also invalidated.

**Resolution:** `CareModal`'s mutation `onSuccess` additionally invalidates
`['hospitalization', hospit.id]`. `CareHistoryModal` uses that same query key.
One-line addition to the plan; no new endpoint.

## Finding 3 — fetch error state

`CareModal`/`EditModal` already have an established error-display pattern
(`error` state + red text) for mutations, but no existing modal in this file
handles a *query* error state (all reads go through `ClinicInpatient`'s
top-level `isError`). `CareHistoryModal` introduces the first per-modal GET.

**Resolution:** `CareHistoryModal` shows a simple inline error message
("Failed to load care history.") on `isError`, mirroring the board's existing
error-state styling (`bg-error-container text-error`) for visual consistency
— no new pattern invented.

## Finding 4 — branch isolation on `GET /:id`

`hospRepo.findById` scopes by `tenantId` only, not `branchId` (confirmed:
`where: { id, tenantId }`, repository.ts:27). A user restricted to Branch A
could fetch a Branch B hospitalization's care history by guessing/iterating
IDs, if they hold `inpatient.view` tenant-wide.

**Resolution: not a regression introduced by this branch.** `EditModal` and
`AdmitModal` already call the same `GET /:id`-adjacent read paths today with
identical scoping; branch-level record isolation for single-record GETs is a
pre-existing, tenant-wide architectural choice (only `listActive` filters by
`branchId`). Flagging it here for the record but NOT fixing it in this branch
— fixing it is a cross-cutting change to `findById`'s contract affecting
`EditModal`/`AdmitModal` too, outside LCV-1's diff surface (Ponytail
criterion #4, scope). Filed to `remaining-tasks.md` backlog as a
branch-isolation hardening item for @db-agent/@ba-agent to scope separately.

## Finding 5 — discharged admissions (CORRECTED on re-grill, see below)

~~Confirmed acceptable: LCV-1 AC already states the history button appears
regardless of status. No change needed; re-verified `_count.careLogs` is
present on discharged records too (no status filter in the repository
query).~~ **This was wrong** — see Finding 6.

## Finding 6 (re-grill, supersedes Finding 5) — board never renders discharged cards at all

`ClinicInpatient`'s board query is `GET /api/hospitalizations/active` →
`hospRepo.findActive`, which filters `where: { tenantId, status: 'admitted',
... }` (repository.ts:19). Finding 5 checked whether `_count.careLogs` was
status-filtered (it isn't) but missed that the *hospitalization list itself*
is filtered to `admitted` only. A discharged hospitalization's `CageCard`
never renders on this screen — there is no card to attach a history button
to for it, regardless of what the button's own logic does.

**Resolution (ADR-0011):** LCV-1's AC is corrected to admitted-only scope
(matches what's actually reachable). Discharged-admission history access is
real but is a different screen's problem — deferred to Item 2 (Pet Profile
Medical tab), which already needs to pull a pet's historical clinical
records. Recorded as ADR-0011.

## Findings resolved — /write-plan unblocked

6 findings total (Finding 5 superseded by Finding 6), all resolved. Two
items filed to backlog as separate future work (performedBy name
resolution, branch isolation on single-record GETs); one item's scope
corrected via ADR-0011 (discharged-history deferred to Item 2). None block
LCV-1's MVP scope.
