# Task breakdown — Log Care modal vitals/nursing fields (Step 2, @pm-agent)

Input: brainstorm doc `2026-07-12-log-care-vitals-modal-brainstorm.md`
Role/Device applicable across all tasks: Actor = Clinic staff with `inpatient.manage` (any
clinic role holding that permission — Vet/Vet Tech per `anemal-rbac-matrix` default matrix);
Device = Tablet (primary, per Compassionate Care touch-first requirement) — Web must also work,
not a separate build.

No RBAC change: this task adds no new route, no new permission code, no new screen. It only adds
fields to an existing modal already gated by the existing `inpatient.manage` permission on
`POST /:id/care`. Confirmed against `anemal-rbac-matrix` — no matrix update required.

---

### Task LC-1 — Extract `VitalStepper` to shared component

Actor/role: N/A (infra task, no user-facing behavior change)   Device: Both

Description: Move `VitalStepper` (currently `ClinicEMR.tsx:145-207`) to
`src/frontend/src/components/VitalStepper.tsx` as a named export with an unchanged public
interface. `ClinicEMR.tsx` imports it instead of defining it locally. `VitalStepper.test.tsx`
imports from the new path.

Acceptance Criteria:
- [ ] `src/frontend/src/components/VitalStepper.tsx` exists and exports `VitalStepper` with the
      exact same props/behavior as today (label, unit, value, onChange, step, min, max; typed
      input + +/- buttons; Enter/blur commit with double-dispatch guard; wheel-blur guard;
      round/clamp semantics unchanged).
- [ ] `ClinicEMR.tsx` no longer defines `VitalStepper` locally; imports it from
      `../../components/VitalStepper` (or correct relative path) and all 4 existing call sites
      (weight/temperature/heart rate/resp rate in the EMR vitals form) behave identically.
- [ ] `VitalStepper.test.tsx` imports the component from its new location; all existing test
      cases pass unmodified in behavior (test file path/import updated only).
- [ ] No second implementation of numeric stepper logic exists anywhere in the frontend after
      this task (grep for a second `justCommittedRef` or equivalent pattern returns nothing new).

Permission(s): none (component-only change)
Dependencies: none

---

### Task LC-2 — Extend `CareEntry` + initial state, remove local `Stepper`

Actor/role: Clinic staff (inpatient.manage)   Device: Both

Description: In `ClinicInpatient.tsx`, extend the `CareEntry` interface to the 7-field shape
(`timeSlot, temperatureC, heartRateBpm, respRateRpm, feedingStatus, medicationGiven, notes`),
update `CareModal`'s initial `useState<CareEntry>` to include the 4 new fields as `null`, and
delete the local `Stepper` function (lines ~146-168) — it is fully superseded by the shared
`VitalStepper` from Task LC-1.

Acceptance Criteria:
- [ ] `CareEntry` interface has all 7 fields with correct types matching `careSchema` exactly
      (`heartRateBpm`/`respRateRpm`: `number | null`; `feedingStatus`/`medicationGiven`: `string | null`).
- [ ] Initial `useState<CareEntry>` sets the 4 new fields to `null`.
- [ ] Local `Stepper` function is removed; no dead code left behind.
- [ ] TypeScript compiles with no new `any`/type errors.

Permission(s): none
Dependencies: LC-1

---

### Task LC-3 — Render 3 vitals via shared `VitalStepper` in wizard Step 2

Actor/role: Clinic staff (inpatient.manage)   Device: Tablet (primary), Web

Description: Replace the single local-`Stepper`-based temperature control in `CareModal`'s
`step2()` with 3 `VitalStepper` instances in a responsive grid (Temperature °C step 0.1;
Heart Rate bpm step 1, integer; Resp Rate rpm step 1, integer), matching the layout guidance in
`RecommendByCodex/02-log-care-vitals-modal.md` (1 column at 768px portrait if needed, 2-3 columns
at 1024px landscape/desktop, no forced horizontal scroll).

Acceptance Criteria:
- [ ] All 3 vitals inputs render, each with an accessible label (`htmlFor`/`id` or `aria-label`)
      distinct from the unit text.
- [ ] Typed numeric entry works (not only +/- clicks) — e.g., typing "38.5" and blurring commits
      38.5 to `temperatureC`.
- [ ] Heart rate / respiratory rate reject non-integer commits (rounds to nearest integer per
      existing `VitalStepper` step=1 rounding behavior) and reject values ≤0 (commit to `null`
      per existing `VitalStepper` semantics — same guard as EMR today).
- [ ] Blank input commits to `null`, not `''` or `0`.
- [ ] All 3 controls are ≥44×44px touch targets (inherited from `VitalStepper`, verify not
      overridden by the modal's grid classes).
- [ ] No horizontal overflow at 768×1024 or 1024×768 viewport.

Permission(s): `inpatient.manage` (existing, unchanged)
Dependencies: LC-1, LC-2

---

### Task LC-4 — Feeding status picklist + Other free text

Actor/role: Clinic staff (inpatient.manage)   Device: Tablet (primary), Web

Description: In `CareModal`'s `step3()`, add a feeding-status `<select>` with the controlled
vocabulary (D1 in brainstorm): Not assessed (→ `null`), Ate all, Ate some, Refused, NPO, Assisted
feeding, Other (opens adjacent bounded text input, max 255 chars, value sent verbatim as
`feedingStatus`).

Acceptance Criteria:
- [ ] Select control is ≥44px tall, labeled via `htmlFor`/`id`.
- [ ] Choosing a preset value other than "Not assessed"/"Other" sets `feedingStatus` to that
      exact canonical string.
- [ ] Choosing "Not assessed" sets `feedingStatus` to `null`.
- [ ] Choosing "Other" reveals a text input; its value (trimmed) becomes `feedingStatus` on
      submit; if left blank while "Other" is selected, `feedingStatus` normalizes to `null`
      (documented negative case — do not silently send `"Other"` as a literal value).
- [ ] Existing/legacy `feedingStatus` strings not in the controlled vocabulary still display
      correctly in Care History (no assertion needed here since Care History code is unchanged,
      but confirm no regression by inspection).

Permission(s): `inpatient.manage` (existing, unchanged)
Dependencies: LC-2

---

### Task LC-5 — Medication/treatment note field + payload normalization

Actor/role: Clinic staff (inpatient.manage)   Device: Tablet (primary), Web

Description: Add a multiline `medicationGiven` textarea in `step3()`, visually and by copy
distinct from the general `notes` textarea, labeled "Medication / treatment note (optional)"
with helper text disclaiming MAR status (D2). Before `mut.mutate(entry)`, normalize all optional
string fields (`feedingStatus`, `medicationGiven`, `notes`) so empty/whitespace-only strings
become `null` rather than `''`.

Acceptance Criteria:
- [ ] Medication field and Care notes field are visually distinct and never write to each other's
      state key (`medicationGiven` vs `notes` stay separate through typing → submit → payload).
- [ ] Helper/placeholder copy makes clear this is a documentation note, not a verified MAR entry
      (exact wording per D2, reviewable by @uiux-agent for tone).
- [ ] Submitting with all 4 new fields blank sends `heartRateBpm: null, respRateRpm: null,
      feedingStatus: null, medicationGiven: null` (not `undefined`, not `''`) — request body
      inspected in test via mocked `api.post`.
- [ ] `careSchema.strict()` accepts the full payload with no extra/renamed keys (payload key
      names match `CareEntry` exactly, which matches `careSchema` exactly).

Permission(s): `inpatient.manage` (existing, unchanged)
Dependencies: LC-2

---

### Task LC-6 — Inline API-error display (NEW behavior, amended per BA condition C1) + pending/success regression check

Actor/role: Clinic staff (inpatient.manage)   Device: Both

BA finding (C1, blocking): `CareModal`'s mutation (`ClinicInpatient.tsx:115-122`) has **no
`onError` handler and no error state today** — on API rejection, nothing is currently shown to
the user. This task is corrected from "regression check" to "build inline error display",
mirroring the existing `AdmitModal`/`EditModal` pattern (`onError → setError(...) → inline
<p className="text-error">` block) — reuse of an established repo pattern, not a new one.
Draft-preservation is genuinely pre-existing (component state is untouched on error) and pending-
disable and dual-invalidation are genuinely pre-existing — those three remain regression checks.

Acceptance Criteria:
- [ ] `CareModal`'s `useMutation` gains an `onError` handler that sets a local `error` state
      string (same shape as `AdmitModal`'s `catch`/`onError` pattern), and `step3()`/footer
      renders it inline (e.g., `text-error` paragraph) when set — **new code**, test-first.
- [ ] On API rejection, the error displays in-modal and the modal stays open with the user's
      entered values intact (failure-path test: mock `api.post` to reject, assert error text
      visible, assert `entry` state unchanged, assert modal still mounted).
- [ ] Save button remains disabled while `mut.isPending` (regression check — must not break).
- [ ] On success, both `['inpatient-active']` and `['hospitalization', hospit.id]` query keys are
      invalidated (regression check — must not break).
- [ ] A staff member's session lacking `inpatient.manage` never reaches this modal (existing route
      guard on `POST /:id/care`; negative authorization case — verify by confirming the route
      still requires the permission, not by adding new middleware).

Permission(s): `inpatient.manage`
Dependencies: LC-3, LC-4, LC-5

---

### Task LC-7 — Backend contract regression test (test-only, closes BA condition C2)

Actor/role: N/A (verification task)   Device: N/A

BA finding (C2, blocking): the existing backend care-route integration test
(`src/backend/tests/integration/phase4.test.ts` around line 146) POSTs `heartRateBpm` but never
`respRateRpm`, `feedingStatus`, or `medicationGiven` — spec test-matrix item 12 (backend confirms
`careSchema` accepts the full new payload) is currently uncovered. This is a **test-only**
addition — no production backend file is touched, consistent with the spec's own note that
backend code doesn't need to change, and consistent with the Package B "frontend-only" framing
(no backend *production* code crosses into this PR).

Acceptance Criteria:
- [ ] Extend (or add alongside) the existing care POST test in `phase4.test.ts` to send all 7
      `careSchema` fields (`timeSlot, temperatureC, heartRateBpm, respRateRpm, feedingStatus,
      medicationGiven, notes`) and assert `201`/success with all 7 values persisted/returned.
- [ ] No `src/backend/services|controllers|models|routes` production file is modified by this task.
- [ ] Full backend suite still passes (`npm test -- --runInBand` in `src/backend`).

Permission(s): none (test-only)
Dependencies: none (can run independently, but sequenced last for the "full suites green" gate)

---

## Handoff

@db-agent: not needed (no schema/migration change).
@uiux-agent: review LC-3/LC-4/LC-5 for Compassionate Care token compliance, touch targets, and
copy tone (D2 disclaimer wording) during Step 6 execute-plan.
@dev-agent: implements LC-1 through LC-7 task-by-task with TDD per `/execute-plan`.
@qa-agent: verifies LC-6/LC-7 acceptance criteria + runs full frontend and backend suites;
confirms no RBAC/tenant surface was added (Step 8).

## BA sign-off amendments applied (Step 3 → Step 3.5 handoff)
- C1: LC-6 reworded from "regression check" to "build inline error display" (new behavior).
- C2: LC-7 added (backend test-only, closes spec test-matrix item 12).
- C3 (non-blocking, carried to grill/backlog): (a) Thai-clinician feeding-vocabulary review
  follow-up; (b) backend schema-hardening follow-up (`careSchema` lacks `.positive()`/max caps —
  UI guard is not a data-integrity boundary); (c) accepted deviations: no Escape-to-close (no
  modal in repo has this), ≤0 vitals silently revert to `null` (matches shipped EMR behavior,
  not a validation-error banner).
