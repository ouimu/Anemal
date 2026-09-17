# Arch Audit — Phase 10 "Minor cleanup (batch, low risk)"

Date: 2026-09-17 · Lane: D (`/anemal-refactor`) · Agent: `@arch-agent` · Tier: Lane D target analysis
(SKILL.md §8) · Branch: `refactor/phase10-cleanup` (worktree, cut from `main` @ `58492ce`)
Source backlog entry: `.claude/roadmap/phase-history.md`, Backlog → Actionable (unscheduled), row `LaneD-P10`
Status: **audit only — no source file modified**

---

## 0. Headline

The backlog entry's three premises were checked against the live tree. **Two of the three counts in it
are wrong, and two of the three sub-items fail the Reverse-Ponytail gate (`refactor.md` §1 gate 6)
before they reach it.**

| # | Sub-item | Backlog claim | Actual | Reverse-Ponytail pre-check | Recommendation |
|---|----------|---------------|--------|---------------------------|----------------|
| 1 | Stray `.gitkeep` | 5 files | **8 files, all 8 stray** | **PASS** — files ↓8, nothing ↑ | **Do it** |
| 2 | Non-null assertions | 10, "needs guard comments" | **262 real** (16 frontend prod / 145 `req.context!` / 92 tests / 9 other) | **REJECT as framed** — nothing ↓, LOC ↑ | **Drop as framed** |
| 3 | Split `i18n/index.ts` | 717 lines → per-feature | 718 lines, **700 of them flat data, 18 logic** | **REJECT** — all four axes ↑ | **Drop, and close it out** |

Phase 9's lesson applies directly and is the reason for the two rejections: shipping overhead (QA
sign-off, PR, red-suite gate, five tracking docs) has to be paid per branch, so a sub-item must clear
that bar on its own merits, not on the momentum of the word "batch".

---

## 1. Sub-item 1 — stray `.gitkeep` files

### Finding

Eight `.gitkeep` files exist (all tracked in git, none untracked). **All eight sit in populated
directories**; none is still doing its job. The backlog's "5" undercounted by three.

| File | Sibling files (recursive, excl. `.gitkeep`) | Verdict |
|------|--------------------------------------------|---------|
| `src/backend/controllers/.gitkeep` | 34 | STRAY |
| `src/backend/routes/.gitkeep` | 35 | STRAY |
| `src/backend/services/.gitkeep` | 40 | STRAY |
| `src/frontend/src/components/.gitkeep` | 20 | STRAY |
| `src/frontend/src/hooks/.gitkeep` | 31 | STRAY |
| `src/frontend/src/store/.gitkeep` | 5 | STRAY |
| `src/frontend/src/utils/.gitkeep` | 9 | STRAY |
| `src/frontend/src/views/.gitkeep` | 46 | STRAY |

There is **no genuinely-empty directory holding a `.gitkeep`** anywhere in the tree, so there is no
subset to preserve. It is all eight, or none.

### Coupling check (the thing that would make this non-trivial)

A stray-file deletion is only zero-risk if nothing consumes it. Swept every `.ts/.tsx/.js/.cjs/.json/
.yml/.yaml/.ps1/.sh/.md/.toml`, `Dockerfile`, `.gitignore` and `.dockerignore` in the tree:

- **Zero references to `.gitkeep`** anywhere except the `LaneD-P10` backlog row in `phase-history.md`
  itself.
- No `.github/workflows/` directory exists — nothing in CI globs or copies them.
- Not referenced by `vercel.json`, `cleanup-remnants.ps1`, or either `package.json`.

The files are empty, inert, and unreferenced. Deletion cannot change behaviour, cannot fail a build,
and cannot turn a test red.

### Reverse-Ponytail pre-check (`refactor.md` §1 gate 6)

| Axis | Before | After | Direction |
|------|--------|-------|-----------|
| File count | 8 | 0 | **↓ 8** |
| LOC | 0 (files are empty) | 0 | flat |
| Abstraction count | 0 | 0 | flat |
| Dependency count | 0 | 0 | flat |

One axis down, none up → **PASS**. This is the only sub-item that clears the gate.

### What must not change

Nothing. There is no contract, no response shape, no permission code, and no behaviour attached to
these files. Gate 0 (characterization tests) is **vacuous** here — `.gitkeep` is not code and has no
behaviour to lock. That vacuity is worth stating explicitly in the PR body so QA does not go looking
for a baseline that cannot exist.

---

## 2. Sub-item 2 — non-null assertions

### Finding: the premise is wrong by ~26×

A whole-tree scan of `src/**/*.{ts,tsx}` (strings and comments masked) found **264 lines carrying a
non-null assertion**, of which 2 are false positives — JSX text and template-literal content ending in
`!` (`ClinicBilling.tsx:715` "Thank you!", `:803` "Payment Successful!"). **262 real.** They are not
one population; they are four, with very different risk:

| Bucket | Count | Assessment |
|--------|-------|------------|
| Test files (backend + frontend) | 92 | **Zero risk.** A null here fails the test — that *is* the assertion. Leave alone. |
| Backend `req.context!` idiom in controllers/routes | 145 | **Systemic, not a cleanup.** Guaranteed by `requirePlane`/auth middleware. See below. |
| Other backend production (drivers, seed, `owner.service`) | 9 | Mostly narrowed one line earlier. Low value. |
| **Frontend production** | **16** | The only interesting set — analysed individually below. |

The backlog's "10" most plausibly referred to a subset of the frontend-production 16. It should be
corrected to 16 before anything is planned, and the other 246 should be explicitly named as
out-of-scope so they are not silently swept in.

### The 16 frontend-production sites, individually assessed

**Safe — invariant provable from surrounding code (comment-only at most):**

| Site | Assertion | Why it holds |
|------|-----------|--------------|
| `main.tsx:9` | `getElementById('root')!` | Canonical React/Vite bootstrap. If `#root` is missing the app cannot boot at all. |
| `ClinicEMR.tsx:74` | `canvas.getContext('2d')!` | Guarded by `if (!canvas) return` on line 73. Already the correct pattern. |
| `ClinicEMR.tsx:89,100,108,129` | `canvasRef.current!` | Handlers `onDown`/`onMove`/`onUp` are bound to the `<canvas ref={canvasRef}>` element itself (lines 165–173). A pointer event cannot fire on an unmounted element. |
| `ClinicEMR.tsx:100,108,130` | `.getContext('2d')!` | `getContext('2d')` returns null only for an unsupported/conflicting context type. Not reachable on a plain 2D canvas. |
| `ClinicEMR.tsx:712` | `selectedRecordId!` | `record` comes from a query keyed `['record', selectedRecordId]` with `enabled: !!selectedRecordId` (line 417). Render is gated on `record?.attachments?.length`. Invariant holds — but it is **300 lines away** from the assertion. |
| `ClinicBilling.tsx:97` | `pet!.petId` | Inside a `queryFn` with `enabled: !!pet` on the line above. Standard React Query idiom. |
| `ClinicBilling.tsx:296,328` | `VAT_PRICE_LABEL_KEY[vatMode]!` | Inside a ternary that already tested the same index access. TS simply will not narrow a repeated index expression. |
| `AdminBloodBank.tsx:199` | `selectedBag!` | `mismatch = !!selectedBag && …` (line 151); the JSX is inside `{mismatch && …}`. Provable. |
| `ClinicInventory.tsx:244` | `product!.id` | `isEdit = !!product` (line 209); guarded by `if (isEdit)`. Provable. |
| `PaymentPage.tsx:52` | `ev.target!.result` | Guarded by `if (ev.target?.result)` on line 51. |
| `useBarcodeScanner.ts:23` | `videoEl!` | Sole caller renders `<video ref={videoRef}>` unconditionally and passes `active={true}` (`BarcodeScanner.tsx:40,47`). Refs attach before effects run. |

**The one site that is NOT provable from types — escalate, do not comment:**

`src/frontend/src/views/admin/UserManagementTab.tsx:65-66`

```ts
const uid = isNew ? (res.data as { data: { id: number } }).data.id : user.id!
await api.patch(`/users/${uid}/branch`, { branchIds: form.branchIds }).catch(() => {})
```

`isNew` is `!!user.isNew` (line 40) and `user` is `Partial<User> & { isNew?: boolean }` — so `!isNew`
does **not** imply `user.id` exists. The author already knew this: line 54 writes
`if (isNew || !user.id) { … return }`, testing both. At line 65 only `isNew` is tested. If `user.id`
were ever undefined the code would `PATCH /users/undefined/branch`, and the trailing `.catch(() => {})`
would swallow the failure **silently** — a wrong-URL write that reports success.

It is currently **unreachable**: the two call sites supply either `{ isNew: true }` (line 379) or a
complete `user` object (line 415). So this is not a live bug, and therefore **not Lane B today**. It is
a type-modelling gap plus an over-broad empty catch. A comment would document the hazard rather than
remove it; the honest fix is to narrow the type or test `user.id` directly — which is a behaviour-
adjacent change and belongs in its own item, not in a comment sweep.

### The enforcement problem that kills the "guard comment" framing

Both `.eslintrc.cjs` files extend `plugin:@typescript-eslint/recommended` on
`@typescript-eslint/eslint-plugin ^8.0.0`. In v8, **`no-non-null-assertion` lives in `stylistic`, not
`recommended`** — so the rule is currently **OFF**, in both backend and frontend.

That means a "guard comment" convention would have **nothing enforcing it**. The next PR adding a
`req.context!` would carry no comment, no lint error, and no reviewer signal. The comments would rot
from the day they land. Convention without enforcement is not a refactor; it is decoration.

The durable alternative — enable `no-non-null-assertion` — immediately lights up ~262 sites and forces
a decision on the 145-site `req.context!` idiom (for which `src/backend/utils/context.ts:5`'s
`requireBranchId(req)` is the existing precedent for a `requireContext(req)` helper). **That is a real
project with a real payoff, and it is emphatically not "Phase 10 minor cleanup."** Flagging it for the
backlog, not for this branch.

### Reverse-Ponytail pre-check

**As framed ("add guard comments to ~16 sites"):**

| Axis | Direction |
|------|-----------|
| File count | flat |
| LOC | **↑ ~16** |
| Abstraction count | flat |
| Dependency count | flat |

Nothing goes down, LOC goes up → **REJECT**. Gate 6 requires *at least one axis down and none up*.

**Reframed ("delete the ~5 assertions the compiler can already prove"):** `ClinicInventory:244`
(`if (isEdit)` → `if (product)`), `ClinicEMR:100,108` (`canvasRef.current!` → `e.currentTarget`, which
React types as `HTMLCanvasElement` — the type system proves it, no comment needed), `PaymentPage:52`
(use the in-scope `reader.result`), `ClinicBilling:296,328` (hoist to a local const so TS narrows).
That version is LOC-flat-to-slightly-down, file-flat, abstraction-flat, dependency-flat — a marginal
pass. But it is a **~6-line diff across 4 files**, which is Phase 9's rejected shape almost exactly.
Not worth a branch on its own.

### What must not change (if any variant is ever executed)

Route list, response envelope, permission codes, public function signatures, and the frontend test set
— in particular `RoleList.test.tsx`, `ClinicBilling.test.tsx` and `PlatformConsole.test.tsx`, which
themselves use assertions on DOM queries and must not be edited to accommodate a source change.

---

## 3. Sub-item 3 — split `i18n/index.ts`

### Finding: the file is data, not structure

`src/frontend/src/i18n/index.ts` is **718 lines**, and the shape matters more than the number:

| Region | Lines | Content |
|--------|-------|---------|
| Header comment + import | 1–13 | Explains the no-library decision |
| `const en: Dict` | 15–359 | **305 flat keys** |
| `const th: Dict` | 361–699 | **305 flat keys** |
| `DICTS`, `translate()`, `useT()`, exports | 701–718 | **~18 lines — all of the logic** |

The dictionaries are `Record<string, string>` — **flat maps with dotted string keys**
(`'clinic.billing.price'`), not nested objects. `en` and `th` are exactly parallel: 305 keys each,
zero prefixes missing on either side.

There is no god-object, no duplication that has drifted, no business logic in the wrong layer, no
scattered state booleans, no one-implementation interface. Against `refactor.md` §6's list of what a
good Lane D target looks like, **this file matches none of them.** It is 700 lines of translation data
and 18 lines of trivially-correct lookup.

`.claude/standards/architecture-rules.md` (160 lines, §§1–9) contains **no file-size or maximum-length
rule**. Nothing in the project's standards mandates this split.

### How keys are actually consumed (the DX question)

24 import sites reference `../i18n`:

- **23 of 24 import `useT` and nothing else.**
- **1** — `src/frontend/src/__tests__/i18n.coverage.test.ts:3` — imports `{ en, th, translate }`, and
  needs the **aggregate** objects to assert EN/TH parity (`Object.keys(en).filter(k => !(k in th))`).

So: a split would **not break import ergonomics**, because application code never imports the
dictionaries at all. But the same fact removes the motive — **no consumer would ever import a feature
slice.** The split would create 11 module boundaries that nothing crosses, and the one real consumer
needs them re-merged anyway.

### What the split would actually look like, and cost

Keys by prefix (EN / TH, identical):

```
clinic 146 · admin 27 · roles 25 · page 24 · nav 22 · common 20
login 18 · prefs 10 · menu 8 · top 3 · forbidden 2          = 305 each
```

Per-prefix split of a flat dotted-key map requires each file to export EN and TH fragments which
`index.ts` re-merges by spread:

```ts
// i18n/keys/clinic.ts
export const clinicEn: Dict = { 'clinic.billing.price': 'Price', … }
export const clinicTh: Dict = { 'clinic.billing.price': 'ราคา', … }

// i18n/index.ts
const en: Dict = { ...menuEn, ...topEn, ...pageEn, ...navEn, ...commonEn, ...loginEn,
                   ...prefsEn, ...clinicEn, ...adminEn, ...rolesEn, ...forbiddenEn }
```

- **Files:** 1 → 12
- **LOC:** ~718 → ~824 (≈77 lines of per-file scaffolding + ≈33 import/spread lines in `index.ts`)
- **Largest file after the split:** `clinic.ts` at ~310 lines. The `clinic` prefix is **48% of all
  keys**, so the split relieves less than half of the thing it is supposed to relieve — and two
  developers adding clinic strings still collide in the same file.

### Reverse-Ponytail pre-check

| Axis | Before | After | Direction |
|------|--------|-------|-----------|
| File count | 1 | 12 | **↑ 11** |
| LOC | 718 | ~824 | **↑ ~106** |
| Abstraction count | 0 module boundaries | 11 | **↑ 11** |
| Dependency count | 0 internal imports | 11 | **↑ 11** |

**All four axes rise.** `refactor.md` §1 gate 6: *"All four rising = a feature in disguise → REJECT."*
This is the textbook case, and my own SKILL.md §8 says the same thing: *"A refactor that adds files,
LOC, and abstractions is a feature in disguise — say so and stop."* Saying so, and stopping.

The minimal variant (split by language only, `en.ts` / `th.ts` / `index.ts`) is better — 1 → 3 files,
~+10 LOC, largest file halved to ~350 — but it still has **nothing going down**, so it fails the same
gate. It is a file move wearing a refactor's coat.

### Recommendation

**Drop, and close it out in `phase-history.md` with this reasoning**, so it does not resurface as a
"still outstanding" item in a later sweep. If the file ever becomes a genuine problem, the trigger to
watch for is a real one: a third language landing (at which point the EN/TH-parallel structure genuinely
breaks down), or a key count past roughly 1000. Neither is true today.

---

## 4. Scope guard — how many branches

**Recommendation: ONE branch, carrying sub-item 1 only.**

The backlog entry's "batch" framing does not survive its own premise. The three sub-items are three
unrelated changes — filesystem hygiene, defensive comments, and a module split — touching disjoint
files for disjoint reasons. `refactor.md` §2 is explicit that each backlog item gets *"one branch, one
review, one revert point."* Batching them would create a branch that cannot be reverted in pieces.

But that argument only bites when there is more than one item worth shipping, and **there is not**:

- **Sub-item 2** fails gate 6 as framed and has no lint rule to anchor it. → no branch.
- **Sub-item 3** fails gate 6 on all four axes. → no branch.
- **Sub-item 1** passes gate 6 cleanly and is provably inert. → this branch.

So the "1 branch vs 3 branches" question resolves to **1**, not because the items batch well, but
because two of them should not ship at all.

**On whether even sub-item 1 earns its own branch** — the Phase 9 test, applied honestly: Phase 9 was
rejected because a 4-line diff still needed visual-regression checking, so its overhead was real.
Sub-item 1's overhead is *bounded in a way Phase 9's was not*: zero characterization tests (nothing to
characterize), zero QA surface (no behaviour), zero contract risk, zero test-set movement. The residual
cost is branch + commit + PR + tracking docs. That is defensible for a change that permanently removes
8 misleading files and closes a backlog row.

**Acceptable alternative** if the orchestrator would rather not spend a PR on it: fold the 8 deletions
into the next branch that is already shipping for another reason, as its own separate commit
(`chore(repo): remove 8 stray .gitkeep files from populated directories`). `refactor.md` §3's
"never mix" rule bars mixing a refactor with a *feature or a bug fix* — a zero-behaviour file deletion
riding along as an isolated, independently-revertable commit does not create the ambiguity that rule
exists to prevent. This is the orchestrator's call, not mine.

**Do not** open three branches. Two of them would be gate failures walking into `@ponytail-agent`
in `reverse` mode, and that is exactly the Phase 9 outcome this audit exists to avoid repeating.

---

## 5. Backlog corrections to make (`@pm-agent` / `@scribe-agent`)

The `LaneD-P10` row in `.claude/roadmap/phase-history.md`'s Backlog → Actionable (unscheduled) table
currently reads *"5 stray `.gitkeep` files in
populated dirs; 10 non-null assertions without guard comments (worst: `ClinicEMR.tsx:100,108,130`
double-asserts canvas ref); split 717-line `i18n/index.ts` into per-feature files."* Three corrections:

1. `.gitkeep` count is **8**, not 5 — and all 8 are stray.
2. Non-null assertion count is **262 repo-wide**, of which **16** are frontend production. The cited
   `ClinicEMR.tsx:100,108,130` line numbers are still accurate and are all provably safe — those
   handlers are bound to the canvas element itself, so the ref cannot be null when they fire.
3. The i18n split is **rejected on Reverse-Ponytail**, not merely deferred.

Two items to add to the backlog **as separate entries, not as Phase 10 scope**:

- **`no-non-null-assertion` lint posture.** The rule is off in both `.eslintrc.cjs` files
  (typescript-eslint v8 moved it to `stylistic`). Turning it on means deciding what to do about the
  145-site `req.context!` idiom — `src/backend/utils/context.ts:5`'s `requireBranchId(req)` is the
  precedent for a `requireContext(req)` helper. Needs its own scoping; not a cleanup.
- **`UserManagementTab.tsx:65-66` type gap.** `!isNew` does not imply `user.id` by type, and the
  `.catch(() => {})` on the next line would silently swallow a `PATCH /users/undefined/branch`.
  Currently unreachable via both call sites, so not Lane B — but it is the one assertion in the
  frontend that is load-bearing rather than cosmetic.

---

## 6. Self-review (SKILL.md §6)

1. **Simpler and still absorbs the expected change?** Yes — the recommendation removes work rather than adding it.
2. **Abstraction with no second implementation?** None proposed. The i18n split would have created 11 module boundaries with zero consumers; rejected on exactly that ground.
3. **Pattern lacking a named problem?** No pattern proposed. Sub-item 3 was rejected *because* no problem could be named for it.
4. **Business logic in a controller/repository/hook?** Not touched by any surviving recommendation.
5. **Core logic testable without DB/network/UI?** Unchanged — nothing recommended alters any seam.
6. **Most expensive spot to maintain?** `src/frontend/src/i18n/index.ts` stays at 718 lines. Accepted: it is flat data with 18 lines of logic, EN/TH parity is enforced by `i18n.coverage.test.ts`, and splitting it costs four rising axes for no consumer benefit.
7. **Weakens tenant isolation, plane separation, or deny-by-default?** No. Nothing recommended touches `req.context`, a repository signature, a permission code, or a tenant-scoped query. The 145 `req.context!` sites are explicitly left alone; narrowing them is a separate, larger item and would only ever make the invariant stricter.

---

## 7. Handoff

- **Next gate:** `@ponytail-agent` in `reverse` mode, on sub-item 1 only. Sub-items 2 and 3 are
  pre-rejected here and should not be put in front of it.
- **If sub-item 1 is approved:** `@dev-agent` deletes the 8 files in one commit; `@qa-agent` confirms
  the frontend and backend suites are unmoved (test-set equality is trivially satisfied — no test
  references any of these paths); `@scribe-agent` ships, and records the Gate-0 vacuity in the PR body.
- **`@pm-agent`:** apply the §5 backlog corrections and close the two rejected sub-items with the
  Reverse-Ponytail reasoning attached, so they are not re-proposed.

---

## 8. Outcome, recorded 2026-09-17

**Sub-item 1 (`.gitkeep` cleanup) — implemented.** All 8 stray files deleted in one commit. No
Gate 0 characterization was possible or needed (empty files have no behavior); no test references any
of the 8 paths, confirmed by repo-wide sweep in §2. `@ponytail-agent` reverse-mode check is the only
remaining gate before shipping.

**Sub-items 2 and 3 — closed without implementation**, on this audit's own pre-check rather than a
formal `@ponytail-agent` REJECT (per §7's handoff instruction: pre-rejected items should not be put in
front of the gate). Sub-item 2 (non-null-assertion guard comments) as originally framed nets LOC up
with nothing down — the one genuine finding (`UserManagementTab.tsx:65-66`'s type gap, currently
unreachable via both call sites) is recorded as its own backlog item, not folded into a doc-comment
batch that an unenforced lint rule would let rot. Sub-item 3 (i18n split) is a textbook feature-in-
disguise per §6.6 — 23 of 24 consumers only ever import the aggregate `useT`, so no split boundary
would have a real consumer. Both close for the same reason Phase 9 closed: full Lane D branch overhead
would exceed the payoff of a change that fixes no present harm.
