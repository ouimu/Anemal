# Phase 7 — God-components: Gate 0 audit + refactor backlog

**Date:** 2026-09-16 · **Agent:** `@arch-agent` · **Lane:** D (`/anemal-refactor`) ·
**Tier:** Lane D backlog (arch-agent SKILL.md §8) · **Branch this audit was cut on:**
`refactor/phase7-god-components` from `main` @ `8b66aef`

**Scope guard applied.** Four god-components = four separate `/anemal-refactor` runs, one branch /
one review / one revert point each. This document is the ordering + Gate 0 reference for all four.
It changes no source file.

---

## 0. The constraint that reshapes this phase — read before anything else

A naive reading of "inline modals … mixing logic/fetch/presentation" suggests migrating these files'
hand-rolled modal shells onto the shared `src/frontend/src/components/Dialog.tsx` (ADR-0027). **That
is already decided, and the answer is no — not in Lane D, and not in Phase 7.**

Three accepted records say so:

1. `docs/superpowers/plans/HANDOFF-code-quality-refactor.md` L280-291 — Phase 6 attempted exactly this
   swap inside a Lane D branch and was **pulled to Lane A by human decision (2026-09-10)**, because
   characterization tests "cannot pass unmodified against the pre-migration DOM (no `role="dialog"`
   existed), which is itself the proof these are real UI changes, not refactor-safe internal
   reshuffling."
2. The same file, L306-308, names our four files and instructs: *"don't touch their modals until
   Phase 7 restructures them."* — i.e. Phase 7 restructures the **components**; the **shells** migrate
   later, through Lane A.
3. `docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md` §7 allowlists these files by
   name as "Phase 7 god-component — out of scope (PM §5)".

Verified against the current source — a `Dialog` swap would be an observable change in every file:

| File | Hand-rolled roots | Backdrop closes | X control | Escape | `role`/`aria-modal` | Delta if swapped to `Dialog` |
|---|---|---|---|---|---|---|
| `ClinicInpatient.tsx` | 4 (L294, 393, 463, 503) | yes (all 4) | yes (L305/397/467/514) | **no** | **no** | + Escape, + aria, + drag-overshoot guard |
| `ClinicBilling.tsx` | 5 (L615, 620, 644, 779, 797) | 3 of 5 | no | L583 (local) | **no** | + Escape, + X, + aria, **+ backdrop on 2 that deliberately lack it** |
| `ClinicPets.tsx` | 5 (L74, 160, 262, 388, 478) | **no** | **no** | **no** | **no** | + Escape, + backdrop, + X, + aria — largest delta |
| `ClinicEMR.tsx` | **0** | — | — | — | — | n/a — not a Dialog consumer at all |

**Therefore Phase 7's Lane D scope is:** collapse duplicated state, extract duplicated
form/submit/fetch logic out of the view file, and move network calls onto the codebase's existing
mutation-hook pattern — **leaving every modal shell's markup and dismissal behaviour byte-identical.**
The shell migration is a later Lane A item and inherits a much smaller diff once this work lands.

### 0.1 The census test will fire — and that is correct

`src/frontend/src/__tests__/modal-consistency.test.ts` holds `KNOWN_BESPOKE_MODALS`, keyed
`path → expected root count`, asserted with `expect(actual).toEqual(expected)` (strict equality):

```
views/clinic/ClinicBilling.tsx   → 5
views/clinic/ClinicPets.tsx      → 5
views/clinic/ClinicInpatient.tsx → 4
views/admin/UserManagementTab.tsx→ 2
```

Because Phase 7 does **not** migrate shells, the root counts must stay unchanged — so this test
should stay green untouched throughout Phase 7. **If it goes red, the refactor has changed a modal
shell and has left Lane D.** Treat a red `modal-consistency` census as a stop signal, not as an
allowlist to edit. (Extracting a modal to its own file *does* move a root between paths and will fire
the census — see §2.2 for how each item avoids that.)

---

## 1. Gate 0 — characterization coverage verdict per file

Baseline measured on this branch, 2026-09-16:
`npx vitest run` over the 11 relevant files → **11 files, 98 tests, all passing, 19.45s.**

| File | LOC | useState | Test files | Tests | Verdict |
|---|---|---|---|---|---|
| `ClinicInpatient.tsx` | 800 | 12 | 1 | ~30 | **SUFFICIENT** (2 small gaps) |
| `ClinicEMR.tsx` | 768 | 28 | 4 | ~10 | **PARTIAL** — narrow slices only |
| `ClinicPets.tsx` | 937 | 29 | 4 | ~10 | **INSUFFICIENT** |
| `ClinicBilling.tsx` | 817 | 22 | 1 | ~10 | **NONE** on the component itself |

### ClinicInpatient — SUFFICIENT
`ClinicInpatient.test.tsx` (480 lines, 66 assertions, 70 interactions) mounts the **default export**
and drives it end to end: CageCard field rendering and the `Unassigned` doctor fallback; Delete gated
on care-log count with confirm accept **and** decline; Edit modal pre-populate → PUT, and hidden for a
discharged admission; the Care wizard's step navigation, payload field names, three vitals steppers
with blur-commit, five feeding-status cases including the "Other" draft-preservation regression, and
inline-error-plus-retry idempotency; the Care History modal's rows, empty state, error state and all
three `performedByUser` fallbacks. Plus `AdmitModal` standalone. **This is real characterization
coverage of top-level behaviour** — modal open, fetch-triggered state change, and conditional branches
are all locked.

### ClinicEMR — PARTIAL
All four files mount the **default export** against a real `api` mock and drive
search → select pet → select record, which is the right harness. But they assert only four narrow
slices: the attachments panel, the `AuthedPetImage` avatar swap, the `?petId=` deep link, and
`saveRecord`'s query invalidation. Untouched: the SOAP editor that *is* the 411-line component body
(`soapTab` + `subjective/objective/assessment/plan`), the four vitals fields, the `isNewRecord` branch,
record-list selection, `saveMsg`, the 168-line `PrescriptionPanel` (debounced drug search, add, delete)
and the 122-line `AnatomyCanvas`. New characterization needed before touching any of those.

### ClinicPets — INSUFFICIENT
Two of the four files (`ClinicPetsMedicalTab`, `ClinicPetsPhotoDisplay`) import the **named sub-exports**
`PetDetail` / `OwnerPanel`, not the component. The two that do mount the default export
(`ClinicPets.i18n`, `ClinicPetsOwnerList`) both `vi.mock('@tanstack/react-query', …)` **wholesale** —
`useQuery` is stubbed, so no fetch-triggered state change is exercised anywhere, and one assertion is a
CSS class check (`min-w-0`). Net: of the five modals, **zero have any submit, error or close coverage**;
owner delete (L707) and reactivate (L718) are untested; the `modal` dispatch state is untested. This is
the file with the largest planned change and the weakest net.

### ClinicBilling — NONE (on the component)
Every test targets something already extracted: `calcVat` (a pure function), `SuccessModal`,
`ReceiptModal`, `PaymentHistoryTab` — all **named exports**. Nothing renders the default-export
`ClinicBilling`. Its 415-line body (L45-460, 14 of the file's 22 `useState`) — pet search, cart,
discount, loyalty redemption, VAT mode, payment method, tendered/change, PromptPay QR, the two
`/api/loyalty/redeem` call sites — has **zero rendered coverage**. Money paths, and the file ADR-0020
already burned the project on (`TAX_RATE` hardcoded here).

---

## 2. Structural problem and smallest fix, per file

### 2.1 ClinicInpatient.tsx — three nullable targets encoding one state machine
**Problem.** The root holds `careTarget`, `editTarget`, `historyTarget` as three independent
`Hospitalization | null` states (L673-675), each set by a different `CageCard` callback and cleared
independently. Three nullable slots represent 8 states for a control that has 4. The unreachable
combinations are unreachable only because a full-screen overlay happens to cover the buttons
underneath — nothing in the type or the code enforces it. This is `architecture-rules.md` §6's
"spread of booleans encoding a state machine", in nullable-object form.

**Smallest fix.** Collapse to one discriminated union, exactly mirroring the shape `ClinicPets` already
uses at L812:

```ts
const [modal, setModal] = useState<{ kind: 'care' | 'edit' | 'history'; hospit: Hospitalization } | null>(null)
```

Three `useState` → one; three render guards → one `switch`; impossible states become unrepresentable.
No file is added, no component moves, no markup changes. **Do not** touch `feedingOther` /
`feedingOtherMode` — that pair is deliberate and documented at L151-154 (grill finding F1).

**Explicitly not in this item:** extracting the four modals to their own files (moves census roots),
and the `Dialog` swap (§0).

### 2.2 ClinicPets.tsx — the same form modal written five times
**Problem.** L45-501 (456 lines, 49% of the file) is five modals that are two near-verbatim twin pairs
plus one. `AddOwnerModal` and `EditOwnerModal` differ only in title, initial values, and
`api.post` vs `api.put` — same eight fields, same `set()` change-handler factory, same
`form`/`error`/`saving` triple, same `try/catch/finally`, same error extraction
`(err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save'`, and
the same 150-character input `className` repeated verbatim ~30 times. `AddPetModal`/`EditPetModal` are
the same story plus `photoFile`/`photoPreview`. 15 of the file's 29 `useState` are these five copies of
one triple. All five call `api.*` directly from the component body — the one place in
`architecture-rules.md` §1's frontend rule that says no fetch inside a component body — while 24
sibling hooks in `hooks/` already do this correctly with `useMutation`.

**Smallest fix, in two independently revertable commits:**
1. Extract the shared submit mechanics into one local hook — `useModalSubmit(fn)` returning
   `{ error, saving, submit }` — wrapping the identical try/catch/finally and error extraction. Five
   copies → one. This removes 10 `useState` and roughly 60 duplicated lines, adds one hook, and touches
   no markup.
2. Hoist the repeated input `className` to a single module-level `const fieldClass`. ~30 verbatim
   copies → one reference.

Twin-pair merging (`AddOwnerModal` + `EditOwnerModal` → one component with an optional `owner` prop) is
the larger prize but is a **second** Lane D item, gated on step 1 landing green — merging two exported
components changes the module's public surface that `ClinicPetsPhotoDisplay.test.tsx` and
`ClinicPetsMedicalTab.test.tsx` import by name.

### 2.3 ClinicEMR.tsx — one draft record smeared across eleven useState
**Problem.** The record editor holds `subjective`, `objective`, `assessment`, `plan`, `weightKg`,
`tempC`, `heartRate`, `respRate`, `anatomy`, plus `saving`/`saveMsg` as eleven independent `useState`
(L379-389). They are written together (four `useEffect` hydrate them from the fetched record), read
together (one `body` object at save, L490/494), and reset together. Eleven setters where the domain has
one object; the four `useEffect` exist only to keep the eleven in sync with one query result.

**Smallest fix.** Collapse the nine field states into one `draft` object with a single
`setField(k, v)` updater, so the four hydration effects become one `useEffect` that sets `draft` from
the query result. Eleven `useState` → three; four `useEffect` → one. `saving`/`saveMsg` stay as they
are. `AnatomyCanvas` and `PrescriptionPanel` are already extracted components with their own state —
**leave both alone in this item**; they are separate candidates and neither is on the critical path.

### 2.4 ClinicBilling.tsx — a 415-line checkout with no seam
**Problem.** The default export (L45-460) does pet search, cart assembly, discount, loyalty
redemption, VAT computation, payment method, tender/change, PromptPay QR polling and invoice creation
in one function body over 14 `useState`, with `api.post('/api/loyalty/redeem', …)` written twice
(L165 and L185) with the same arguments.

**Smallest fix.** Extract the *money* computation — subtotal → discount → loyalty redemption → `calcVat`
→ total — into one pure function `computeTotals(cart, discount, redeemPts, vatMode, vatRate)` in the
same file, testable with no DB, no network and no UI (`architecture-rules.md` §8.1). `calcVat` is
already pure and already tested; this extends the same seam over the rest of the arithmetic. Then
de-duplicate the two identical `/api/loyalty/redeem` call sites. Nothing else — no component split, no
state collapse — until the characterization suite of §1 exists for this file.

---

## 3. Recommended order

**ClinicInpatient → ClinicPets → ClinicEMR → ClinicBilling**

This follows the default heuristic (best coverage / lowest risk first) and the additional constraints
below reinforce rather than override it.

| # | File | Risk | Payoff | Coverage | Why here |
|---|---|---|---|---|---|
| 1 | `ClinicInpatient.tsx` | lowest | modest | sufficient | Only file whose Gate 0 is already ~met. Also the reference implementation — it alone already uses `useMutation` throughout, has `CageCard` extracted, and consumes the shared `VitalStepper`. **And it is upstream:** `ClinicPets.tsx` imports `{ AdmitModal }` from it, so migrating Pets first would leave a half-restructured cross-view dependency. |
| 2 | `ClinicPets.tsx` | high | **highest** | insufficient | Biggest duplication payoff in the phase (456 lines of five-times-copied modal). Sits second because its dependency (`AdmitModal`) is then already done and locked, and because the largest payoff deserves the second-safest slot rather than the last. Needs a full characterization suite first. |
| 3 | `ClinicEMR.tsx` | medium | medium | partial | The only file with **zero** modal roots, so 100% of its change is Lane-D-legal with no §0 ambiguity at all. Its existing four test files already establish the correct harness (real component + real `api` mock), so the Gate 0 write-up is an extension, not a greenfield. |
| 4 | `ClinicBilling.tsx` | **highest** | high | none | Money: VAT (ADR-0020), loyalty redemption, invoice creation — with zero rendered coverage on the flow that does it. Goes last so the Gate 0 → baseline → restructure → test-set-equality mechanics are proven three times before they are pointed at revenue. |

**The one judgement call:** ClinicInpatient has the *least* structural pain of the four, so "start where
it hurts" would argue for Pets. Rejected — Lane D orders by `risk · payoff · existing coverage`, this is
the largest phase in the backlog, and proving the Phase 7 mechanics (census stays green, test-set
equality, reverse-ponytail evidence) on the cheapest file is worth more than front-loading payoff.

---

## 4. Gate 0 plan — `ClinicInpatient.tsx` (item 1)

**Output file:** `src/frontend/src/__tests__/ClinicInpatient.characterization.test.tsx` — a **new**
file. The existing `ClinicInpatient.test.tsx` is not edited, so its 30 test names survive verbatim into
the gate-4 comparison.

> **Sequencing trap — state this in the PR.** Lane D gate 4 requires the test-name list to be identical
> before and after. Gate 0 requires *adding* tests. The baseline for gate 4 is therefore recorded at
> Lane D **step 1 — after the characterization tests land and before any source file is touched.**
> Adding tests happens in a commit of its own, against unmodified source.

### 4.1 What must be locked down, and why

The existing suite covers behaviour thoroughly but has gaps that sit exactly where §2.1's change lands
— the modal open/close lifecycle. Six areas:

| # | Behaviour | Why it must be locked |
|---|---|---|
| G1 | **Close paths** — Cancel button, X button, and backdrop click each unmount the modal | The three→one state collapse rewrites every close handler. Nothing currently asserts a modal closes at all. |
| G2 | **Mutual exclusion** — opening one modal while another is open is not reachable; exactly one modal is in the DOM at a time | This is the invariant the union makes unrepresentable. Record the current truth before making it structural. |
| G3 | **Discharge flow** — confirm → `PUT /api/hospitalizations/:id/discharge` → board refetch; declining the confirm calls nothing | `handleDischarge` (L700) and its mutation (L690) have **no test whatsoever**. Delete is covered, discharge is not. |
| G4 | **Board-level states** — `Loading…`, `Failed to load inpatient data. Please refresh.`, `No active admissions`, and the `N active admission(s)` pluralisation | The root component's own render branches; only the empty state is touched today. |
| G5 | **Save closes the modal** — after a successful Care save and a successful Edit save, the modal unmounts | Tests assert the POST/PUT fires, never that `onSaved` actually closed anything. `onSaved` is rewired by the collapse. |
| G6 | **Care wizard back-navigation** — Next → Next → Back returns to the prior step with entered values intact | `step` is adjacent to the state being collapsed; every current test only moves forward. |

### 4.2 Test cases

Reuse `ClinicInpatient.test.tsx`'s existing harness verbatim — same `vi.mock('../utils/api', …)` shape,
same `QueryClientProvider` wrapper, same fixture builders. Do not invent a second harness.

```
describe('ClinicInpatient — modal lifecycle (Gate 0, G1/G2/G5)')
  1  Log Care → Cancel unmounts the care modal, board still rendered
  2  Log Care → X control unmounts the care modal
  3  Log Care → backdrop click unmounts the care modal
  4  Log Care → click inside the panel does NOT unmount   (stopPropagation guard)
  5  Edit → Cancel / X / backdrop each unmount the edit modal
  6  Care History → X and backdrop each unmount the history modal
  7  exactly one modal root is in the document at a time, across open→close→open of a different modal
  8  a successful Care save unmounts the modal and leaves the board rendered      (G5)
  9  a successful Edit save unmounts the modal                                     (G5)
 10  a FAILED Care save leaves the modal mounted  (pins today's behaviour; already partly covered at L306)

describe('ClinicInpatient — discharge (Gate 0, G3)')
 11  Discharge → confirm accepted → PUT /api/hospitalizations/:id/discharge, board refetched
 12  Discharge → confirm declined → no PUT issued
 13  the confirm message names the pet and mentions the billing invoice   (pins the exact string, L701)
 14  Discharge control is absent for an already-discharged admission       (verify current truth first)

describe('ClinicInpatient — board states (Gate 0, G4)')
 15  isLoading renders 'Loading…' in the header subtitle
 16  isError renders 'Failed to load inpatient data. Please refresh.'
 17  empty list renders 'No active admissions' and the discharge-or-none copy
 18  header count pluralises: 1 → '1 active admission', 2 → '2 active admissions'
 19  the refresh control triggers a refetch

describe('ClinicInpatient — care wizard navigation (Gate 0, G6)')
 20  Next → Next → Back → Back returns to step 1
 21  values entered on step 2 survive a Back/Next round trip
```

**Characterization discipline:** record what the code *does*, not what it should do. If case 14 shows
the Discharge control is present on a discharged admission, the test asserts *present* and the finding
is filed separately (Lane B), not fixed here. Same for any assertion that feels wrong while writing it.

### 4.3 Baseline confirmation to report back

After the file lands and **before** any source edit:

```
cd src/frontend && npx vitest run --reporter=dot \
  src/__tests__/ClinicInpatient.test.tsx \
  src/__tests__/ClinicInpatient.characterization.test.tsx \
  src/__tests__/modal-consistency.test.ts
```

Expected and to be recorded in the PR body: **3 files, 30 + 21 + census tests, all green.** Capture the
full test-name list here — that list, not the pre-Gate-0 98, is the gate-4 equality baseline.
Any red test at this point means the characterization recorded an assumption rather than the behaviour;
fix the test, never the source.

### 4.4 Reverse-ponytail projection for item 1

| Metric | Before | After | Direction |
|---|---|---|---|
| `useState` in the root component | 3 targets | 1 union | **down** |
| LOC in `ClinicInpatient.tsx` | 800 | ~785 | **down** |
| Files (production) | unchanged | unchanged | flat |
| Abstractions / dependencies | unchanged | unchanged | flat |
| Modal roots (census) | 4 | **4** | flat — must not move |

One metric down, none up → passes gate 6. If a proposed change makes the file *grow*, it is a feature
in disguise (arch-agent SKILL.md §8) — stop and re-scope.

---

## 5. What must not change, in every one of the four items

- **Contract:** every modal's rendered markup and dismissal behaviour; the `KNOWN_BESPOKE_MODALS`
  root counts; the named exports each test file imports (`PetDetail`, `OwnerPanel`, `AdmitModal`,
  `SuccessModal`, `ReceiptModal`, `PaymentHistoryTab`, `calcVat`); every API path, method and payload
  shape; every query key used in an `invalidateQueries` call.
- **Behaviour:** rendered output byte-identical. Anything observable that changes → stop, flag, and
  route to Lane A (the Phase 6 precedent, §0).
- **Test set:** no existing test edited or deleted. A deletion needs a recorded deleted-coverage
  justification in the PR body.
- **Security invariants:** untouched. These are frontend view components — no tenant scoping,
  permission check or plane boundary is in scope. `ClinicPets`'s `crm.delete` gate on the
  show-inactive control and `ClinicPetsMedicalTab`'s `emr.view` degraded states are **covered by
  existing tests and must stay green** — they are the client-side reflection of a server decision, and
  a refactor may only leave them exactly as strict.

---

## 6. Self-review (arch-agent SKILL.md §6)

1. **Simpler and still absorbs the expected change?** Yes — every item is a deletion or a collapse; the
   only thing added is one local hook in §2.2, replacing five copies of itself.
2. **Abstraction with no second implementation?** None proposed. No interface, no factory, no strategy.
3. **Pattern with no named problem?** No pattern is introduced. `useModalSubmit` is de-duplication of
   five existing copies, not a pattern from the whitelist.
4. **Business logic in a controller/repository/hook?** §2.4 moves money arithmetic *out* of a component
   body into a pure function — the correct direction.
5. **Core logic testable without infrastructure?** `computeTotals` (§2.4) is pure. The rest is view
   state and is tested through the existing RTL harness.
6. **Most expensive spot to maintain?** The `KNOWN_BESPOKE_MODALS` census allowlist, already flagged as
   such by the Phase 6 brief §8. Phase 7 does not touch it; it stays a tripwire, which is its job.
7. **Weakens tenant isolation, plane separation or deny-by-default?** No. No repository, no route, no
   permission code is in scope; the two permission-gated UI branches are pinned by existing tests.

---

## 7. Handoff

**Next dispatch:** `@dev-agent` writes §4.2 into
`src/frontend/src/__tests__/ClinicInpatient.characterization.test.tsx` — **tests only, no source
edits** — and reports the §4.3 baseline. That is Lane D gate 0 + step 1 for item 1.

Items 2-4 re-enter this document for their own Gate 0 plan when item 1 has merged.
