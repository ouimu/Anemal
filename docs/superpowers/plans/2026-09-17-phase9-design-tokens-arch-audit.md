# Arch Audit — Phase 9: Design-system drift (chart/canvas hardcoded hex)

Date: 2026-09-17 · Lane: **D (refactor)** · Branch: `refactor/phase9-design-tokens`
Tier: Arch Brief (Lane D target analysis, `arch-agent/SKILL.md` §8)
Source item: deleted `HANDOFF-code-quality-refactor.md`, Phase 9 entry
Scope of this document: **audit only — no source file was modified.**

---

## 0. Verdict up front

| Question | Answer |
|---|---|
| Is the drift real? | **Yes.** 5 distinct literals, 12 occurrences, 3 files — every one of them duplicating a value that is already tokenised. |
| Does `designTokens.ts` exist? | **No.** Nothing under `src/frontend/src` exports colour values to TypeScript. |
| Can Phase 9 stay in Lane D? | **Yes, but only in one specific shape** (static value-mirror). The obvious "better" fix is a Lane A change in disguise — see §4. |
| Are characterization tests needed? | **No.** Replace Gate 0 with a mechanical equality proof — see §7. |
| Does it pass reverse-ponytail? | **Not on the literal arithmetic.** All four counters rise. Flagged for `@ponytail-agent` — see §8. |

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

Line 6 already holds a **private** version of the pattern Phase 9 proposes:

```ts
const CHART = { secondary: '#006c4a', grid: '#e0e3e5', axis: '#45464d' }
```

Consumed at lines 61, 62, 65, 66 (×2), 67, 70, 71. So the real work here is not "extract a constant"
— it is **promote an existing private constant to a shared module and make the other chart use it.**

| Key | Literal | Maps to | Verdict |
|---|---|---|---|
| `secondary` | `#006c4a` | `--secondary` | **consolidate** |
| `grid` | `#e0e3e5` | `--surface-variant` | **consolidate** — but see the trap in §3.2 |
| `axis` | `#45464d` | `--on-surface-variant` | **consolidate** |

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

`#45464d` alone appears **5 times across 3 files**. After consolidation: once.

### 3.2 Trap — the two charts disagree, and Phase 9 must not resolve it

`AdminDashboard` draws its grid in `--outline-variant` (`#c6c6cd`).
`ClinicTransactions` draws its grid in `--surface-variant` (`#e0e3e5`).

Same conceptual role, two different tokens. Unifying them under one `CHART.grid` key would repaint one
of the two charts → **observable change → Lane A.**

**Therefore the shared module is keyed by token name, not by role.** Keying it `grid` would force a
choice the refactor is not allowed to make. Which token each chart uses for its grid is a design
decision belonging to `@uiux-agent` in a Lane A change, not to this branch.

### 3.3 `#0369a1` — the one literal with no token

Tailwind's stock `sky-700`. It violates **two** hard rules in `anemal-design-system/SKILL.md`
("No raw hex colors", "No generic Tailwind color utilities"), and it disagrees with the other chart's
series colour (`--secondary`). It is the strongest *evidence* of drift and the one thing Phase 9
**cannot legally fix** — recolouring that bar is an observable change.

**Recommendation:** freeze it, but do not launder it. Keep it out of the `TOKEN_HEX` map (it is not a
token value; putting it in a map of token values would be a lie) and place it in a clearly separated
`OFF_PALETTE` export with a pointer to the follow-up. Recolouring it to `--secondary` is a one-line
Lane A change for `@uiux-agent` to rule on.

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

---

## 4. The fork that decides the lane — read before implementing

The Phase 9 title says "design-system drift". An implementer who reads that and reaches for the
obviously-correct fix will silently leave Lane D. Both options are written out so the choice is explicit.

### Option A — static value-mirror *(the only Lane-D-legal option; recommended for this branch)*

Export the **current light-mode literals** as named constants. `TOKEN_HEX.outlineVariant === '#c6c6cd'`.

- Rendering is **byte-identical in both themes**. Contract unchanged. True Lane D.
- It removes the duplication and creates the missing seam.
- It does **not** make the charts theme-aware. It *names* the drift; it does not cure it.

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
*easy* to fix later (one module to change) and record it. Raised to the orchestrator in §9.

---

## 5. Contract (FROZEN) — the seam Step 6 builds against

**Path:** `src/frontend/src/utils/designTokens.ts`
Chosen over `src/frontend/src/designTokens.ts` to conform to the documented structure in `CLAUDE.md`
(`src/frontend/src/{components,views,hooks,utils,store}`). Conform first.

```ts
// designTokens.ts
// Token values for the three rendering surfaces a Tailwind class cannot reach:
// SVG presentation attributes (recharts), the canvas 2D context, and generated print documents.
//
// These are the LIGHT-mode values from :root in src/index.css. This module is deliberately
// STATIC: it does NOT follow the .dark theme. Making it theme-aware changes what renders in
// dark mode and is a Lane A change — see docs/superpowers/plans/2026-09-17-phase9-design-tokens-arch-audit.md §4.
//
// INVARIANT: every value below equals its :root counterpart in src/index.css.
// Enforced by utils/__tests__/designTokens.test.ts.

/** Mirror of the light-mode design tokens, keyed by token name (never by role — see audit §3.2). */
export const TOKEN_HEX = {
  outlineVariant:   '#c6c6cd',  // --outline-variant
  onSurfaceVariant: '#45464d',  // --on-surface-variant
  surfaceVariant:   '#e0e3e5',  // --surface-variant
  secondary:        '#006c4a',  // --secondary
  onSurface:        '#191c1e',  // --on-surface
  error:            '#EF4444',  // --error
  info:             '#0EA5E9',  // --info
} as const

/**
 * Ink for EMR anatomy annotations.
 * Intentionally theme-independent and intentionally NOT derived from TOKEN_HEX: this ink is
 * rasterised into imageData and stored in the medical record, so it must not vary with the
 * viewer's theme. The resemblance to --error / --on-surface / --info is a coincidence to
 * preserve, not a dependency to introduce. See audit §3.4.
 */
export const PEN_COLORS = ['#EF4444', '#191c1e', '#0EA5E9'] as const

/**
 * Colours with no counterpart in the token table. Not design-system values — parked here so the
 * literal has one home until a Lane A change retires it. See audit §3.3.
 */
export const OFF_PALETTE = {
  adminRevenueBar: '#0369a1',  // Tailwind sky-700; no token. Recolour = Lane A (@uiux-agent).
} as const
```

**Frozen rules for Step 6:**

- Named exports only. **No default export, no functions, no runtime theme lookup, no `getComputedStyle`.** Static string literals exclusively.
- Call sites change by **literal → symbol substitution only**. No restructuring of chart markup, no prop reordering, no extraction of chart components.
- `ClinicTransactions.tsx` keeps its local `CHART` object; only its *values* are sourced from `TOKEN_HEX` — preserving each chart's current token choice exactly (§3.2):
  `const CHART = { secondary: TOKEN_HEX.secondary, grid: TOKEN_HEX.surfaceVariant, axis: TOKEN_HEX.onSurfaceVariant }`
- `ClinicBilling.tsx` is **out of scope** and keeps its literals (§2.4).
- Casing is preserved exactly as written today (`#EF4444`, `#0EA5E9` uppercase; the rest lowercase). Normalising casing is a diff with no payoff and breaks byte-for-byte greppability of the before/after proof.

**File scope for Step 6 (exclusive):** `utils/designTokens.ts` (new), `utils/__tests__/designTokens.test.ts` (new), `views/admin/AdminDashboard.tsx`, `views/clinic/ClinicTransactions.tsx`, `views/clinic/ClinicEMR.tsx`. Nothing else.

---

## 6. Patterns used

**None.** No pattern from the `architecture-rules.md` §3 whitelist is needed or justified. This is a
constant-extraction — a shared module of literals, not an abstraction. No interface, no factory, no
strategy. Adding one would trip the abuse signals in `arch-agent/SKILL.md` §5.

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
`'#c6c6cd'` → `TOKEN_HEX.outlineVariant`, where `TOKEN_HEX.outlineVariant === '#c6c6cd'`.

The correctness property is **string equality**, which is mechanically decidable. A proof is
available that is *stronger* than any characterization test a human would write.

A test asserting `expect(bar.getAttribute('fill')).toBe('#0369a1')` would be a tautology restating the
constants file. jsdom performs no layout or paint, so a "visual" assertion here is only an
attribute-string assertion — the same tautology wearing a costume. The repo has **no snapshot tests**
(no `.snap` files anywhere) and no visual-regression tooling; inventing that apparatus for seven
string constants is disproportionate.

### Proposed Gate 0 substitute — three parts, all evidenced in the PR body

**(1) Value-equality invariant — the real gate, and the one new test worth keeping.**
`src/frontend/src/utils/__tests__/designTokens.test.ts` (~15 lines): parse the `:root` block of
`src/index.css`, convert each `--token` RGB triplet to hex, assert every `TOKEN_HEX` entry matches.

This is **additive, not characterization**. It is worth committing because it converts "these must
stay in sync" from a comment into an enforced invariant — it prevents Phase 9's drift from recurring,
which is the actual point of the phase. It also catches the one substantive risk of Option A: that
someone later edits `index.css` and leaves the mirror stale.

**(2) Repo-wide grep proof — before/after counts in the PR body.**
```
grep -rE "#[0-9a-fA-F]{3,8}" src/frontend/src --include=*.tsx --include=*.ts
```
Before: 12 occurrences across 4 `.tsx` files.
After: must return **only** `ClinicBilling.tsx:703-706` (the documented print-document exclusion),
plus the new `designTokens.ts` itself. Any other hit fails the gate.

**(3) Existing suite as the regression net — Lane D Gate 4 (test-set equality), unchanged.**
`npm test` in `src/frontend` green, with an **identical test-name list before and after**. Five
existing tests mount the affected views (`ClinicEMR.attachments`, `ClinicEMR.petAvatar`,
`ClinicEMR.petIdParam`, `ClinicEMR.weightSync`, `App.realRouting`). For a symbol substitution the only
real runtime risk is a bad or circular import, and those tests catch exactly that.

**Explicitly NOT required: a manual dark-mode visual comparison.** Phase 9 must not change dark-mode
rendering at all. If dark mode looks different afterwards, the implementation took Option B and is wrong.

---

## 8. Reverse-ponytail (Step 5) — FLAG, with the numbers

`refactor.md` §1 Gate 6: *at least one of {file count, LOC, abstraction count, dependency count} goes
DOWN, and none of the others goes up.*

| Counter | Before | After | Direction |
|---|---|---|---|
| File count | — | +2 (`designTokens.ts`, its test) | **up** |
| LOC | — | ≈ +45 net (call sites are 1:1 substitutions, ≈ 0 delta) | **up** |
| Abstraction count | — | +1 module | **up** |
| Dependency count | — | +3 import edges | **up** |

**On the literal arithmetic, Phase 9 REJECTS.** `arch-agent/SKILL.md` §8 is equally blunt: *"A refactor
that adds files, LOC, and abstractions is a feature in disguise — say so and stop."* This document is
me saying so.

The counter-argument, stated fairly: the duplication genuinely falls. `#45464d` goes from 5
occurrences to 1; distinct hardcoded colour literals in chart/canvas contexts go from 12 to 0.
"Duplication that has drifted" is named in `refactor.md` §6 as a model Lane D target. The gate's four
counters simply do not have a dimension that measures *duplicate literal values*, which is the thing
being removed. This is a known blind spot of size-based gates, not a loophole to argue around.

**This ruling is `@ponytail-agent`'s (mode `reverse`), not mine.** I am handing it the exact numbers
rather than pre-empting it. Two outcomes:

- **PASS / FLAG** → proceed with §5 as frozen.
- **REJECT** → the honest fallback is *not* to shrink Phase 9 further (there is nothing left to cut),
  but to **defer it and fold the module into the Lane A dark-mode-charts work** (§4.1), where the new
  file pays for itself immediately by making the charts theme-aware. Phase 9 standing alone buys a
  seam whose payoff is deferred; Phase 9 merged into that Lane A change buys a seam that is used the
  same day.

I lean toward proceeding (the drift is real, the seam is genuinely missing, and the follow-up work is
cheaper with it in place), but I do not get that vote.

---

## 9. Handoff, risks, and items this audit raises

**Recommended ADR (write at Step 6, not here): ADR-0029 — "Chart and canvas colour is a static
light-mode mirror, not a theme binding."** The decision in §4 outlives this feature: the next person
who sees `TOKEN_HEX` will want to make it theme-aware, and the reason not to (plus the reason
`PEN_COLORS` must *never* be, §3.4) needs a permanent home. Next free number is 0029.

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

**Highest-maintenance spot, and why it is acceptable:** the hand-maintained mirror between
`index.css :root` and `TOKEN_HEX`. Two places now hold the same seven values. That is accepted because
(a) the equality test in §7(1) makes drift a build failure rather than a visual bug, and (b) the
alternative — deriving the values at runtime — is precisely Option B, which is out of lane. It is a
duplication we can *detect*, replacing one we could only *notice*.

**Next step:** `/grill-with-docs` (Step 3.5) on this document, with §4 (the lane fork) and §8 (the
reverse-ponytail arithmetic) as the two questions to press hardest. Then `@pm-agent` for `/write-plan`.
