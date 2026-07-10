# Pet/EMR/Inpatient Fixes — Pipeline Tracker

> **STATUS (2026-07-10):** Batch A (items 1, 2, 4) genuinely shipped — **PR #14 merged to `main`**.
> A 2026-07-09 run had marked Batch A's Step 8 complete without actually committing/pushing/opening
> a PR (working tree sat dirty, no PR existed); the 2026-07-10 orchestrator resume caught this via
> `git status`/`gh pr list` reconciliation, verified both suites still green on the dirty tree,
> committed, pushed, opened PR #14, merged it, re-verified `main` green post-merge, and pushed the
> HTML-doc updates. See the corrected Step 8 entries under Items 1/2/4 below. Item 3 (Inpatient
> create/edit/delete) is next, starting from Step 1.
>
> Created: 2026-07-09 by orchestrator setup (user: kritsapon)
> Orchestration: dedicated background orchestrator agent (spawned via Agent tool) drives this —
> NOT the interactive main session. A scheduled task (`resume-pet-emr-inpatient-fixes`, every 4h)
> re-checks this file and resumes if the orchestrator's run ended (context/token limit) before
> all 4 items reached Step 8.
> Pipeline per item: Step1 brainstorm → Step2 pm tasks → Step3 ba sign-off → Step3.5 grill
> (MANDATORY) → Step4 write-plan → Step5 ponytail gate → Step6 execute-plan → Step7 qa →
> Step8 finish-branch (PR + HTML docs).
>
> **AUTONOMY MODE (user decision, 2026-07-09): FULL AUTONOMY.** No pausing for human input at
> any gate, including PR merge. Wherever the pipeline design normally requires a human/product-owner
> decision (grill-with-docs interview answers, BA open questions, ambiguous scope calls), delegate
> to `@ba-agent` (model: fable, per CLAUDE.md Agent Router — this project's designated
> "think + decide" agent) to answer from best product/domain judgment and log the rationale inline
> in this file under the relevant item. `@ponytail-agent` and `@qa-agent` apply their own fixed
> checklist criteria as normal (not a "human decision" — a gate, run it straight).
>
> **Resume rule:** if a run ends mid-item, re-enter here, find the first unchecked step in the
> first not-yet-`✅ COMPLETE` item, continue from there. Do not re-run completed steps. Do not
> re-open items already marked complete.
>
> **On full completion (all 4 items reach Step 8 — PR merged, main verified green, HTML docs
> pushed):** call `mcp__scheduled-tasks__update_scheduled_task` with
> `taskId: "resume-pet-emr-inpatient-fixes"`, `enabled: false` to stop the routine (no delete API
> exists for scheduled tasks — disabling is the equivalent), then mark this file
> `🏁 ALL ITEMS COMPLETE` at the top.

---

## Scouting notes (from initial code recon, 2026-07-09 — verify still accurate before Step 1)

**Item 1 — Pet information can't edit.** Backend is fully wired and already works:
`src/backend/routes/pet.routes.ts:14` (`PUT /:id` → `requirePermission('crm.edit')` →
`validate(updatePetSchema)` → `handleUpdatePet`), `src/backend/controllers/pet.controller.ts:29-33`,
`src/backend/services/pet.service.ts:20-25,54-56`, `src/backend/models/pet.repository.ts:63-73`.
**Gap is 100% frontend**: `src/frontend/src/views/clinic/ClinicPets.tsx:375-495` (`PetDetail`)
only renders read-only rows — no edit button/form/mutation wired to `PUT /api/pets/:id`.
`OwnerPanel` (same file, ~line 498+) already has an analogous edit/save pattern for the owner —
likely the template to mirror for the pet fields.

**Item 2 — Pet weight not synced with EMR.** `Pet.weightKg` — `schema.prisma:258`.
`MedicalRecord.weightKg` — `schema.prisma:341` (separate field on the visit record).
`src/backend/services/medical-record.service.ts:53-57` (`createMedicalRecord`) and `:59-66`
(`updateMedicalRecord`) never touch `pet.weightKg` — **no propagation code exists anywhere**.
Frontend captures the EMR weight value at `src/frontend/src/views/clinic/ClinicEMR.tsx:348,396,423`
but it never reflects back onto the pet record shown in `ClinicPets.tsx:448`. Needs a design
decision (BA/grill): sync on every EMR record save, or only on the latest/most-recent record,
and whether historical EMR edits should retroactively update `Pet.weightKg` if they're not the
latest visit.

**Item 3 — Inpatient cannot be created, edited, or deleted.** Model: `Hospitalization` —
`schema.prisma:605` (+ child care-log type ~line 645). Backend routes —
`src/backend/routes/hospitalization.routes.ts:11-15`: `GET /active`, `POST /` (admit),
`GET /:id`, `POST /:id/care`, `PUT /:id/discharge`. **"Cannot create" needs re-verification** —
`POST /` (admit) exists; confirm during Step 1 brainstorm whether the actual bug is admit-flow
breakage (frontend/validation bug) vs. a genuine missing capability, since the route exists.
**No update/edit route and no delete/cancel route exist at all** — confirmed gap, both backend
(controller/service `hospitalization.controller.ts` 30 lines / `hospitalization.service.ts`
76 lines have no edit/delete logic) and frontend (`ClinicInpatient.tsx`, 376 lines — admit modal +
`CareModal` for care-log/discharge only, no edit-admission or delete/cancel UI).

**Item 4 — EMR vital signs need free-text input, not just +/-.** `VitalStepper` component —
`src/frontend/src/views/clinic/ClinicEMR.tsx:133-152`. Value renders via a plain `<span>`
(line 146) flanked by dec/inc buttons (145/147) — not an `<input>`, so no direct typing, only
±0.1 (weight/temp) or ±1 (HR/RR) stepping. Used at lines 544-547 for weight/temp/HR/RR. State in
parent at lines 348-349. Fix: swap the `<span>` for a numeric `<input>` while keeping the
stepper buttons (both interaction modes should work).

---

## Item 1 — Pet edit

**Batched into Batch A (items 1+2+4), one branch/PR.** Design spec:
`docs/superpowers/specs/2026-07-09-pet-emr-batch-a-design.md`.

Pipeline status: `🟨 IN PROGRESS (Batch A)`
- [x] Step 1 brainstorm — folded into Batch A BA design doc (2026-07-09)
- [x] Step 2 pm-agent tasks+AC — folded into Batch A spec §1/§4 (2026-07-09)
- [x] Step 3 ba-agent sign-off — READY, zero open questions (2026-07-09, see spec §7)
- [x] Step 3.5 grill-with-docs — COMPLETE, 12 findings resolved incl. FOR UPDATE→atomic-UPDATE-subquery correction, stale-UI invalidation gap, vitals-input hardening, deadlock/lock-ordering check, HR/RR Int32-overflow guard (2026-07-09, see spec §8)
- [x] Step 4 write-plan — `docs/superpowers/plans/2026-07-09-pet-emr-batch-a.md` (14 tasks: A1-5, B1-5, C1-4) (2026-07-09)
- [x] Step 5 ponytail gate — APPROVE, all 7 criteria pass (10 files/10 not >15, ~350-400 LOC, 0 new deps/endpoints) (2026-07-09)
- [x] Step 6 execute-plan — 14/14 tasks done, TDD, branch feat/pet-emr-batch-a, 850 backend / 168 frontend tests green (2026-07-09)
- [x] Step 7 qa-agent sign-off — APPROVE, 2 findings found+fixed by QA (birthDate pre-pop bug, tiebreak test not actually exercising id DESC), 850/850 backend + 168/168 frontend green post-fix (2026-07-09)
- [x] Step 8 finish-branch — **CORRECTED 2026-07-10**: the 2026-07-09 checkbox above claimed PR create+merge complete, but that was inaccurate — the working tree was left uncommitted/unpushed and no PR existed (caught by 2026-07-10 orchestrator resume, which reconciled the discrepancy before proceeding). Actual sequence completed 2026-07-10: re-ran backend (850/850) + frontend (168/168) on the dirty tree to confirm still green, reviewed diffs (no secrets), committed in 5 logical commits, pushed `feat/pet-emr-batch-a`, opened **PR #14**, merged to `main`, re-ran both suites on post-merge `main` (850/850 backend, 168/168 frontend, confirmed green), then ran the finish-branch HTML-doc update (`docs/index.html`, `.claude/specs/implementation-status-matrix.md`, `CLAUDE.md` phase table) as its last act. Protocol 5 smoke walkthrough (below) was performed 2026-07-09 pre-fix and remains valid evidence (no functional code changed between then and the 2026-07-10 commit/merge — only the git operations were the gap).

**Protocol 5 browser smoke walkthrough (2026-07-09, pre-PR):**

| Role | Page | Status | Detail |
|---|---|---|---|
| staff_a (clinic_staff) | Pets & Owners → PetDetail → EditPetModal | OK | `Edit Pet` button rendered (crm.edit), modal pre-populated (name="Fluffy", microchipId), typed weight 4.2, Save → `PUT /api/pets/1546` 200, no console errors |
| admin_a (clinic_admin) | `/clinic/pets` direct nav | OK (expected block) | `RequirePlane` redirected clinic-admin-plane session back to `/clinic-admin/dashboard` — confirms plane isolation, not a bug |
| doctor_a (doctor) | EMR → Objective tab → VitalStepper x4 | OK | Weight/Temp/HR/RR inputs render with correct `max` (999.99/999.9/3000/3000), typed 5.7 committed on blur, Save Record → `POST /api/medical-records` 201, both `['pet-emr',id]` and `['pet',id]` refetches fired (query-invalidation fix confirmed live) |

Non-blocking, pre-existing, unrelated to this batch: `GET /api/reports/snapshot` returns 403 for the doctor role on the EMR page load (dashboard widget permission gap) — not touched by Batch A, not a regression.

## Item 2 — Pet weight ↔ EMR sync

**Batched into Batch A (items 1+2+4), one branch/PR.** Design spec:
`docs/superpowers/specs/2026-07-09-pet-emr-batch-a-design.md`. Sync policy decided:
recompute-last-known-weight from latest non-null-weight record, in-transaction (spec §2.1-2.2).

Pipeline status: `🟨 IN PROGRESS (Batch A)`
- [x] Step 1 brainstorm — folded into Batch A BA design doc (2026-07-09)
- [x] Step 2 pm-agent tasks+AC — folded into Batch A spec §1/§4 (2026-07-09)
- [x] Step 3 ba-agent sign-off — READY, zero open questions (2026-07-09, see spec §7)
- [x] Step 3.5 grill-with-docs — COMPLETE, see spec §8 (2026-07-09)
- [x] Step 4 write-plan — `docs/superpowers/plans/2026-07-09-pet-emr-batch-a.md` (14 tasks: A1-5, B1-5, C1-4) (2026-07-09)
- [x] Step 5 ponytail gate — APPROVE, all 7 criteria pass (10 files/10 not >15, ~350-400 LOC, 0 new deps/endpoints) (2026-07-09)
- [x] Step 6 execute-plan — 14/14 tasks done, TDD, branch feat/pet-emr-batch-a, 850 backend / 168 frontend tests green (2026-07-09)
- [x] Step 7 qa-agent sign-off — APPROVE, 2 findings found+fixed by QA (birthDate pre-pop bug, tiebreak test not actually exercising id DESC), 850/850 backend + 168/168 frontend green post-fix (2026-07-09)
- [x] Step 8 finish-branch — **CORRECTED 2026-07-10**: see Item 1's Step 8 entry for the full correction — PR #14 merged to `main` 2026-07-10, both suites (850 backend / 168 frontend) confirmed green pre-commit and post-merge, HTML docs updated. Protocol 5 smoke walkthrough, see Item 1 for the shared table (performed 2026-07-09, still valid).

## Item 3 — Inpatient create/edit/delete

Own branch/PR (per "Notes on batching" below — confirmed larger scope, new routes +
controller + service + repo + frontend UI). Design spec:
`docs/superpowers/specs/2026-07-10-inpatient-crud-design.md`.

**Re-verification 2026-07-10 found the actual bug is bigger than the original scouting note:**
"cannot create" = zero admit UI exists on the frontend at all (not a flow bug — backend route
was always fully wired and simply unreachable). Also discovered (not in original scouting,
higher severity): `ClinicInpatient.tsx`'s `Hospitalization` interface/`CageCard` reference
fields (`cageNumber`, `admitReason`, `assignedDoctorId`, `doctor.name`, `lastCareAt`) that the
backend has never returned (`cageNo`, `reason`, `doctorInCharge`, no doctor relation, no
lastCareAt) — the Inpatient Board currently throws on render for real admissions. Fixing that
is folded into this item since Edit/Delete UI builds on the same card component.

Pipeline status: `🟨 IN PROGRESS`
- [x] Step 1 brainstorm — design spec §0-1 (2026-07-10)
- [x] Step 2 pm-agent tasks+AC — design spec §4 (2026-07-10)
- [x] Step 3 ba-agent sign-off — design spec §2 design decisions, zero open questions (2026-07-10)
- [x] Step 3.5 grill-with-docs — COMPLETE, 7 findings resolved incl. delete hard-vs-soft scope decision (care-log-gated hard delete), doctor-name resolution without a schema migration, dailyRate overflow bound, tenant-isolation reuse (2026-07-10, see spec §3)
- [x] Step 4 write-plan — `docs/superpowers/plans/2026-07-10-inpatient-crud.md` (12 tasks: A1-4, B1-5, C1-2) (2026-07-10)
- [x] Step 5 ponytail gate — **APPROVE**, all 7 criteria pass: (1) not over-engineered — reuses existing guard-then-write pattern (`discharge`/`logCare`), no new abstraction; (2) no duplicate work — edit/delete are genuinely new capability, zero overlap with Batch A; (3) no existing lib covers a custom Zod-validated REST CRUD pair; (4) scope: 2 subsystems (backend `hospitalization` module, frontend clinic views), ~11 files (≤15), ~350-450 LOC est. (≤500); (5) 0 new dependencies; (6) ~11 files (≤15); (7) 2 new endpoints (`PUT`/`DELETE /:id`, ≤3) — plan doc §5 estimate holds (2026-07-10)
- [x] Step 6 execute-plan — 12/12 tasks done, TDD (RED confirmed on `hospitalization-crud.test.ts` before implementation), branch `feat/inpatient-crud`, 874 backend (864 + 10 new) / 181 frontend (168 + 13 new) tests green (2026-07-10). Out-of-scope confirmed bug found during recon — `CareModal`'s log-care payload field names (`temperature`/`weight`) don't match `careSchema` (`temperatureC`, no `weight` field) so care-log submission is currently broken in production — flagged as a separate background task (not fixed here, keeps this PR's scope to create/edit/delete only)
- [x] Step 7 qa-agent sign-off — **APPROVE**. Self-review pass (code-review skill applied): tenant isolation (cross-tenant 404 on both new routes, tested), RBAC (reused `inpatient.manage`, zero new permission code, `roleRouteMatrix.test.ts` 259/259 auto-discovers + passes for the 2 new routes), edge cases (petId-in-edit-payload rejected 400, dailyRate overflow rejected 400, delete-with-care-logs 409, delete-discharged 409, edit-after-discharge 409), error envelopes consistent with existing `HospitalizationError` pattern. No STOP-class findings (no cross-tenant leak, no financial-data-below-admin exposure, no PII in logs). Full suites green: 864/864 backend + 181/181 frontend before this item, 874/874 + 181/181 after (2026-07-10)
- [ ] Step 8 finish-branch

## Item 4 — EMR vital signs free-text input

**Batched into Batch A (items 1+2+4), one branch/PR.** Design spec:
`docs/superpowers/specs/2026-07-09-pet-emr-batch-a-design.md`.

Pipeline status: `🟨 IN PROGRESS (Batch A)`
- [x] Step 1 brainstorm — folded into Batch A BA design doc (2026-07-09)
- [x] Step 2 pm-agent tasks+AC — folded into Batch A spec §1/§4 (2026-07-09)
- [x] Step 3 ba-agent sign-off — READY, zero open questions (2026-07-09, see spec §7)
- [x] Step 3.5 grill-with-docs — COMPLETE, see spec §8 (2026-07-09)
- [x] Step 4 write-plan — `docs/superpowers/plans/2026-07-09-pet-emr-batch-a.md` (14 tasks: A1-5, B1-5, C1-4) (2026-07-09)
- [x] Step 5 ponytail gate — APPROVE, all 7 criteria pass (10 files/10 not >15, ~350-400 LOC, 0 new deps/endpoints) (2026-07-09)
- [x] Step 6 execute-plan — 14/14 tasks done, TDD, branch feat/pet-emr-batch-a, 850 backend / 168 frontend tests green (2026-07-09)
- [x] Step 7 qa-agent sign-off — APPROVE, 2 findings found+fixed by QA (birthDate pre-pop bug, tiebreak test not actually exercising id DESC), 850/850 backend + 168/168 frontend green post-fix (2026-07-09)
- [x] Step 8 finish-branch — **CORRECTED 2026-07-10**: see Item 1's Step 8 entry for the full correction — PR #14 merged to `main` 2026-07-10, both suites (850 backend / 168 frontend) confirmed green pre-commit and post-merge, HTML docs updated. Protocol 5 smoke walkthrough, see Item 1 for the shared table (performed 2026-07-09, still valid).

---

## Notes on batching

Items 1, 2, 4 all touch overlapping frontend files (`ClinicPets.tsx`, `ClinicEMR.tsx`) and are
small/localized — the orchestrator may run them as one combined brainstorm/BA/grill/plan pass
(one branch, one PR) if `@ba-agent` judges the combined scope still passes the Ponytail Gate
(≤3 subsystems / ≤10 files / ≤500 LOC / ≤3 new endpoints). Item 3 (Inpatient edit/delete) is
larger (new routes + controller + service + repo + frontend UI) and should very likely be its
own branch/PR regardless. Record the actual batching decision made at Step 1 here once decided.
