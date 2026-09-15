# ADR-0027 — The shared modal derives its dialog role from a dismissal policy, and is plane-neutral

**Status:** Accepted
**Date:** 2026-09-11 (proposed at Step 3.4; all open items decided by the human at Step 3.5)
**Related:** ADR-0001 (idle-logout is client-side only), ADR-0026 (authorization UI is recoverable and
honest — nav filtering is cosmetic, never the enforcement)
**Origin:** Step 3.4 arch brief —
`docs/superpowers/plans/2026-09-11-modal-consolidation-arch-brief.md`, from BA sign-off
`docs/superpowers/plans/2026-09-11-modal-consolidation-ba-signoff.md` §5.4, §5.9, R7
**Closed at Step 3.5 (`/grill-with-docs`):** D-1 → Option B (dismissal policy, below). D-4 → rename
now, target frozen in decision 2. Ponytail flag on the props union → accepted, union collapsed to two
branches. Nothing in this ADR is conditional.

---

## Context

`src/frontend/src/components/platform/PlatformModal.tsx` is being promoted from a
platform-console helper to the single dialog shell for the whole product: 5 platform-plane call
sites today, and 11 clinic-plane modal roots migrating onto it (of 13 surveyed — two in
`UserManagementTab` stay bespoke). Three things about it are currently true by accident rather than
by decision, and each one is load-bearing once 16 consumers depend on it.

**The dialog role is a per-site judgement call.** Step 1's human decision mandated
`role="dialog"` everywhere, no exceptions. `IdleLogoutModal` is `role="alertdialog"` with no close
button, no Escape handler and no backdrop dismissal — deliberately, because it is a timed
interruption over possibly-unsaved clinical data on a tablet. Applying the mandate literally
regresses WCAG semantics and creates a data-loss path (BA §5.4, R2). The BA's recommended
Option B relaxes the mandate to "the dialog role family — `dialog` or `alertdialog` where
semantically correct". But "where semantically correct" hands each developer the judgement call
that the whole feature exists to remove. A rule that still requires per-site judgement is not one
standard; it is eleven standards with a shared preamble.

**Plane-neutrality is accidental, and the name argues against it.** The component imports only
`react` and `MaterialIcon`. Nothing states that this must remain true. It is named `PlatformModal`,
lives in `components/platform/`, and after migration 11 of its 16 consumers are clinic-plane. A
future engineer adding a `useAuthStore()` call to it — to show the current branch in a header, say —
would fuse the two planes through a presentational component, on a path no route guard inspects
(BA R7). The name is the standing invitation to exactly that mistake.

**Unmount is an undocumented resource contract.** `if (!open) return null` unmounts children, so a
consumer's `useEffect` cleanup runs on close. `BarcodeScanner` depends on exactly this to stop the
camera `MediaStream` (BA R5). A later change to CSS-hiding instead of unmounting — the ordinary way
to add a close animation — would leave the tablet camera live after the dialog disappears, with
nothing failing loudly.

---

## Decision

### 1. Dismissal policy is declared; the dialog role is derived from it

The component takes one `dismissal` policy prop with three values. `role`, the presence of the
close (X) control, and the Escape and backdrop behaviours are all **computed from it**. No consumer
passes `role`, and no consumer decides which role is "semantically correct".

| `dismissal` | `role` | Close (X) | Escape | Backdrop click | `onClose` |
|---|---|---|---|---|---|
| `'dismissible'` *(default)* | `dialog` | rendered | closes | closes | **required** |
| `'explicit'` | `dialog` | rendered | **closes** | **no-op** | **required** |
| `'blocking'` | `alertdialog` | **not rendered** | no-op | no-op | optional, **never invoked** |

`'explicit'` suppresses the backdrop only. A backdrop tap is *accidental* — this is a touch-first
tablet product and a stray tap beside a confirm dialog is an ordinary event. Escape is *deliberate*,
and is the keyboard cancel affordance WAI-ARIA APG specifies for a dialog; removing it protects
nothing and costs keyboard users their documented exit. Cancelling a destructive confirm is the safe
direction in any case.

`'blocking'` is the only state that departs from APG's "Escape closes the dialog", and
`alertdialog` + a required response is precisely the case APG carves out for it.

**The props type is a two-branch union; the policy still has three values.** The two axes are
different and must not be conflated:

```ts
type DismissalPolicy = 'dismissible' | 'explicit' | 'blocking'

// branch A — the two dismissible policies: a dismissal affordance is rendered,
//            so a handler for it is mandatory
// branch B — blocking: no affordance is rendered, so a handler is not required
```

`onClose` is required under `'dismissible'` and `'explicit'` because those policies render a control
that must do something; a close button wired to nothing is a real bug and the type prevents it. Under
`'blocking'` it is merely unused, and the component never calls it.

**There is deliberately no type-level ban on `onClose` under `'blocking'`.** An earlier draft carried
`onClose?: never` on that branch. It was removed because it guarded the wrong axis: passing a dead
`onClose` alongside `'blocking'` is harmless, while the real failure — a developer writing
`dismissal='dismissible'` on `IdleLogoutModal` and restoring the data-loss path — was never
expressible as a type error in the first place. That failure is caught where it actually lives, by
the behavioural assertion named under *Testing constraint* below.

The `aria-live="assertive"` currently on `IdleLogoutModal` is **not** carried forward. A live region
that is created at the same moment as its content is not a reliable announcement mechanism; the
`alertdialog` role on mount is. It would also have announced a per-second countdown to screen-reader
users, which is hostile rather than helpful. This is a deliberate, recorded behaviour change and
`@qa-agent` verifies it with assistive technology rather than by assertion.

### 2. The shared modal is plane-neutral — in behaviour, and in name

**Behaviour.** The component **must not** import from, or otherwise read, the auth store, tenant
context, branch context, plane, permission set, router location, or any API client. It receives
everything it renders through props.

This is the same principle ADR-0026 decision 4 states for navigation: presentation is never the
boundary. A dialog shell that knows which plane it is on is a dialog shell that can be made to
behave differently per plane, and the two planes are not permitted to fuse. The component has no
legitimate reason to know, and 16 consumers across both planes make the constraint load-bearing.

Enforced by a test, not by a comment: the import list of the shared modal module is asserted against
an allowlist (`react`, `MaterialIcon`), and the test fails when a plane-specific import is added.

**Name and location — frozen target.** A shell named `PlatformModal` under `components/platform/`
contradicts the rule on its own file path, and 11 of its 16 consumers are clinic-plane. It moves:

| | From | To |
|---|---|---|
| Module | `src/frontend/src/components/platform/PlatformModal.tsx` | `src/frontend/src/components/Dialog.tsx` |
| Default export | `PlatformModal` | `Dialog` |
| Props type | `Props` (local) | `DialogProps` (exported) |
| Policy type | — | `DismissalPolicy` (exported) |
| Unit test | — | `src/frontend/src/__tests__/Dialog.test.tsx` |

**Why `Dialog` and not `Modal`.** Two reasons, one of them mechanical.

The mechanical one: `Modal` is already taken, twice, in files this feature has to touch.
`views/admin/AdminBloodBank.tsx:60` and `views/admin/UserManagementTab.tsx:36` each define a local
`function Modal(...)`, and both files host an in-scope migration (MODAL-9 and MODAL-3). An
`import Modal from '../../components/Modal'` in either is a duplicate-identifier error. `AdminBloodBank`
could resolve it by deleting its local copy, which is the migration anyway — but `UserManagementTab`'s
local `Modal` is the main user-edit dialog, **explicitly out of scope and staying bespoke**. Naming the
shared shell `Modal` would therefore force a permanent aliased import at one call site: the one
standard, imported under a different name at the one place a reader is most likely to compare against.
A census of `src/frontend/src` finds no `Dialog` identifier at all.

The substantive one: `Dialog` is the word this design already reasons in. Decision 1 derives
`role="dialog"` / `role="alertdialog"` from a policy, §5 of the brief calls the closed set "dialog
kinds", and the whole accessibility argument is WAI-ARIA APG's dialog pattern. "Modal" names a CSS
behaviour — and `aria-modal` is a *property* of a dialog, not its identity. The feature and its task
IDs stay `MODAL-*`; a task ID is not a component name.

**Why the root of `components/` and not a new `components/shared/`.** The repository already places
plane-neutral shared components at the root of `components/` — `MaterialIcon.tsx`, `Toggle.tsx`,
`Can.tsx`, `BranchSwitcher.tsx`, `IdleLogoutModal.tsx`. Subdirectories there carry a *plane or domain*
grouping (`platform/`, `roles/`) or a multi-file component (`BarcodeScanner/`). Inventing
`components/shared/` for one file would create a second convention for the thing the first convention
already covers, and would make the five components at the root look mis-filed — a directory whose
name is only true after an unrelated five-file move. Conforming costs nothing here and the move is
smaller: the module's own `MaterialIcon` import goes from `'../MaterialIcon'` to `'./MaterialIcon'`.

**Sequencing — this is the point of deciding it now.** The move is mechanical and changes no
behaviour, but its cost scales with the fan-out: **4 files and 5 call sites today** (the module plus
`components/platform/ClinicAdminsTab.tsx` ×3, `views/platform/CustomerListView.tsx` ×1,
`views/platform/PlatformPlansView.tsx` ×1, verified by census on `main`) versus 15 files and 16 call
sites once MODAL-2…MODAL-13 have landed. It therefore runs as its own task **before MODAL-1**, as a
pure move with no content change, so that MODAL-1's diff stays a contract diff and every later task
is written against the final path. The plan at Step 4 must sequence it there.

### 3. Closing unmounts; the modal owns no consumer resource

`open === false` **unmounts** the children. It does not hide them. Consumers own their own
resources — media streams, timers, subscriptions — and release them in their own `useEffect`
cleanup, which this unmount is the trigger for.

The shared modal holds no server state, opens no transaction, performs no fetch, catches no
consumer error, and is not an error boundary. An error thrown by dialog content is the consumer's,
and propagates past the modal untouched.

Any future change that keeps children mounted while closed — a close animation is the obvious one —
breaks `BarcodeScanner`'s camera cleanup silently and must be treated as a contract change requiring
an amendment to this ADR, not an implementation detail.

---

## Consequences

**Positive**

- The "one standard, no per-site judgement" goal becomes literally true: role is derived, not chosen.
- The `IdleLogoutModal` accessibility regression and the session-security data-loss path (R2) are
  avoided without a permanent carve-out from the standard.
- The destructive-confirm requirement that `MODAL-3` and `MODAL-6` already carry — and that the
  component on `main` cannot express at all — is satisfied by the same prop, not a second mechanism.
- R7 (plane fusion through a UI component) moves from "nobody has done it yet" to "the build fails",
  and the file path stops arguing for the mistake.
- R5 (orphaned `MediaStream`) gains a written contract instead of an accidental one.

**Negative / risks**

- A three-value policy is more surface than a boolean. Accepted only because all three values have
  named consumers on day one (**13 / 5 / 1** over 19 consumers as shipped — the day-one estimate at
  this decision's drafting was 13/2/1 over 16; the plan's Step 4 ACs for MODAL-5 and MODAL-9 mandated
  `'explicit'` at 3 additional sites the arch brief hadn't yet enumerated, confirmed correct by QA at
  Step 7, §3) — a boolean genuinely cannot
  distinguish "the user must choose, but is never trapped" from "there is no exit but the action",
  and those are two real, currently-existing behaviours in this codebase.
- `'blocking'` renders no close control, so an unrecoverable dialog is now expressible, and no type
  prevents a second site from adopting it. Bounded behaviourally, not structurally: `alertdialog` is
  derived with it, `IdleLogoutModal` is its single intended consumer, and the assertion below fails
  both when that site stops being blocking and when a second site starts.
- The rename touches 4 files before any migration begins, and `PlatformModal` remains in commit
  history, older plan documents and PR descriptions. Accepted as the cheaper half of an asymmetry
  that gets ~4× worse after the fan-out, and it is a pure move — no behaviour, no props, no markup.
- The feature, its task IDs and the census test keep the word "modal" while the component is called
  `Dialog`. A small, permanent vocabulary seam. Accepted because the alternative is a permanent
  aliased import at `UserManagementTab`, and because the census test genuinely censuses *modal roots*
  — a broader thing than this one component.

**Testing constraint (inherited from ADR-0026)**

Every acceptance criterion here must fail when the corresponding change is reverted.
"All migrated sites render identical header markup" is **not** such a criterion — once every site
renders through one component it cannot fail, and per ADR-0026 a non-falsifiable criterion is
treated as absent. The falsifiable form is a census over the source tree asserting that no
hand-rolled modal root exists outside a named allowlist; it fails the moment someone adds a root
that is not on it. See the arch brief §7 for the day-one allowlist (16 roots in 5 files) and for why
it is keyed by `path → count` rather than by `file:line`.

**The blocking-policy assertion — the guard that replaces the removed type-level ban.** Two paired
checks, both falsifiable in both directions:

1. `IdleLogoutModal` renders `role="alertdialog"`, exposes no close control, and does not close on
   Escape or on backdrop click. Fails if anyone makes the session warning dismissible.
2. `dismissal='blocking'` occurs at exactly **one** call site in `src/frontend/src/**`, and that site
   is `IdleLogoutModal.tsx`. Fails if a second site adopts the policy without a decision.

This is strictly stronger than the `onClose?: never` guard it replaces, which could not have caught
either failure.
