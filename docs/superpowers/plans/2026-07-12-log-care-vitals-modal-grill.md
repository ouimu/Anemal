# Grill — Log Care modal vitals/nursing fields (Step 3.5, MANDATORY)

Date: 2026-07-12 · Unattended run: no live interviewer, so this grill is conducted as a
relentless self-interview against (a) the BA sign-off's risk register/conditions, (b) the
RecommendByCodex/04 Package B gate questions, and (c) fresh reads of the actual source
(`ClinicInpatient.tsx` CareModal + its existing test file, `ClinicEMR.tsx` VitalStepper,
`hospitalization.service.ts` careSchema). Every finding below is either resolved by a task-doc
amendment or explicitly accepted as a documented, non-blocking risk. None are left open — this
gate does not close with unresolved findings.

## Gate questions from RecommendByCodex/04 "Package B" — answered

- **"ยืนยัน controlled feeding vocabulary และคำแปล"** → Answered at BA sign-off Q3: accepted as a
  documented judgment call (UI-only, reversible, English-only screen today), with a logged
  follow-up for Thai-clinician review. No further grill action; carried to backlog (see Non-goals
  / follow-ups below).
- **"medication field เป็น documentation note เท่านั้น ไม่ใช่ MAR"** → Confirmed via LC-5 AC +
  BA Q4. No change.
- **"ทุก field optional จริงหรือมี task template ใดควร required"** → Verified directly against
  `careSchema` (`hospitalization.service.ts:22-30`): every clinical field is
  `.optional().nullable()`; only `timeSlot` is required (enum). No task-template concept exists
  in this codebase. All fields stay optional. No change.
- **"ต้องเตือน outlier หรือไม่"** → No. Per D3 (brainstorm) and the hard must-not list, no
  clinical range/threshold is invented without clinical sign-off, which is unavailable in this
  unattended run. Confirmed no change.

## Findings from fresh source interrogation (new — not in BA sign-off)

### F1 (must fix) — "Other" feeding text needs its own draft state, not shared with `feedingStatus`

If the `<select>` writes canonical strings straight into `entry.feedingStatus` and "Other" reveals
a text input that *also* writes into `entry.feedingStatus`, then switching the select away from
"Other" and back loses the typed text (no separate draft), and initializing the select's selected
option from a `feedingStatus` value that isn't one of the 6 canonical strings requires special-
casing (e.g., a legacy string on a fresh `entry` — n/a here since `entry` always starts `null`,
but the "Other" round-trip within one modal session is real). **Resolution:** `CareModal` gets a
local `feedingOther` string state (UI-only, not part of `CareEntry`/payload) that holds the typed
text while "Other" is selected; on submit, `feedingStatus` is computed as: selected preset value,
or `null` for "Not assessed", or the trimmed `feedingOther` (→ `null` if blank) when "Other" is
selected. Added to LC-4 acceptance criteria.

### F2 (must fix) — no upper bound specified for HR/RR in this modal; EMR's existing convention should be reused for consistency, not reinvented

The spec doesn't set a numeric ceiling for the Log Care modal's HR/RR fields (only "positive
integer"). `VitalStepper`'s existing 4 call sites in `ClinicEMR.tsx` already use `max={3000}` for
both heart rate and resp rate as a sane input ceiling (not a clinical range — just prevents
fat-finger entry of huge numbers) that's already shipped and understood. **Resolution:** reuse
`max={3000}` for both HR and RR `VitalStepper` instances in the Log Care modal, for consistency
with EMR and to avoid inventing a second, different, undocumented ceiling. Temperature keeps the
existing `max={999.9}` convention (matches EMR temperature field). Added to LC-3 acceptance
criteria. This is an input-sanity ceiling only, not a clinical range — does not violate the "no
hard-coded normal range" must-not rule (no min-side clinical floor is added beyond the existing
>0 guard already in `VitalStepper.commit()`).

### F3 (must fix) — an EXISTING test hard-asserts the old 3-field payload shape and will fail once the payload grows; this must be an explicit TDD update, not a surprise regression

`ClinicInpatient.test.tsx:151-168` ("Log Care modal payload... field-name regression guard")
currently asserts:
```ts
expect(payload).toEqual({ timeSlot: '16:00', temperatureC: null, notes: '' })
```
This is a positive-match `toEqual` (not `toMatchObject`) — it will fail the moment `CareEntry`
grows to 7 fields, regardless of correctness. Per the spec's own normalization guidance ("ทางที่
สะอาดกว่าคือ normalize ทุก optional string เป็น null") and BA's gap analysis (item 3 of the test
matrix — blank string must become `null`, not `''`), the correct resolution is: normalize **all**
optional fields — including `notes` — to `null` when blank, for one consistent contract across
all 4 nullable-string/number fields, rather than special-casing `notes` to stay `''` for
"compatibility" (nothing currently depends on `notes: ''` specifically; Care History already
renders `log.notes || '—'`, which treats `null` and `''` identically). **Resolution:** this
existing test is updated (not just extended) as part of Task LC-2/LC-5 — its literal payload
assertion becomes `{ timeSlot: '16:00', temperatureC: null, heartRateBpm: null, respRateRpm: null,
feedingStatus: null, medicationGiven: null, notes: null }`. This must be called out explicitly to
@dev-agent so the red-green TDD cycle updates this specific existing assertion rather than
treating a failing pre-existing test as an unrelated break. Added to LC-2 acceptance criteria as
an explicit sub-item.

### F4 (must fix) — stale error must clear on next edit/retry, not persist across a second attempt

LC-6 (as amended by BA C1) adds an `onError`-driven error state but doesn't specify when it
clears. Without clearing, a user who fixes their input and successfully saves on a second attempt
could see a flash of stale error text before `onSuccess` closes/resets, or — worse — if `onSaved`
doesn't unmount the modal synchronously, a stale error could linger visually. **Resolution:**
clear `error` state at the start of every `mut.mutate()` call (mirroring `AdmitModal`'s
`submit()` which does `setError('')` before `mut.mutate(form)`), i.e. wrap the Save button's
`onClick` to clear error before mutating, not only rely on `onError` to set it. Added to LC-6
acceptance criteria.

### F5 (accepted, no task change) — modal remount already guarantees clean state between opens

Verified: `CareModal` is only ever rendered via `{careTarget && <CareModal ... />}`
(`ClinicInpatient.tsx:680-682`) — closing sets `careTarget` to `null`, fully unmounting the
component, so all local state (`entry`, `step`, the new `feedingOther`, `error`) resets for free
on next open. No "reset on open" logic needs to be written. No task change; recorded so
@dev-agent doesn't add unneeded reset code (would trip Ponytail criterion 1).

### F6 (must fix, layout) — reuse the file's own existing responsive grid convention instead of inventing new breakpoint classes

`ClinicInpatient.tsx:663` already uses `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-lg`
elsewhere in this same file for a similar card grid. The spec's guidance (1 column at 768px
portrait if needed, 2-3 columns at 1024px landscape) maps directly onto Tailwind's default
`sm`(640)/`lg`(1024) breakpoints, which this file already uses. **Resolution:** LC-3's vitals grid
uses the same convention: `grid grid-cols-1 sm:grid-cols-3 gap-md` (3 controls fit in 2 columns
awkwardly — going straight to 3-across at `sm` reads cleaner for exactly 3 items than a 2-then-3
staged breakpoint; @uiux-agent confirms final class choice in Step 6, but must reuse the existing
Tailwind scale, not invent arbitrary pixel breakpoints). Modal width grows from `max-w-md` to
`max-w-xl` with `max-h-[min(80vh,640px)] overflow-y-auto` on the body per the spec's explicit
sizing allowance — added to LC-3 AC.

## Non-blocking items carried forward (already surfaced by BA, reconfirmed here, no new action)

- Thai-clinician feeding-vocabulary review — backlog follow-up, not this PR.
- Backend schema hardening (`careSchema` lacks `.positive()`, no HR/RR max at the schema level,
  unbounded `medicationGiven`) — backlog follow-up, explicitly out of this frontend-only PR.
- No Escape-to-close (no modal in the repo has this pattern) — accepted deviation.
- ≤0 vitals silently revert to `null` rather than showing an inline error — accepted deviation,
  matches shipped `VitalStepper` behavior in EMR (identical semantics reused, not reinvented).

## Verdict

**GRILL GATE: CLOSED — all findings resolved.** F1, F2, F3, F4, F6 require task-doc amendments
(applied to `2026-07-12-log-care-vitals-modal-tasks.md` immediately after this doc). F5 requires
no action (documented to prevent scope creep). No finding is left open. `/write-plan` (Step 4)
may proceed.
