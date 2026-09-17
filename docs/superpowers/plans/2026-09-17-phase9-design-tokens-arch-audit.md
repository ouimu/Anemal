# Arch Audit — Phase 9: Design-system drift (chart/canvas hardcoded hex)

Date: 2026-09-17 · Lane: **D (refactor)** · Branch: `refactor/phase9-design-tokens`
Tier: Arch Brief (Lane D target analysis, `arch-agent/SKILL.md` §8)
Source item: deleted `HANDOFF-code-quality-refactor.md`, Phase 9 entry
Scope of this document: **audit only — no source file was modified.**
**Revision: rev 2** — supersedes rev 1's §5 after an `arch-precheck` BLOCK on criterion #1. Start at §0a.

---

## 0a. Revision note — rev 2, responding to a ponytail BLOCK

**`@ponytail-agent` (mode `arch-precheck`, Step 3.4b) returned BLOCK on criterion #1 (over-engineering)
against rev 1 of this document.** This revision responds to it. Rev 1 is superseded; the BLOCK was
correct and the finding is recorded here rather than quietly edited away.

**The finding.** Rev 1's §5 froze a new shared module, `utils/designTokens.ts`, exporting `TOKEN_HEX`,
`PEN_COLORS` and `OFF_PALETTE`. Counting actual cross-file consumers per exported value shows that
**exactly one value has a second in-scope consumer** — `#45464d`, shared by `AdminDashboard.tsx` and
`ClinicTransactions.tsx`. Every other value is consumed by exactly one file:

| Literal | In-scope consumer files | Shared? |
|---|---|---|
| `#45464d` | `AdminDashboard`, `ClinicTransactions` | **yes — the only one** |
| `#c6c6cd` · `#0369a1` | `AdminDashboard` | no |
| `#006c4a` · `#e0e3e5` | `ClinicTransactions` | no |
| `#EF4444` · `#191c1e` · `#0EA5E9` | `ClinicEMR` | no |

(`ClinicBilling.tsx` excluded throughout — see §2.4. Counts verified mechanically this session.)

A shared module for one genuinely shared value — whose other effect is to relocate two local patterns
that are **already correct** (`ClinicTransactions.tsx`'s private `CHART`, `ClinicEMR.tsx`'s
`PEN_COLORS`) — is a seam built for a sharing that does not exist. That is criterion #1, and rev 1's
own §8 had already flagged that all four reverse-ponytail counters rose. I argued past my own number;
the gate did not.

**What changed in rev 2:** §5 only (the frozen contract), plus the parts of §2.2, §3.1, §3.3, §3.4,
§7 and §8 that referenced the module. **What is unchanged:** every finding. The theme-awareness fact
(§1), the two-charts-use-different-grid-tokens trap (§3.2), the `PEN_COLORS`-must-stay-frozen
reasoning (§3.4), the `ClinicBilling` print-document exclusion (§2.4), the Option A/B lane fork (§4)
and the dark-mode legibility defect (§4.1) all stand as written. The audit was right; the proposed
structure was too big for it.

---

## 0. Verdict up front

| Question | Answer |
|---|---|
| Is the drift real? | **Yes, but it is smaller than the Phase 9 entry implied.** In scope: 8 distinct literals, 11 occurrences, 3 files (verified mechanically). **Only 5 of those 11 are bare call-site literals** — and all 5 are in one file, `AdminDashboard.tsx`. The other 6 already sit inside two correct top-of-file named consts. |
| Does `designTokens.ts` exist? | **No — and rev 2 does not create it.** Nothing under `src/frontend/src` exports colour values to TypeScript, and with one shared value there is nothing for such a module to carry (§0a). |
| Can Phase 9 stay in Lane D? | **Yes, in one specific shape** (static values, named locally, one file touched). The obvious "better" fix is a Lane A change in disguise — see §4. |
| Are characterization tests needed? | **No** — and rev 2 adds **no** test either. Gate 0 is replaced by a mechanical proof; the rev 1 invariant test is dropped, with reasons — see §7. |
| Does it pass reverse-ponytail? | **Still not cleanly, but the question is now a different size.** Rev 1: +2 files, ≈ +45 LOC, +1 module, +3 import edges. Rev 2: **+1 LOC, everything else flat.** See §8 — the ruling is `@ponytail-agent`'s. |

---

## 1. The load-bearing fact the original HANDOFF entry did not know

**This codebase is theme-aware, and 42 of its 46 colour tokens change value between light and dark.**

`tailwind.config.js` does not hold hex values. It maps every colour utility to
`rgb(var(--token) / <alpha-value>)`. The actual values live in `src/frontend/src/index.css` —
light in `:root` (line 10), dark in `.dark` (line 71). Dark mode is live and shipped:
`App.tsx:97` toggles `.dark` on `<html>` from `uiStore.theme`, and users flip it from
`ProfileMenu.tsx` and `views/settings/PreferencesPage.tsx`.

Every hardcoded hex in the three cited files — except one — is **exactly the light-mode value of a
token that flips in dark mode**:

| Literal | Token | Light | Dark | Flips? |
|---|---|---|---|---|
| `#c6c6cd` | `--outline-variant` | `#c6c6cd` | `#42474e` | **yes** |
| `#45464d` | `--on-surface-variant` | `#45464d` | `#c2c7cf` | **yes** |
| `#e0e3e5` | `--surface-variant` | `#e0e3e5` | `#42474e` | **yes** |
| `#006c4a` | `--secondary` | `#006c4a` | `#68dba9` | **yes** |
| `#191c1e` | `--on-surface` | `#191c1e` | `#e2e2e5` | **yes** |
| `#EF4444` | `--error` | `#ef4444` | `#ffb4ab` | **yes** |
| `#0EA5E9` | `--info` | `#0ea5e9` | `#38bdf8` | **yes** |
| `#0369a1` | *(none)* | — | — | **off-palette** |

This single fact decides the whole phase. It is why §4 exists.

---

## 2. Audit — every colour literal in a chart/canvas context

Line numbers are **current** (verified this session; they have shifted from the original entry).

### 2.1 `src/frontend/src/views/admin/AdminDashboard.tsx` (181 LOC) — recharts `<BarChart>`

| Line | Code | Literal | Maps to | Verdict |
|---|---|---|---|---|
| 136 | `<CartesianGrid strokeDasharray="3 3" stroke="#c6c6cd" />` | `#c6c6cd` | `--outline-variant` | tokenised elsewhere → **consolidate** |
| 137 | `<XAxis … tick={{ fontSize: 12, fill: '#45464d' }} />` | `#45464d` | `--on-surface-variant` | **consolidate** |
| 138 | `<YAxis … tick={{ fontSize: 12, fill: '#45464d' }} />` | `#45464d` | `--on-surface-variant` | **consolidate** |
| 141 | `contentStyle={{ …, border: '1px solid #c6c6cd', … }}` | `#c6c6cd` | `--outline-variant` | **consolidate** |
| 143 | `<Bar dataKey="total" fill="#0369a1" … />` | `#0369a1` | **no token** | **off-palette — see §3.3** |

### 2.2 `src/frontend/src/views/clinic/ClinicTransactions.tsx` (128 LOC) — recharts `<AreaChart>`

Line 6 already holds a **private, correct** version of the pattern Phase 9 is reaching for:

```ts
const CHART = { secondary: '#006c4a', grid: '#e0e3e5', axis: '#45464d' }
```

Consumed at lines 61, 62, 65, 66 (×2), 67, 70, 71 — all inside this file, by this chart, and nowhere
else. **This file is already in the target state.** Rev 1 proposed promoting this const to a shared
module; rev 2 does not, because two of its three values have no second consumer and the third
(`#45464d`) is better served by giving the *other* file the same local treatment. See §0a and §5.

| Key | Literal | Maps to | Verdict (rev 2) |
|---|---|---|---|
| `secondary` | `#006c4a` | `--secondary` | **leave** — single consumer, already named |
| `grid` | `#e0e3e5` | `--surface-variant` | **leave** — single consumer; and see the trap in §3.2 |
| `axis` | `#45464d` | `--on-surface-variant` | **leave** — the one shared value, but see §3.1 |

**`ClinicTransactions.tsx` is not modified by Phase 9.** It is the model the other chart copies.

### 2.3 `src/frontend/src/views/clinic/ClinicEMR.tsx` (767 LOC) — canvas 2D

```ts
// Canvas drawing requires literal color values (ctx.strokeStyle / inline swatch),
// so these mirror the error / on-surface / info token hexes from tailwind.config.js.
const PEN_COLORS = ['#EF4444', '#191c1e', '#0EA5E9'] as const     // line 62
```

Used at line 68 (`useState` initial ink) and line 148 (the swatch buttons, `style={{ background: c }}`).
The drift is **already documented in-place** by the comment at lines 60–61 — the previous author knew,
and correctly identified that a Tailwind class cannot reach `ctx.strokeStyle`.

**These three are a different kind of value from the chart colours, and must be treated differently — see §3.4.**

**`ClinicEMR.tsx` is not modified by Phase 9 either.** The constant is already named, already frozen,
already `as const`, and already carries the comment explaining why. There is nothing here to fix —
moving it into a shared module (rev 1) would have made it *less* safe, not more: see §3.4.

### 2.4 Out of scope — found during the audit, deliberately excluded

**`src/frontend/src/views/clinic/ClinicBilling.tsx` (816 LOC), lines 703–706** — not named in the
original Phase 9 entry. Contains `#191c1e`, `#45464d` (×2), `#e2e8f0` inside a `<style>` block of a
**generated print/invoice HTML document** rendered into a separate window.

**Leave these literal. Permanently.** A print document is a different document — it has no access to
the app's CSS custom properties — and a printed tax invoice must never follow the operator's dark-mode
preference. They are correctly hardcoded. Recorded here so a future audit does not "fix" them.

**`src/frontend/src/views/LoginView.tsx:88`** — `linear-gradient(rgba(15,23,42,0.4), rgba(15,23,42,0.1))`,
a decorative image scrim matching the `boxShadow` rgba values already in `tailwind.config.js`.
Not a chart/canvas context. Out of scope; note only.

---

## 3. Which literals become tokens, and which stay bespoke

### 3.1 The drift is real and one-directional

The same conceptual colours are tokenised correctly *everywhere the Tailwind class layer reaches*:
`text-on-surface-variant`, `border-outline-variant`, `bg-secondary` are used throughout the app. They
are hardcoded **only** on the three surfaces a `className` cannot reach:

1. SVG presentation attributes passed as recharts props (`stroke=`, `fill=`, `tick.fill`)
2. the canvas 2D context (`ctx.strokeStyle`)
3. a generated print document (§2.4, excluded)

**Root cause — a missing seam, not sloppiness.** The design system publishes its values to CSS (via
custom properties) and to JSX (via Tailwind classes). It publishes them to **TypeScript not at all.**
Three authors independently hit the same wall and each re-typed the hex. That is exactly the
"duplication that has drifted" target `anemal-dev-lanes/references/refactor.md` §6 names.

**But the seam being missing does not mean Phase 9 should build it** (rev 2's correction, §0a). Two of
the three authors who hit that wall *already solved it locally and correctly* — `ClinicTransactions.tsx`
with `CHART`, `ClinicEMR.tsx` with `PEN_COLORS`. Only the third, `AdminDashboard.tsx`, left its
literals bare. The honest measurement:

| Measure | Before | After (rev 2) |
|---|---|---|
| **Bare call-site hex literals** (in-scope) | **5** — all in `AdminDashboard.tsx` | **0** |
| Occurrences of `#45464d` (in-scope) | 3, across 2 files | 2, across 2 files |
| Files holding chart/canvas colour | 3 | 3 |
| Files where those colours are *named* | 2 of 3 | **3 of 3** |

So the duplication removed is modest and must be stated as such: `#45464d` goes from 3 in-scope
occurrences to 2, not to 1 — the two charts keep separate consts by design (§3.2). **The real win is
not de-duplication; it is that the one file still using bare literals stops doing so, and the codebase
ends up with one consistent way of naming an unreachable-by-Tailwind colour instead of two ways.**

Anyone arguing for a shared module must first answer: which second consumer does it serve? Today the
answer is "one value, `#45464d`" — and a whole module is not the right price for that.

### 3.2 Trap — the two charts disagree, and Phase 9 must not resolve it

`AdminDashboard` draws its grid in `--outline-variant` (`#c6c6cd`).
`ClinicTransactions` draws its grid in `--surface-variant` (`#e0e3e5`).

Same conceptual role, two different tokens. Unifying them under one `CHART.grid` key would repaint one
of the two charts → **observable change → Lane A.**

Rev 1 dodged this by keying the shared module by *token name* rather than by role — `TOKEN_HEX.outlineVariant`,
`TOKEN_HEX.surfaceVariant` — so that neither chart's choice was disturbed. That worked, but it is a
workaround: a module named for sharing, deliberately keyed so that nothing is shared.

**Rev 2 removes the trap instead of dodging it.** Two *local* `CHART` consts, one per file, may both
have a key named `grid` holding different values, and this is not a contradiction — it is simply two
files each describing their own chart. There is no shared key to collide, so no unification pressure,
so no way for a future editor to "tidy up" two keys into one and silently repaint a chart. **The
smaller shape is also the safer one here**, which is the strongest architectural argument for it and
not merely a concession to the gate.

Which token each chart uses for its grid remains a design decision belonging to `@uiux-agent` in a
Lane A change, not to this branch (follow-up #3, §9).

### 3.3 `#0369a1` — the one literal with no token

Tailwind's stock `sky-700`. It violates **two** hard rules in `anemal-design-system/SKILL.md`
("No raw hex colors", "No generic Tailwind color utilities"), and it disagrees with the other chart's
series colour (`--secondary`). It is the strongest *evidence* of drift and the one thing Phase 9
**cannot legally fix** — recolouring that bar is an observable change.

**Recommendation (rev 2):** freeze it, but do not launder it. Rev 1 gave it a separate `OFF_PALETTE`
export so it could not be mistaken for a token value — the right instinct, but it needed a whole module
to express. A local const does the same job for free: the key sits in `AdminDashboard.tsx`'s own `CHART`
object next to a comment saying it has no token. It is named, greppable and labelled as off-palette,
and it makes no claim to be a design-system value because the object it lives in makes no such claim
about anything. Recolouring it to `--secondary` remains a one-line Lane A change for `@uiux-agent` to
rule on (follow-up #2, §9).

### 3.4 `PEN_COLORS` — genuinely bespoke; do **not** bind these to tokens, ever

The brief asked for judgment on what should not be forced into a token. This is that case, and the
reason is stronger than aesthetics:

The selected pen colour is written to `ctx.strokeStyle`; the canvas is then serialised to
`value.imageData` (a data URL) and **persisted as part of the `AnatomyAnnotation` medical record.**
The ink is flattened into stored patient data.

Consequences:

- A theme-linked pen would mean the same "red" annotation is baked in as `#EF4444` when drawn in light
  mode and `#ffb4ab` when drawn in dark mode — **permanently, in different patients' records**,
  determined by a UI preference of whoever happened to be holding the tablet.
- Annotation ink is **semantic clinical data** (red = concern), not chrome. Its meaning must be stable
  across viewers, devices and years.
- Old records are immutable rasters regardless; only new ones would drift.

So `PEN_COLORS` deserves a **named, frozen, explicitly theme-independent** home — not a token binding.
The values happen to coincide with `--error` / `--on-surface` / `--info` today; that coincidence must
be documented as a coincidence, not encoded as a dependency.

**Rev 2: it already has exactly that home, and Phase 9 must leave it alone.** `ClinicEMR.tsx:62` is a
named, frozen, `as const`, theme-independent declaration carrying a comment (lines 60–61) that states
the reason. Every requirement in the paragraph above is already met.

Rev 1 proposed moving it into `utils/designTokens.ts` beside `TOKEN_HEX`. That would have been a net
loss of safety: placing medical-record ink in the same module as a table of *theme token mirrors*
invites precisely the edit the paragraph above forbids — a future reader tidying the module by
deriving `PEN_COLORS` from `TOKEN_HEX`, on the entirely reasonable-looking grounds that the values are
identical. The physical distance between these two kinds of value is doing real work. **Keep them in
different files.**

---

## 4. The fork that decides the lane — read before implementing

The Phase 9 title says "design-system drift". An implementer who reads that and reaches for the
obviously-correct fix will silently leave Lane D. Both options are written out so the choice is explicit.

### Option A — static value-mirror *(the only Lane-D-legal option; recommended for this branch)*

Give the **current light-mode literals** names, and keep the values exactly as they are:
`CHART.grid === '#c6c6cd'`.

- Rendering is **byte-identical in both themes**. Contract unchanged. True Lane D.
- It *names* the drift; it does not cure it, and does not make the charts theme-aware.
- Rev 2 note: this option is about **values staying static**, not about *where* the names live. Naming
  them locally (§5) and naming them in a shared module are both Option A. The BLOCK in §0a was about
  the second choice, not this fork — Option A vs B is untouched by it.

### Option B — bind to live token values *(Lane A — do not do this on this branch)*

Resolve `--outline-variant` at runtime (`getComputedStyle`) or emit `rgb(var(--outline-variant))`.

- Light mode: identical. Dark mode: **the charts change colour.**
- That is an observable rendered change → **disqualified from Lane D**, per
  `refactor.md`: *"If anything observable changes — a response shape, a status code, a permission,
  **a rendered result** — it is not a refactor."*
- Same class of failure as Phase 6 (modal markup) and Phase 7 (NaN-guard regression).

**Directive for `@dev-agent`: implement Option A. If the change makes any chart or swatch render
differently in dark mode, the change is wrong — not the dark mode.**

### 4.1 Latent defect this audit surfaces (not Phase 9's to fix)

In dark mode the two recharts surfaces render axis labels at `#45464d` (dark grey) against
`--surface` `#1a1c1e` (near-black). **The chart axes are effectively illegible in dark mode today.**

This is a real accessibility defect that exists on `main` right now, independent of Phase 9.
It is **Lane B or Lane A**, not Lane D — fixing it here would blow the lane. Phase 9 should make it
*easy* to fix later and record it. Raised to the orchestrator in §9.

Rev 2 sizing: after §5, each chart's colours are one named const at the top of its own file, so the
Lane A fix edits one line per chart instead of five scattered attributes in `AdminDashboard.tsx`. That
is the whole of Phase 9's payoff, stated plainly — it is preparation, and §8 asks whether that
preparation is worth +1 LOC today.

---

## 5. Contract (FROZEN, rev 2) — one file, one const, no new files

**Zero new files. Zero new imports. One file modified.** This supersedes rev 1's `utils/designTokens.ts`
module entirely — see §0a for why.

### 5.1 The whole change

`src/frontend/src/views/admin/AdminDashboard.tsx` — add one declaration at the top of the file,
alongside the existing module-scope consts (`STATS` at line 21, `dateStr`/`firstOfMonth` at 18–19),
mirroring the convention `ClinicTransactions.tsx:6` has used since it was written:

```ts
// Chart colours. Deliberately STATIC light-mode values: recharts takes SVG presentation
// attributes, which a Tailwind class cannot reach. These do NOT follow the .dark theme —
// making them theme-aware changes dark-mode rendering and is a Lane A change.
// See docs/superpowers/plans/2026-09-17-phase9-design-tokens-arch-audit.md §4 and §7.
// `bar` is off-palette (Tailwind sky-700, no token) — see audit §3.3.
const CHART = { grid: '#c6c6cd', axis: '#45464d', bar: '#0369a1' }
```

Then substitute at the five call sites. Line numbers verified this session:

| Line | Before | After |
|---|---|---|
| 136 | `stroke="#c6c6cd"` | `stroke={CHART.grid}` |
| 137 | `tick={{ fontSize: 12, fill: '#45464d' }}` | `tick={{ fontSize: 12, fill: CHART.axis }}` |
| 138 | `tick={{ fontSize: 12, fill: '#45464d' }}` | `tick={{ fontSize: 12, fill: CHART.axis }}` |
| 141 | `border: '1px solid #c6c6cd'` | `` border: `1px solid ${CHART.grid}` `` |
| 143 | `fill="#0369a1"` | `fill={CHART.bar}` |

Line 141 is the only non-trivial one: it is an interpolation inside a larger CSS shorthand string, not
a bare attribute. It stays a single string — do not decompose `contentStyle` into separate properties.

### 5.2 Files explicitly NOT modified

| File | Why |
|---|---|
| `views/clinic/ClinicTransactions.tsx` | Already correct. Local `CHART` at line 6 is the pattern being copied, not moved (§2.2). |
| `views/clinic/ClinicEMR.tsx` | Already correct. `PEN_COLORS` is named, frozen and commented; moving it reduces safety (§3.4). |
| `views/clinic/ClinicBilling.tsx` | Print document — correctly hardcoded, permanently (§2.4). |
| `utils/designTokens.ts` | **Does not exist and is not created.** One shared value does not warrant a module (§0a). |
| `src/index.css`, `tailwind.config.js` | Not touched. No token value changes. |

### 5.3 Frozen rules for Step 6

- **Values are byte-identical.** Casing preserved exactly as written today (`#c6c6cd`, `#45464d`,
  `#0369a1` all lowercase in this file). Normalising casing is a diff with no payoff and breaks
  byte-for-byte greppability of the before/after proof.
- **Substitution only.** No restructuring of chart markup, no prop reordering, no extraction of chart
  components, no `useMemo`, no moving `CHART` inside the component.
- **`const`, module scope, no `export`.** It is local by design. If a second file ever needs one of
  these values, that is the moment to reconsider a shared module — and it is a new decision with a real
  second consumer behind it, not this one.
- **No `as const`.** `ClinicTransactions.tsx:6` does not use it; match the sibling exactly. (`PEN_COLORS`
  needs `as const` because it is a tuple read by index; an object of strings does not.)
- **No runtime theme lookup, no `getComputedStyle`, no CSS-variable strings.** That is Option B (§4).
- **No new test file.** See §7 for the reasoning and the resolution.

### 5.4 Contract surface — unchanged, and that is the point

Nothing in this change is a seam. No exported symbol, no signature, no import edge, no request/response
shape, no permission code. **Step 6 has no parallelism to authorise here** — this is a single-file,
single-worker change, so the "freeze the seams for parallel work" purpose of a frozen contract does not
apply. What §5 freezes is the *diff*, not an interface.

**File scope for Step 6 (exclusive):** `src/frontend/src/views/admin/AdminDashboard.tsx`. Nothing else.

---

## 6. Patterns used

**None.** No pattern from the `architecture-rules.md` §3 whitelist is needed or justified. This is a
constant-extraction — three named literals in one file, not an abstraction. No interface, no factory,
no strategy, and (after rev 2) no module. Adding any of them would trip the abuse signals in
`arch-agent/SKILL.md` §5 — which is, in substance, what the §0a BLOCK found.

Against `architecture-rules.md` §7 ("where a value lives — code, or a table"): these values are
**code**. They are not per-tenant, not user-editable, and changing one requires a deploy. Row 3 of
that table. The ADR-0020 precedent (hardcoded VAT) does not apply — nobody configures a chart
gridline per clinic.

---

## 7. Gate 0 — characterization tests: **not required**. Use a mechanical equality proof instead.

The brief asked whether Gate 0 applies here in the same way it did for Phase 7. It does not, and the
reason is categorical.

Lane D mandates characterization tests because *"it still works" is an opinion* — true when behaviour
is state-dependent, as in Phase 7's state machines. Phase 9 is a **pure symbol substitution**:
`'#c6c6cd'` → `CHART.grid`, where `CHART.grid === '#c6c6cd'`.

The correctness property is **string equality**, which is mechanically decidable. A proof is
available that is *stronger* than any characterization test a human would write.

A test asserting `expect(bar.getAttribute('fill')).toBe('#0369a1')` would be a tautology restating the
constants file. jsdom performs no layout or paint, so a "visual" assertion here is only an
attribute-string assertion — the same tautology wearing a costume. The repo has **no snapshot tests**
(no `.snap` files anywhere) and no visual-regression tooling; inventing that apparatus for seven
string constants is disproportionate.

### Proposed Gate 0 substitute — (1) a dropped test and why · (2) a mechanical proof · (3) the existing suite

**(1) The value-equality invariant test is DROPPED. This is a decision, not an omission — read this
before proposing it again.**

Rev 1 specified `utils/__tests__/designTokens.test.ts`: parse the `:root` block of `src/index.css`,
convert each `--token` RGB triplet to hex, assert every frozen value matches. The `arch-precheck`
BLOCK identified that this test **contradicts the design intent it was meant to protect**, and on
review that objection is correct and decisive. Four reasons, in order of weight:

1. **Its failure mode invites the one edit this refactor exists to prevent.** The values are
   deliberately static (§4, Option A): they do *not* follow the theme, and they are *not* required to
   track `index.css`. So a red test here means "a token changed and the chart deliberately did not
   follow it" — which is the **designed** state, not a defect. The obvious repair for a red test is to
   update the frozen value to match. That repaints a chart: an observable change, shipped under a
   green suite, by someone who believed they were fixing a lint. A test whose correct response to
   failure is "do nothing" is worse than no test, because it trains the reader to either silence it or
   obey it, and obeying it is the harmful path.
2. **It asserts a property the design explicitly denies is binding.** "These must equal the CSS
   variables" is exactly what §4 rules out as the contract. Encoding a non-contract as an assertion
   misdescribes the system to every future reader.
3. **It breaks Lane D Gate 4.** `refactor.md` §1 Gate 4 is *test-set equality*: "the list of test names
   after == before." A new test file adds new test names. Rev 1 waved this through as "additive, not
   characterization"; that is not an exemption the gate offers.
4. **It is disproportionate and unprecedented here.** The repo has no CSS-parsing test infrastructure.
   Writing an `index.css` parser to guard three literals in one file is more machinery than the change
   itself. `ClinicTransactions.tsx:6` has held an identical unguarded const since it was written, with
   no drift incident.

**What carries the knowledge instead** — so it is not simply lost:

| Concern the test was meant to cover | Where it lives now |
|---|---|
| "Don't make these theme-aware" | The comment block on the const (§5.1), stating it in the file a future editor is already reading |
| "These no longer match the token" | Not defended, **by design** — divergence is the accepted state (§4). It only becomes a defect if charts *should* be theme-aware, which is follow-up #1 (§9), a Lane A decision |
| "Don't reintroduce bare literals" | The mechanical proof in (2) below, which enforces the property we actually hold |

**Standing rule for a future reader:** if you are about to add a test asserting these hexes equal
`index.css`, the answer is no — and the reason is that a mismatch is not a bug here. If you believe
the charts *should* track the theme, that is a real and probably correct position: open a Lane A
ticket (follow-up #1), do not encode it as an invariant test on a Lane D branch.

**(2) Mechanical proof — solution-neutral, stated as a property of the code, not of a chosen design.**

The property, which any acceptable implementation must satisfy:

> **No hex colour literal appears in a chart or canvas rendering context outside a module-scope named
> const declaration.** Equivalently: in the three in-scope files, every line containing a hex literal
> must be a `const NAME = …` declaration at module scope.

This is checkable without knowing which solution was chosen — it passes for rev 1's shared module, for
rev 2's local const, and for any third option someone prefers; it fails for bare literals at call
sites. That neutrality is deliberate: rev 1's version of this proof was written so that only the module
solution could satisfy it, which made the gate an argument for its own conclusion.

```
grep -rnE "#[0-9a-fA-F]{3,8}" src/frontend/src --include=*.tsx --include=*.ts
```

| | Lines with a hex literal | Of which are **bare call sites** |
|---|---|---|
| **Before** | `AdminDashboard` 136,137,138,141,143 · `ClinicTransactions` 6 · `ClinicEMR` 62 · `ClinicBilling` 703–706 | **5** (all `AdminDashboard`) |
| **After (required)** | `AdminDashboard` × 1 (the new const) · `ClinicTransactions` 6 · `ClinicEMR` 62 · `ClinicBilling` 703–706 | **0** |

`ClinicBilling.tsx:703–706` is the documented, permanent print-document exclusion (§2.4) and is
expected in both columns. **Any bare call-site hit in the "after" column fails the gate.**

**(3) Existing suite as the regression net — Lane D Gate 4 (test-set equality), now trivially satisfied.**
`npm test` in `src/frontend` green, with an **identical test-name list before and after**. Rev 2 adds
no test file, so Gate 4 passes by construction rather than by argument — one of the quieter benefits
of the smaller shape.

**Honest note on coverage, because it got thinner and `@ponytail-agent` should see that.** Rev 1 touched
`ClinicEMR.tsx`, which four existing tests mount (`ClinicEMR.attachments`, `.petAvatar`, `.petIdParam`,
`.weightSync`). Rev 2 does not touch that file, so those four are no longer a net for anything in this
change. **`AdminDashboard.tsx` has no dedicated test**; the only suite that reaches it is
`App.realRouting.test.tsx` (verified — it is the sole test file referencing it), which mounts the route
and would catch a module-scope crash but will not assert a `stroke` attribute.

This is acceptable, and the reason is the shape of the risk rather than the strength of the net. Rev 1
introduced a new module and three import edges, so "bad or circular import" was a live failure mode
worth catching. Rev 2 adds no import: the residual risk is a typo inside a five-line substitution in
one file — `CHART.axis` where `CHART.grid` was meant, or a mistyped hex. TypeScript catches a wrong or
misspelled key at compile time (the object is inferred, so `CHART.gird` does not compile). A mistyped
*hex value* is the one thing nothing catches automatically, which is why §5.3 freezes the values
byte-for-byte and (2) above prints the before/after lines: **the review of this change is a five-line
diff read, and that is a proportionate control for a five-line diff.**

**Explicitly NOT required: a manual dark-mode visual comparison.** Phase 9 must not change dark-mode
rendering at all. If dark mode looks different afterwards, the implementation took Option B and is wrong.

---

## 8. Reverse-ponytail (Step 5) — FLAG, with the numbers

`refactor.md` §1 Gate 6: *at least one of {file count, LOC, abstraction count, dependency count} goes
DOWN, and none of the others goes up.*

| Counter | Rev 1 (BLOCKed) | **Rev 2** | Direction |
|---|---|---|---|
| File count | +2 (`designTokens.ts`, its test) | **0** | flat |
| LOC | ≈ +45 net | **+1** (one const line; the 5 call sites are in-place substitutions) | **up, by one** |
| Abstraction count | +1 module | **0** — a local const object is a named literal, not an abstraction | flat |
| Dependency count | +3 import edges | **0** — no import added | flat |

**Phase 9 still does not pass Gate 6 as written.** The gate requires *at least one counter to go DOWN*,
and none does. I am not going to argue that +1 LOC is really a decrease, and I am not going to claim
the BLOCK fixed this — it changed the size of the question, not the answer to it.

What it changed: rev 1 asked "are two new files, 45 LOC, a module and three import edges worth removing
five bare literals?" — a question that answers itself. Rev 2 asks **"is one line worth removing five
bare literals and making the third chart file match the two that already do it right?"** That is a
genuine judgement call rather than a rhetorical one.

The counter-argument, stated fairly and now more modestly than in rev 1: bare call-site hex literals in
chart contexts go from 5 to 0, and the codebase converges on one way of naming an
unreachable-by-Tailwind colour instead of two. "Duplication that has drifted" is named in `refactor.md`
§6 as a model Lane D target. The gate's four counters have no dimension that measures *bare literals at
call sites*, which is the thing being removed — a known blind spot of size-based gates, not a loophole
to argue around. But the blind spot is worth much less here than rev 1 claimed: the actual
de-duplication is `#45464d` going from 3 in-scope occurrences to 2 (§3.1), and the rest is consistency.

**This ruling is `@ponytail-agent`'s (mode `reverse`), not mine.** Three outcomes, and unlike rev 1 I
have no lean to declare — the case is thin enough that I would not argue with a rejection:

- **PASS / FLAG** → proceed with §5 as frozen. One file, one const, five substitutions.
- **REJECT → close Phase 9 with no code change.** This is now a real and defensible outcome, and it was
  not available in rev 1's framing. Rev 1 offered "fold the module into the Lane A work" as the
  fallback; **that fallback is gone, because there is no module to fold.** The replacement is simpler:
  follow-up #1 (§4.1, dark-mode chart legibility) must rewrite `AdminDashboard.tsx:136–143` anyway, and
  whoever does it will name these values as a side effect of fixing them. Phase 9 would then have
  spent a branch to save that person four lines of editing.
- **REJECT → defer.** Equivalent to the above in practice; record Phase 9 as absorbed into follow-up #1
  so the audit's findings are not lost when the entry disappears.

The argument for doing it now rather than letting follow-up #1 absorb it is weak but not empty:
follow-up #1 is unscheduled, the five bare literals are live in the meantime, and the naming makes the
off-palette `#0369a1` (follow-up #2) visible to anyone reading the file. The argument against is that
this is preparation for work nobody has committed to — "for future flexibility with no named future"
is itself an abuse signal in `architecture-rules.md` §3, and follow-up #1 is a *proposed* future, not
a scheduled one. I put both on the table rather than choosing.

---

## 9. Handoff, risks, and items this audit raises

**ADR: not written by this branch (changed in rev 2).** Rev 1 recommended ADR-0029 — *"Chart and canvas
colour is a static light-mode mirror, not a theme binding."* Rev 2 withdraws that recommendation, for
the same reason the module was withdrawn: **this branch does not make that decision.** It changes no
theme behaviour, introduces no binding and settles no question that was open. An ADR recording a
decision nobody took is estate clutter, and `docs/adr/` is already carrying a numbering collision
(below).

The decision *is* real, but it gets made in **follow-up #1** (§4.1, dark-mode chart legibility, Lane A),
where someone must actually choose whether charts track the theme. **That branch writes the ADR, and
§3.2 / §3.4 of this audit are its source material** — in particular the argument that `PEN_COLORS` must
*never* be theme-bound, which is the most durable finding in this document and the one most likely to
be lost. Until then the reasoning lives in two places that a future editor will actually encounter: this
audit, and the in-code comments at `ClinicEMR.tsx:60–61` and (per §5.1) `AdminDashboard.tsx`.

If `@ponytail-agent` or the human grilling session disagrees and wants the ADR now, it is cheap and I
will not resist it — but I am not going to spend a number on a non-decision unprompted.

**Hygiene item for `@scribe-agent` (unrelated to Phase 9):** `docs/adr/` contains **two ADR-0027s** —
`0027-shared-modal-dismissal-policy-and-plane-neutrality.md` and
`0027-tenant-scoped-relation-traversal-carries-its-own-predicate.md`. Numbering collision; not mine to
renumber.

**Doc drift for `@uiux-agent`:** `.claude/skills/anemal-design-system/references/tokens.md` and
`SKILL.md` publish a **single hex per token**, which has been the *light* value only since the
2026-06-13 theming change. The documented token table is itself stale with respect to the CSS
variables it claims to describe. Phase 9 does not fix this; a reader of that table today would
reasonably believe `--error` is `#EF4444` in all themes. Worth its own small doc task.

**Follow-ups this audit spawns (each its own branch, none in scope here):**

| # | Item | Lane |
|---|---|---|
| 1 | Charts illegible in dark mode — axis `#45464d` on `#1a1c1e` surface (§4.1) | B or A |
| 2 | `#0369a1` is off-palette; recolour to `--secondary` or add a token (§3.3) | A (`@uiux-agent` rules) |
| 3 | Grid-token inconsistency between the two charts (§3.2) | A (`@uiux-agent` rules) |
| 4 | `tokens.md` publishes light values only, unlabelled | doc task |

**Highest-maintenance spot, and why it is acceptable (rev 2).** Rev 1 named the hand-maintained mirror
between `index.css :root` and `TOKEN_HEX`, defended by the equality test. Both are gone. The
highest-maintenance spot is now **`#45464d`, which remains written out in two files** —
`AdminDashboard.tsx` and `ClinicTransactions.tsx` — with nothing connecting them.

That is accepted, and the honesty required here is that it is accepted *as a cost*, not solved:

- Deriving it in one place is exactly the shared module the `arch-precheck` BLOCK rejected, and one
  shared value does not pay for a module (§0a). If a third consumer appears, revisit — that is a real
  second-implementation trigger, not a hypothetical one.
- A stale copy is low-severity by construction: the two values are *already* allowed to diverge (§3.2,
  §4), so divergence is not a defect until follow-up #1 decides charts should track the theme.
- The values are static and change only by deliberate edit. There is no mechanism by which they drift
  on their own.

Compared with rev 1 this trades "a duplication we can detect" for "a duplication we can see" — two
named consts, twelve lines apart in sibling files, rather than seven values mirrored across a module
boundary and policed by a CSS parser. For one shared literal that is the better trade, and if it stops
being true the trigger is explicit: **a third consumer.**

**Next step (rev 2): back to `@ponytail-agent` for `arch-precheck` re-check** — this revision responds
to a BLOCK and must clear it before anything else. Then `/grill-with-docs` (Step 3.5), with §8 (does
Phase 9 justify its own branch at all?) and §7(1) (is dropping the invariant test right?) as the two
questions to press hardest — §4's lane fork is settled. Then `@pm-agent` for `/write-plan`, or the
orchestrator closes Phase 9 into follow-up #1 if §8 lands on REJECT.

---

## 0b. Outcome, recorded 2026-09-17 — CLOSED, deferred to follow-up #1

`@ponytail-agent` re-ran both modes against rev 2 and split them:

- **`arch-precheck` — PASS.** The rev 2 shape (one local `const CHART` in `AdminDashboard.tsx`, zero
  new files/imports/exports) clears all three flagged criteria. The BLOCK against rev 1 was correct and
  is resolved, not argued away.
- **`reverse` — REJECT (criterion 6).** Even crediting the strongest honest reading — two literals at
  N=2 call sites collapsing to one named value each counts as a real "down" under this SKILL's own
  duplicated-call-site rule — LOC still goes up by 1 and nothing else goes down. The gate requires a
  down **and** nothing up; +1 LOC with a genuine abstraction-count down still fails "none of the others
  rises" on the letter of the rule.

Ponytail's reasoning for closing rather than shrinking further: the *arithmetic* is a tiebreak, not the
deciding argument — the deciding argument is that a full Lane D branch (QA sign-off, PR, red-suite
gate, five tracking-document updates, phase-history entry, HTML-updater) costs an order of magnitude
more than the four-line diff it would ship, to fix something causing **zero present harm** (the five
bare literals render byte-identical to the named version in both themes today). Meanwhile §4.1's
dark-mode axis-label legibility defect is a live, already-broken UI issue whose fix must rewrite these
same five lines anyway — Phase 9 would spend a branch to save that future fix four lines of editing.

**Decision: Phase 9 is closed without implementation.** No source file was ever touched (confirmed:
this branch's diff against `main` is docs-only, two commits, one file). This audit is the deliverable —
its durable findings (§1 theme-awareness table, §3.2 two-charts-different-grid-tokens trap, §3.4
`PEN_COLORS`-must-never-be-theme-bound reasoning, §2.4 `ClinicBilling` print-doc exclusion, §4.1's
dark-mode legibility defect, the off-palette `#0369a1`, the stale `tokens.md`, the ADR-0027 numbering
collision) carry forward as source material for whenever the dark-mode-charts Lane A work (follow-up
#1) is picked up — at that point the same five call sites get named as a natural side effect of making
them theme-reactive, at zero extra branch cost.

Recorded in `.claude/roadmap/phase-history.md`'s backlog section rather than left only in this file, so
the finding survives even if this branch and worktree are later cleaned up.
