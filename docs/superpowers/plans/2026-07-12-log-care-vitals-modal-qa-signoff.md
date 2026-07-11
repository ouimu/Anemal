# QA Sign-off — Log Care modal vitals/nursing fields (Step 7, @qa-agent)

**Feature:** Package B — Log Care modal vitals/nursing fields
**Branch:** `fix/log-care-vitals-modal` (implementation commit `b87a79e`)
**Date:** 2026-07-12
**Reviewer:** @qa-agent
**Prior gates:** BA sign-off ✅ · Grill (6 findings resolved) ✅ · Ponytail APPROVE ✅ · /code-review APPROVE ✅

## Verdict

**REJECT** — one blocking finding (Finding 1, a missing test assertion explicitly required by
Task LC-6's acceptance criteria). Everything else is green. The fix is a one-line test
addition; re-run of this sign-off after @dev-agent applies it should be fast.

---

## LC-6 verification (inline API-error display)

Code (`src/frontend/src/views/clinic/ClinicInpatient.tsx`, `CareModal`):

| AC | Result | Evidence |
|---|---|---|
| `onError` sets local `error` state | ✅ PASS | Lines 156, 166–168 — `setError(...response?.data?.error ?? 'Failed to save care record')` |
| Error rendered inline | ✅ PASS | Line 285 — `{error && <p className="text-error text-body-sm">{error}</p>}` in `step3()` |
| Modal stays open, values intact on rejection (behavior) | ✅ PASS (by code inspection) | `onError` touches only `error`; `entry`/`step` state untouched; no `onClose()` in error path |
| Save disabled while pending | ✅ PASS | Lines 337–340 — `disabled={mut.isPending}`, label swaps to "Saving…" |
| Dual invalidation on success | ✅ PASS | Lines 161–164 — `['inpatient-active']` and `['hospitalization', hospit.id]` both invalidated |
| Error cleared at start of every save (grill F4) | ✅ PASS | Lines 171–174 — `handleSave()` runs `setError('')` before `mut.mutate(buildPayload(entry))`; retry-clears-error also test-covered (`ClinicInpatient.test.tsx:309–312`) |
| Route still requires `inpatient.manage` (negative authz) | ✅ PASS | No route/middleware file in diff; `POST /:id/care` guard unchanged (see scope section) |
| Failure-path test exists | ⚠️ PARTIAL | `ClinicInpatient.test.tsx:291–314` — see Finding 1 |

### Finding 1 (BLOCKING) — LC-6 failure-path test does not assert "entry state unchanged"

LC-6 AC prescribes the failure-path test must: "mock `api.post` to reject, **assert error text
visible**, **assert `entry` state unchanged**, **assert modal still mounted**."

The test (`src/frontend/src/__tests__/ClinicInpatient.test.tsx:291–314`) asserts:
- error text visible ✅ (line 306)
- modal still mounted ✅ (line 307 — Save button present; since that button only renders at
  step 3, this also proves wizard `step` state survived)
- **entry state unchanged — NOT asserted.** Neither the second POST's payload nor the visible
  Temperature input value is checked after the rejection. A hypothetical regression that wipes
  `entry` in `onError` (e.g. `setEntry(initial)`) would still pass this test: the retry at line
  310 only asserts `postMock` was called twice, never what it was called with.

Remediation (one line, after line 311):
`expect(postMock.mock.calls[1][1]).toEqual(postMock.mock.calls[0][1])` — or equivalently assert
`(screen.getByLabelText('Temperature') as HTMLInputElement).value === '38.5'` after the error.

Severity: blocking per the letter of the AC (the runtime behavior itself is correct by code
inspection — this is a test-completeness gap, not a product bug). Route to @dev-agent.

---

## LC-7 verification (backend contract regression test) — ✅ PASS

- `src/backend/tests/integration/phase4.test.ts` care POST test now sends all 7 `careSchema`
  fields (`timeSlot, temperatureC, heartRateBpm, respRateRpm, feedingStatus, medicationGiven,
  notes`), asserts `201`, asserts all 6 non-decimal fields via `toMatchObject`, and asserts
  `Number(res.body.data.temperatureC) === 38.5` (Prisma Decimal coercion consistent with the
  rest of the file). Extends the existing test in place — allowed by AC ("extend or add
  alongside"); backend test count therefore stays at the PR #20 baseline (912).
- No backend production file modified: `git diff main...HEAD --name-only` over
  `src/backend/{services,controllers,models,routes,src}` returns **nothing** — only
  `src/backend/tests/integration/phase4.test.ts` changed under `src/backend/`.
- Full backend suite green (below).

## Test suite results

| Suite | Command | Result | Baseline → Now |
|---|---|---|---|
| Frontend (vitest) | `npm test` in `src/frontend` | **233 passed / 233, 0 failed** (39 files) | 225 → 233 (+8) |
| Backend (jest) | `npm test -- --runInBand` in `src/backend` | **912 passed / 912, 0 failed** (58 suites) | 912 → 912 (LC-7 extends an existing test) |

New frontend coverage verified: careSchema 7-field null-payload regression guard (updated per
grill F3, `notes` now normalizes to `null`), LC-3 vitals typed-entry + payload, LC-4 canonical /
Not-assessed→null / Other-typed / blank-Other→null feeding cases, LC-5 medication-vs-notes key
separation, LC-6 error + retry-clears-error.

## RBAC / tenant-surface confirmation — ✅ PASS

- No new route, permission code, middleware, screen guard, or tenant-facing surface. Diff
  contains zero files under `src/backend/routes|controllers|services|models|middlewares`.
- `POST /api/hospitalizations/:id/care` remains behind the existing `inpatient.manage` guard
  (unchanged; exercised by the passing phase4 integration test with an authorized token).
- No schema/migration change; @db-agent correctly not involved.

## Scope-diff confirmation — ✅ PASS (with one note)

Changed files vs `main` (code/test only):
- `src/frontend/src/views/clinic/ClinicInpatient.tsx` — allowed (CareModal changes)
- `src/frontend/src/components/VitalStepper.tsx` — allowed (new, LC-1 extraction)
- `src/frontend/src/views/clinic/ClinicEMR.tsx` — allowed (LC-1: local definition removed,
  import added; net −76 lines; no duplicate stepper logic — `justCommittedRef` grep hits only
  the shared component)
- `src/frontend/src/__tests__/ClinicInpatient.test.tsx`, `VitalStepper.test.tsx` — allowed
- `src/backend/tests/integration/phase4.test.ts` — allowed (test-only, LC-7)

No MAR/scheduler/dosage scope creep, no second VitalStepper copy, no branch-isolation-fix code
mixed in. Remaining diff files are pipeline docs (`docs/superpowers/plans/*`) and reference
docs (`RecommendByCodex/*.md`, added by the brainstorm commit `85c8c76` as spec inputs) —
documentation only, not a scope violation.

## Other findings (non-blocking)

- **Finding 2 (open gate item, not a code defect):** QA Protocol 5 (`.claude/roadmap/
  qa-protocols.md`) requires the `anemal-smoke-walkthrough` role×page artifact for any
  release-bound branch touching frontend code before it proceeds past Step 7 / into Step 8.
  No walkthrough artifact is attached for this branch yet. Coordinator should run it (or attach
  it to the PR) before `/anemal-finish-branch`.

## Approval

- [ ] ~~QA-Agent Approval~~ — **withheld** until Finding 1 is fixed (one-line test assertion)
  and the LC-6 test re-run green; Finding 2 artifact to be attached before Step 8.

**Notes:** Runtime behavior of the feature is correct and fully green across both suites; the
rejection is strictly on LC-6 test-completeness per its written acceptance criteria.

---

# Re-verification — 2026-07-12 (@qa-agent)

## Final Verdict: **APPROVE** — QA-Agent Approval: ✅

The original REJECT above is retained as history. Both findings are now resolved.

## Finding 1 (was BLOCKING) — RESOLVED

@dev-agent added the exact prescribed assertion in commit `0482d4c`
(`src/frontend/src/__tests__/ClinicInpatient.test.tsx:313`):

```ts
expect(postMock.mock.calls[1][1]).toEqual(postMock.mock.calls[0][1])
```

Verified by reading the file: the assertion sits after the retry click + `toHaveBeenCalledTimes(2)`
wait, comparing the retry POST payload to the original — this proves `entry` state survived the
failed save, exactly what LC-6's AC ("assert `entry` state unchanged") required. A regression that
wipes `entry` in `onError` would now fail this test.

## Test suites — re-run 2026-07-12

| Suite | Command | Result |
|---|---|---|
| Frontend (vitest) | `npm test` in `src/frontend` | **233 passed / 233, 0 failed** (39 files) |
| Backend (jest) | `npm test -- --runInBand` in `src/backend` | **912 passed / 912, 0 failed** (58 suites) |

## Finding 2 — RESOLVED via smoke walkthrough (Protocol 5)

Protocol 5 wording ("Any release-bound branch that touches frontend code ... MUST run the
`anemal-smoke-walkthrough` skill before it can proceed past Step 7 ... cannot reach Step 8 without
one attached") is a hard gate, not advisory — it cannot be waived for this branch. The walkthrough
was therefore run (2026-07-12, dev servers + Docker `vetclinic-pg`), scoped per the skill's
"pick per request" allowance to the only surface this branch touches: clinic plane, `staff_a`
(clinic_staff — holds `inpatient.manage` per the RBAC matrix), inpatient board / Log Care flow,
including the Protocol-5-required write-path record creation end-to-end.

### Walkthrough artifact — role × page status table

| Role | Page / Flow | Status | Detail / Action |
|---|---|---|---|
| clinic_staff (staff_a, dev-clinic, Main Branch) | Login + branch selection | OK | UI login, branch picker shown and selected |
| clinic_staff | Dashboard (landing) | OK | Correct clinic landing, no console errors |
| clinic_staff | Inpatient Board `/clinic/inpatient` | OK | Board renders admission card with Log Care / Discharge / history / edit / delete actions |
| clinic_staff | Log Care modal — step 1 (time slot) | OK | 08:00/12:00/16:00/20:00 rendered; selected 16:00 |
| clinic_staff | Log Care modal — step 2 (vitals) | OK | Typed Temp 38.5, HR 92; VitalStepper `+` button verified (blank → 1); Resp set to 22 |
| clinic_staff | Log Care modal — step 3 (feeding/medication/notes) | OK | Feeding dropdown canonical options + Other present; selected "Ate some"; medication + notes as separate fields |
| clinic_staff | Save (write path) | OK | `POST /api/hospitalizations/991/care` → **201**; modal closed; board refetched `/active` (dual invalidation observed live) |
| clinic_staff | Persistence check (API) | OK | GET detail: all 7 fields exactly as entered — `timeSlot 16:00, temperatureC 38.5, heartRateBpm 92, respRateRpm 22, feedingStatus "Ate some", medicationGiven "Amoxicillin 250mg PO", notes` — LC-3/LC-4/LC-5 confirmed at runtime |
| clinic_staff | Care History modal | OK | New entry rendered with all fields + performer "By: Staff A" (PR #19 FK resolution intact) |

Console: zero application errors during the whole flow (only harness-side "viewport height 0"
noise from the preview pane, timestamped before page interaction). Network: zero failed
app-originated requests (the one 404/401 pair in the log came from QA's own API probing of
endpoint paths, not from the application).

Incidental positive observation: `DELETE /api/hospitalizations/991` correctly refused with **409**
because the admission has care logs — the delete guard works. Fixture cleaned up via
`PUT /api/hospitalizations/991/discharge` → 200; board returned to a clean state.

## Approval

- [x] **QA-Agent Approval: ✅** — Finding 1 fixed and verified, both suites green
  (233 frontend / 912 backend), Protocol 5 walkthrough artifact attached above.
  Branch `fix/log-care-vitals-modal` is clear to proceed to Step 8 (`/anemal-finish-branch`).
