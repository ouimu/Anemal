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

**Item 4 — Vitals free-text input (PETFIX-4).** `VitalStepper` `<span>` becomes an `<input type="number">` (decimal for weight/temp, integer step for HR/RR) while keeping the existing +/- buttons. Commit on blur/Enter: parse via `valueAsNumber`; empty/NaN/≤0 → null; round to step precision (then re-apply ≤0 → null, so e.g. 0.04 rounding to 0.0 becomes null, not zero); clamp to max. Commit must be idempotent (pure function of current input string — Enter followed by the blur it causes yields the same committed value, no double-apply). Enter calls `preventDefault()` (must not submit any enclosing form). `onWheel` blurs the input (standard guard against accidental scroll-wheel value changes on a focused number input). Scientific notation ("1e2") parses to a number via `valueAsNumber` and goes through the same round/clamp path — no special handling. Comma-as-decimal-separator is not supported by `type="number"` in most browsers (keystroke ignored); accepted — Thailand uses the dot separator (§8.6).

## 2. Design decisions

**2.1 Sync policy — recompute-last-known-weight, triggered by non-null weight writes.** On any `createMedicalRecord`/`updateMedicalRecord` call whose payload has a non-null `weightKg`, recompute inside the transaction: query the pet's latest record with `weightKg != null` (tenant-scoped, `orderBy createdAt desc, id desc`), set `Pet.weightKg` to that value. Null/omitted weight never triggers sync and never clears the pet's weight. This correctly self-heals retroactive typo-corrections on older records (a naive "only if this record is latest" rule would miss that case) at equal implementation cost. Manual pet-profile weight edits (item 1) remain allowed for front-desk weigh-ins; next EMR save with a weight overwrites per "last measured wins."

**2.2 Same transaction — yes, single atomic UPDATE as the concurrency control (corrected at Step 3.5 grill, §8.1).** Record write + pet update in one `prisma.$transaction`. The pet-weight recompute is one guarded raw `tx.$executeRaw` UPDATE with the latest-non-null-weight subquery inline (exact SQL in §3) — not a separate read-then-write, and not a `SELECT ... FOR UPDATE` pessimistic lock (that precedent was mis-cited in an earlier draft of §6.10; verified against `prescription.repository.ts:35-54`, which itself uses a guarded raw UPDATE with an `affected === 0` check, not a lock). A single UPDATE statement is atomic under Postgres MVCC — there is no separate lock-acquisition step, so nothing is held across statements and nothing can deadlock against it (§8.11). Prevents "record saved, pet weight stale" on partial failure (rollback covers both writes together). Residual concurrent-save anomaly analysed and accepted in §8.1.

**2.3 Validation bounds — DB-capacity max only, no invented clinical ranges.** `weightKg .max(999.99)` (createMedicalRecordSchema and, for parity, pet create/update schemas), `temperatureC .max(999.9)/.min(0)` — prevents Decimal overflow → 500. HR/RR left unbounded (Int column, feline HR can legitimately exceed 300 bpm; no overflow risk). Frontend mirrors these as input min/max. **Added at Step 3.5 grill (§8.12):** `heartRateBpm`/`respRateRpm` also get `.max(3000)` — not a clinical ceiling (no real animal approaches it), purely an overflow guard against a pasted 10+-digit value hitting the Postgres `Int` column's ±2.1B range now that item 4 allows free-text paste; the bound is picked far above any physiological reading, preserving the "no invented clinical range" spirit of this decision.

**2.4 `updatePetSchema`/`PUT /api/pets/:id` reused as-is** — already covers every field needed for item 1.

## 3. Architecture

| Item | Layer | Change |
|---|---|---|
| 1 | Frontend only | `EditPetModal` + gated button in `PetDetail`; i18n keys (en+th) |
| 2 | Repository | `medical-record.repository.ts` `createRecord`/`updateRecord` → `prisma.$transaction(async tx => { record write; if (payload weightKg != null) recompute })` where the recompute is ONE guarded raw statement via `tx.$executeRaw` (camelCase columns double-quoted per project rule):<br>`UPDATE pets SET "weightKg" = (SELECT "weightKg" FROM medical_records WHERE "tenantId" = $tenantId AND "petId" = $petId AND "weightKg" IS NOT NULL ORDER BY "createdAt" DESC, id DESC LIMIT 1) WHERE id = $petId AND "tenantId" = $tenantId`<br>Single-statement atomic UPDATE — no `SELECT ... FOR UPDATE`, matching the `prescription.repository.ts:35-54` guarded-raw-UPDATE convention. Tenant-scoped in both the subquery and the outer WHERE. Service layer unchanged except schema bounds (2.3); billed-record guard still runs pre-repo-call. Return shape of `createRecord`/`updateRecord` unchanged. |
| 2 | Frontend | `ClinicEMR.saveRecord` adds `invalidateQueries(['pet-emr', petId])` AND `invalidateQueries(['pet', petId])` — the latter is the `PetDetail` query key (`ClinicPets.tsx:379`); without it the pet profile keeps showing the stale pre-sync weight |
| 4 | Frontend only | `VitalStepper` internal rework; call-site props unchanged |

No new RBAC permission codes. Item 1 rides existing `crm.edit`; item 2 rides existing `emr.create`/`emr.edit`; item 4 is UI-only. No route added without a permission (none introduced at all).

## 4. Testing approach (Step 7 QA scope)

**Item 2 (backend):** create-with-weight syncs pet; null-weight save leaves pet unchanged; update-latest-record syncs; update-older-record-with-newer-weighed-record-present does NOT change pet; update-older-record-when-all-newer-are-weightless DOES correct pet (recompute case); billed-record edit → 403, pet unchanged; tenant isolation of the sync query; transaction atomicity (forced failure rolls back both writes); 999.99kg accepted / 1000kg → 400 not 500 (same for temp bound); no delete/void route exists for medical records today (confirmed — GET/POST/PUT only), so no delete-sync case is in scope.

**Item 4 (frontend):** typed decimals/integers commit correctly; letters/empty/negative/0 → null; over-max clamped/rejected; +/- buttons still work after typing; save sends the typed value; correct rounding precision; leading zeros ("007.5") parse to 7.5; scientific notation ("1e2") commits as 100 then clamps; sub-step value rounding to 0 → null; Enter-then-blur commits once (idempotent, no double-apply); Enter does not submit an enclosing form.

**Item 4 additions (backend, grill-surfaced, §8.12):** pasted 10+-digit heart-rate/resp-rate value → 400 (rejected by `.max(3000)`), not 500 (Postgres `Int` overflow); boundary case at 3000/3001.

**Item 2 additions (backend, grill-surfaced):** recompute SQL parameterised (no string interpolation) and tenant-scoped in BOTH subquery and outer WHERE — cross-tenant record with same petId-shaped data must never influence another tenant's pet; two records with identical `createdAt` resolve deterministically by `id DESC`; update that sets the latest record's weight to null leaves `Pet.weightKg` unchanged (documented staleness, §8.3).

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
8. ~~HR/RR left unbounded — Int column has no overflow risk; feline HR can legitimately exceed 300 bpm.~~ — **PARTIALLY RETRACTED at Step 3.5 grill.** Clinical-range reasoning still holds (no invented species-dependent cap). But "no overflow risk" was wrong once item 4 turns the field into free-text paste input: Postgres `Int` is 4-byte (±2.1B) and a pasted 10+-digit value is still `z.number().int().positive()`-valid yet overflows the column → 500. See §8.12 — a generous overflow-guard max (not a clinical ceiling) is now required on `heartRateBpm`/`respRateRpm`.
9. Batch A = one branch/PR for items 1+2+4 — overlapping files, combined scope passes every Ponytail threshold; separate PRs would triple pipeline overhead for no risk reduction.
10. ~~Accepted risk: concurrent EMR saves may briefly race the recompute under read-committed isolation~~ — **RETRACTED at Step 3.5 grill, then re-corrected at the same grill.** The race is real, but the earlier retraction miscited the codebase precedent: `prescription.repository.ts:35-54` does NOT use `SELECT ... FOR UPDATE` — it uses a single guarded raw `UPDATE ... WHERE ... AND stock >= :n` inside `$transaction`, checking `affected === 0`. The correct fix here is the same convention: one atomic `UPDATE pets SET "weightKg" = (subquery for latest non-null record weight) WHERE id AND "tenantId"` via `tx.$executeRaw` (exact SQL in §3). A single statement is atomic in Postgres (consistent statement snapshot for the subquery), needs no pessimistic lock, and matches the codebase pattern. Residual anomaly analysed and accepted in §8.1.

## 7. Sign-off

**BA sign-off: READY — zero open questions.** Definition of Ready met: objective, actors/roles (`crm.edit`, `emr.create`, `emr.edit` — all existing), business rules, exceptions (billed-record guard, null-weight, retro-edits, tenant isolation), NFR impact (one extra indexed query + one row update per weighed save — negligible), testable acceptance criteria (§4), risks/dependencies (§6.10) all recorded. Nothing requires a human; no external credentials involved.

**Key files:**
- `src/frontend/src/views/clinic/ClinicPets.tsx`
- `src/frontend/src/views/clinic/ClinicEMR.tsx`
- `src/backend/models/medical-record.repository.ts`
- `src/backend/services/medical-record.service.ts`
- `src/backend/services/pet.service.ts`

## 8. Step 3.5 grill findings (autonomous run — decisions by designated think+decide agent, rationale inline)

1. **Concurrency fix corrected — atomic UPDATE, not FOR UPDATE.** The pre-grill §6.10 retraction claimed `prescription.repository.ts:35-54` establishes a pessimistic `FOR UPDATE` precedent. Verified against source: it does not — it is a single guarded raw `UPDATE` inside `$transaction` with an `affected === 0` check. Design corrected to the same shape: one `tx.$executeRaw` UPDATE with the latest-weight subquery inline (§3). Simpler, lock-free, codebase-conventional, and atomic per statement. **Residual anomaly, analysed and accepted:** two near-simultaneous weighed saves for the same pet serialize on the pet-row write lock; under READ COMMITTED the waiter's subquery keeps its statement snapshot, so the loser may not see the winner's just-committed record and the final `Pet.weightKg` can reflect either of the two ~simultaneous measurements. Impact: millisecond-window ambiguity between two weigh-ins of the same animal taken at the same moment — clinically indistinguishable values — and the recompute policy self-heals on the next weighed save. A `SERIALIZABLE`/`FOR UPDATE`-based total fix would add retry machinery for zero clinical benefit; rejected per Ponytail.
2. **Tenant isolation of the raw SQL made explicit.** The recompute statement carries `"tenantId"` in both the subquery and the outer `WHERE`, uses Prisma parameter binding (never interpolation), and double-quotes camelCase columns (known 42703 pitfall in this codebase). QA case added (§4). No other new/changed query exists in this batch; item 1 reuses the already-tenant-scoped `PUT /api/pets/:id`.
3. **Weight-corrected-to-null edge — recompute deliberately NOT triggered.** If a user edits the latest record's weight from a value to null, `Pet.weightKg` retains the old value (stale until the next weighed save). Alternative (recompute on null-writes, falling back to an older record) was rejected: it would clobber manual front-desk weigh-ins entered after that older record (§6.4 workflow), a worse failure than transient staleness on a rare correction path. Documented as accepted behaviour with QA case.
4. **Zero-records / first-record edge cases hold by construction.** Recompute only fires on a non-null weight write, and that record is visible inside its own transaction, so the subquery can never return NULL when triggered; a pet with no medical records is never touched. First-ever weighed record syncs correctly. Identical `createdAt` resolved by the existing `id DESC` tiebreak (cuid ids — deterministic; roughly time-ordered).
5. **No delete/void path — confirmed non-case.** `MedicalRecord` has no `deletedAt`/void field in `schema.prisma` and no DELETE route exists; "recompute after record deletion" is out of scope by fact, not by choice.
6. **Vitals input hardening (frontend).** Commit made idempotent (Enter→blur double-fire commits once); Enter `preventDefault()`; `onWheel` blur guard; round-then-recheck ≤0 → null; scientific notation and leading zeros flow through `valueAsNumber` normally; paste of non-numeric text yields empty `valueAsNumber` NaN → null. Comma decimal separator unsupported by `type="number"` — accepted rather than switching to `type="text" inputMode="decimal"` + custom parsing, because Thailand (and the en locale) uses the dot separator and the custom-parse path would add code for a locale the product doesn't serve. Backlog note if the product ever localises to a comma-decimal market.
7. **Stale pet weight in UI after EMR save.** `invalidateQueries(['pet-emr', petId])` alone leaves `PetDetail` (`['pet', petId]`, `ClinicPets.tsx:379`) showing the pre-sync weight. Fixed: both keys invalidated (§3).
8. **RBAC re-verified — no new surface.** Zero new endpoints; edit-pet button UI-gated by `crm.edit` with the server already enforcing it on `PUT /api/pets/:id` (UI gating is UX only, server remains the boundary); weight sync executes inside existing `emr.create`/`emr.edit`-guarded routes; no plane crossing; deny-by-default unchanged.
9. **Validation bounds re-verified against Decimal precision.** `weightKg ≤ 999.99` matches `Decimal(5,2)`; `temperatureC` 0–999.9 matches `Decimal(4,1)`; excess fractional digits (e.g. 12.345) round silently at the Postgres `numeric` layer and the frontend rounds to step precision first — no overflow path remains. HR/RR stay unbounded (Int column, no overflow risk, legitimate feline HR > 300).
10. **Transaction failure semantics.** Any failure of either statement rolls back both (interactive `$transaction`); a recompute affecting 0 rows (pet row absent — not currently reachable, pets are soft-deactivated only) is not an error and must not fail the save. QA atomicity case already in §4.
11. **Deadlock risk / lock ordering — checked, not an issue, because no lock is acquired.** §8.1's corrected design uses one atomic `tx.$executeRaw` UPDATE, not `SELECT ... FOR UPDATE`; there is no separate lock-then-write sequence for another transaction to interleave with, so classic deadlock (two transactions each holding a resource the other wants, acquired in opposite order) cannot occur — a deadlock needs ≥2 locks held simultaneously by the same transaction, and this design never holds one. Cross-checked the rest of the codebase for anything else that locks `pets` rows: `pet.repository.ts:65` `updatePet()` (item 1's own `PUT /api/pets/:id` edit path) is the only other writer, and it's a single-statement `prisma.pet.update` outside any `$transaction` — a lone auto-committed statement also can't participate in a lock-ordering deadlock for the same reason. It can, briefly, block behind this recompute's row-level write lock if the two happen to collide on the same pet at the same instant (ordinary Postgres single-row write serialization, not a deadlock — it resolves as soon as the recompute's UPDATE commits, sub-millisecond in practice). No other repository (`blood-bank`, `hospitalization`, `vaccination`, `owner`, etc.) touches the `pets` table inside a `$transaction` at all. Conclusion: zero deadlock surface introduced by this batch.
12. **Vitals huge-number paste on HR/RR — Int32 overflow, previously missed.** §6.8's "no overflow risk" call was scoped to clinical plausibility of the stepper's ±1 increments and didn't re-examine the column type once item 4 opens free-text paste. `heartRateBpm`/`respRateRpm` are plain Postgres `Int` (`schema.prisma:343-344`, 4-byte, range ±2,147,483,647), and `z.number().int().positive()` has no upper bound — a pasted value like `99999999999` (11 digits) is schema-valid but exceeds the column's range, throwing a Postgres numeric-overflow error (SQLSTATE 22003) on write, surfacing as an uncaught 500. This is the identical overflow-defect class §2.3 already fixed for `weightKg`/`temperatureC` (Decimal columns) — just not re-checked against the Int columns when the input surface changed from stepper-only to free-text. **Resolution:** add `.max(3000)` to both fields in `createMedicalRecordSchema` (§2.3) — a bound far above any real physiological reading (chosen purely to reject overflow/garbage input, not to impose a clinical ceiling, consistent with the "DB-capacity, no invented clinical range" policy already governing weight/temperature). Frontend mirrors it as the input's `max` attribute so the existing "clamp to max" commit path (§1) handles it identically to weight/temperature — no new frontend logic needed. Not implemented in this design-only pass; captured here for Step 4 write-plan.

**Step 3.5 grill: COMPLETE — all findings resolved, zero open items.**
