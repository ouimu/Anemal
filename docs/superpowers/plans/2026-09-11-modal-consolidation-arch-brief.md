# Arch Brief — modal-consolidation

**Date:** 2026-09-11 · **Tier:** Brief · **Author:** @arch-agent · **Step:** 3.4, revised at 3.5
**Source:** `docs/superpowers/plans/2026-09-11-modal-consolidation-ba-signoff.md` (BA sign-off, Step 3)
**Upstream:** `docs/superpowers/plans/2026-09-11-modal-consolidation-pm-tasks.md` (Step 2)
**Durable decisions:** `docs/adr/0027-shared-modal-dismissal-policy-and-plane-neutrality.md` (Accepted)
**Downstream:** Step 4 `@pm-agent` `/write-plan`

> **Status: FINAL.** Step 3.4b (arch-precheck) and Step 3.5 (`/grill-with-docs`) are both closed. The
> human resolved D-1 (→ Option B), D-4 (→ rename now) and the Ponytail flag on the props union
> (→ accepted, two branches) on 2026-09-11. The §4 contract is no longer "frozen pending grill" — it
> is the finished seam Step 6 builds against, and §10 records outcomes rather than questions.

**Read from `main`, not from the `910b70c` worktree.** Every fact below was verified against live
source; where the reference commit disagrees, `main` wins.

**Three corrections this brief makes to inherited figures** — each verified by census on `main`, so a
reviewer comparing against the BA doc sees the divergence is deliberate, not drift:

| # | Inherited claim | Corrected to | Where |
|---|---|---|---|
| C-1 | BA §3.2: "18 total consumers after migration" | **16 consumers** (11 migrated clinic roots + 5 platform). 18 is the *surveyed call-site* count; 2 of the 13 clinic roots do not migrate. | §4, §7 |
| C-2 | Draft §7: census allowlist = the 2 `UserManagementTab` roots | **16 roots in 4 files** — the draft omitted the 14 Phase-7 god-component roots and would have failed on day one. | §7 |
| C-3 | Draft §4: "`ClinicGrooming.tsx:102` already hand-rolls exactly this structure" | It hand-rolls a **different** technique (CSS `sticky` inside a scrolling panel). The requirement is real; the evidence sentence was overstated. | §4 |

---

## 1. Problem & assumptions

One dialog shell must serve 16 consumers across both planes, and 11 migrations must be able to run
in parallel at Step 6. That is only legal if the seam is frozen here (CLAUDE.md Step 6). The seam is
one React component's prop contract — there is no backend, no route, no service, no repository and no
schema in this feature.

Three things block the freeze, all confirmed on `main`:

1. The component — `PlatformModal` on `main`, `Modal` after the §4 rename — has **no**
   `closeOnBackdropClick` prop. `MODAL-3` and `MODAL-6` both have
   acceptance criteria that assume it. The prop must be *added*, and its shape decided here.
2. `IdleLogoutModal` is `role="alertdialog"`, no close control, no dismissal — and the Step 1
   mandate ("`role="dialog"` everywhere, no exceptions") would regress it into a data-loss path
   (BA §5.4, R2). **Decided at Step 3.5 (D-1 → Option B):** it migrates onto the standard under a
   deny-by-default dismissal flag rather than being carved out. §4 carries the resolved contract.
3. `role="dialog"`, `aria-modal` and `aria-label` all sit on the backdrop `<div>` that also carries
   `onClick={onClose}`; the panel is its child. The element announced as the dialog is the backdrop,
   and the accessible name duplicates the visible `<h2>` (BA §5.9).

**Assumptions.** Step 1's four rendered changes stand. Focus-trap stays backlogged. No backend, DB,
permission-code or route change — `@db-agent` has no review surface (BA §7); confirm and release at
Step 6 W0. The 5 platform-plane consumers keep their current behaviour in this branch.

---

## 2. Complexity hotspots

| Area | Classification | Consequence |
|---|---|---|
| The shared modal's **prop contract** | rule-heavy, changes rarely, **16 dependants** (C-1) | the only thing that must be frozen |
| Per-site markup (11 migrations) | stable, independently changeable | fan-out; each task touches one file |
| **Dismissal + role semantics** | rule-heavy, one correct answer per dialog *kind* | the sole genuine design decision |
| Panel scroll structure (sticky footer, #6) | structural, one-time | absorbed into the standard, not a variant |
| Consumer-owned resources (`MediaStream`, timers) | lifecycle-sensitive | an unwritten contract today (R5) |

What changes often (per-site content and layout) is already separated from what does not (the shell).
The one thing that was *not* separated is dialog *kind* — currently encoded as eleven hand-rolled
markup decisions. That is the boundary this brief draws.

---

## 3. Logical model delta

**None.** No entity, relation, table, column, index, migration, query, state machine, permission code
or route changes. This is a presentation-layer consolidation.

The only model-shaped thing introduced is a closed set of **dialog kinds**, which is a TS union, not
data: it is bound to `switch`-style branching inside one component and changing it requires a deploy
(`architecture-rules.md` §7, row 3 — enum/union, not a lookup table).

---

## 4. Contract (FINAL — Step 3.5 closed)

The seam Step 6 builds against. Every open item that touched this section is now decided; nothing
below is conditional.

**Module identity (D-4 → rename now; frozen in ADR-0027 decision 2):**

| | Value |
|---|---|
| Module | `src/frontend/src/components/Dialog.tsx` |
| Default export | `Dialog` |
| Exported types | `DialogProps`, `DismissalPolicy` |
| Unit test | `src/frontend/src/__tests__/Dialog.test.tsx` |
| Moved from | `src/frontend/src/components/platform/PlatformModal.tsx` (export `PlatformModal`) |

The move is a pure rename — no behaviour, props or markup change — and runs as its own task **before
MODAL-1**, while it costs 4 files and 5 call sites instead of 15 and 16. Root of `components/` rather
than a new `components/shared/`, because that is where this repo already keeps plane-neutral shared
components (`MaterialIcon`, `Toggle`, `Can`, `BranchSwitcher`, `IdleLogoutModal`); rationale and the
full move census are in ADR-0027 decision 2.

> **`Dialog`, not `Modal` — and this one is load-bearing for Step 6.** Two in-scope files already
> define a local `function Modal(...)`: `views/admin/AdminBloodBank.tsx:60` (MODAL-9) and
> `views/admin/UserManagementTab.tsx:36` (MODAL-3). `AdminBloodBank`'s local copy disappears with its
> migration, but `UserManagementTab`'s is the main user-edit dialog that is **explicitly out of scope
> and stays**, so `Modal` would mean a permanent aliased import at that site — the one standard
> imported under a different name at the one place a reader compares against. No `Dialog` identifier
> exists anywhere in `src/frontend/src`. It is also the word this design reasons in: the role derived
> in the table below is `dialog` / `alertdialog`. Full rationale: ADR-0027 decision 2.

```ts
type DismissalPolicy = 'dismissible' | 'explicit' | 'blocking'

type DialogBase = {
  /** Visible dialog title. Rendered as the <h2> and referenced by aria-labelledby. */
  title:     string
  open:      boolean
  children:  React.ReactNode
  /** Width token class applied to the panel. Default 'max-w-lg'. */
  width?:    string
  /** Pinned action row. Omitted -> no footer element is rendered at all. */
  footer?:   React.ReactNode
}

export type DialogProps =
  // A dismissal affordance is rendered, so a handler for it is mandatory.
  | (DialogBase & { dismissal?: 'dismissible' | 'explicit'; onClose: () => void })
  // No affordance is rendered, so no handler is required. If one is passed it is never invoked.
  | (DialogBase & { dismissal:  'blocking';                 onClose?: () => void })
```

**Two branches, three policy values — these are different axes.** The props union has two branches
because there are exactly two `onClose` obligations (required / not required). `DismissalPolicy`
still has three values, each with named day-one consumers.

**Derived behaviour — no consumer passes `role`, and no consumer decides it.** Rationale for each
cell: ADR-0027 decision 1.

| `dismissal` | `role` | Close (X) | Escape | Backdrop | Day-one consumers |
|---|---|---|---|---|---|
| `'dismissible'` *(default)* | `dialog` | rendered | closes | closes | **13** |
| `'explicit'` | `dialog` | rendered | closes | **no-op** | **2** — MODAL-3, MODAL-6 |
| `'blocking'` | `alertdialog` | **none** | no-op | no-op | **1** — MODAL-12 |

**Consumer arithmetic — 16, not 18.** The BA's §3.2 labels 18 as "total consumers after migration";
that figure is the count of *surveyed call sites* (13 clinic modal roots + 5 platform usages). Two of
the 13 clinic roots — `UserManagementTab.tsx:100` and `:144` — are explicitly **not** migrating, so
the component has **16 consumers** on day one: 11 migrated clinic roots + 5 existing platform usages.
Breakdown **13 / 2 / 1**. Use 16 in acceptance criteria; 18 is a survey total, not a dependant count.

**`onClose` obligation, and what guards the real mistake.** `onClose` is *required* under
`'dismissible'` and `'explicit'` — a rendered close control wired to nothing is a real bug and the
type prevents it. Under `'blocking'` it is optional and never invoked; there is deliberately **no**
`onClose?: never` ban. That ban guarded the wrong axis: a dead `onClose` beside `'blocking'` is
harmless, while the failure that actually matters — someone writing `dismissal='dismissible'` on
`IdleLogoutModal` and restoring the data-loss path — was never a type error in any version of this
design. It is caught by the paired blocking-policy assertion in §7 (ADR-0027, *Testing constraint*),
which fails both when `IdleLogoutModal` stops being blocking and when a second site starts.

**Structural contract (three slots; exact token classes are `@uiux-agent`'s at Step 6):**

- Panel is a **column flex container** with a max height. Header `shrink-0`, body
  `flex-1 / overflow-y-auto / min-h-0`, footer `shrink-0`.
- **The body scrolls, the panel does not.** This is a change from `main`, where the whole panel
  scrolls and the header scrolls away. It makes the sticky-footer requirement (#6, R6) a property of
  the standard rather than a variant.
  *Evidence the requirement is real, stated precisely:* `ClinicGrooming.tsx` already achieves the same
  user-visible outcome by a **different technique** — `overflow-y-auto` on the panel (L102) with
  `sticky top-0` on the header (L105) and `sticky bottom-0` on the action row (L212). It is a
  pinned header and footer inside a *scrolling panel*, not a flex column with a scrolling body. The
  standard adopts the flex-column form instead because CSS `sticky` inside a padded scroll container
  is the fragile version of this: it depends on the sticky element being a direct child of the
  scroller and on no ancestor establishing `overflow`, and it silently degrades to a non-pinned row
  when either changes. Both forms satisfy MODAL-7's AC; only one of them keeps satisfying it after a
  later wrapper is added.
- **Accessible naming (fixes BA §5.9):** `role` and `aria-modal="true"` move onto the **panel**.
  The backdrop keeps only `onClick`. The name comes from `aria-labelledby` pointing at the `<h2>`'s
  id, generated with React 18's `useId()`. `aria-label` is **removed** — no duplicate name.
- **`open === false` unmounts children.** Not CSS-hidden. ADR-0027 decision 3.
- **Plane-neutral.** No import of the auth store, tenant/branch context, plane, permission set,
  router or API client. ADR-0027 decision 2.

**Fan-out precondition.** Two things, in order: (1) the rename above has landed, so every migration
is written against `components/Dialog.tsx` and none has to be rewritten afterwards; (2) that module
exports the contract above and the 5 platform consumers are green. `MODAL-2 … MODAL-13` may then start
in parallel. Nothing else gates the wave.

**Permission codes / HTTP / repository signatures:** unchanged. Use the BA's §4 and §6 tables verbatim.

---

## 5. Patterns used

**None.** No whitelist pattern is applied, so there is no four-line block to write.

Recorded because each was considered and rejected:

- **Strategy** for dismissal behaviour — rejected. Three fixed values resolved inside one component
  is a `switch`, not a swappable algorithm object. Strategy here would add an interface with three
  one-method implementations to replace three table rows.
- **Factory / variant components** (`ConfirmModal`, `AlertModal` wrapping the base) — rejected. A
  layer that only forwards props is an explicit abuse signal (`architecture-rules.md` §3), and it
  reintroduces the per-site judgement call the feature exists to remove.
- **Interface / port for the modal** — rejected. One implementation. A mock is not a second
  implementation.

The three-value *policy* union (`DismissalPolicy` — not the two-branch props union) is typing, not
abstraction: all three values have named, existing consumers on day one (13 / 2 / 1 over 16 consumers). A boolean cannot distinguish "the user must choose, but is
never trapped" from "there is no exit but the action" — both are real behaviours already in this
codebase.

---

## 6. Transaction & error boundary — **n/a, explicitly**

Stated rather than omitted, because "no transaction" is itself a contract clause here.

| Concern | Verdict | Why |
|---|---|---|
| Transaction boundary | **none exists** | No service, no repository, no Prisma, no HTTP. `architecture-rules.md` §5 places the boundary in a service; this feature has no service. |
| Error taxonomy (§4) | **untouched** | No error crosses a layer boundary in this component. Consumer mutations keep their own 400/403/404/409 handling. |
| Error boundary | **forbidden here** | The modal must not `try`/`catch` around children or act as an error boundary. An error thrown by dialog content is the consumer's and propagates past the modal untouched. |
| Tenant isolation | **no surface** | No query, no `tenantId`, no `WHERE` clause. Every migrated site's queries are unchanged; `@qa-agent` verifies the migration introduced no new query, per the BA's per-task ACs. |
| Plane separation | **strengthened** | ADR-0027 decision 2 turns accidental neutrality into an enforced rule. |
| **Resource lifecycle — the one real boundary** | **owned by the consumer** | Closing unmounts children; consumer `useEffect` cleanup releases media streams and timers. `BarcodeScanner` depends on this (R5). Frozen in ADR-0027 decision 3 so a future close-animation cannot break it silently. |

---

## 7. Test strategy

**Unit — the component, no DB, no network, no server (`src/frontend/src/__tests__/Dialog.test.tsx`):**

- `open=false` renders nothing **and unmounts children** — assert a probe child's cleanup ran.
  This is the falsifiable form of the R5 contract.
- The element carrying `role`/`aria-modal` is **not** the element carrying the backdrop click
  handler (fails today on `main` — the F-9 regression guard).
- `aria-labelledby` resolves to the `<h2>` whose text is `title`; **no** `aria-label` present.
- Heading is level 2 (`getByRole('heading', { level: 2 })`).
- Close control has an accessible name and a ≥44×44 target.
- **Dismissal matrix: 3 policies × 3 channels (X / Escape / backdrop) = 9 assertions**, plus
  `'blocking'` renders `role="alertdialog"` and exposes no close control.
- `footer` absent → no footer element; present → the footer sits outside the scrolling body.

**Blocking-policy assertion — the guard on the one unsafe policy (ADR-0027, *Testing constraint*).**
Two paired checks, falsifiable in both directions. This replaces the `@ts-expect-error` compile-time
assertion an earlier draft carried, and covers a failure that assertion could not reach:

1. `IdleLogoutModal` renders `role="alertdialog"`, exposes no close control, and does not close on
   Escape or backdrop click. **Fails if anyone makes the session warning dismissible** — the R2
   data-loss path.
2. `dismissal='blocking'` occurs at exactly **one** call site under `src/frontend/src/**`, and that
   site is `IdleLogoutModal.tsx`. Fails if a second site adopts the policy without a decision.

**Contract regression — the 5 platform-plane consumers (BA F-7):** `ClinicAdminsTab.tsx` (L82, L123,
L294), `CustomerListView.tsx` (L130), `PlatformPlansView.tsx` (L292). Each still opens and closes,
and its header exposes an `<h2>` with the expected title plus a close control. Structural assertions,
not whole-modal snapshots — a snapshot would fail on every legitimate token change and get
regenerated on sight.

**Census test — replaces MODAL-13's diff-check
(`src/frontend/src/__tests__/modal-consistency.test.ts`):**

The PM's AC *"all migrated sites use identical header/title/close-button markup (diff-check)"* is
**tautological once migrated** — every site renders one component, so it cannot fail — and BA F-6
shows it is simultaneously unsatisfiable on `UserManagementTab.tsx`, which keeps two non-conforming
roots by design. Per ADR-0026's testing constraint, a criterion that cannot fail is treated as
absent. Replace it with one that can:

- Scan `src/frontend/src/**/*.tsx` for a hand-rolled modal-root signature (a `fixed inset-0`
  overlay, or a literal `role="dialog"` / `role="alertdialog"`) outside the shared component.
- Assert the matching set **equals** a checked-in `KNOWN_BESPOKE_MODALS` allowlist carrying a reason
  string per entry.
- **Key the allowlist by `path → expected root count`, never by `file:line`.** A line-keyed list
  breaks on every unrelated edit to an allowlisted file and gets "repaired" by renumbering, which
  silently re-blesses whatever moved. A path+count key still fails when a *new* root appears in an
  already-allowlisted file, which is the failure the test exists for.

**Day-one allowlist — 16 roots in 4 files, verified by census on `main`.** This is the *post-migration*
steady state, which is when the test lands (MODAL-13):

| File | Roots | Lines | Reason |
|---|---|---|---|
| `views/clinic/ClinicBilling.tsx` | 5 | 615, 620, 644, 779, 797 | Phase 7 god-component — out of scope (PM §5) |
| `views/clinic/ClinicPets.tsx` | 5 | 74, 160, 262, 388, 478 | Phase 7 god-component — out of scope (PM §5) |
| `views/clinic/ClinicInpatient.tsx` | 4 | 294, 393, 463, 503 | Phase 7 god-component — out of scope (PM §5) |
| `views/admin/UserManagementTab.tsx` | 2 | 100, 144 | main edit out of scope; self-demotion per **D-2** |

`IdleLogoutModal.tsx` is **not** on this list: D-1 resolved to Option B, so it migrates onto the
standard under `dismissal='blocking'` and stops being a hand-rolled root. One conditional entry
remains — `BarcodeScanner.tsx` (1), added **only** if **D-3** carves it out, decided last per §9.

> **This corrects a defect in the draft of this brief.** The earlier allowlist named only the two
> `UserManagementTab` roots and would have **failed on day one** against the 14 Phase-7 roots that are
> deliberately out of scope. The 14 were verified present on `main` by census, not assumed.

- The test fails the moment a *seventeenth* hand-rolled root appears, or a new one lands in an
  already-allowlisted file. That is the whole value.

**Plane-neutrality test (R7):** assert the import list of `src/frontend/src/components/Dialog.tsx`
against an allowlist (`react`, `MaterialIcon`). Fails when anyone adds `useAuthStore` or any
tenant/plane import.

**Counts (BA §3.2, corrected twice — verified by census on `main`):** 13 clinic-plane modal roots in
the 11 in-scope files — not 11, because `UserManagementTab` holds three (L100, L144, L253) — of which
**11 are in scope** and 2 are excluded; plus **5** existing platform-plane consumers. That is **18
surveyed call sites** but **16 consumers** of the component after migration (11 + 5). A further **14**
hand-rolled roots exist in the three Phase-7 god-components and are out of scope entirely; they are
counted here only because the census test must allowlist them.

**Isolation tests:** `architecture-rules.md` §8.2 requires one per repository function. There are no
repository functions in this feature, so none apply. The plane-neutrality and census tests are the
structural guards that take their place.

**Not covered here:** focus trap / focus-on-open (backlogged, unchanged); assistive-technology
verification of the countdown announcement after `aria-live` is dropped — a manual AT check assigned
to `@qa-agent`, not an automated assertion.

---

## 8. Risks & the highest-maintenance spot

| # | Risk | Handling |
|---|---|---|
| R1 | Contract change breaks the 5 unlisted platform consumers | Contract regression suite, §7. Their behaviour is unchanged: they take the default policy. |
| R2 | Dismissible session warning → data loss mid-consult | The paired blocking-policy assertion, §7 — `IdleLogoutModal` must render `alertdialog` with no dismissal channel, and `'blocking'` must have exactly one call site. Fails in both directions; a type guard could catch neither. |
| R5 | Orphaned `MediaStream` | Unmount-on-close frozen (ADR-0027 §3) + the probe-child cleanup test. |
| R6 | Sticky-footer unresolved blocks MODAL-7 | **Dissolved** — the `footer?` slot and body-scrolls structure are the standard, not a variant. No exception needed for #6. |
| R7 | Plane fusion via a UI component | Import-allowlist test + ADR-0027 §2. |
| R8 | "No exceptions" erodes into per-dev judgement | Two of the three candidate exceptions are dissolved (#6 by the footer slot, #11 by `'blocking'`). Only #10 remains eligible, under the §9 format. |
| R9 | Rename churn against in-flight work | The move is pure (no behaviour, props or markup) and lands **before MODAL-1**, so no migration is written twice. Older docs and commit history keep the `PlatformModal` name; that is history, not a reference. |

**Highest-maintenance spot:** the `KNOWN_BESPOKE_MODALS` allowlist in the census test. It is the only
artefact here that unrelated work will trip over — any future edit that adds a modal root to
`ClinicBilling`, `ClinicPets` or `ClinicInpatient` fails the suite — and the tempting repair is
exactly the wrong one: append a line and the new hand-rolled root is silently blessed. Two things
bound it. Each entry carries a reason string, so an unjustified append is visible in review rather
than invisible in a count. And the key is `path → expected root count`, which is stable across the
ordinary edits that would break a `file:line` key, so the test stays quiet except when something real
changes. Accepted because the alternative is MODAL-13's original diff-check AC, which cannot fail at
all once every site renders one component — and per ADR-0026 a criterion that cannot fail is treated
as absent.

---

## 9. Exception record format (BA §10 item 4)

One format, same bar for every site. An exception is a file that keeps bespoke modal markup:

```
Site:      <file:line>
Reason:    <why the shared shell cannot carry it — a structural fact, not a preference>
Costs:     <which standard properties this site therefore does not get>
Revisit:   <the condition under which it rejoins the standard>
Allowlist: added to KNOWN_BESPOKE_MODALS in modal-consistency.test.ts
```

**Eligible sites after this design: one.** #10 `BarcodeScanner` — a camera viewfinder against the
shell's body padding and `max-w-lg`; decided last, after MODAL-13, per BA §5.5 and **D-3**.
#6 `ClinicGrooming` no longer needs an exception (the footer slot is standard). #11 `IdleLogoutModal`
needs none either: D-1 resolved to Option B, so it migrates under `dismissal='blocking'` rather than
being carved out.

---

## 10. Step 3.5 outcomes — decided, not open

Recorded by the human at `/grill-with-docs` on 2026-09-11. Applied above; listed here so a reader can
see what changed and why without reconstructing it from the diff.

| # | Decision | Applied in |
|---|---|---|
| **D-1** | **Option B.** `IdleLogoutModal` migrates onto the standard under a deny-by-default dismissal flag instead of being carved out. Under `dismissal='blocking'`, Escape is a no-op too — not just backdrop-dismiss and the close button — matching APG's `alertdialog` carve-out from the usual "Escape closes" rule. | §4 table, §7 blocking assertion, §9, ADR-0027 decision 1 |
| **D-4** | **Rename now.** `PlatformModal` → `Dialog` at `src/frontend/src/components/Dialog.tsx`, as its own pure-move task before MODAL-1, while it is 4 files and 5 call sites rather than 15 and 16. Plane-neutral name for a plane-neutral component; `Dialog` rather than `Modal` because `Modal` collides with existing local components in two in-scope files, one of them permanently. | §4 module identity, §8 R9, ADR-0027 decision 2 |
| **Ponytail flag** | **Accepted.** Props union collapsed from three branches to two; the `onClose?: never` guard on the blocking branch and its `@ts-expect-error` test are removed. The guard protected the wrong axis — the real risk is `dismissal='dismissible'` landing on `IdleLogoutModal`, which only a behavioural assertion can catch. | §4 type + `onClose` note, §7, §8 |
| **D-2** | **Out.** `UserManagementTab.tsx:144` self-demotion confirm stays out of scope, same bucket as the L100 main edit (Phase 7). §7 allowlist is written for this outcome — `UserManagementTab.tsx` stays a 2-root entry (100, 144). | §7 allowlist |
| **D-3** | **Confirmed.** MODAL-11 (`BarcodeScanner`) resequenced last (W4), with the defer exit kept. | §9 exception format, plan work-partition |

D-1 was materially narrower than the BA framed it, which was the main result of Step 3.4: because
`'explicit'` suppresses the backdrop only, Options A and B produced **identical behaviour at all 17
non-`IdleLogoutModal` call sites**, so the decision came down to one file and one prop's value set —
a permanent carve-out from a day-one standard, versus one extra union member. Option B was the
recommendation and is now the decision. It also corrects the BA's wording: "the dialog role family —
whichever is *semantically correct*" still left the judgement call with each developer, and deriving
`role` from `dismissal` removes it entirely, which is what Step 1 actually asked for.

---

## 11. Self-review (SKILL §6)

1. **Simpler and still absorbs the expected change?** Yes — one component, one added prop, one added
   slot. The simpler alternatives (a boolean; per-site judgement) each fail a requirement that
   already exists in the task list.
2. **Abstraction with no second implementation?** No. No interface, no base class, no port. The one
   policy union has 13/2/1 real consumers on day one, over 16 total, and the props union carries two
   branches because there are exactly two `onClose` obligations — not three shapes, after the Step 3.5
   simplification.
3. **Pattern with no named problem?** No pattern is used (§5).
4. **Business logic in a controller, repository or hook?** No backend touched; the component holds no
   logic beyond deriving four presentation values from one prop.
5. **Core logic testable without DB, network or UI?** The whole feature is UI; it is testable without
   DB, network or server, which is the applicable form.
6. **Most expensive spot?** The `KNOWN_BESPOKE_MODALS` census allowlist — §8, accepted because the
   criterion it replaces cannot fail at all, and bounded by per-entry reason strings and a
   `path → count` key.
7. **Weakens tenant isolation, plane separation or deny-by-default?** No. Plane separation is made
   **stricter** (ADR-0027 §2). Isolation and authorization are untouched — no query, no permission
   code, no route. Note on vocabulary: "deny-by-default" is an authorization invariant and is not
   what a dismissal default is; borrowing the term would import a guarantee that is not present.
   The unsafe case is handled by making it *unrepresentable*, which is stronger than defaulting
   against it.
