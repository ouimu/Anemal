# Implementation Plan — Batch A: Pet Edit, Weight↔EMR Sync, Vitals Free-Text Input

> Step 4 (`/superpowers:write-plan`) of the Anemal Standard Pipeline. Source: `docs/superpowers/specs/2026-07-09-pet-emr-batch-a-design.md` (§8 final, grill COMPLETE, zero open findings) + `docs/adr/0008-weight-sync-atomic-update-subquery.md`.
> Next: Step 5 `@ponytail-agent` gate (self-check at bottom) → Step 6 `@dev-agent` `/tdd` execution.
> Each task is 2–5 min, has an exact file path, and a named test. Tests are written first per `/tdd` (red → green).

---

## Task Group A — Item 1: Pet Edit Modal (PETFIX-1)

**Files:** `src/frontend/src/views/clinic/ClinicPets.tsx`, `src/frontend/src/i18n/index.ts`, `src/frontend/src/__tests__/EditPetModal.test.tsx`
**Backend:** zero changes — reuses `PUT /api/pets/:id` + `updatePetSchema` (`pet.service.ts:20-22`) as-is.

### A1. i18n keys (en + th)
- File: `src/frontend/src/i18n/index.ts`
- In the `en: Dict` block (near existing `clinic.pets.editOwner` at line 194), add:
  - `'clinic.pets.editPet': 'Edit Pet'`
  - `'clinic.pets.petUpdated': 'Pet updated'` (optional success toast copy, only if a toast pattern is used elsewhere in this view — otherwise skip, reuse the existing inline-error pattern from `EditOwnerModal`)
- In the `th: Dict` block (near existing `clinic.pets.editOwner` at line 504), add the matching Thai translations:
  - `'clinic.pets.editPet': 'แก้ไขข้อมูลสัตว์เลี้ยง'`
- No test — i18n key presence is exercised indirectly by A4/A5's render assertions and by the existing `ClinicPets.i18n.test.tsx` suite (must stay green).

### A2. `EditPetModal` component — skeleton + pre-population
- File: `src/frontend/src/views/clinic/ClinicPets.tsx`, insert immediately after `AddPetModal` (after line 325, before the `AddVaccinationModal` comment at line 327)
- Signature: `export function EditPetModal({ pet, onClose, onSuccess }: { pet: Pet; onClose: () => void; onSuccess: () => void })`
- Structurally copy `AddPetModal` (lines 205-325): same field set minus `ownerId`/`ownerName` header, same Tailwind classes, same `usePhotoUpload` hook usage.
- Fields (per spec §1, authoritative from `updatePetSchema`): `name*, species, gender, breed, color, weightKg, birthDate, microchipId, photo, allergies, underlyingConditions`. **Do not include `isActive`** (explicitly excluded — separate deactivation scope, spec §1/§6.5).
- `useState` form initialized from `pet` prop (mirror `EditOwnerModal`'s pre-population pattern at lines 121-130):
  ```ts
  const [form, setForm] = useState({
    name: pet.name, species: pet.species, breed: pet.breed ?? '', color: pet.color ?? '',
    gender: pet.gender ?? '', birthDate: pet.birthDate ?? '', weightKg: pet.weightKg?.toString() ?? '',
    microchipId: pet.microchipId ?? '', allergies: pet.allergies ?? '', underlyingConditions: pet.underlyingConditions ?? '',
  })
  const [photoPreview, setPhotoPreview] = useState<string | null>(pet.photoUrl ?? null)
  ```
- Test: `src/frontend/src/__tests__/EditPetModal.test.tsx`, test case `'EditPetModal — pre-population'`:
  ```ts
  it('pre-populates all fields from the pet prop', () => {
    render(<EditPetModal pet={mockPet} onClose={vi.fn()} onSuccess={vi.fn()} />)
    expect(screen.getByDisplayValue('Rex')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument() // weightKg
  })
  ```

### A3. `EditPetModal` — submit handler
- Same file, inside `EditPetModal`, mirror `EditOwnerModal.submit` (lines 137-154): `PUT /api/pets/:id`, optional fields sent as `null` when cleared (matches spec §4 "optional fields cleared → sent as null"), photo re-upload only if a new `photoFile` was chosen (else keep existing `pet.photoUrl`).
  ```ts
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      let photoUrl = pet.photoUrl ?? null
      if (photoFile) photoUrl = await uploadPhoto(photoFile)
      await api.put(`/api/pets/${pet.id}`, {
        name: form.name, species: form.species, breed: form.breed || null, color: form.color || null,
        gender: form.gender || null, birthDate: form.birthDate || null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
        microchipId: form.microchipId || null, allergies: form.allergies || null,
        underlyingConditions: form.underlyingConditions || null, photoUrl,
      })
      onSuccess()
    } catch (err) { setError(...) } finally { setSaving(false) }
  }
  ```
- Test cases in `EditPetModal.test.tsx`:
  - `'submits PUT /api/pets/:id with typed field values'` — type into weight field, click save, assert `putMock` called with `expect.objectContaining({ weightKg: 15 })`.
  - `'sends null for a cleared optional field'` — clear the microchip input, save, assert `microchipId: null` in the PUT body.
  - `'save refreshes detail view'` — assert `onSuccess` callback fires after a successful save (spec §4 "save refreshes detail view").

### A4. Wire edit button into `PetDetail` hero card
- File: `src/frontend/src/views/clinic/ClinicPets.tsx`, inside `PetDetail` (starts line 375), hero card block (lines 392-407)
- Add a pencil/edit icon button next to the pet name, gated by the existing `<Can perm="crm.edit">` pattern already used at line 557 for the pencil button in the owner list:
  ```tsx
  <Can perm="crm.edit">
    <button
      type="button"
      aria-label={t('clinic.pets.editPet')}
      onClick={() => setEditingPet(true)}
      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container-low transition-colors"
    >
      <MaterialIcon name="edit" size={20} className="text-on-surface-variant" />
    </button>
  </Can>
  ```
- Add `const [editingPet, setEditingPet] = useState(false)` to `PetDetail`, and render `{editingPet && pet && <EditPetModal pet={pet} onClose={() => setEditingPet(false)} onSuccess={() => { setEditingPet(false); /* React Query refetch is automatic via invalidation in A5 */ }} />}` near the end of `PetDetail`'s JSX.
- Test (in the same `EditPetModal.test.tsx` or a `PetDetail.editButton.test.tsx`), test case `'edit button — RBAC gating'`:
  - Positive: user context with `crm.edit` renders the edit button (`getByLabelText('Edit Pet')` present).
  - **Negative case (required per skill rule):** user context without `crm.edit` — button absent (`queryByLabelText('Edit Pet')` is `null`). Server-side 403 on `PUT /api/pets/:id` for this case is already covered by existing route/permission tests (spec §4) — this test only proves the UI gate, matching the note "server-side 403 already covered by existing route tests."

### A5. Refetch/invalidate on save
- File: `src/frontend/src/views/clinic/ClinicPets.tsx`, `EditPetModal.submit` (from A3) — after `onSuccess()`, ensure `PetDetail`'s `['pet', petId]` query re-fetches. Since `PetDetail` re-renders and its `useQuery` for `['pet', petId]` is still mounted, add `queryClient.invalidateQueries({ queryKey: ['pet', pet.id] })` inside `EditPetModal.submit`'s try block (needs `const queryClient = useQueryClient()` — import `useQueryClient` from `@tanstack/react-query`, same source already imported for `useQuery` at the top of the file).
- Test case `'photo-change path'` (spec §4): mock `usePhotoUpload().uploadPhoto`, select a new file, save, assert the PUT body's `photoUrl` is the value returned by `uploadPhoto`, not `pet.photoUrl`.

**Task Group A count: 5 tasks (A1–A5), ~7 test cases.**

---

## Task Group B — Item 2: Pet Weight ↔ EMR Sync (PETFIX-2)

**Files:** `src/backend/services/medical-record.service.ts`, `src/backend/services/pet.service.ts`, `src/backend/models/medical-record.repository.ts`, `src/frontend/src/views/clinic/ClinicEMR.tsx`, `src/backend/tests/integration/medical-record-weight-sync.test.ts`

### B1. Validation bounds — `medical-record.service.ts`
- File: `src/backend/services/medical-record.service.ts`, `createMedicalRecordSchema` (lines 5-18)
- Change:
  ```ts
  weightKg:         z.number().positive().max(999.99).optional().nullable(),
  temperatureC:     z.number().min(0).max(999.9).optional().nullable(),
  heartRateBpm:     z.number().int().positive().max(3000).optional().nullable(),
  respRateRpm:      z.number().int().positive().max(3000).optional().nullable(),
  ```
- `updateMedicalRecordSchema` already derives via `.partial().omit(...)` (line 20) — bounds propagate automatically, no separate edit needed.
- Test: `src/backend/tests/integration/medical-record-weight-sync.test.ts` (created in B5), cases `'weightKg 999.99 accepted / 1000 rejected 400'`, `'temperatureC 999.9 accepted / 1000 rejected 400 / -1 rejected 400'`, `'heartRateBpm 3000 accepted / 3001 rejected 400'`, `'respRateRpm 3000 accepted / 3001 rejected 400'`.

### B2. Validation bound — `pet.service.ts`
- File: `src/backend/services/pet.service.ts`, `createPetSchema` (lines 5-18), line 13
- Change: `weightKg: z.number().positive().max(999.99).optional().nullable(),`
- `updatePetSchema` derives via `.partial().omit(...).extend(...)` (line 20) — bound propagates.
- Test: add case `'PUT /api/pets/:id — weightKg 999.99 accepted / 1000 rejected 400'` to the same new test file (B5) or a `pet-weight-bound.test.ts` if kept separate — prefer the same file per spec's "combined batch" framing; name the `describe` block `'Pet weightKg bound'`.

### B3. Atomic transaction rewrite — `medical-record.repository.ts`
- File: `src/backend/models/medical-record.repository.ts`, replace `createRecord` (lines 56-64) and `updateRecord` (lines 66-68)
- Exact shape (per spec §3 / ADR-0008, matching `prescription.repository.ts:36-53`'s guarded-raw-UPDATE convention — parameter-bound, camelCase columns double-quoted):
  ```ts
  async function recomputePetWeight(tx: Prisma.TransactionClient, tenantId: number, petId: number) {
    await tx.$executeRaw`
      UPDATE pets
      SET "weightKg" = (
        SELECT "weightKg" FROM medical_records
        WHERE "tenantId" = ${tenantId} AND "petId" = ${petId} AND "weightKg" IS NOT NULL
        ORDER BY "createdAt" DESC, id DESC LIMIT 1
      )
      WHERE id = ${petId} AND "tenantId" = ${tenantId}
    `
  }

  export function createRecord(tenantId: number, branchId: number | null | undefined, data: CreateMedicalRecordInput) {
    return prisma.$transaction(async (tx) => {
      const record = await tx.medicalRecord.create({
        data: { ...data, tenantId, ...(branchId != null ? { branchId } : {}) },
      })
      if (data.weightKg != null) await recomputePetWeight(tx, tenantId, data.petId)
      return record
    })
  }

  export function updateRecord(tenantId: number, id: number, data: UpdateMedicalRecordInput) {
    return prisma.$transaction(async (tx) => {
      const record = await tx.medicalRecord.update({ where: { id, tenantId }, data })
      if (data.weightKg != null) await recomputePetWeight(tx, tenantId, record.petId)
      return record
    })
  }
  ```
- Import `Prisma` type from `@prisma/client` at the top of the file (`import prisma, { Prisma } from '../config/db'` — confirm `config/db.ts` exports `Prisma`; if not, `import { Prisma } from '@prisma/client'` as a second import line — check the pattern used in `prescription.repository.ts` first since it also uses `tx.$executeRaw`, and match its exact import style instead of guessing).
- Return shape of both functions unchanged (still resolves to the created/updated `MedicalRecord` row) — required by spec §3 "Return shape unchanged" and by `medical-record.controller.ts`'s existing response mapping.
- No changes to `medical-record.service.ts` call sites (`createMedicalRecord`/`updateMedicalRecord` at lines 53-66) — they already just `await recordRepo.createRecord(...)` / `await recordRepo.updateRecord(...)`.
- Tests: see B5 (all Item-2 backend cases exercise this function).

### B4. Frontend double query-invalidation — `ClinicEMR.tsx`
- File: `src/frontend/src/views/clinic/ClinicEMR.tsx`, `saveRecord` (lines 418-439)
- Add `useQueryClient` import (`@tanstack/react-query`, alongside existing `useQuery` import) and `const queryClient = useQueryClient()` near the top of `ClinicEMR` (alongside `const { userId } = useAuthStore()` at line 334).
- After the existing `refetchRecords()` call (line 433), add:
  ```ts
  queryClient.invalidateQueries({ queryKey: ['pet-emr', selectedPetId] })
  queryClient.invalidateQueries({ queryKey: ['pet', selectedPetId] })
  ```
  (Grill finding §8.7 — without the second key, `PetDetail`'s `['pet', petId]` query, `ClinicPets.tsx:379`, shows the stale pre-sync weight.)
- Test: `src/frontend/src/__tests__/ClinicEMR.weightSync.test.tsx`, test case `'saveRecord invalidates both pet-emr and pet query keys'`:
  ```ts
  it('invalidates both pet-emr and pet query keys after save', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    // ...render, select pet, type weight, click Save...
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pet-emr', expect.any(Number)] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['pet', expect.any(Number)] })
    })
  })
  ```

### B5. Backend integration tests — sync policy (new file)
- File: `src/backend/tests/integration/medical-record-weight-sync.test.ts` — follow the `phase4.test.ts` pattern (lines 1-63: `supertest` + live server + `getToken` helper + per-run unique owner/pet via `Date.now()`), scoped to `dev-clinic`/`test-clinic` tenants already seeded (per that file's tokens).
- Test cases (spec §4, exact names):
  1. `'create-with-weight syncs pet.weightKg'`
  2. `'null-weight create leaves pet.weightKg unchanged'`
  3. `'update-latest-record syncs pet.weightKg'`
  4. `'update-older-record-with-newer-weighed-record-present does NOT change pet.weightKg'`
  5. `'update-older-record-when-all-newer-are-weightless DOES correct pet.weightKg (recompute case)'`
  6. `'billed-record edit → 403, pet.weightKg unchanged'` (create a record, pay its invoice via existing invoice flow, attempt `PUT /api/medical-records/:id` with a new weight, assert 403 and pet weight untouched)
  7. `'tenant isolation of the sync query — cross-tenant record never influences another tenant's pet'` (create pet+record in `test-clinic` with the same `petId` shape colliding conceptually with a `dev-clinic` pet; assert `dev-clinic`'s pet weight is unaffected)
  8. `'transaction atomicity — forced failure rolls back both writes'` (simplest reliable trigger: send a payload that fails the record write inside the transaction, e.g. an FK violation via a nonexistent `doctorId` — assert neither the record nor the pet weight persisted; if no clean failure trigger exists at the service layer, this case may instead assert atomicity indirectly by asserting record-creation failure via schema validation never reaches the repository — confirm the simplest valid failure path with `@db-agent`/`@qa-agent` during Step 6/7 if the FK route proves awkward)
  9. `'weight-corrected-to-null on latest record leaves pet.weightKg unchanged (documented staleness, spec §8.3)'`
  10. `'two records with identical createdAt resolve deterministically by id DESC'` (construct via direct Prisma seed in the test's `beforeAll`, not via the API, since `createdAt` collision isn't reliably producible through two sequential HTTP calls)
- Regression: full existing suite (835 backend / 143 frontend) must stay green — run at Step 7, not part of this task group's own test count.

**Task Group B count: 5 tasks (B1–B5), ~15 test cases (4 bound + 1 pet-bound + 10 sync/isolation/atomicity).**

---

## Task Group C — Item 4: Vitals Free-Text Input (PETFIX-4)

**Files:** `src/frontend/src/views/clinic/ClinicEMR.tsx`, `src/frontend/src/__tests__/VitalStepper.test.tsx`

### C1. `VitalStepper` rework — numeric `<input>` alongside +/- buttons
- File: `src/frontend/src/views/clinic/ClinicEMR.tsx`, replace the `<span>` display at lines 134-152 with a controlled `<input type="number">`, keeping the existing dec/inc buttons.
- Add `max` prop (mirrors backend bounds from B1): `VitalStepper` signature becomes `{ label, unit, value, onChange, step = 0.1, min = 0, max }: { ...; max?: number }`.
- Call sites (lines 544-547) get explicit `max` matching B1's bounds:
  ```tsx
  <VitalStepper label={t('clinic.emr.weight')} unit="kg" value={weightKg} onChange={setWeightKg} step={0.1} max={999.99} />
  <VitalStepper label={t('clinic.emr.temperature')} unit="°C" value={tempC} onChange={setTempC} step={0.1} max={999.9} />
  <VitalStepper label="Heart Rate" unit="bpm" value={heartRate} onChange={setHeartRate} step={1} min={1} max={3000} />
  <VitalStepper label="Resp Rate" unit="rpm" value={respRate} onChange={setRespRate} step={1} min={1} max={3000} />
  ```
- Local input state: keep a local `string` draft state inside `VitalStepper` (`const [draft, setDraft] = useState(value?.toString() ?? '')`) so the user can type freely without every keystroke round-tripping through the parent's numeric `value`; sync `draft` from `value` via `useEffect` only when `value` changes externally (e.g. +/- button clicks), not on every render.
- Test: `src/frontend/src/__tests__/VitalStepper.test.tsx`, case `'renders a number input with the correct value'`.

### C2. Commit logic — idempotent parse/round/clamp on blur + Enter
- Same file, same component. Implement a single pure `commit` function called from both `onBlur` and `onKeyDown` (Enter):
  ```ts
  const commit = () => {
    const raw = inputRef.current?.valueAsNumber
    if (raw === undefined || Number.isNaN(raw)) { onChange(null); setDraft(''); return }
    let rounded = Math.round(raw / step) * step
    rounded = Math.round(rounded * 100) / 100 // avoid float drift, then re-check bound
    if (rounded <= 0) { onChange(null); setDraft(''); return }
    if (max !== undefined && rounded > max) rounded = max
    onChange(rounded)
    setDraft(rounded.toString())
  }
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }
  const onWheel = () => inputRef.current?.blur()
  ```
  - Idempotency: `commit` reads only from the DOM input's current value (`valueAsNumber`) and writes `draft` to the resolved value — a second call (the blur that follows a committed Enter) reads the same already-normalized value and produces the same result, no double-apply (spec §1/§8.6).
  - `<input ref={inputRef} type="number" step={step} min={min} max={max} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKeyDown} onWheel={onWheel} className="... text-center ..." aria-label={label} />` — replaces the dec/inc buttons' target `<span>`; buttons now call `onChange` directly as today (lines 138-139 logic unchanged, but also update `draft` after).
- Test cases in `VitalStepper.test.tsx`:
  - `'typed decimal commits on blur'` — type "12.34", blur, assert `onChange` called with `12.3` (rounded to 0.1 step) — adjust expected value to match actual step arithmetic used.
  - `'typed integer commits for HR/RR (step=1)'`
  - `'empty input commits null'`
  - `'letters ignored by type=number, invalid → null'`
  - `'negative value → null'`
  - `'zero → null'`
  - `'over-max value clamped to max'` — type "5000" on the HR field (`max=3000`), blur, assert `onChange(3000)`.
  - `'leading zeros parse correctly'` — type "007.5", blur, assert `onChange(7.5)`.
  - `'scientific notation commits via valueAsNumber then clamps'` — type "1e2", blur, assert `onChange(100)`.
  - `'sub-step rounding to 0 becomes null'` — e.g. typed value rounds to 0.0 at the given step, assert `onChange(null)`.
  - `'Enter commits and does not submit an enclosing form'` — wrap in a `<form onSubmit={submitSpy}>`, press Enter in the input, assert `onChange` called once and `submitSpy` NOT called.
  - `'Enter followed by the blur it triggers commits exactly once'` — press Enter (commit fires), then fire blur, assert `onChange` called exactly once with the same value (idempotency, spec §8.6) — implement by checking call count, not just final value.
  - `'onWheel blurs the input'` — fire a wheel event, assert the input loses focus (`document.activeElement !== input`).

### C3. +/- buttons still work after typing
- No code change beyond C1/C2 — buttons call `onChange` with the existing rounding logic (lines 138-139), and `draft` re-syncs from the external `value` via the `useEffect` from C1.
- Test: `'typing a value then clicking + increments from the typed value, not a stale one'` — type "10", blur (commits 10), click "+", assert `onChange` called with `10.1` (weight, step 0.1).

### C4. Save-path integration (no VitalStepper change, verifies wiring)
- Test only, in `VitalStepper.test.tsx` or a `ClinicEMR.vitals.test.tsx`: `'save sends the typed value'` — render enough of `ClinicEMR` (or a thin wrapper) to type a vitals value, trigger save, and assert the POST/PUT body carries the typed-then-committed number. If mounting full `ClinicEMR` is too heavy for this test, this case may assert at the `VitalStepper` + parent `useState` boundary instead (i.e., `onChange` was called with the correct value, which is what feeds `body.weightKg` in `saveRecord`) — acceptable per spec §4's intent, confirm exact mounting approach with `@qa-agent` at Step 7 if ambiguous.

**Task Group C count: 4 tasks (C1–C4), ~14 test cases.**

---

## Cross-cutting

### D1. Regression gate
- Run full suite after all tasks: backend (835+ tests) and frontend (143+ tests) must stay green. Not a new task — verification step owned by `@qa-agent` at Step 7 (`/code-review`), not part of `/execute-plan`'s per-task loop.

---

## Ponytail self-check (Step 5 gate — restating spec §5)

| Criterion | Threshold | This plan |
|---|---|---|
| Subsystems | ≤3 | 2 (frontend views + backend medical-record module) + i18n |
| Files touched | ≤15 (new), ≤10 typical | ~8: `ClinicPets.tsx`, `ClinicEMR.tsx`, `medical-record.repository.ts`, `medical-record.service.ts`, `pet.service.ts`, `i18n/index.ts`, + 4 new test files (`EditPetModal.test.tsx`, `ClinicEMR.weightSync.test.tsx`, `VitalStepper.test.tsx`, `medical-record-weight-sync.test.ts`) |
| LOC estimate | ≤500 | ~350-400 incl. tests |
| New endpoints | ≤3 | 0 |
| New dependencies | ≤5 | 0 |
| New files | ≤15 | 4 (all test files — no new production files; `EditPetModal` is a new export inside the existing `ClinicPets.tsx`) |
| Over-engineering / duplication / existing-solution-ignored | none | All three items reuse existing patterns: `EditOwnerModal`/`AddPetModal` structure (A), `prescription.repository.ts`'s guarded-raw-UPDATE-in-`$transaction` convention (B3), and the existing +/- `VitalStepper` shell (C) — no new abstraction introduced |

Item 3 (Inpatient) remains out of scope for this batch (spec §5), tracked separately.

**Total: 14 implementation/test tasks across 3 groups (A: 5, B: 5, C: 4) + 1 cross-cutting regression gate.**
