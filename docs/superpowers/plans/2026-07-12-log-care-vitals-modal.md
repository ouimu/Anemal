# Plan — Log Care modal vitals/nursing fields (Step 4 write-plan)

Branch: `fix/log-care-vitals-modal`
Refs: `2026-07-12-log-care-vitals-modal-brainstorm.md`, `-tasks.md` (LC-1..LC-7, amended per BA
C1/C2 and grill F1-F6), `-ba-signoff.md`, `-grill.md`.
BA sign-off: GRANTED (conditional, C1/C2 applied). Grill: 6 findings (F1-F6), all resolved.

Scope: frontend-only production code + one backend test-only addition (LC-7). No backend
production file, no new endpoint, no new dependency, no migration. Files touched:
- `src/frontend/src/components/VitalStepper.tsx` (new)
- `src/frontend/src/views/clinic/ClinicEMR.tsx` (edit: remove local def, import shared)
- `src/frontend/src/views/clinic/ClinicInpatient.tsx` (edit: CareModal)
- `src/frontend/src/__tests__/VitalStepper.test.tsx` (edit: import path)
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx` (edit: extend + fix one existing assertion)
- `src/backend/tests/integration/phase4.test.ts` (edit: extend one existing test payload)

7 files total (well under Ponytail's 15-file / 3-subsystem ceiling), 0 new deps, 0 new endpoints.

---

## Task 1 — Create `src/frontend/src/components/VitalStepper.tsx` (~4 min)

Cut the `VitalStepper` function (and its doc comment) from `ClinicEMR.tsx:134-207` verbatim into
a new file. Needs its own imports: `import { useState, useRef, useEffect } from 'react'` (check
exact React import style used elsewhere in `components/`, e.g. `MaterialIcon.tsx`, and match it).
Export as `export function VitalStepper(...)` — named export, no default, no re-export shim left
behind anywhere.

Test-first: run `npm test -- VitalStepper` in `src/frontend` before touching anything — it should
currently pass against the old import. This is the baseline to diff against after the move.

## Task 2 — Point `ClinicEMR.tsx` at the shared component (~3 min)

Delete lines 134-207 (the `VitalStepper` definition and its section-header comment) from
`ClinicEMR.tsx`. Add `import { VitalStepper } from '../../components/VitalStepper'` near the
other local imports at the top of the file. Leave all 4 call sites (weight/temperature/heart
rate/resp rate, lines ~609-612) untouched — same props, same behavior.

Verify: `npm run build` in `src/frontend` (typecheck) + `npm test -- ClinicEMR` still pass.

## Task 3 — Update `VitalStepper.test.tsx` import (~2 min)

Change the import from `../views/clinic/ClinicEMR` to `../components/VitalStepper` (adjust
relative path to match actual test file location). No assertion content changes — this is a
Q1-verified no-risk move (BA sign-off §3 Q1). Run the full file; all existing cases must still
pass unmodified.

**Gate: after Tasks 1-3, run `npm test -- VitalStepper ClinicEMR` — must be green before
continuing.** This closes out LC-1.

## Task 4 — Extend `CareEntry` interface + initial state; delete local `Stepper` (~4 min)

In `ClinicInpatient.tsx`:
```ts
interface CareEntry {
  timeSlot: string
  temperatureC: number | null
  heartRateBpm: number | null
  respRateRpm: number | null
  feedingStatus: string | null
  medicationGiven: string | null
  notes: string | null
}
```
Note `notes` becomes `number | null`-sibling nullable string (was non-nullable `string` before —
this is intentional, see Task 8's normalization). Update `CareModal`'s initial
`useState<CareEntry>` to:
```ts
const [entry, setEntry] = useState<CareEntry>({
  timeSlot: TIME_SLOTS[0],
  temperatureC: null, heartRateBpm: null, respRateRpm: null,
  feedingStatus: null, medicationGiven: null, notes: null,
})
```
Delete the local `Stepper` function (lines ~146-168) entirely. Add
`import { VitalStepper } from '../../components/VitalStepper'` to `ClinicInpatient.tsx`'s imports.
Add local state for the "Other" feeding draft (grill F1) and error display (grill F4 / BA C1):
```ts
const [feedingOther, setFeedingOther] = useState('')
const [error, setError] = useState('')
```

This will break `step2()`'s and `step3()`'s current bodies (they reference the deleted `Stepper`
and the now-changed `entry.notes` typing) — that's expected; Tasks 5-7 fix them. Build will be red
between this task and Task 7; that's normal TDD sequencing, not a stopping point.

## Task 5 — Rewrite `step2()`: 3 `VitalStepper` controls (~5 min)

```tsx
const FEEDING_OPTIONS = [
  { value: '', label: 'Not assessed' },
  { value: 'Ate all', label: 'Ate all' },
  { value: 'Ate some', label: 'Ate some' },
  { value: 'Refused', label: 'Refused' },
  { value: 'NPO', label: 'NPO' },
  { value: 'Assisted feeding', label: 'Assisted feeding' },
  { value: '__other__', label: 'Other' },
] as const

function step2() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
      <VitalStepper label="Temperature" unit="°C" value={entry.temperatureC}
        onChange={v => setEntry(e => ({ ...e, temperatureC: v }))} step={0.1} max={999.9} />
      <VitalStepper label="Heart Rate" unit="bpm" value={entry.heartRateBpm}
        onChange={v => setEntry(e => ({ ...e, heartRateBpm: v }))} step={1} min={1} max={3000} />
      <VitalStepper label="Resp Rate" unit="rpm" value={entry.respRateRpm}
        onChange={v => setEntry(e => ({ ...e, respRateRpm: v }))} step={1} min={1} max={3000} />
    </div>
  )
}
```
(`min={1}` here matches the EMR call sites exactly — grill F2 — and produces the same "≤0 → null"
guard already inside `VitalStepper.commit()`, so no new validation code is written.)

Test (add to `ClinicInpatient.test.tsx`): open Log Care modal, go to step 2, type into each of the
3 `VitalStepper` inputs (`aria-label` = "Temperature"/"Heart Rate"/"Resp Rate"), blur, assert the
displayed value updates. This exercises real typed entry, not just +/- clicks (spec requirement).

## Task 6 — Rewrite `step3()`: feeding picklist + medication note + care notes (~6 min)

```tsx
function step3() {
  const isOther = !FEEDING_OPTIONS.some(o => o.value === entry.feedingStatus) && entry.feedingStatus !== null
  // selection derived from entry.feedingStatus: '' (not assessed) / a canonical value / '__other__' when isOther or feedingOther has been touched
  ...
  <label htmlFor="feeding-status">Feeding status</label>
  <select id="feeding-status" className={inputCls} value={selectedFeedingValue} onChange={e => {
    const v = e.target.value
    if (v === '__other__') { setEntry(en => ({ ...en, feedingStatus: feedingOther || null })) }
    else { setEntry(en => ({ ...en, feedingStatus: v === '' ? null : v })) }
  }}>
    {FEEDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
  {selectedFeedingValue === '__other__' && (
    <input id="feeding-other" maxLength={255} value={feedingOther}
      onChange={e => { setFeedingOther(e.target.value); setEntry(en => ({ ...en, feedingStatus: e.target.value || null })) }}
      placeholder="Describe feeding status" className={inputCls} />
  )}

  <label htmlFor="medication-given">Medication / treatment note (optional)</label>
  <p className="text-label-md text-on-surface-variant">Documentation note only — not a verified medication administration record.</p>
  <textarea id="medication-given" value={entry.medicationGiven ?? ''}
    onChange={e => setEntry(en => ({ ...en, medicationGiven: e.target.value }))}
    placeholder="Medication/treatment name, dose, route, or note" rows={3} className={textareaCls} />

  <label htmlFor="care-notes">Care notes (optional)</label>
  <textarea id="care-notes" value={entry.notes ?? ''}
    onChange={e => setEntry(en => ({ ...en, notes: e.target.value }))}
    placeholder="Observations, instructions…" rows={3} className={textareaCls} />

  {error && <p className="text-error text-body-sm">{error}</p>}
}
```
Exact JSX/variable names are implementation detail for @dev-agent — the contract that must hold:
`feedingOther` (grill F1) never gets silently overwritten by the select, medication and notes are
two separate `<textarea>`s bound to two separate state keys (never share an `onChange`), and the
disclaimer copy (BA D2) sits directly under the medication label, not hidden in a tooltip.

Tests: (a) select each canonical feeding option, assert `entry.feedingStatus` per option incl.
"Not assessed" → `null`; (b) select "Other", type text, assert `feedingStatus` = typed text; (c)
select "Other", leave blank, assert `feedingStatus` stays `null` on submit; (d) type into
medication field and notes field separately, assert neither leaks into the other's payload key.

## Task 7 — Wire error display + clear-on-retry into the mutation (~4 min)

```ts
const mut = useMutation({
  mutationFn: (data: CareInput) => api.post(`/api/hospitalizations/${hospit.id}/care`, data),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['inpatient-active'] })
    qc.invalidateQueries({ queryKey: ['hospitalization', hospit.id] })
    onSaved()
  },
  onError: (err: unknown) => {
    setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save care record')
  },
})
```
Save button's `onClick` becomes:
```ts
onClick={() => { setError(''); mut.mutate(buildPayload(entry, feedingOther)) }}
```
(clears stale error before every attempt — grill F4). `buildPayload` is Task 8's normalization
function.

Tests: mock `api.post` to reject once, click Save, assert error text renders and modal is still
open with `entry` state intact (BA C1 failure-path test); mock a second successful attempt after
the first failure, assert the stale error clears and both query keys invalidate.

## Task 8 — Payload normalization before POST (~3 min)

```ts
function buildPayload(entry: CareEntry): CareEntry {
  return {
    ...entry,
    feedingStatus: entry.feedingStatus?.trim() || null,
    medicationGiven: entry.medicationGiven?.trim() || null,
    notes: entry.notes?.trim() || null,
  }
}
```
Called from the Save button's `onClick` (Task 7) instead of passing `entry` directly. `temperatureC`/
`heartRateBpm`/`respRateRpm` are already `number | null` from `VitalStepper`'s own commit logic —
no extra normalization needed for those three.

**Test (grill F3 — must update, not just add):** locate the existing test in
`ClinicInpatient.test.tsx` — describe block "Log Care modal payload (careSchema field-name
regression guard)" — and change its `toEqual` assertion to:
```ts
expect(payload).toEqual({
  timeSlot: '16:00', temperatureC: null, heartRateBpm: null, respRateRpm: null,
  feedingStatus: null, medicationGiven: null, notes: null,
})
```
Run this specific test file before and after to confirm the change is deliberate (red because of
the old assertion → green after the update), not an accidental break slipping through.

## Task 9 — Full frontend suite + build (~3 min, verification not authoring)

```powershell
cd D:\Development\AnimalClinic\src\frontend
npm test -- --run
npm run build
```
All tests green, build clean, before moving to Task 10.

## Task 10 — Backend test-only extension (LC-7, ~4 min)

In `src/backend/tests/integration/phase4.test.ts`, locate the care POST test near line 146.
Extend its request payload to include all 7 `careSchema` fields (adding `respRateRpm`,
`feedingStatus`, `medicationGiven` alongside the existing `heartRateBpm`/`timeSlot`/
`temperatureC`/`notes`), and extend its assertions to check the response echoes all 7 values.
Touch **only** this test file — no `src/backend/services|controllers|models|routes` file changes.

```powershell
cd D:\Development\AnimalClinic\src\backend
npm test -- --runInBand
npm run build
```

## Task 11 — Accessibility + viewport spot-check (~3 min, @uiux-agent during execute-plan)

Manual/automated check at 768×1024 and 1024×768: no horizontal scroll, all interactive controls
≥44×44px, labels bound via `htmlFor`/`id`, tab order flows time-slot → vitals → feeding → other
(if shown) → medication → notes → footer buttons. No raw hex/`gray-*`/emoji introduced.

---

## Explicit non-goals restated (do not implement)
- No scheduled treatments, overdue alerts, actual-administration timestamp.
- No medication order linkage, dose/route enum, barcode verification, approval/co-sign.
- No species-specific reference ranges or clinical alerting; no hard-coded "normal range".
- No feeding enum in the DB schema; no historical vitals chart.
- No staff-lookup endpoint; no backend production file changes; no new dependency/endpoint/migration.
- No Escape-to-close, no unsaved-changes-on-close warning (accepted deviations, documented in grill).

## Definition of Done for this plan
1. Tasks 1-11 all checked off with tests written test-first (red→green) per `/tdd`.
2. `npm test -- --run` + `npm run build` green in `src/frontend`; `npm test -- --runInBand` +
   `npm run build` green in `src/backend`.
3. Ponytail gate (Step 5) APPROVE before Task execution begins for real.
4. @uiux-agent design-system/touch-target sign-off (Task 11) during Step 6.
5. @qa-agent sign-off (Step 8) confirming no RBAC/tenant regression.
6. `/anemal-finish-branch` (Step 9) ships the PR.
