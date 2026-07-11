# Brainstorm — Log Care modal vitals/nursing fields (Step 1)

Date: 2026-07-12
Owner: @pm-agent (unattended scheduled run, Package B of 3)
Input: `RecommendByCodex/02-log-care-vitals-modal.md`, `RecommendByCodex/04-claude-execution-guide.md`
Prior art in repo: `docs/superpowers/plans/2026-07-11-inpatient-log-care-vitals.md` (Care History
*read* modal, ADR-0011, already shipped — different feature, no overlap: that plan explicitly
deferred "vitals input fields beyond temperature" to backlog. This brainstorm picks that up.)

## Problem statement

`careSchema` on the backend (`src/backend/services/hospitalization.service.ts:22-30`) accepts
`heartRateBpm`, `respRateRpm`, `feedingStatus`, `medicationGiven` and the repository persists
them (confirmed: `CareLog` interface and Care History render block in
`ClinicInpatient.tsx:42-54,451-458` already display these 4 fields — they came from PR #19/#13
staff-name work). But the Log Care **input** modal (`CareModal` in `ClinicInpatient.tsx:102-254`)
only collects `timeSlot`, `temperatureC`, `notes`. Staff cannot record heart rate, respiratory
rate, feeding status, or a medication/treatment note from the UI at all — the 4 fields are
write-only from the API's perspective but currently unreachable from the product.

## Confirmed current state (verified by reading source, not assumed)

- `CareEntry` interface: `{ timeSlot: string; temperatureC: number | null; notes: string }` (3 fields)
- `careSchema` (backend): `timeSlot` (enum, required), `temperatureC`/`heartRateBpm`/`respRateRpm`
  (all `optional().nullable()`, HR/RR are `.int()`), `feedingStatus` (string, max 255,
  optional/nullable), `medicationGiven`/`notes` (string, optional/nullable) — `.strict()` object,
  so extra keys are rejected and all listed keys must match name/type exactly.
- `VitalStepper` exists once today, inside `ClinicEMR.tsx:145-207`, fully built (typed numeric
  input + +/- buttons, Enter-to-commit, blur-commit with double-dispatch guard, wheel-blur guard,
  round/clamp). `CareModal` has its own much simpler local `Stepper` (lines 146-168) that only
  supports +/- (no typed entry) — this is the duplicate-logic problem flagged by the spec: typing
  38.5°C via a +/--only 0.1-step stepper takes ~385 clicks from zero.
- `VitalStepper.test.tsx` exists and tests the EMR component directly by importing it from
  `ClinicEMR.tsx`.
- No i18n usage found in `ClinicInpatient.tsx` (component is plain English strings, unlike some
  fully-localized screens) — confirmed by absence of `useTranslation`/`t(` calls in the file
  region read. Decision: do NOT add new i18n keys in this task (nothing to extend, and adding a
  translation layer where none exists is a scope expansion the router doesn't ask for). If a
  future screen-wide i18n pass reaches this file, it will pick these strings up then.

## Scope for this brainstorm (frontend-only, matches RecommendByCodex 02 + Package B guide)

1. Extract `VitalStepper` out of `ClinicEMR.tsx` into `src/frontend/src/components/VitalStepper.tsx`
   as the single implementation. Update `ClinicEMR.tsx` to import it (delete the local
   definition). Update `VitalStepper.test.tsx` to import from the new path. Delete `CareModal`'s
   local `Stepper` function entirely — do not keep two numeric-input implementations.
2. Extend `CareEntry` to the 7-field shape from the spec:
   `{ timeSlot, temperatureC, heartRateBpm, respRateRpm, feedingStatus, medicationGiven, notes }`.
3. Step 2 of the wizard ("Record Vitals") renders 3 `VitalStepper` instances (temperature,
   heart rate, respiratory rate) in a responsive grid, replacing the single local `Stepper`.
4. Step 3 of the wizard ("Care Notes") gains:
   - Feeding status picklist (native `<select>`) with the controlled vocabulary from the spec
     (Not assessed→null / Ate all / Ate some / Refused / NPO / Assisted feeding / Other→free text)
   - Medication/treatment note: multiline free text, explicitly labeled as a documentation note,
     not a MAR — placeholder text and/or helper copy makes this unambiguous
   - Existing general Care notes textarea, kept separate from the medication field
5. Normalize blank optional fields to `null` before `POST` (not `''`), per the spec's clean
   contract recommendation. Blank required-in-UI-but-optional-in-schema strings become `null`.
6. No new dependencies, no new API endpoints, no DB migration, no backend file touched.

## Explicit design decisions made now (unattended run — documented per operating constraints)

- **D1 — Feeding vocabulary**: adopt the spec's 6-option + Other list verbatim (it's the only
  vocabulary proposed and is UI-only against a `String` column, so it's non-breaking and
  reversible). Values sent to the API are the canonical English strings; Other opens a bounded
  free-text input (respect the 255-char backend cap). Legacy/history values are rendered as-is in
  Care History already (that code doesn't validate against a fixed enum — confirmed above), so no
  migration needed for old data.
- **D2 — Medication field framing**: labeled "Medication / treatment note (optional)" with helper
  text "Documentation note only — not a verified medication administration record." This is a
  UX/copy decision within @pm-agent/@uiux-agent authority, not a clinical decision, so it does not
  block on human sign-off.
- **D3 — No outlier/range validation**: per the hard "must not" list, no clinical thresholds are
  invented. UI blocks only structurally invalid input (empty→null, non-numeric, ≤0 for vitals,
  non-integer for HR/RR) — the same guard `VitalStepper`'s `commit()` already implements
  (`rounded <= 0 ? null : ...`). This is a data-shape guard, not a clinical-range guard, so it's
  in scope without clinical sign-off.
- **D4 — No field is newly `required`**: every field stays optional, matching backend schema
  exactly, matching the spec's acceptance criteria ("every clinical field optional per current
  backend"). No task template/required-field concept exists in this codebase to attach a
  required rule to.
- **D5 — No unsaved-changes warning on close**: spec explicitly defers this unless the repo
  already has the pattern. Grep check (below, in grill) will confirm; default is defer/out-of-scope
  unless a cheap existing pattern is found.

## Open questions carried to BA sign-off (Step 3) and grill (Step 3.5)

- Q1: Does extracting `VitalStepper` change any prop contract EMR currently relies on that isn't
  covered by existing `VitalStepper.test.tsx` assertions? (BA/grill to confirm test coverage is
  preserved, not just moved.)
- Q2: Is there an existing "unsaved changes" confirm-close pattern anywhere in the frontend that
  D5 should reuse, or is defer correct?
- Q3: Confirm feeding vocabulary + English copy is acceptable as a first controlled vocabulary
  (no Thai clinician review available in this unattended run — flag as a documented judgment call,
  not a silent decision).
- Q4: Confirm medication field copy framing (D2) is sufficient disclaimer, or whether stronger UI
  treatment (e.g., a visible badge) is warranted.

## Non-goals (explicit, from RecommendByCodex 02 "Out of scope" + hard must-not list)

- No scheduled treatments, overdue alerts, actual-administration timestamp.
- No medication order linkage, dose/route enum, barcode verification, approval/co-sign.
- No species-specific reference ranges or clinical alerting.
- No schema change to make feeding an enum; no historical vitals chart.
- No staff-lookup endpoint (irrelevant to this package).
- No backend file touched; no new endpoint/dependency/migration.
- Must not touch hospitalization branch-isolation files (Package A, already shipped in PR #20)
  or bundle this with any backend change.

This document is pre-input to @pm-agent Step 2 task breakdown, per CLAUDE.md's brainstorming-hook
coexistence rule.
