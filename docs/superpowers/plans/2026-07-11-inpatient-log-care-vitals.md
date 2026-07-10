# Plan — Item 1: Inpatient Log Care / Vitals (Step 4)

Branch: `feature/inpatient-log-care-history`
Refs: `2026-07-11-inpatient-log-care-vitals-brainstorm.md`, `-tasks.md`, `-grill.md`
BA sign-off: granted. Grill: 5 findings, all resolved.

Scope: frontend-only. No backend/DB changes (endpoint, permission, and data
already exist — verified in brainstorm + BA + grill docs). Single file touched
for implementation: `src/frontend/src/views/clinic/ClinicInpatient.tsx`, plus
its test file.

## Task 1 — `CareHistoryModal` component (~5 min)

File: `src/frontend/src/views/clinic/ClinicInpatient.tsx`

Add a new component after `EditModal` (before `CageCard`):

```tsx
function CareHistoryModal({ hospit, onClose }: { hospit: Hospitalization; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<Hospitalization & { careLogs: CareLog[] }>({
    queryKey: ['hospitalization', hospit.id],
    queryFn: () => api.get(`/api/hospitalizations/${hospit.id}`).then(r => r.data.data),
  })
  const logs = data?.careLogs ?? []
  // header mirrors CareModal's; body: loading spinner / error banner / empty state /
  // scrollable list of rows (recordedAt, timeSlot badge, temp/HR/resp/feeding/med/notes,
  // "Staff #<performedBy>" or "—"); footer: single "Close" button.
}
```

Add `CareLog` interface (fields per `DailyInpatientCare` model: `id`,
`recordedAt`, `timeSlot`, `temperatureC`, `heartRateBpm`, `respRateRpm`,
`feedingStatus`, `medicationGiven`, `notes`, `performedBy` — all matching
backend field names exactly, same discipline as `CareEntry`/`Hospitalization`).

Test: `src/frontend/src/__tests__/ClinicInpatient.test.tsx` — render modal
with mocked `careLogs` array, assert rows show correct values; assert empty
state text when `careLogs: []`; assert error banner when query rejects.

## Task 2 — wire button into `CageCard` + main view (~3 min)

- `CageCard` props: add `onHistory: () => void`; add a button (icon
  `history`, `aria-label="View care history"`) in the actions row, visible on
  every card rendered by the board — near the existing Log Care/Discharge/
  Edit/Delete buttons. Per grill finding 4 (ADR-0011, added post-Ponytail):
  the board only queries `GET /api/hospitalizations/active`, so every
  `CageCard` it renders is an admitted hospitalization already — there is no
  "discharged" case to special-case here. Discharged-admission history access
  is out of scope for this branch (deferred to Item 2 — Pet Profile Medical
  tab).
- `ClinicInpatient` main component: add `historyTarget` state (same pattern as
  `careTarget`/`editTarget`); render `<CareHistoryModal>` when set; pass
  `onHistory={() => setHistoryTarget(h)}` to `CageCard`.

Test: assert clicking the history button opens the modal with the right
pet name in the header.

## Task 3 — cache invalidation fix (grill finding 2) (~2 min)

`CareModal`'s mutation `onSuccess`:
```ts
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ['inpatient-active'] })
  qc.invalidateQueries({ queryKey: ['hospitalization', hospit.id] })
  onSaved()
}
```

Test: existing regression-test pattern — mock two mutate calls, assert both
query keys invalidated (or trust existing 11 tests + new modal test cover
behavior; if a targeted invalidation test is cheap, add one).

## Task 4 — QA / RBAC verification (Step 7, not this task list's job to implement, but plan notes it)

No new permission code. QA re-confirms (not re-implements):
1. Tenant isolation on `GET /:id` already covered by existing
   `hospitalization-crud.test.ts` cross-tenant test — QA checks it exists and
   covers the id-based single-record fetch, doesn't just assume.
2. A role without `inpatient.view` cannot reach the Inpatient Board at all
   (existing route guard, not new).
3. History button/modal introduce no new API call beyond the already-guarded
   `GET /:id` and no new client-side permission branching to get wrong.

## Out of scope (do not implement in this branch)
- Vitals input fields beyond temperature (backlog).
- performedBy name resolution (backlog).
- Branch isolation hardening on `GET /:id` (backlog).
- Pagination of care logs.

## File list (exact)
- `src/frontend/src/views/clinic/ClinicInpatient.tsx` (edit)
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx` (edit — add tests)

2 files, ~4 small tasks, 0 new dependencies, 0 new API endpoints, 0 new
permission codes, 0 migrations — sized for the Ponytail gate (Step 5).
