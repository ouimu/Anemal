# BA Sign-off — Log Care modal vitals/nursing fields (Step 3, @ba-agent)

Date: 2026-07-12 · Run: unattended (Package B) · Pipeline: CLAUDE.md Standard Pipeline Step 3
Inputs validated against actual source (not summaries): `ClinicInpatient.tsx` (full CareModal +
Care History block), `ClinicEMR.tsx:134-207` (VitalStepper), `hospitalization.service.ts:22-30`
(careSchema), `hospitalization.routes.ts`, `VitalStepper.test.tsx`, `anemal-rbac-matrix`
(+ `references/permission-matrix.md`), `anemal-functional-reqs`, `anemal-ba-toolkit`,
`RecommendByCodex/02` + `04` (Package B section incl. hard must-not list), brainstorm + task docs.

## 1. Objective (restated)

Staff holding `inpatient.manage` can record one complete care observation (time slot + 3 vitals +
feeding + medication note + general note) in a single wizard pass on tablet, matching the
already-live backend `careSchema` contract. Maps to **FR-08** (Inpatient daily care) with FR-05
vitals semantics and the NFR touch-UX floor (≥44×44px). Business value confirmed: the 4 fields
are persisted and *displayed* (Care History) today but unreachable at input time — a real
product gap, not gold-plating.

## 2. Backend contract verification (independent, per task instruction)

Read `careSchema` directly (`hospitalization.service.ts:22-30`):

| Field | Schema | Frontend claim in brainstorm | Verdict |
|---|---|---|---|
| `timeSlot` | `z.enum(['08:00','12:00','16:00','20:00'])` required | matches | OK |
| `temperatureC` | `z.number().optional().nullable()` | matches | OK |
| `heartRateBpm` / `respRateRpm` | `z.number().int().optional().nullable()` | matches | OK |
| `feedingStatus` | `z.string().max(255).optional().nullable()` | matches (255 cap noted in D1) | OK |
| `medicationGiven` / `notes` | `z.string().optional().nullable()` | matches | OK |
| Object mode | `.strict()` — extra keys rejected | matches (LC-5 AC covers) | OK |

Confirmed: **no other constraints** — no `.positive()`, no max on HR/RR via this route (the EMR
medical-record route caps HR at 3000; `careSchema` does not). Frontend claim "backend accepts the
4 new fields as optional/nullable" is **accurate**. Two byproducts recorded as risks R1/R2 below.

## 3. Answers to brainstorm open questions Q1–Q4

**Q1 — VitalStepper extraction / test-coverage risk: NO material risk.**
`VitalStepper.test.tsx` imports the component as a named export directly
(`import { VitalStepper } from '../views/clinic/ClinicEMR'`) and wraps it in its own local
`useState` parent — the suite is fully self-contained (17 cases: rendering, blur/Enter commit,
idempotent double-dispatch guard, null on empty/negative/zero/sub-step, max clamp, scientific
notation, wheel-blur, +/- after typing, save-path wiring). Moving the file changes exactly one
import line; zero assertions depend on ClinicEMR internals. Grep confirms only 3 references
repo-wide: definition, ClinicEMR's 4 call sites, and the test. Prop contract used by EMR
(`label, unit, value, onChange, step, min, max`) is the full public interface — nothing implicit.
LC-1's AC (unchanged props/behavior, no second `justCommittedRef`-pattern implementation) is the
right guard. Coverage is preserved, not merely relocated. One instruction for @dev-agent: keep it
a **named export**; do not leave a re-export shim in ClinicEMR (would defeat LC-1's "single
implementation" AC).

**Q2 — Existing unsaved-changes confirm-close pattern: NONE exists → defer (D5) is CORRECT.**
Grep of `src/frontend/src` for `unsaved|beforeunload|confirm.*close|discard`: zero hits. The only
`window.confirm` uses are action confirmations (discharge/delete), not dirty-form guards; no
modal in the repo (Admit/Edit/CareHistory/Care) warns on close with a draft. Building the pattern
new would expand scope against the spec's own instruction ("ถ้าไม่มีให้ defer ไม่ขยาย scope") and
would trip Ponytail criterion 1. **Decision: out of scope, deferred.** Carry to grill only as a
confirmation, not a redesign.

**Q3 — Feeding vocabulary + English copy: ACCEPTED as a documented judgment call, with follow-up.**
Rationale: (a) the 6-option + Other list is the only vocabulary proposed by the evidence-based
spec and mirrors the ezyVet picklist rationale; (b) it is UI-only against a `String(255)` column —
zero migration, fully reversible, legacy strings render untouched in Care History (verified:
`ClinicInpatient.tsx:456` renders `log.feedingStatus || '—'` with no enum check); (c) the screen
is English-only today (no `useTranslation` in `ClinicInpatient.tsx` — verified; ClinicEMR is
partially localized, this file is not), so English canonical strings are consistent with the
surrounding UI. **Condition C3a:** a follow-up item must be logged for Thai clinician review of
the vocabulary and Thai labels when (or before) an i18n pass reaches this screen. No silent
adoption — this paragraph is the documentation of the call, per unattended-run constraints.

**Q4 — Medication disclaimer (D2 copy) is SUFFICIENT; no badge.**
The governing acceptance criterion (spec) is only "must not imply this is a verified MAR". A
persistent label "Medication / treatment note (optional)" + helper text "Documentation note only —
not a verified medication administration record" satisfies it: the disclaimer is visible at the
point of entry, not hover-hidden. A visual badge adds a new UI pattern (none exists in the design
system inventory for this) for no additional requirement — scope expansion, Ponytail criterion 1.
The stronger safety control here is what the feature *doesn't* do (no dose/route fields, no
"administered" checkbox, no timestamps implying administration) — and that is already enforced by
the non-goals list. @uiux-agent reviews exact wording tone in Step 6 (already in LC-5 AC). Also
render-side symmetry exists: Care History labels the field plainly as "Medication:" — acceptable,
read-only display of a documentation note.

## 4. Gap analysis — LC-1..LC-6 vs RecommendByCodex/02 functional contract + 12-item test matrix

| Spec item | Covered by | Verdict |
|---|---|---|
| 1. 4 new fields present, accessible by label | LC-3 (vitals), LC-4 (feeding), LC-5 (medication) | OK |
| 2. 38.5/90/20 POSTed as numbers to correct fields | LC-3 + LC-5 payload AC | OK |
| 3. Blank numeric/string → `null` (not `''`/`undefined`) | LC-3, LC-5 | OK |
| 4. HR/RR integer-only; negative/zero blocked in UI | LC-3 (inherits VitalStepper commit guard) | OK — see note N1 |
| 5. Feeding preset canonical; Other → user text; blank-Other → null | LC-4 (incl. the negative case) | OK |
| 6. Medication and notes never swap fields | LC-5 | OK |
| 7. API failure → error shown in modal, draft preserved | LC-6 | **GAP G1 — see below** |
| 8. Pending disables save; success invalidates both queries | LC-6 (genuinely existing behavior) | OK |
| 9. Keyboard: tab order, Enter commits w/o wizard submit, Escape/close | Partially (Enter via VitalStepper test) | **GAP G2 (minor)** |
| 10. 768×1024 / 1024×768 no horizontal overflow; targets ≥44px | LC-3, LC-4 | OK |
| 11. Care History renders all fields + legacy feeding strings | LC-4 (inspection; code unchanged) | OK |
| 12. Backend focused integration: schema accepts new payload | Not in any LC task | **GAP G3** |

**G1 (must fix before /write-plan) — LC-6 mischaracterizes error display as existing behavior.**
Verified in source: `CareModal`'s mutation (`ClinicInpatient.tsx:115-122`) has **no `onError`
handler and no error state** — on API rejection today, nothing is shown (the button silently
re-enables). AdmitModal and EditModal both have the `onError → setError → inline <p
class="text-error">` pattern; CareModal does not. Spec test-matrix item 7 requires the error to
display in-modal. LC-6 must be reworded: implementing the inline error display (mirroring the
existing Admit/Edit pattern — reuse, not invention) is **new behavior to build**, not a
regression check. Draft preservation genuinely is existing behavior (state isn't cleared on
error) — that half of LC-6 stands.

**G2 (minor — resolve at grill, default = accept as-is).** Enter-doesn't-submit is covered by the
existing VitalStepper form test, and the wizard's Save is an `onClick` button (no `<form>`), so
accidental submit is structurally impossible. Escape-to-close, however, exists in **no** modal in
this repo (overlay click + close button only). Adding Escape handling would be a new cross-modal
pattern — out of scope by the same logic as Q2. Recommended disposition: document as accepted
deviation; add a one-line tab-order check to LC-6's test notes.

**G3 (must fix before /write-plan) — spec test item 12 uncovered.** Backend tests today POST
`heartRateBpm` on the care route (`phase4.test.ts:146`) but **never** `respRateRpm`,
`feedingStatus`, or `medicationGiven`. Resolution options (pick at Step 4): (a) extend the
existing `phase4.test.ts` care POST payload to all 7 fields — a **test-only** change, no backend
production code, which the spec itself endorses ("ไม่จำเป็นต้องแก้ backend") and does not violate
the frontend-only packaging rule (production `src/backend` untouched); or (b) record an explicit
waiver at grill citing zod-schema reading as sufficient. I recommend (a): one small assertion,
closes the contract loop.

**Other spec deltas checked and accepted (no action):**
- N1: spec says "≤0 shows inline error"; VitalStepper's semantics commit `null` instead (silent
  revert). Accepted deviation per D3 — identical to shipped EMR behavior; two workflows keeping
  one semantic outranks a new error style. Grill may revisit.
- Modal sizing: spec permits growth to `max-w-xl` + scrollable body; current modal is `max-w-md`
  with no body scroll. LC-3's layout AC references the spec's guidance; fine as implementation
  detail for @uiux-agent/@dev-agent — no task change needed.
- Hard must-not list (`04` guide): plan violates none — no ranges invented (D3), no MAR/scheduler,
  no second stepper copy (LC-1/LC-2 delete both duplicates), no backend production change, no
  bundling with security work (Package A shipped separately, PR #20).
- Task format vs `anemal-ba-toolkit`/`anemal-functional-reqs` conventions: tasks carry actor/role,
  device, permission code, dependencies, testable ACs incl. negative cases — meets Definition of
  Ready once G1/G3 are amended. FR traceability (FR-08) should be added to the tasks header at
  write-plan; cosmetic.

## 5. Authorization / RBAC statement (explicit, per anemal-rbac-matrix)

**No authorization surface changes. Confirmed against source and matrix, not assumed:**
- Route: same `POST /api/hospitalizations/:id/care`, already guarded
  `requirePlane('clinic') → requirePermission('inpatient.manage')` (`hospitalization.routes.ts:16`).
  No new route, no new permission code, no new screen/guard, no matrix row change.
- Default matrix: `inpatient.manage` = E for all three system roles (clinic_admin / doctor /
  clinic_staff) — actor statement in the task doc is correct (and slightly broader than
  "Vet/Vet Tech": clinic_staff also holds it; not a problem, same as today).
- Deny-by-default intact; server remains the boundary (fields validated by existing
  `validate(careSchema)`); planes untouched (clinic plane only, no PII crosses to platform);
  tenant/branch isolation unchanged and recently hardened (PR #20/ADR-0014) — this feature rides
  on that fix, which is exactly why Package B was sequenced after Package A.
- LC-6's negative-authz AC correctly verifies the existing guard rather than adding middleware.

## 6. NFR impact

Touch UX ≥44px: enforced by VitalStepper internals + LC-3/LC-4 ACs. Performance: nil (same single
POST, two existing query invalidations). Offline/i18n/security NFRs: untouched. No new
dependency/endpoint/migration (Ponytail criteria 3–7 pre-screen: clean).

## 7. Risk register

| ID | Risk | Impact | Disposition |
|---|---|---|---|
| R1 | `careSchema` accepts negative/zero vitals and unbounded `medicationGiven` from any API client (no `.positive()`, no HR/RR max, no string cap) — UI guard is not a data-integrity boundary | Bad data from non-UI clients | **Backlog follow-up (backend hardening), explicitly out of this PR** per spec §Numeric behavior; record at grill |
| R2 | Feeding vocabulary unreviewed by Thai clinician (unattended run) | Vocabulary churn later | Accepted (Q3) with follow-up C3a; String column makes it reversible |
| R3 | LC-6 as written would let the error-display requirement slip through as "already exists" | Spec item 7 silently unmet | Closed by condition C1 |
| R4 | Backend contract drift undetected (item 12) | Frontend/schema mismatch ships | Closed by condition C2 |

## 8. Verdict

**BA SIGN-OFF: GRANTED — conditional.** Conditions binding on Step 3.5/Step 4:

- **C1 (blocking):** Amend LC-6 before /write-plan — inline API-error display in CareModal is
  *new* behavior; implement by mirroring the existing AdmitModal/EditModal `onError` pattern
  (reuse, not invention), with a failure-path test (mock rejected `api.post`, assert error text
  visible + draft intact + modal open).
- **C2 (blocking):** Close gap G3 — extend the existing backend care-route integration test
  (test-only) to a full 7-field payload, or record an explicit waiver during grill. Recommended:
  extend the test.
- **C3 (non-blocking, must be recorded):** (a) log Thai-clinician vocabulary review as a backlog
  follow-up; (b) log backend schema-hardening follow-up (R1); (c) grill confirms the G2/N1
  accepted deviations (Escape-close deferred; ≤0 → silent null, matching EMR).

No finding blocks the design itself; both blocking conditions are task-document amendments within
@pm-agent authority. Pipeline may proceed to **Step 3.5 /grill-with-docs** with C1–C3 carried as
mandatory grill inputs.

— @ba-agent
