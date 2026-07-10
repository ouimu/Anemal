# Design Spec — Item 3: Inpatient Create/Edit/Delete

> Steps 1 (brainstorm) + 2 (pm tasks) + 3 (BA sign-off) combined, per CLAUDE.md Standard
> Pipeline. Orchestration: fully-autonomous run (user kritsapon, pre-authorized 2026-07-09 —
> see `.claude/roadmap/ACTIVE/pet-emr-inpatient-fixes.md` header). No human present in this
> session; all judgment calls normally routed to a human were made by the orchestrator acting
> in the `@ba-agent` "think + decide" role (fable-equivalent judgment, same standard as Batch
> A), with rationale logged in §3 below as the audit trail.
> Source: `.claude/roadmap/ACTIVE/pet-emr-inpatient-fixes.md` Item 3 scouting notes (lines
> ~53-62), re-verified against current code 2026-07-10 (post Batch-A merge, PR #14 — Item 3's
> files are untouched by that merge, confirmed no drift).

## 0. Scouting-note verification (re-checked 2026-07-10)

| Claim | Verdict |
|---|---|
| `Hospitalization` model exists, `hospitalization.routes.ts:11-15` has `GET /active`, `POST /` (admit), `GET /:id`, `POST /:id/care`, `PUT /:id/discharge` | Confirmed, unchanged |
| No update/edit route, no delete/cancel route | Confirmed — `hospitalization.routes.ts` has exactly the 5 routes above, no more |
| "Cannot create" needs re-verification — route exists, confirm bug is admit-flow breakage vs missing capability | **Resolved: missing capability.** `ClinicInpatient.tsx` (376 lines) has a `CareModal` and a discharge button but **no admit UI of any kind** — no button, no modal, no form calling `POST /api/hospitalizations`. The backend route is fully wired and unreachable from the UI. Not a flow bug; the create capability was simply never built on the frontend. |
| `ClinicInpatient.tsx` 376 lines, admit modal + `CareModal` | **Corrected**: no admit modal exists; only `CareModal` (care-log/discharge) — scouting note over-assumed |

**Additional fact discovered 2026-07-10, not in original scouting notes (material, higher severity than the missing-create gap):**

`ClinicInpatient.tsx`'s `Hospitalization` TypeScript interface (lines 7-18) and the `CageCard` component that renders it reference fields the backend **does not return**:

| Frontend expects | Backend actually returns (`hospitalization.repository.ts` `findActive`/`findById`) |
|---|---|
| `cageNumber` | `cageNo` |
| `admitReason` | `reason` |
| `assignedDoctorId` | `doctorInCharge` |
| `lastCareAt` | *(does not exist — not computed anywhere)* |
| `doctor: { id, name }` | *(no `doctor` relation on `Hospitalization` at all — schema has only a raw `doctorInCharge Int?` FK-less column, no Prisma relation, no join)* |

Consequence: the Inpatient Board is **currently broken for existing admissions**, not just missing create. `CageCard` renders `hospit.doctor.name` — since `doctor` is `undefined` on every real API response, this throws inside the render (`Cannot read properties of undefined`), which React error-boundaries would catch as a broken board, not a silent bug. `Cage {hospit.cageNumber}` also always renders `Cage undefined`. This is a pre-existing regression (real bug, not authored by this batch) that must be fixed as part of "the board must actually work," since Edit/Delete build UI on top of the same `CageCard`.

## 1. Confirmed scope

**PETFIX-3a — Fix Inpatient Board field mismatch (bug, not a new feature).** Correct `ClinicInpatient.tsx`'s `Hospitalization` interface and `CageCard` to the fields the backend actually returns: `cageNo`, `reason`, `doctorInCharge` (number, resolved to a name client-side — see §2.2), no `lastCareAt` (compute from `careLogs[0].recordedAt` when available via `GET /:id`, or omit the "last care" line entirely on the summary card, which only has the `findActive` shape — see §2.2 for the decision). Zero backend changes for this item alone.

**PETFIX-3b — Admit (create) UI.** New "Admit Patient" modal, entry point placed on the pet's own record (`ClinicPets.tsx` `PetDetail`, mirroring how the new `EditPetModal` was launched in Batch A), pre-filling `petId`. Fields: reason* (required, matches `admitSchema`), cageNo, doctorInCharge (dropdown, sourced from the existing `GET /api/appointments/doctors` endpoint — zero new backend surface), dailyRate (default 0), notes. Submits `POST /api/hospitalizations` (already implemented, zero backend change; permission `inpatient.manage` already assigned to admin/doctor/staff per `seed-rbac.ts`).

**PETFIX-3c — Edit.** New `PUT /api/hospitalizations/:id`, reusing `inpatient.manage` (no new permission code). Editable fields: `reason, cageNo, doctorInCharge, dailyRate, notes` — i.e. everything `admitSchema` accepts except `petId` (re-assigning an admission to a different pet is out of scope; that's effectively "cancel + re-admit," see §3.2). Guarded: only allowed while `status === 'admitted'` (mirrors the existing `discharge`/`logCare` guard pattern in `hospitalization.service.ts`), else `409 HospitalizationError`. Edit modal in `ClinicInpatient.tsx`, structurally mirrors the new Admit modal (shared field set minus `petId`).

**PETFIX-3d — Delete/cancel.** New `DELETE /api/hospitalizations/:id`, reusing `inpatient.manage`. See §3.2 for the judgment call on scope (hard delete allowed only pre-care-log, admitted-only).

Not in scope: reassigning `petId` on edit, a doctor/cage relation-schema migration (see §2.2 — deliberately avoided), bulk actions, admission history/audit trail beyond what already exists.

## 2. Design decisions

**2.1 Zero new permission codes.** `inpatient.manage` already exists and is assigned to clinic_admin, doctor, and clinic_staff (`seed-rbac.ts` lines 117, 143, 162) — the same three roles that can already admit/log-care/discharge. Edit and delete are "manage an admission" actions, same bucket. No RBAC matrix change, no new seed row, no `@db-agent` migration needed for permissions.

**2.2 Doctor name resolution — reuse `GET /api/appointments/doctors`, no schema/relation change.** `Hospitalization.doctorInCharge` is a bare `Int?`, no Prisma relation to `User` (confirmed in `schema.prisma`). Two options considered:
  (a) Add a proper Prisma relation + migration so the repository can `include: { doctor: true }` — cleanest long-term, but is a schema migration (`@db-agent` territory, new subsystem, pushes this batch over "3 subsystems") for a cosmetic list-label.
  (b) Resolve doctor names **client-side**: the frontend already needs the doctors list for the Admit/Edit modal's dropdown (`GET /api/appointments/doctors`, permission `appointments.view` — confirmed all three inpatient-capable roles already have `appointments.view` too, so no new 403 surface). Build an `id → name` map from that same fetched list and use it to label `doctorInCharge` on the card. Zero backend changes, zero new endpoints, zero migration.
  **Decision: (b).** Matches "zero backend changes where possible" spirit from Batch A, keeps this batch to 2 subsystems (backend hospitalization module, frontend inpatient/pets views) instead of 3. If a real relation is ever needed (e.g. for reporting), that's a separate, explicitly-scoped future task — not silently smuggled into a bug-fix batch.

**2.3 `lastCareAt` — drop from the summary card, do not compute a new aggregate.** The `findActive` list endpoint (used for the board) never joins `careLogs` (`hospitalization.repository.ts:17-23`, `include: { pet: petSelect }` only) — adding that join means fetching every care log for every active admission just to read `recordedAt DESC LIMIT 1` per card, which is a real query-shape change (an aggregate subquery or a second query per card) for a "time since last care" nicety. Judgment call: **remove the "Last care: …" line from `CageCard` entirely** rather than add a backend aggregate for it. It was never wired to real data before this fix (the field didn't exist on the API response at all), so removing it is not a regression — it's honest about what data is actually available. Full care-log history remains visible via `GET /:id` (already used nowhere in the current frontend, but available) — out of scope to wire up a "view history" affordance in this batch; that's a natural Item-3.1 candidate for backlog, not blocking.

## 3. Grill findings (Step 3.5 — stress-test, MANDATORY)

Grill performed inline (no separate human present; findings resolved here per full-autonomy authorization, same standard as Batch A §8).

**3.1 — Concurrent edit/discharge race.** If a user opens the Edit modal, and another user discharges the same admission before the edit is submitted, the edit `PUT` would hit the `status === 'admitted'` guard and correctly 409 (no stale write succeeds) — same pattern already proven safe for `logCare`/`discharge`. No new code needed beyond reusing the existing guard-then-write shape; **resolved, no action** (the guard already exists as a pattern, this task just needs to apply it identically in the new `edit` service function).

**3.2 — Delete scope: hard delete vs soft cancel? (real judgment call).** `Hospitalization.careLogs` cascade-deletes (`onDelete: Cascade` in schema) if the parent row is deleted. A true hard `DELETE` on an admission that already has care logs would silently destroy real medical-observation records (temperature/HR/RR/medication history) with no audit trail — unacceptable for a vet clinic EMR-adjacent record. But the actual user need behind "cannot delete" (per the original bug report) is almost certainly "I fat-fingered an admission (wrong pet, wrong reason) and there's no way to remove the mistake" — a data-entry-typo scenario, not "delete a real patient's stay after the fact."
  **Decision:** `DELETE /api/hospitalizations/:id` is allowed **only when `status === 'admitted'` AND the admission has zero `careLogs`.** Any care log logged (even one) means real clinical data exists — from that point on, the only way out is `discharge` (which already exists and preserves the record + generates the correct invoice). Violating either condition → `409` with a clear message: care logs exist → "Cannot delete an admission with care history — discharge it instead."; already discharged → "Cannot delete a discharged admission — it is part of the pet's medical history." This is a genuine product-safety decision (favors auditability of real vet records over convenience), logged here per the autonomy mandate.
  **Frontend UX consequence:** the Delete button is only rendered/enabled on cards with zero care logs (client-side pre-check using the same `careLogs` count the board could easily carry — see 3.2b), avoiding a guaranteed-to-fail request as the common case; the backend 409 is still the source of truth (defense in depth, not trusted-client-only).
  **3.2b — does `findActive` need a `careLogs` count for the delete-button check?** Yes — minimal addition, not a new endpoint: `findActive`'s existing Prisma query gets `_count: { select: { careLogs: true } }` added to its `include` (one extra field on an existing query, not a new route, not a new subsystem). Logged as an explicit micro-decision so it doesn't get missed at plan/ponytail time.

**3.3 — Editing `dailyRate` mid-stay: does it affect an already-generated invoice?** No — invoices are generated exactly once, at `discharge` time, computed from whatever `dailyRate` is on the row *at that moment* (`hospitalization.service.ts` `discharge()`, reads `h.dailyRate` live). Editing `dailyRate` before discharge changes the eventual bill (intentional — "we're revising the daily rate for this stay"); editing it after discharge is impossible since edit is guarded to `status === 'admitted'` only. **Resolved, no action needed** — behavior is already correct by construction once the `admitted`-only guard is applied consistently.

**3.4 — Zod schema for edit: reuse `admitSchema` or a new `editSchema`?** `admitSchema` includes `petId` (required) — edit must not accept/require `petId` (§1 PETFIX-3c: reassigning pet is out of scope). Reusing `admitSchema.omit({ petId: true })` (Zod's built-in `.omit`) is the correct move — avoids duplicating the reason/cageNo/dailyRate/notes validation rules (max lengths, `nonnegative()`, etc.) in a second schema that could drift from `admitSchema` over time. **Resolved: `export const editSchema = admitSchema.omit({ petId: true })`.**

**3.5 — Does the Admit modal's pet-preselection (launched from `PetDetail`) block admitting a pet from the Inpatient Board itself (no pet in context)?** Yes, by design (§1 PETFIX-3b) — this batch does not add a pet-search picker inside `ClinicInpatient.tsx`. **Judgment call, logged:** the existing clinic workflow already requires opening a pet's record for most actions (EMR, edit, etc.); requiring the same for "admit" is consistent, not a new friction point, and avoids building a second pet-search UI (Batch A already built pet-context patterns; a bare Inpatient-Board-first picker is meaningfully more UI surface for a workflow that's arguably backwards anyway — clinics decide to admit *a pet they're looking at*, not from a blank board). If real usage later shows staff want to admit from the board directly, that is a scoped follow-up, not silently added here.

**3.6 — Int32/precision overflow on `dailyRate`/`cageNo` typed input, matching Batch A's HR/RR overflow finding.** `dailyRate` is `Decimal(10,2)` in schema; current Zod is `z.number().nonnegative().default(0)` with **no upper bound** — same class of gap Batch A found and fixed for EMR vitals. **Resolved: add `.max(99999999.99)` to `admitSchema.dailyRate`** (matches the column's 10-2 precision ceiling, `10^8 - 0.01`), applied to both `admitSchema` and (transitively) `editSchema` via the `.omit`.

**3.7 — Tenant/branch isolation on the new routes.** `edit`/`delete` must reuse the exact same `findById(tenantId, id)`-then-act pattern already proven by `logCare`/`discharge` (tenant-scoped lookup, 404 if cross-tenant) — **no new isolation logic to design, just apply the existing proven shape.** QA (Step 7) must still write the cross-tenant 404 test explicitly for both new routes (not assume coverage transfers).

All findings resolved; zero open questions carried into write-plan.

## 4. Acceptance criteria (Step 2 folded in)

- AC1: `PUT /api/hospitalizations/:id` — 200 + updated row when `status === 'admitted'`; 409 when discharged; 404 cross-tenant; validates via `editSchema`; requires `inpatient.manage`.
- AC2: `DELETE /api/hospitalizations/:id` — 204 when `status === 'admitted'` AND zero care logs; 409 (with the two distinct messages from §3.2) otherwise; 404 cross-tenant; requires `inpatient.manage`.
- AC3: `findActive` response includes a care-log count (`_count.careLogs`) usable by the frontend to gate the Delete button.
- AC4: `ClinicInpatient.tsx` `CageCard` renders real field names (`cageNo`, `reason`) with no more `undefined` labels or render-time crashes; "Last care" line removed.
- AC5: Admit modal reachable from `PetDetail` (`ClinicPets.tsx`), submits successfully, board reflects the new admission on next fetch/refetch.
- AC6: Edit modal reachable from an admitted `CageCard`, pre-populated, submits successfully.
- AC7: Delete button visible only on zero-care-log admitted cards; clicking it (with confirm) removes the card from the board; attempting delete via direct API call on a card with care logs returns 409.
- AC8: All existing hospitalization tests + new tests green; no regression to `logCare`/`discharge`/`listActive`/`getHospitalization`.

## 5. Ponytail budget estimate (pre-check, formal gate is Step 5)

Files: `hospitalization.routes.ts` (edit), `hospitalization.controller.ts` (+2 handlers), `hospitalization.service.ts` (+2 functions, `editSchema`, `dailyRate` max), `hospitalization.repository.ts` (+`update`/`delete` queries, `_count` on `findActive`) = 4 backend.
`ClinicInpatient.tsx` (Admit + Edit modals, fixed `CageCard`, Delete button) = 1 frontend (already has a modal — same colocation pattern as `CareModal`).
`ClinicPets.tsx` (Admit entry point in `PetDetail`) = 1 frontend.
Tests: `tests/integration/hospitalization-crud.test.ts` (new), inpatient frontend test file(s) (new) = 2+.
Docs: this spec, the write-plan, 1 ADR for the §3.2 delete-scope decision = 3.
**Total ≈ 11 files, 2 new endpoints, 0 new deps, 0 new subsystems (still backend `hospitalization` module + frontend clinic views, same 2 subsystems as before), well under 500 LOC estimate.** Expect PASS at Step 5; formal gate still runs.
