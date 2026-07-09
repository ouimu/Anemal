# Design Spec — Batch A: Pet Edit, Weight↔EMR Sync, Vitals Free-Text Input

> Steps 1 (brainstorm) + 3 (BA sign-off) combined, per CLAUDE.md Standard Pipeline.
> Orchestration: fully-autonomous run (user kritsapon, pre-authorized 2026-07-09 — see
> `.claude/roadmap/ACTIVE/pet-emr-inpatient-fixes.md` header). No human present in this
> session; all judgment calls normally routed to a human were made by `@ba-agent` (fable
> model, this project's designated "think + decide" agent per the Agent Router table), with
> rationale logged in §6 below as the audit trail, per the explicit autonomy authorization.
> Source items: `.claude/roadmap/ACTIVE/pet-emr-inpatient-fixes.md` Items 1, 2, 4 (batched
> per that file's "Notes on batching" section — overlapping frontend files, small scope).

## 0. Scouting-note verification

| Claim | Verdict |
|---|---|
| Item 1 backend fully wired: `PUT /:id` → `crm.edit` → `validate(updatePetSchema)` (`pet.routes.ts:14`) | Confirmed |
| Item 1 gap 100% frontend; `PetDetail` read-only (`ClinicPets.tsx:375-495`) | Confirmed |
| "Mirror OwnerPanel edit pattern" | Confirmed, refined: pattern is `EditOwnerModal` (`ClinicPets.tsx:119-202`) launched from a `crm.edit`-gated pencil button (`:557-561`); for field layout, `AddPetModal` (`:205-325`) is the closer template — already has every pet field incl. photo upload |
| Item 1 field list | Corrected. Authoritative list from `updatePetSchema` (`pet.service.ts:20-22`): `name, species, breed, color, birthDate, gender, weightKg, microchipId, photoUrl, allergies, underlyingConditions, isActive`. No `notes` field exists on Pet; "sex" is `gender` enum. Scouting note omitted `microchipId`, `photoUrl`, `allergies`, `underlyingConditions`. No schema change needed. |
| Item 2: `Pet.weightKg` / `MedicalRecord.weightKg` fully disconnected | Confirmed — no propagation in `medical-record.service.ts:53-66` nor `medical-record.repository.ts` |
| Item 4: `VitalStepper` renders `<span>` (`ClinicEMR.tsx:146`), buttons 145/147, used 544-547, state 348-351 | Confirmed |

**Additional facts discovered (material to design):**
- `updateMedicalRecord` blocks edits on billed records (`medical-record.service.ts:62-63`, paid invoice → 403). Weight sync inherits this guard for free.
- `MedicalRecord` has no visit-date field — `createdAt` is the only chronology and is immutable on update, so "latest visit" is statically determined.
- `$transaction` precedent lives in the repository layer across the codebase (blood-bank, prescription, product, invoice, user repositories).
- No max-bound validation exists on EMR vitals today (`weightKg z.number().positive()`, `temperatureC z.number()` unbounded, HR/RR `int().positive()`). A typed value could overflow `Decimal(5,2)`/`Decimal(4,1)` columns and 500 — becomes reachable once item 4 allows typing.

## 1. Confirmed scope

**Item 1 — Pet edit (PETFIX-1).** New `EditPetModal` in `ClinicPets.tsx`, structurally copied from `AddPetModal`, pre-populated like `EditOwnerModal`, submitting `PUT /api/pets/:id`. Edit button in `PetDetail` hero card gated by `<Can perm="crm.edit">`. Fields: name*, species*, gender, breed, color, weightKg, birthDate, microchipId, photo, allergies, underlyingConditions. `isActive` excluded (pet deactivation is separate, unrequested scope). Zero backend changes.

**Item 2 — Pet weight ↔ EMR sync (PETFIX-2).** Business rule: `Pet.weightKg` = weight of the pet's chronologically latest medical record that has a non-null weight. Implemented in `medical-record.repository.ts` `createRecord`/`updateRecord`, wrapped in `prisma.$transaction`. Zero new endpoints.

**Item 4 — Vitals free-text input (PETFIX-4).** `VitalStepper` `<span>` becomes an `<input type="number">` (decimal for weight/temp, integer step for HR/RR) while keeping the existing +/- buttons. Commit on blur/Enter: empty/NaN/≤0 → null; round to step precision; clamp to max.

## 2. Design decisions

**2.1 Sync policy — recompute-last-known-weight, triggered by non-null weight writes.** On any `createMedicalRecord`/`updateMedicalRecord` call whose payload has a non-null `weightKg`, recompute inside the transaction: query the pet's latest record with `weightKg != null` (tenant-scoped, `orderBy createdAt desc, id desc`), set `Pet.weightKg` to that value. Null/omitted weight never triggers sync and never clears the pet's weight. This correctly self-heals retroactive typo-corrections on older records (a naive "only if this record is latest" rule would miss that case) at equal implementation cost. Manual pet-profile weight edits (item 1) remain allowed for front-desk weigh-ins; next EMR save with a weight overwrites per "last measured wins."

**2.2 Same transaction — yes.** Record write + pet update in one `prisma.$transaction`, matching the established repository-layer pattern. Prevents "record saved, pet weight stale" on partial failure.

**2.3 Validation bounds — DB-capacity max only, no invented clinical ranges.** `weightKg .max(999.99)` (createMedicalRecordSchema and, for parity, pet create/update schemas), `temperatureC .max(999.9)/.min(0)` — prevents Decimal overflow → 500. HR/RR left unbounded (Int column, feline HR can legitimately exceed 300 bpm; no overflow risk). Frontend mirrors these as input min/max.

**2.4 `updatePetSchema`/`PUT /api/pets/:id` reused as-is** — already covers every field needed for item 1.

## 3. Architecture

| Item | Layer | Change |
|---|---|---|
| 1 | Frontend only | `EditPetModal` + gated button in `PetDetail`; i18n keys (en+th) |
| 2 | Repository | `medical-record.repository.ts` `createRecord`/`updateRecord` → `$transaction(record write → conditional latest-with-weight query → tx.pet.update)`, tenant-scoped throughout. Service layer unchanged except schema bounds (2.3); billed-record guard still runs pre-repo-call. |
| 2 | Frontend | `ClinicEMR.saveRecord` adds `invalidateQueries(['pet-emr', petId])` |
| 4 | Frontend only | `VitalStepper` internal rework; call-site props unchanged |

No new RBAC permission codes. Item 1 rides existing `crm.edit`; item 2 rides existing `emr.create`/`emr.edit`; item 4 is UI-only. No route added without a permission (none introduced at all).

## 4. Testing approach (Step 7 QA scope)

**Item 2 (backend):** create-with-weight syncs pet; null-weight save leaves pet unchanged; update-latest-record syncs; update-older-record-with-newer-weighed-record-present does NOT change pet; update-older-record-when-all-newer-are-weightless DOES correct pet (recompute case); billed-record edit → 403, pet unchanged; tenant isolation of the sync query; transaction atomicity (forced failure rolls back both writes); 999.99kg accepted / 1000kg → 400 not 500 (same for temp bound); no delete/void route exists for medical records today (confirmed — GET/POST/PUT only), so no delete-sync case is in scope.

**Item 4 (frontend):** typed decimals/integers commit correctly; letters/empty/negative/0 → null; over-max clamped/rejected; +/- buttons still work after typing; save sends the typed value; correct rounding precision.

**Item 1 (frontend):** modal pre-populates all fields; optional fields cleared → sent as null; save refreshes detail view; user without `crm.edit` sees no button (server-side 403 already covered by existing route tests); photo-change path.

**Regression:** full existing suite (835 backend / 143 frontend at time of writing) must stay green; `createRecord`/`updateRecord` return shape unchanged.

## 5. Ponytail-gate self-check

Subsystems: 2 (frontend views + backend medical-record module) + i18n — ≤3. Files touched: ~8 (`ClinicPets.tsx`, `ClinicEMR.tsx`, `medical-record.repository.ts`, `medical-record.service.ts`, `pet.service.ts`, i18n en+th, 1-2 test files) — ≤10/≤15. LOC estimate ~350-400 incl. tests — ≤500. New endpoints: 0 — ≤3. New dependencies: 0 — ≤5. All reuse existing endpoint/schema/modal/transaction patterns — no over-engineering, no duplication, no reinvented existing solution.

Item 3 (Inpatient) is explicitly excluded from this batch and will run as its own branch/PR (confirmed by tracker's batching note and endorsed here — larger surface: new routes/controller/service/repo/UI).

## 6. Judgment calls made in place of a human (audit trail)

1. Sync policy = recompute-from-latest, non-null-trigger — matches clinic intuition ("most recent measured weight is current"), self-heals retroactive corrections, no extra cost vs. the naive rule.
2. Null weight never clears `Pet.weightKg` — a weight-less visit doesn't make weight unknown.
3. Sync lives in repository-layer transaction, not service — matches 16 existing call sites using this pattern.
4. Manual pet-profile weight edits remain allowed — front-desk weigh-ins are a real workflow; "last measured wins" on next EMR save is correct precedence.
5. Field list corrected to schema authority; no invented `notes` field; `isActive` excluded from edit modal (deactivation is separate scope, not smuggled in).
6. Photo change included in `EditPetModal` — near-free copy of existing `AddPetModal` block + existing `usePhotoUpload` hook.
7. Validation bounds = DB-capacity only (999.99kg / 999.9°C) — this is an overflow-defect fix, not invented clinical-range policy (species-dependent ranges are unrequested, backlog candidate).
8. HR/RR left unbounded — Int column has no overflow risk; feline HR can legitimately exceed 300 bpm.
9. Batch A = one branch/PR for items 1+2+4 — overlapping files, combined scope passes every Ponytail threshold; separate PRs would triple pipeline overhead for no risk reduction.
10. Accepted risk: concurrent EMR saves may briefly race the recompute under read-committed isolation; converges to the last-committed transaction's view. Negligible at single-clinic load — documented for QA rather than adding locking.

## 7. Sign-off

**BA sign-off: READY — zero open questions.** Definition of Ready met: objective, actors/roles (`crm.edit`, `emr.create`, `emr.edit` — all existing), business rules, exceptions (billed-record guard, null-weight, retro-edits, tenant isolation), NFR impact (one extra indexed query + one row update per weighed save — negligible), testable acceptance criteria (§4), risks/dependencies (§6.10) all recorded. Nothing requires a human; no external credentials involved.

**Key files:**
- `src/frontend/src/views/clinic/ClinicPets.tsx`
- `src/frontend/src/views/clinic/ClinicEMR.tsx`
- `src/backend/models/medical-record.repository.ts`
- `src/backend/services/medical-record.service.ts`
- `src/backend/services/pet.service.ts`
