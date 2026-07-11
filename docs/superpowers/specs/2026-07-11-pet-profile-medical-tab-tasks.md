# Tasks + Acceptance Criteria — Pet Profile Medical Tab (Bugfix Pipeline Item 2)

Date: 2026-07-11
Owner: @pm-agent
Pipeline step: Step 2 of 8
Input: docs/superpowers/specs/2026-07-11-pet-profile-medical-tab-brainstorm.md

## Scope decision (pending formal @ba-agent sign-off at Step 3)

Adopt Option C (hybrid), per BA preliminary read at Step 1:
- `allergies` / `underlyingConditions` remain pet-level, directly editable fields (`crm.edit`,
  unchanged — no action needed, already correct).
- The Medical tab's record list becomes an explicit, clearly-labeled **read-only EMR rollup**:
  fix the silent 3-record cap (add a "View all in EMR" / "View full record" affordance), gate the
  rollup section on `emr.view` (degrade gracefully — omit section, not whole-profile failure — if
  a custom role lacks `emr.view` but has `crm.view`), and reconcile the "Medical" vs "Medical
  History" naming drift between code and `.claude/skills/anemal-screen-specs/references/04-pet-owner.md`.
- No new editable fields, no new tables, no fork of clinical data onto the Pet record.

## Tasks

### Task PET-MED-1 — Fix silent record cap / add drill-in to EMR
- Task ID: PET-MED-1
- Actor/role: Doctor, Staff, Clinic Admin (any role with `crm.view`)
- Device: Tablet, Web (Both)
- Description: Pet Profile Medical tab currently shows at most 3 medical records with no
  indication more may exist and no way to reach them. Add a "View all records" / "Open in EMR"
  action per record (and/or a tab-level link) that navigates to `ClinicEMR.tsx` filtered to this
  pet, and/or fetches the full list via the existing `GET /api/medical-records?petId=...` endpoint
  already used by `ClinicEMR.tsx` (no new endpoint required).
- Acceptance Criteria:
  - [ ] When a pet has >3 medical records, the tab visibly indicates more exist (e.g., "Showing 3
        of N" or a "View all" link) rather than silently truncating.
  - [ ] Clicking "View all" / a record row navigates to `ClinicEMR.tsx?petId=<id>`, which reads
        `petId` via `useSearchParams` on mount and sets `selectedPetId` accordingly (new on-mount
        effect, mirroring the existing convention in `ClinicRecordVaccination.tsx` lines 20-24 —
        Finding 1). `ClinicEMR.tsx` is therefore an in-scope touched file, not just `ClinicPets.tsx`.
  - [ ] A user with `crm.view` but without `emr.view` does NOT see this drill-in affordance (link
        is omitted, not merely disabled) — negative/authorization case.
  - [ ] A user with neither `crm.view` nor `emr.view` cannot reach the Pet Profile screen at all
        (existing route guard — Finding 2: already enforced by `RequirePermission` on both the
        `/clinic/pets` and `/clinic/emr` routes in `App.tsx`; this AC is a regression test only, no
        new guard code).
- Permission(s): `crm.view` (tab visibility), `emr.view` (rollup section + drill-in visibility)
- Dependencies: none (reuses existing `GET /api/medical-records` endpoint)
- Touched files (corrected per Finding 1): `ClinicPets.tsx`, `ClinicEMR.tsx` (+ its test file)

### Task PET-MED-2 — Graceful degradation when `emr.view` is absent
- Task ID: PET-MED-2
- Actor/role: Any custom clinic role lacking `emr.view` but holding `crm.view`
- Device: Both
- Description: Today `findPetById` always includes `medicalRecords` AND `vaccinations` regardless
  of caller's `emr.*` permission (server-side over-fetch — both `medical-record.routes` and
  `vaccination.routes` GET are gated `emr.view` per permission-matrix.md, so the embedded payload
  must not be broader than those dedicated endpoints' own guard — BA AMEND-1). Update the pet
  detail response/service to omit BOTH `medicalRecords` and `vaccinations` when the requesting
  user lacks `emr.view`, instead of relying on frontend-only hiding.
- Acceptance Criteria:
  - [ ] `GET /api/pets/:id` omits `medicalRecords` AND `vaccinations` in the response payload when
        caller lacks `emr.view` (verified at the service/repository layer, not just serialization).
  - [ ] Frontend Medical tab AND Vaccinations tab show an appropriate, distinguishable state (e.g.,
        "You don't have access to clinical records" — visibly different from the pre-existing "No
        medical records yet." empty state). Per Finding 3, this message is driven by the client's
        own `hasPermission('emr.view')` (auth store), NOT by inspecting whether `medicalRecords`/
        `vaccinations` is present/absent in the payload — avoids inventing a tri-state payload
        contract; the server-side omission (this task, first AC) remains the real security
        boundary regardless of the UI's decision logic. Overview tab's
        `allergies`/`underlyingConditions` display is unaffected.
  - [ ] Negative case: a `crm.view`+`emr.view` user still sees both rollups unchanged (no regression).
  - [ ] Tenant isolation unaffected — queries (when included) still scoped by existing
        `tenant_id`/`petId` filters (verify, no new query surface).
  - [ ] Multi-role union case: a user holding both a custom no-`emr.view` role AND `doctor` still
        resolves `emr.view` (union of permissions per CR-01) and sees the rollups.
  - [ ] Add Vaccination button is omitted when `vaccinations` is absent from the pet response
        (CORR-2 — `vaccination.create` is a distinct permission code; a user who cannot view the
        vaccination list must not be offered a blind-add UI; server-side `POST /api/vaccinations`
        permission check is unchanged).
- Permission(s): `crm.view`, `emr.view`, `vaccination.create` (button visibility only)
- Dependencies: PET-MED-1 (shares the same tab section)

### Task PET-MED-3 — Reconcile naming + update screen spec
- Task ID: PET-MED-3
- Actor/role: N/A (documentation only)
- Device: N/A
- Description: `.claude/skills/anemal-screen-specs/references/04-pet-owner.md` calls the tab
  "Medical History"; code (`ClinicPets.tsx` `TABS` const) calls it "Medical". Pick one label
  (recommend keeping "Medical" in code as-is to avoid a UI string/i18n-key churn unless BA's Step 3
  sign-off says otherwise) and update the spec doc to match, plus document the new drill-in/
  degradation behavior from PET-MED-1/2.
- Acceptance Criteria:
  - [ ] Spec doc and code tab label agree.
  - [ ] Spec doc documents the "View all"/drill-in affordance and the `emr.view` gating behavior.
- Permission(s): none (docs)
- Dependencies: PET-MED-1, PET-MED-2

## Explicitly out of scope (backlog)

- Any change to `allergies`/`underlyingConditions` editing (already correct, FR-03-04 compliant).
- Structuring free-text allergies into discrete/coded allergy entries (flagged by BA as future
  debt vs FR-05-05 automated prescription allergy checks) — file to
  `.claude/roadmap/ACTIVE/remaining-tasks.md` backlog, not this item.
- Folding discharged-admission/inpatient care history into this tab (ADR-0011 deferral) — separate
  future item, not bundled into this bugfix.

## BA Step-3 formal sign-off (2026-07-11, @ba-agent — supersedes prior informal addendum)

**Verdict: SIGNED OFF WITH CHANGES.** Option C (hybrid) confirmed. All claims re-verified against
the current codebase (`ClinicPets.tsx` lines 500/615-624/626-644, `pet.repository.ts`
`findPetById` lines 31-44, `pet/medical-record/vaccination` route guards, permission-matrix.md,
`04-pet-owner.md`, FR-03-04 / FR-05).

**Confirmed as-is:**
- **Option C scope:** FR-03-04 (Must) keeps `allergies`/`underlyingConditions` pet-level under
  `crm.edit` for prescription-safety visibility; FR-05 owns SOAP/vitals. No forked clinical store.
- **AMEND-1 (PET-MED-2 covers vaccinations too):** verified — `findPetById` embeds a full,
  uncapped `vaccinations` include, and `vaccination.routes` GET (`/`, `/due-soon`, `/due-worklist`)
  is guarded `emr.view`. Server gate must omit BOTH `medicalRecords` and `vaccinations` for a
  caller lacking `emr.view` (embedded payload must not exceed the dedicated endpoints' own guards;
  deny-by-default). Already incorporated into PET-MED-2 ACs above — no further edit needed.
- **AMEND-2 (drill-in is pet-scoped):** verified — `ClinicEMR.tsx` entry point is
  `selectedPetId` internal state; record selection is existing in-EMR behaviour. PET-MED-1 AC
  reads "pre-filtered/scoped to that pet" — testable as written. Implementation note for
  @dev-agent: EMR pet selection is component state, not a URL param, so the drill-in needs a
  navigation-state/store mechanism (design detail, not a new requirement).
- **Naming:** keep code label "Medical"; update `04-pet-owner.md` (currently "Medical History",
  lines 106/116) to match. Also fix the stale deferred-item line "Owner edit / pet edit modals
  (create-only today)" (line 164) — `EditPetModal` exists.

**Corrections (the CHANGES):**
- **CORR-1 — custom-role rationale was wrong:** the informal addendum justified the
  clone-`clinic_staff`-and-toggle-off scenario with "`clinic_admin` holds both". False:
  permission-matrix.md shows `clinic_admin` `emr.attach` = `-` (denied); only `doctor` (E) and
  `clinic_staff` (V) hold it. The scenario is nonetheless PERMITTED, for the correct reason:
  the no-escalation rule bars a custom role *granting* a permission its creator doesn't hold;
  toggling permissions OFF is a removal and can never escalate. Conclusion unchanged, rationale
  corrected.
- **CORR-2 (AMEND-3) — Add Vaccination button:** `POST /api/vaccinations` is guarded
  `vaccination.create` (a distinct code, NOT `emr.*`). PET-MED-2 degradation must also hide the
  Vaccinations tab's "Add Vaccination" button when the `vaccinations` field is absent (a user who
  cannot view the vaccination list must not be offered a blind-add UI). Server-side permission for
  the POST is unchanged (`vaccination.create`); this is a UX-consistency requirement, server
  remains the boundary. Add to PET-MED-2 AC: "[ ] Add Vaccination button is omitted when
  `vaccinations` is absent from the pet response."

**Definition-of-Ready check:** objective, actors/roles, permission codes (`crm.view`, `crm.edit`,
`emr.view`, `vaccination.create`), exception cases (no-`emr.view` degradation, multi-role union
per CR-01, tenant isolation), NFR impact (none new; payload shrinks for restricted roles),
testable ACs, dependencies/risks — all present. READY for Step 3.5.

## Hand-off

Step 3 complete (formal BA sign-off above). Next: Step 3.5 `/grill-with-docs` (mandatory), then
`/write-plan` by @pm-agent.
