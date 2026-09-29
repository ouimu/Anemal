# Brainstorm: Responsive Shell + EMR Portrait

**Lane:** A · **Step:** 1 (brainstorm) · **Status:** ⛔ awaiting human approval before Step 2
**Author:** @pm-agent · **Date:** 2026-09-28
**Origin:** `docs/superpowers/plans/HANDOFF-responsive-shell-emr-portrait.md` (escalated from Lane B,
i18n-completion QA backlog item, 2026-09-25)

---

## 1. Gap inventory

Confirmed by reading the current code against `anemal-design-system/references/sidebar-spec.md` §6
and `anemal-screen-specs/references/{00-shared-layout,05-emr}.md`. All widths below use the shared
scale: `w-14`=56px, `w-56`=224px, `w-64`=256px, `w-72`=288px, `w-80`=320px, viewport 768px portrait.

### 1.1 Sidebar shell — spec never implemented, one exception

| Layout | Evidence | Gap |
|---|---|---|
| `ClinicLayout.tsx:43-44` | `sidebarW = sidebarOpen ? 'w-56' : 'w-14'`; `mainClass = sidebarOpen ? 'ml-56' : 'ml-14'` — driven only by `uiStore.sidebarOpen`, no viewport read anywhere in the file | No ≥1280 expanded / 1024 collapsed-by-default / ≤768 hidden+hamburger behaviour. Sidebar-spec §6 fully unimplemented. |
| `AdminLayout.tsx:47-48` | identical pattern | Same gap. |
| `PlatformLayout.tsx:55-56, 136` | identical pattern; TopNav offset also keyed only off `sidebarOpen` (`left-56`/`left-14`) | Same gap. |
| `SettingsLayout.tsx:37-39, 43-44` | `useEffect(() => { if (window.innerWidth < 768 && sidebarOpen) toggleSidebar() }, [])` (comment: `LAYOUT-04`) | **Partial mitigation, not the spec.** Runs once on mount only (no `resize` listener — rotating the tablet after mount does nothing). Collapses to icon rail (`w-14`/56px), it does not hide + hamburger-overlay. No 1024 collapsed-by-default rule either. |

All four layouts duplicate the same sidebar markup/state wiring rather than sharing one component —
confirmed by the near-identical grep hits across all four files (no shared `<Sidebar>` import).

**Width math at 768 with sidebar open (`sidebarOpen=true`, the persisted default for a first-time
user):** sidebar `224px` leaves `544px` for content in every one of the four shells. `SettingsLayout`
alone forces a collapse to `56px` on first mount, leaving `712px` — still not the spec's "hidden".

### 1.2 EMR — no portrait layout

`ClinicEMR.tsx:576` (`w-56` patient/visit list) + center SOAP editor (`flex-1`) + `ClinicEMR.tsx:742`
(`w-72` attachments/prescriptions panel), per `05-emr.md` "Layout — 3-column workspace".

At 768 with sidebar expanded: `768 − 224 (ClinicLayout sidebar) − 224 (EMR list) − 288 (EMR panel) ≈
32px` for the SOAP editor — matches the HANDOFF's ~30px estimate. Even with the sidebar collapsed to
`w-14`/56px (the best case today, and only reachable in `SettingsLayout`, not `ClinicLayout`): `768 −
56 − 224 − 288 = 200px` — still below any usable text-editing width.

### 1.3 Other clinic screens with the same fixed-column pattern

Swept `src/frontend/src/views/clinic/*.tsx` for fixed Tailwind widths (`w-56`/`w-64`/`w-72`/`w-80`)
outside a responsive (`sm:`/`md:`/`lg:`) prefix:

| Screen | Evidence | Width math at 768 (sidebar open) | Verdict |
|---|---|---|---|
| `ClinicPets.tsx:879` | `w-72` fixed pet-list left panel, no responsive prefix | `768 − 224 (sidebar) − 288 (list) = 256px` for the detail pane | Squeezed but not zeroed; **compounds with the pre-existing, separately-tracked `h-full` overflow bug on this screen** (per the task brief) — same screen, two different defects. |
| `ClinicAppointments.tsx:124` | `w-80` fixed detail drawer, no responsive prefix; calendar grid is `grid-cols-7` (`:454,:459`) | `768 − 224 (sidebar) − 320 (drawer) = 224px` for a 7-column calendar (~32px/cell) | Same failure shape as EMR — a fixed side panel plus a multi-column grid in the remaining space. Only shows up when the detail drawer is open; the calendar alone is usable. |
| `ClinicBilling.tsx:388` | `w-full lg:w-96` — already responsive (full-width below `lg`) | n/a | **Not broken.** Uses the responsive-prefix pattern the others are missing. |
| `ClinicDashboard.tsx:138`, `ClinicInventory.tsx:68`, `ClinicInpatient.tsx:788` | `grid-cols-2 md:grid-cols-4`, `grid-cols-1 sm:grid-cols-3`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` | n/a | **Not broken.** Correct responsive-grid pattern already in use — evidence that the pattern is known in this codebase, just not applied to EMR/Pets/Appointments' side panels. |

**Read-across:** the codebase already has a correct pattern (`ClinicBilling`, `ClinicDashboard`,
`ClinicInventory`, `ClinicInpatient`) for grids that reflow. The defect is isolated to **fixed
side-panel layouts** (EMR list+panel, Pets list, Appointments drawer) that never got the same
treatment, plus the **sidebar shell itself**, which has no responsive treatment at all outside
`SettingsLayout`'s partial, mount-only fix.

---

## 2. Scope options

| | **Option A — full spec compliance** | **Option B — ClinicLayout + EMR only** | **Option C — shared sidebar component + EMR (recommended)** |
|---|---|---|---|
| Sidebar fix | All 4 layouts (`ClinicLayout`, `AdminLayout`, `SettingsLayout`, `PlatformLayout`) get full §6 behaviour (≥1280 expanded / 1024 collapsed / ≤768 hidden+hamburger), ideally by extracting one shared component | `ClinicLayout` only | Extract one shared `AppSidebar`/`useResponsiveSidebar` used by `ClinicLayout` first; `AdminLayout`/`SettingsLayout`/`PlatformLayout` re-point to it in the same PR since the markup is already near-identical (low marginal cost once extracted) |
| EMR portrait | Yes | Yes | Yes |
| Pets `w-72` panel | In scope | Backlog | Backlog (see note below) |
| Appointments `w-80` drawer | In scope | Backlog | Backlog |
| Pets `h-full` overflow bug | Explicitly out (separate pre-existing backlog item per task brief) | Out | Out |
| Relative size | Largest — 4 layouts + EMR + 2 more screens | Smallest — 1 layout + EMR | Middle — de-duplicates the layout code while fixing the same 2 screens as B |

**Recommendation: Option C.**

- **Must:** shared responsive-sidebar behavior (extracted once, applied to `ClinicLayout` and
  `AdminLayout` — both plain clinic-plane shells with identical markup) + EMR portrait layout. This is
  the origin defect (EMR unusable at 768) and its structural cause (the sidebar shell).
- **Should:** re-point `SettingsLayout` and `PlatformLayout` onto the same shared component in this
  branch. The marginal cost is low once the component exists (the grep sweep shows near-byte-identical
  duplicated JSX across all four files), and shipping only 2 of 4 layouts fixed leaves an inconsistent
  shell — a UX regression risk `@ba-agent`/human should weigh in on at the grill (open question #4
  below). If time-boxed out, defer `PlatformLayout`/`SettingsLayout` re-point to backlog, not the
  sidebar-spec authorship itself.
- **Could / Backlog:** `ClinicPets.tsx:879` fixed `w-72` panel and `ClinicAppointments.tsx:124` fixed
  `w-80` drawer — same defect shape as EMR, confirmed above, but **not the reported defect** and each
  is a self-contained single-file fix once the EMR pattern is proven. Filing them now (as `RESP-BL-1`,
  `RESP-BL-2`) prevents them from being silently forgotten, per the CLAUDE.md scope guard, without
  growing this branch. Pets' `h-full` bug stays its own pre-existing backlog item — different defect,
  same file, do not conflate.

**Why not A:** the scope guard in CLAUDE.md ("all · entire · whole repo → produce a backlog first,
then one item per branch") argues against a single branch that also re-touches Pets and Appointments
layouts; those are confirmed but distinct defects better shipped as their own small Lane A/B items
once the sidebar contract is proven on Clinic/Admin. **Why not B:** it ships the fix twice (once now
in `ClinicLayout`, again later for `AdminLayout`/`SettingsLayout`/`PlatformLayout`) instead of once
correctly, and leaves 3 of 4 shells non-compliant with sidebar-spec §6 with no forcing function to
revisit them.

---

## 3. EMR portrait layout — candidate designs

Left to `@uiux-agent` at Step 6 and the human/`@ba-agent` at the Step 3.5 grill; listed here so the
grill has concrete options to interrogate rather than starting blank.

1. **Stack the right panel under the editor, list becomes a picker.** Patient/visit list (`w-56`)
   collapses into a "Change patient" button + slide-up picker; SOAP editor takes full width;
   attachments/prescriptions (`w-72`) render below the editor as a scrollable section, not a
   side-by-side column.
2. **Tabs.** Bottom or top tab bar: `Patient` / `SOAP` / `Attachments & Rx`, one panel visible at a
   time, full 768px width each. Closest to how the existing SOAP sub-tabs (Subjective/Objective/
   Assessment/Plan, `05-emr.md` "SOAP tab bar") already behave — reuses a pattern clinic staff already
   know from this same screen.
3. **Drawers.** Editor is the permanent home screen; patient list and attachments/prescriptions each
   open as an overlay drawer (hamburger-style, matching the sidebar's own overlay-drawer mechanism from
   §6) triggered by icon buttons in the patient header bar.

**Recommendation (non-binding — final call is uiux + grill):** Option 2 (tabs). It reuses the SOAP
tab-bar interaction already on this screen (no new gesture for clinic staff to learn), keeps the
72px-tall save bar and header always visible regardless of which tab is active (safety-relevant: the
allergy chip and save state should never be a swipe away), and is the lowest-risk change to the
existing state model (`isNewRecord`, current record id) since no panel is unmounted — only re-laid-out.
Option 1 risks losing list context; Option 3 risks stacking with the sidebar's own drawer (two overlay
drawers competing for the same screen is exactly the kind of thing `/grill-with-docs` should stress).

---

## 4. Rough acceptance criteria (Gherkin)

Draft only — `@ba-agent` owns the authoritative Step 3 versions; tags are placeholders pending real
task IDs from Step 2.

```gherkin
@RESP-SHELL
Feature: Responsive app shell
  As a clinic_staff or doctor
  I want the sidebar to adapt to my device width
  So that I can use the app on a tablet in portrait without horizontal scrolling

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "clinic_staff"

  @AC-RESP-SHELL-1
  Scenario: No horizontal scroll at tablet portrait
    Given my viewport is 768px wide
    When I open any clinic screen
    Then the page has no horizontal scrollbar
    And every visible element fits within 768px

  @AC-RESP-SHELL-2
  Scenario: Sidebar is hidden and reachable via hamburger at 768px
    Given my viewport is 768px wide
    When the page loads
    Then the sidebar is not rendered in the layout flow
    And a hamburger button is visible in the top bar
    When I tap the hamburger button
    Then the sidebar opens as an overlay drawer above the content
    And tapping outside the drawer closes it

  @AC-RESP-SHELL-3
  Scenario: Sidebar collapses by default at tablet landscape
    Given my viewport is 1024px wide
    When the page loads
    Then the sidebar renders in icon-only (collapsed) mode
    And I can expand it manually

  @AC-RESP-SHELL-4
  Scenario: Sidebar expands by default at desktop width
    Given my viewport is 1280px wide
    When the page loads
    Then the sidebar renders in expanded (labelled) mode

  @AC-RESP-SHELL-5
  Scenario: Nothing regresses at previously-supported widths
    Given my viewport is 1024px or 1280px wide
    When I navigate through Dashboard, Appointments, Pets, EMR, Inventory, Billing
    Then no layout shows a horizontal scrollbar
    And no interactive element is obscured

  @AC-RESP-SHELL-6
  Scenario: All sidebar and hamburger tap targets stay accessible
    Given any viewport width
    When the sidebar or hamburger is rendered
    Then every tap target in it is at least 44x44px

  # Open question — see §5 Q1/Q2 before finalizing this scenario's Given/Then
  @AC-RESP-SHELL-7 @edge
  Scenario: Persisted collapse preference across breakpoint changes
    Given I collapsed the sidebar while at 1280px
    When I resize to 768px
    Then the sidebar shows the 768px behaviour (hidden + hamburger), not my collapsed preference
    When I resize back to 1280px
    Then the sidebar returns to [my prior preference | expanded default — OPEN QUESTION]

@RESP-EMR-PORTRAIT
Feature: EMR usable in tablet portrait
  As a doctor
  I want to write SOAP notes on a tablet held in portrait
  So that I can chart at the patient's cage without rotating the device

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "doctor"
    And "Clinic A" has a pet "Mochi" with an open medical record

  @AC-RESP-EMR-1
  Scenario: SOAP editor is usable at 768px
    Given my viewport is 768px wide
    And I have "Mochi"'s medical record open
    Then the SOAP editor's text input area is at least 320px wide
    And no horizontal scrollbar appears

  @AC-RESP-EMR-2
  Scenario: Patient list and attachments/prescriptions remain reachable at 768px
    Given my viewport is 768px wide
    When I am editing "Mochi"'s medical record
    Then I can reach the patient/visit list without leaving the EMR screen
    And I can reach the attachments/prescriptions panel without leaving the EMR screen

  @AC-RESP-EMR-3
  Scenario: EMR layout is unchanged at landscape and desktop widths
    Given my viewport is 1024px or wider
    When I open "Mochi"'s medical record
    Then the list, editor and attachments/prescriptions panel render side by side as today

  @AC-RESP-EMR-4 @validation
  Scenario: Anatomy canvas remains usable at 768px
    Given my viewport is 768px wide
    And I am on the Objective tab of "Mochi"'s medical record
    Then the anatomy canvas renders at full available width without clipping
```

---

## 5. Open questions for the human and @ba-agent

1. **Does the collapse/expand preference survive a breakpoint change?** E.g., I collapse at 1280px,
   then resize to 1024px (already collapsed-by-default) then back to 1280px — do I get my manual
   preference back, or the width-appropriate default? Sidebar-spec §6/§9 describes persistence
   (`vetclinic_sidebar_collapsed` in `localStorage`) but not its interaction with viewport-driven
   defaults. Affects `@AC-RESP-SHELL-7` above.
2. **Does the 768px drawer close on navigation?** Tapping a nav item inside the overlay drawer — does
   it auto-close, or does the drawer stay open until the user taps the backdrop? Common tablet pattern
   is auto-close-on-navigate; not stated in sidebar-spec.
3. **Is a `resize` listener required, or is mount-only detection (today's `SettingsLayout` pattern)
   acceptable?** A clinic tablet can be rotated mid-session without a page reload. If the pipeline
   decides mount-only is acceptable for MVP, that should be an explicit Must/Should/Could call, not an
   oversight repeated from `SettingsLayout`.
4. **Do `AdminLayout`, `SettingsLayout`, `PlatformLayout` ship in this branch (Option C's "Should") or
   move to backlog?** Recommendation above is ship in-branch once the shared component exists; needs
   explicit sign-off given the scope-guard sensitivity.
5. **EMR portrait design — tabs vs. drawers vs. stack-and-picker (§3)?** Recommendation given, final
   call belongs to `@uiux-agent` + the Step 3.5 grill.
6. **Do the confirmed-but-out-of-scope Pets (`w-72`) and Appointments (`w-80`) fixed panels get filed
   as backlog items now (`RESP-BL-1`/`RESP-BL-2`) as this doc proposes, or does the human want them
   folded into this branch after all?**
7. **Minimum usable SOAP-editor width at 768px** — `@AC-RESP-EMR-1` drafts 320px as the floor. Is that
   the right number, or should `@uiux-agent`/the grill set a different minimum based on the chosen
   design (tabs vs. stack)?

---

## 6. Arch threshold call

**Likely below threshold — recommend `arch: skipped (below threshold)` at Step 3.4,** pending
`@ba-agent`'s Step 3 read:

- No new table, no service/API/integration change, no state machine, no transaction boundary, no
  cross-cutting authz/audit/quota/tenancy concern (BA §8.1 threshold language from the PR #97
  precedent, which was also skipped for the same reasons).
- It is cross-cutting **across files** (4 layouts + several screens), but that is a *breadth* concern
  for the work-partition manifest at Step 4, not a *structural* one for `@arch-agent` — there is no new
  class/interface contract to freeze, only a Tailwind/CSS responsive-behaviour contract (the breakpoint
  rules already specified in `sidebar-spec.md` §6) and a component-extraction decision (shared sidebar
  component vs. keep duplicated).
- The one item that could tip this into "brief" tier: **if** the human/`@ba-agent` decides the shared
  sidebar component's prop contract needs freezing before 4 layouts consume it in parallel (Step 6
  work-partition manifest would otherwise have 2+ tasks touching the same new component file). Flagging
  this explicitly so Step 3.4 isn't skipped reflexively — if Option C's "Should" (all 4 layouts) ships
  in one branch with parallel waves, a brief arch pass to freeze the component's prop shape is cheap
  insurance against W1 rework.
