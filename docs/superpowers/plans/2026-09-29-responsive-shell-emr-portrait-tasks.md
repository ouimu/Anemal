# Tasks + Acceptance Criteria: Responsive Shell + EMR Portrait

**Lane:** A · **Step:** 2 (tasks + AC) · **Status:** Step 3 BA verdict READY-WITH-FIXES (2026-09-29) — N3 Examples reconciled in place; remaining edits listed in `2026-09-29-responsive-shell-emr-portrait-ba-signoff.md` §7
**Author:** @pm-agent · **Date:** 2026-09-29
**Inputs:** `2026-09-28-responsive-shell-emr-portrait-brainstorm.md`; `HANDOFF-responsive-shell-emr-portrait.md` ("Step 1 gate — APPROVED", 7 binding decisions); `anemal-design-system/references/sidebar-spec.md` §5-§7 (behaviour authority).
**Feature slug:** `responsive-shell-emr-portrait`

---

## 0. Binding decisions (from the Step 1 gate, not re-opened here)

| # | Decision | Task(s) that carry it |
|---|----------|-----------------------|
| D1 | On a breakpoint change the width-appropriate default wins over the user's manual collapse preference | RESP-1, RESP-2 |
| D2 | The overlay drawer (below the drawer breakpoint) auto-closes on navigation | RESP-2 |
| D3 | A live `resize` listener is required (rotation mid-session); mount-only detection is not acceptable | RESP-1 |
| D4 | All 4 layouts (Clinic, Admin, Settings, Platform) ship in this branch via a shared sidebar | RESP-2 to RESP-5 |
| D5 | EMR portrait = Tabs | RESP-6, RESP-7 |
| D6 | Pets `w-72` panel and Appointments `w-80` drawer are backlog `RESP-BL-1` / `RESP-BL-2`, out of scope | section 6 |
| D7 | SOAP editor input is at least 320px wide at 768px | RESP-6 |

## 1. Scope, actors, devices

- **Actors:** every signed-in shell user. Clinic plane: `clinic_admin`, `doctor`, `clinic_staff`. Platform plane: platform users (`PlatformLayout`). Primary persona for the defect: `doctor` charting on a tablet held in portrait.
- **Device:** Tablet (768 portrait, 1024 landscape) and Web (>=1280). Touch-first: every tap target >=44x44px.
- **Frontend-only change.** No table, no API, no permission code, no new route. Consequence for `@authz`/`@tenant`/`@validation` Scenarios: see section 5 ("Protected-task rule: not applicable, with one regression guard").
- **Out of scope (explicit):** Pets `h-full` overflow bug (separate pre-existing item); RESP-BL-1; RESP-BL-2; any change to sidebar nav items, role gating, or sidebar visual design (widths stay at the values the layouts use today, `w-56` expanded / `w-14` collapsed; the sidebar-spec's `w-64`/`w-16` numbers are a pre-existing spec-vs-code drift and are NOT altered by this feature).

## 2. Breakpoint contract (proposed, for BA to confirm)

`sidebar-spec.md` §6 lists 1280 / 1024 / 768 / <768 but is silent on the widths in between. This plan proposes the smallest consistent rule, aligned with Tailwind defaults (`lg`=1024, `xl`=1280):

| Viewport width | Mode | Sidebar |
|---|---|---|
| `>= 1280` | `expanded` | inline, `w-56`, labels visible; manual collapse allowed |
| `1024 to 1279` | `rail` | inline, `w-14`, icon-only; manual expand allowed |
| `< 1024` (incl. 768 and below) | `drawer` | not in layout flow; hamburger in TopNav opens an overlay drawer with backdrop |

Consequence for EMR: the EMR three-column layout is used at `>= 1024` (unchanged); the tabbed layout applies at `< 1024`. A single shared constant carries both thresholds so shell and EMR cannot drift (see section 7, arch call).

**Rule for D1 (proposed exact semantics):** the effective mode is derived from the viewport. A manual toggle overrides the default only while the viewport stays inside the same mode band. When the viewport crosses into a different band, the override is discarded and the band default applies (`expanded` at >=1280, `rail` at 1024-1279, `drawer` below). The persisted `uiStore.sidebarOpen` value is not required to survive a band change.

## 3. Task list

Legend: **Must** = ships or the origin defect (EMR unusable at 768) is not fixed. **Should** = ships in this branch by human decision D4, but is a separable increment. Owner roles are the Step 6 roles: **Dev A** (shell/layout code), **UIUX A** (screen design), **Dev B** (EMR screen code), **QA** (verification only, Step 7).

| ID | Title | Priority | Owner | Depends on | Files (indicative; the exclusive Step 6 scope is fixed by the Step 4 manifest) |
|----|-------|----------|-------|------------|------|
| RESP-1 | Viewport-mode hook and shared breakpoint constant (with live `resize`) | Must | Dev A | none | new `src/frontend/src/hooks/useViewportMode.ts` (+ test); new shared breakpoint constant (location per arch/plan); reads only, may add non-persisted state to `store/uiStore.ts` if needed |
| RESP-2 | Shared responsive sidebar (`expanded`/`rail`/`drawer`) with hamburger, backdrop, auto-close on navigation | Must | Dev A | RESP-1 | new shared sidebar component under `src/frontend/src/components/` (+ test); `store/uiStore.ts` if a drawer-open flag is needed |
| RESP-3 | Adopt shared sidebar in `ClinicLayout` | Must | Dev A | RESP-2 | `layouts/ClinicLayout.tsx`, `layouts/__tests__/ClinicLayout.test.tsx` |
| RESP-4 | Adopt shared sidebar in `AdminLayout`; remove mount-only `LAYOUT-04` workaround from `SettingsLayout` when adopting there | Should (D4) | Dev A | RESP-2 | `layouts/AdminLayout.tsx`, `layouts/__tests__/AdminLayout.test.tsx` |
| RESP-5 | Adopt shared sidebar in `SettingsLayout` and `PlatformLayout` | Should (D4) | Dev A | RESP-2 | `layouts/SettingsLayout.tsx`, `layouts/PlatformLayout.tsx` (+ tests) |
| RESP-6 | EMR portrait layout: tabs (`Patient` / `SOAP` / `Attachments & Rx`) below the drawer breakpoint | Must | UIUX A (design) then Dev B (build) | RESP-1 (constant only) | `src/frontend/src/views/clinic/ClinicEMR.tsx` (+ test). UIUX A output: tab design note, may refine D5 |
| RESP-7 | EMR portrait: header, allergy chip and save bar stay visible on every tab; state preserved across tab switches; anatomy canvas fits | Must | Dev B | RESP-6 | `views/clinic/ClinicEMR.tsx` (same owner and file as RESP-6, sequenced not parallel) |
| RESP-8 | Cross-screen regression sweep at 768 / 1024 / 1280 (Dashboard, Appointments, Pets, EMR, Inventory, Billing, Inpatient + Settings, Admin, Platform shells) | Must | QA | RESP-3 to RESP-7 | tests only |

Sizing note: RESP-4 and RESP-5 are deliberately thin once RESP-2 lands (near byte-identical duplicated JSX per brainstorm 1.1). If the branch is time-boxed, RESP-5 is the first item to cut, and it must then be re-filed as backlog (a human decision, not an agent's).

---

## 4. Acceptance criteria (Gherkin)

Every Scenario carries one tag `@AC-<task>-<n>` and one `When`. Screen detail (exact Tailwind classes, tab visuals) belongs to `anemal-screen-specs` / `anemal-design-system`, not here. `Given` widths are viewport widths in CSS px.

### RESP-1 — Viewport-mode hook and breakpoint constant

```gherkin
@RESP-1
Feature: The app knows which sidebar mode the current viewport needs
  As a doctor
  I want the app to react to my tablet's width and rotation
  So that the layout is right without reloading the page

  @AC-RESP-1-1
  Scenario Outline: Width maps to a sidebar mode
    Given my viewport is <width>px wide
    When the app determines the sidebar mode
    Then the mode is "<mode>"

    Examples:
      | width | mode     |
      | 1600  | expanded |
      | 1280  | expanded |
      | 1279  | rail     |
      | 1024  | rail     |
      | 1023  | drawer   |
      | 768   | drawer   |
      | 480   | drawer   |

  @AC-RESP-1-2
  Scenario: Rotating the tablet changes the mode live
    Given my viewport is 768px wide and the mode is "drawer"
    When I rotate the tablet so the viewport becomes 1024px wide
    Then the mode becomes "rail" without a page reload

  @AC-RESP-1-3
  Scenario: Leaving the page stops listening for resize
    Given the app is listening for viewport changes
    When the shell is unmounted
    Then the resize listener is removed

  @AC-RESP-1-4 @edge
  Scenario: Server or test environment without a window
    Given no browser window width is available
    When the app determines the sidebar mode
    Then the mode is "expanded" and no error is thrown
```

### RESP-2 — Shared responsive sidebar

```gherkin
@RESP-2
Feature: One sidebar that adapts to the device
  As a clinic_staff or doctor
  I want the sidebar to expand, shrink to icons, or tuck into a drawer by device width
  So that I can navigate on a tablet in portrait without horizontal scrolling

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "clinic_staff"

  @AC-RESP-2-1
  Scenario: Expanded sidebar at desktop width
    Given my viewport is 1280px wide
    When the page loads
    Then the sidebar is inline and shows icons with labels
    And no hamburger button is shown in the top bar

  @AC-RESP-2-2
  Scenario: Icon rail at tablet landscape
    Given my viewport is 1024px wide
    When the page loads
    Then the sidebar is inline and shows icons only
    And I can expand it with the collapse toggle

  @AC-RESP-2-3
  Scenario: Hidden sidebar and hamburger at tablet portrait
    Given my viewport is 768px wide
    When the page loads
    Then the sidebar takes no space in the page layout
    And a hamburger button is shown in the top bar

  @AC-RESP-2-4
  Scenario: Hamburger opens an overlay drawer
    Given my viewport is 768px wide
    When I tap the hamburger button
    Then the sidebar opens as a drawer above the content with a backdrop
    And the content underneath does not shift or resize

  @AC-RESP-2-5
  Scenario: Tapping outside closes the drawer
    Given the drawer is open at 768px
    When I tap the backdrop
    Then the drawer closes

  @AC-RESP-2-6
  Scenario: Navigating closes the drawer
    Given the drawer is open at 768px
    When I tap a navigation item
    Then the app opens that page
    And the drawer closes

  @AC-RESP-2-7 @edge
  Scenario: Manual collapse does not survive a breakpoint change
    Given I manually collapsed the sidebar while my viewport was 1280px wide
    When I rotate the tablet to 768px and then back to 1280px
    Then the sidebar is expanded (the width default), not collapsed

  @AC-RESP-2-8 @edge
  Scenario: Manual choice is kept while the width band does not change
    Given I manually collapsed the sidebar while my viewport was 1400px wide
    When the viewport becomes 1300px wide
    Then the sidebar is still collapsed

  @AC-RESP-2-9 @edge
  Scenario: Rotating with the drawer open closes it
    Given the drawer is open at 768px
    When the viewport becomes 1280px wide
    Then the drawer state is discarded
    And the sidebar is shown inline and expanded

  @AC-RESP-2-10
  Scenario: Right-hand mode mirrors the drawer
    Given hand mode is "right" and my viewport is 768px wide
    When I tap the hamburger button
    Then the drawer opens from the right edge

  @AC-RESP-2-11
  Scenario Outline: Tap targets are at least 44x44px
    Given my viewport is <width>px wide
    When the sidebar controls are rendered
    Then every navigation item, the collapse toggle and the hamburger are at least 44px wide and 44px high

    Examples:
      | width |
      | 1280  |
      | 1024  |
      | 768   |

  @AC-RESP-2-12
  Scenario: Keyboard can operate the drawer
    Given the drawer is open at 768px
    When I press the Escape key
    Then the drawer closes
    And focus returns to the hamburger button

  @AC-RESP-2-13 @authz
  Scenario Outline: The clinic sidebar shows the same role-gated items in every mode
    Given I am signed in to "Clinic A" as "<role>" instead and my viewport is <width>px wide
    When the clinic shell sidebar is displayed (opened as a drawer below 1024px)
    Then the item "<item>" is <visibility>

    Examples:
      | role         | width | item     | permission     | visibility |
      | doctor       | 1280  | Billing  | billing.create | not shown  |
      | doctor       | 1024  | Billing  | billing.create | not shown  |
      | doctor       | 768   | Billing  | billing.create | not shown  |
      | doctor       | 768   | Grooming | grooming.view  | not shown  |
      | doctor       | 768   | EMR      | emr.view       | shown      |
      | clinic_staff | 768   | Billing  | billing.create | shown      |
      | clinic_staff | 768   | Grooming | grooming.view  | shown      |
```

Reconciled at Step 3 (BA, 2026-09-29) to `ClinicLayout.tsx` `NAV` (per-item `perm`) and `anemal-rbac-matrix` §2. The earlier `Settings` row was removed: `ClinicLayout` has no Settings item for any role, so the row could not fail. The only clinic-shell items that differ between the three system roles are Billing (`billing.create`: `clinic_admin` E, `doctor` -, `clinic_staff` E) and Grooming (`grooming.view`: `clinic_admin` V, `doctor` -, `clinic_staff` V); every other item is held by all three. The 1280/1024/768 rows for `doctor`/Billing are the mode-parity guard: one filtered list feeds all three modes.

### RESP-3 — `ClinicLayout` adopts the shared sidebar

```gherkin
@RESP-3
Feature: Clinic shell fits every supported device
  As a doctor
  I want every clinic screen to fit my tablet
  So that I never scroll sideways to reach a control

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "doctor"

  @AC-RESP-3-1
  Scenario Outline: No horizontal scroll in the clinic shell
    Given my viewport is <width>px wide
    When I open the clinic dashboard
    Then the page has no horizontal scrollbar

    Examples:
      | width |
      | 1280  |
      | 1024  |
      | 768   |

  @AC-RESP-3-2
  Scenario: Content uses the full width when the sidebar is a drawer
    Given my viewport is 768px wide
    When I open the clinic dashboard
    Then the main content starts at the left edge of the viewport
    And the top bar spans the full viewport width

  @AC-RESP-3-3
  Scenario: Top bar offset follows the sidebar mode
    Given my viewport is 1024px wide
    When I expand the sidebar with the toggle
    Then the top bar and main content shift by the expanded sidebar width
```

### RESP-4 — `AdminLayout` adopts the shared sidebar

```gherkin
@RESP-4
Feature: Clinic admin shell fits every supported device
  As a clinic_admin
  I want admin screens to fit my tablet
  So that I can manage staff and roles from a tablet

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "clinic_admin"

  @AC-RESP-4-1
  Scenario Outline: Admin shell follows the same sidebar modes as the clinic shell
    Given my viewport is <width>px wide
    When I open an admin screen
    Then the sidebar mode is "<mode>"
    And the page has no horizontal scrollbar

    Examples:
      | width | mode     |
      | 1280  | expanded |
      | 1024  | rail     |
      | 768   | drawer   |

  @AC-RESP-4-2
  Scenario: Navigating from the admin drawer closes it
    Given the drawer is open on an admin screen at 768px
    When I tap a navigation item
    Then the drawer closes

  @AC-RESP-4-3 @authz
  Scenario Outline: A role without the screen's permission still cannot reach it in drawer mode
    Given I am signed in to "Clinic A" as "<role>" instead and my viewport is 768px wide
    When I open "<screen>" directly by address
    Then I see <outcome>
    And the screen's own content is <content>

    Examples:
      | role         | screen              | permission | outcome                       | content   |
      | clinic_staff | /clinic-admin/users | staff.view | the 403 page (/clinic-admin/403) | not shown |
      | clinic_staff | /clinic-admin/audit | audit.view | the 403 page (/clinic-admin/403) | not shown |
      | doctor       | /clinic-admin/roles | roles.view | the 403 page (/clinic-admin/403) | not shown |
      | clinic_admin | /clinic-admin/users | staff.view | the Users screen              | shown     |
```

Reconciled at Step 3 (BA, 2026-09-29) to `App.tsx` (`RequirePermission` per `/clinic-admin/*` route) and `anemal-rbac-matrix` §2. "An admin screen" was ambiguous and would have passed or failed depending on the screen picked: `doctor` and `clinic_staff` both hold `clinic.profile.view`, so `/clinic-admin/dashboard`, `/usage`, `/settings` and `/subscription` legitimately render for them today (this is the current matrix, not a defect of this feature). The rows use only screens whose code those roles do not hold. The frontend outcome is the `/clinic-admin/403` page (`RequirePermission` redirects; it does not render an HTTP status). The server boundary (`GET /users` → 403 for `staff.view`-less roles, `GET /clinic/roles` → 403) is unchanged and is already covered by the existing backend suites (`roleEditor-t5f01.test.ts`, `rbac-regression.test.ts`), which must stay green.

### RESP-5 — `SettingsLayout` and `PlatformLayout` adopt the shared sidebar

```gherkin
@RESP-5
Feature: Settings and platform shells follow the same responsive rules
  As a clinic_admin or a platform user
  I want the same sidebar behaviour everywhere
  So that the app feels the same on every screen

  @AC-RESP-5-1
  Scenario Outline: Settings shell follows the sidebar modes
    Given I am signed in as "clinic_admin" and my viewport is <width>px wide
    When I open a settings screen
    Then the sidebar mode is "<mode>"
    And the page has no horizontal scrollbar

    Examples:
      | width | mode     |
      | 1280  | expanded |
      | 1024  | rail     |
      | 768   | drawer   |

  @AC-RESP-5-2 @edge
  Scenario: Settings reacts to rotation after load (replaces the mount-only workaround)
    Given I am on a settings screen at 1280px and the sidebar is expanded
    When I rotate the tablet to 768px
    Then the sidebar becomes a drawer without a page reload

  @AC-RESP-5-3
  Scenario Outline: Platform shell follows the sidebar modes
    Given I am signed in as a platform user and my viewport is <width>px wide
    When I open a platform console screen
    Then the sidebar mode is "<mode>"
    And the top bar offset matches the sidebar mode

    Examples:
      | width | mode     |
      | 1280  | expanded |
      | 1024  | rail     |
      | 768   | drawer   |

  @AC-RESP-5-4 @authz
  Scenario Outline: Clinic shells never show platform console items in any mode
    Given I am signed in to the clinic plane as "<role>" and my viewport is <width>px wide
    When the <shell> shell sidebar is displayed (opened as a drawer below 1024px)
    Then no item linking to "/platform/" is shown

    Examples:
      | role         | shell    | width |
      | clinic_admin | clinic   | 768   |
      | clinic_admin | admin    | 768   |
      | clinic_admin | settings | 768   |
      | clinic_admin | admin    | 1024  |
```

Reconciled at Step 3 (BA, 2026-09-29). Platform items are not permission-coded in the clinic catalogue: `PlatformLayout` `NAV` is a static list gated only by the platform-plane session (`platformAuthStore.isAuthenticated()`), and `/platform/*` routes are guarded server-side by `requirePlane('platform')` + `requirePlatformPermission`. The guard therefore asserts plane separation (no platform item ever reaches a clinic shell's item list) rather than a role row. `clinic_admin` is used because it is the broadest clinic role; if it sees no platform item, no clinic role does. See the sign-off doc for the companion "clinic session opens `/platform/*` directly" Scenario.

### RESP-6 — EMR portrait tabs

```gherkin
@RESP-6
Feature: EMR usable in tablet portrait
  As a doctor
  I want to write SOAP notes on a tablet held in portrait
  So that I can chart at the patient's cage without rotating the device

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "doctor"
    And "Clinic A" has a pet "Mochi" with an open medical record

  @AC-RESP-6-1
  Scenario: SOAP editor is usable at 768px
    Given my viewport is 768px wide
    When I open "Mochi"'s medical record
    Then the SOAP text input area is at least 320px wide
    And the page has no horizontal scrollbar

  @AC-RESP-6-2
  Scenario: Three tabs appear below the drawer breakpoint
    Given my viewport is 768px wide
    When I open "Mochi"'s medical record
    Then I see the tabs "Patient", "SOAP" and "Attachments & Rx"
    And exactly one tab panel is shown at a time
    And the "SOAP" tab is selected by default

  @AC-RESP-6-3
  Scenario: Patient and visit list is reachable without leaving EMR
    Given my viewport is 768px wide and I am on the "SOAP" tab
    When I select the "Patient" tab
    Then the patient and visit list is shown at full width

  @AC-RESP-6-4
  Scenario: Attachments and prescriptions are reachable without leaving EMR
    Given my viewport is 768px wide and I am on the "SOAP" tab
    When I select the "Attachments & Rx" tab
    Then the attachments and prescriptions panel is shown at full width

  @AC-RESP-6-5
  Scenario: Picking a different visit returns to the SOAP tab
    Given my viewport is 768px wide and I am on the "Patient" tab
    When I select another visit for "Mochi"
    Then that visit's record opens on the "SOAP" tab

  @AC-RESP-6-6
  Scenario Outline: Three-column layout is unchanged at landscape and desktop
    Given my viewport is <width>px wide
    When I open "Mochi"'s medical record
    Then the list, editor and attachments panel are shown side by side
    And no tab bar for these panels is shown

    Examples:
      | width |
      | 1024  |
      | 1280  |

  @AC-RESP-6-7 @edge
  Scenario: Rotating from landscape to portrait mid-edit keeps the work
    Given I have typed unsaved text in the "Subjective" field at 1024px
    When I rotate the tablet to 768px
    Then the tabbed layout is shown
    And my unsaved text is still in the "Subjective" field

  @AC-RESP-6-8 @edge
  Scenario: Rotating from portrait to landscape restores three columns
    Given I am on the "Attachments & Rx" tab at 768px
    When I rotate the tablet to 1024px
    Then the list, editor and attachments panel are shown side by side

  @AC-RESP-6-9 @authz
  Scenario Outline: Portrait tabs keep the same permission gates as the three-column layout
    Given I am signed in to "Clinic A" as "<role>" instead and my viewport is 768px wide
    When I open the "Attachments & Rx" tab of "Mochi"'s medical record
    Then the attachment upload control is <upload>

    Examples:
      | role                                                   | permissions held         | upload    |
      | doctor                                                 | emr.view, emr.attach     | shown     |
      | clinic_staff                                           | emr.view, emr.attach     | shown     |
      | custom role cloned from clinic_staff, emr.attach off   | emr.view                 | not shown |

  @AC-RESP-6-10 @tenant
  Scenario: Another clinic's record is still not reachable in portrait
    Given my viewport is 768px wide
    And a medical record belongs to tenant "Clinic B"
    When a doctor of "Clinic A" requests that record
    Then the response is 404

  @AC-RESP-6-11
  Scenario: Tabs meet touch size
    Given my viewport is 768px wide
    When the EMR tab bar is rendered
    Then every tab is at least 44px high and 44px wide
```

Reconciled at Step 3 (BA, 2026-09-29) to `ClinicEMR.tsx` and `anemal-rbac-matrix` §2. The only UI permission gate in `ClinicEMR.tsx` today is `<Can perm="emr.attach">` (three places, attachments panel). SOAP fields, the save button and "add prescription" are **not** gated on `emr.create`/`emr.edit`/`prescriptions.create` in the UI, so the earlier `clinic_staff | read-only` row would have failed against unchanged code; that is the pre-existing gap filed as `RESP-BL-5` (see sign-off doc), not fixed here. All three system roles hold `emr.attach` (`clinic_admin` E, `doctor` E, `clinic_staff` V), so the negative row needs a custom role (precedent: `pet-medical-degradation.test.ts` clones `clinic_staff` and toggles EMR codes off). The server boundary for SOAP writes is unchanged and already covered: `clinic_staff` → 403 on `POST /api/medical-records` (`vaccination-create-permission.test.ts`), `clinic_admin` → 403 (`codex-review-regression.test.ts`); those suites must stay green.

`@AC-RESP-6-10` is satisfied by the existing backend tenant-isolation suites staying green (`crossTenantRelation.*.test.ts`, `rbac-regression.test.ts` "GET /api/medical-records → 200|404"); the viewport cannot reach the server, so no new backend test is required. The frontend-side guard for the exemption is `@AC-RESP-6-12` (request and payload parity, added by the sign-off doc).

### RESP-7 — EMR portrait: pinned safety chrome, state, canvas

```gherkin
@RESP-7
Feature: Safety information and save state are always visible in EMR portrait
  As a doctor
  I want the allergy warning and save controls to stay on screen
  So that I never miss an allergy or lose a note when I switch tabs

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "doctor"
    And "Clinic A" has a pet "Mochi" with a recorded allergy and an open medical record
    And my viewport is 768px wide

  @AC-RESP-7-1
  Scenario Outline: Patient header and allergy chip stay visible on every tab
    Given I am on the "<tab>" tab
    When the page is displayed
    Then the patient header and the allergy chip for "Mochi" are visible

    Examples:
      | tab              |
      | Patient          |
      | SOAP             |
      | Attachments & Rx |

  @AC-RESP-7-2
  Scenario Outline: Save bar stays visible on every tab
    Given I am on the "<tab>" tab
    When the page is displayed
    Then the save controls and the save status are visible

    Examples:
      | tab              |
      | Patient          |
      | SOAP             |
      | Attachments & Rx |

  @AC-RESP-7-3
  Scenario: Switching tabs does not lose unsaved text
    Given I typed unsaved text in the "Assessment" field on the "SOAP" tab
    When I switch to the "Attachments & Rx" tab and back to "SOAP"
    Then my unsaved text is still in the "Assessment" field

  @AC-RESP-7-4
  Scenario: Switching tabs does not change which record is open
    Given I have "Mochi"'s medical record open on the "SOAP" tab
    When I switch to the "Patient" tab
    Then the open record is still "Mochi"'s and it is not marked as a new record

  @AC-RESP-7-5
  Scenario: Anatomy canvas fits the portrait width
    Given I am on the "Objective" section of the "SOAP" tab
    When the anatomy canvas is displayed
    Then the canvas fits the available width without being clipped
    And I can still add a marker on it by touch

  @AC-RESP-7-6 @edge
  Scenario: Editing a new, unsaved record and opening another tab keeps it a new record
    Given I started a new medical record for "Mochi" that is not yet saved
    When I switch to the "Attachments & Rx" tab
    Then the record is still treated as new
    And saving it once creates exactly one record

  @AC-RESP-7-7 @edge
  Scenario: Soft keyboard does not hide the save controls
    Given I am typing in a SOAP field on the "SOAP" tab
    When the on-screen keyboard is open
    Then the save controls remain reachable without closing the keyboard
```

`@AC-RESP-7-7` is the least certain Scenario (depends on device/keyboard behaviour that jsdom cannot observe); QA may tag it as a manual/browser check at Step 7 rather than automate it. Flagged in section 8.

### RESP-8 — Regression sweep

```gherkin
@RESP-8
Feature: Nothing regresses across supported widths
  As a clinic_staff
  I want every main screen to keep working at every supported width
  So that a shell change does not break my day-to-day work

  Background:
    Given a clinic tenant "Clinic A" exists
    And I am signed in to "Clinic A" as "clinic_admin"

  @AC-RESP-8-1
  Scenario Outline: Main clinic screens have no horizontal scroll at supported widths
    Given my viewport is <width>px wide
    When I open the "<screen>" screen
    Then the page has no horizontal scrollbar
    And no interactive control is covered by the sidebar or top bar

    Examples:
      | screen       | width |
      | Dashboard    | 1024  |
      | Dashboard    | 1280  |
      | Dashboard    | 768   |
      | Inventory    | 1024  |
      | Inventory    | 1280  |
      | Inventory    | 768   |
      | Billing      | 1024  |
      | Billing      | 1280  |
      | Billing      | 768   |
      | Inpatient    | 1024  |
      | Inpatient    | 1280  |
      | Inpatient    | 768   |
      | EMR          | 1024  |
      | EMR          | 1280  |
      | EMR          | 768   |

  @AC-RESP-8-2 @edge
  Scenario Outline: Known-deferred screens keep today's behaviour (not made worse)
    Given my viewport is <width>px wide
    When I open the "<screen>" screen
    Then it renders no worse than before this change

    Examples:
      | screen       | width |
      | Pets         | 768   |
      | Appointments | 768   |

  @AC-RESP-8-3
  Scenario: Existing shell behaviours still work
    Given my viewport is 1280px wide
    When I toggle the collapse control, swap the hand mode and reload the page
    Then the hand mode persists across the reload
    And role-gated navigation items are unchanged

  @AC-RESP-8-4
  Scenario Outline: Both languages fit the tabs and drawer
    Given the language is "<language>" and my viewport is 768px wide
    When I open the drawer and the EMR tabs
    Then no label is clipped or wraps out of its control

    Examples:
      | language |
      | en       |
      | th       |
```

`@AC-RESP-8-2` is a guard so RESP-BL-1/2 are not silently made worse by the new shell (the drawer mode gives them +224px, so they should improve, not regress). It carries no fix work.

---

## 5. Protected-task rule: not applicable, with one regression guard

`acceptance-criteria.md` requires `@authz`, `@tenant`, `@validation` Scenarios for protected tasks. This feature adds no route, permission, query or input, so the standard triple is not applicable:

- `@tenant`: no data access changes; one regression Scenario (`@AC-RESP-6-10`) confirms the EMR portrait path still hits the existing 404 behaviour.
- `@authz`: no new permission. Regression guards exist where the shell shows or hides items by role (`@AC-RESP-2-13`, `@AC-RESP-4-3`, `@AC-RESP-5-4`, `@AC-RESP-6-9`).
- `@validation`: no new input. The brainstorm's placeholder `@validation` tag on the anatomy canvas was dropped (it is a layout check, not input validation); it is `@AC-RESP-7-5`.

`@ba-agent` should confirm this reading at Step 3, since it is the BA's call whether a Definition-of-Ready exemption is valid.

## 6. Backlog (out of scope, filed per scope guard)

| ID | Item | Why deferred | Evidence |
|----|------|--------------|----------|
| RESP-BL-1 | `ClinicPets.tsx` fixed `w-72` pet-list panel at 768 | Same defect shape, not the reported defect, single-file follow-up (D6). Separate from the pre-existing Pets `h-full` overflow bug. | brainstorm 1.3, `ClinicPets.tsx:879` |
| RESP-BL-2 | `ClinicAppointments.tsx` fixed `w-80` detail drawer with 7-column calendar at 768 | Same (D6). | brainstorm 1.3, `ClinicAppointments.tsx:124` |
| RESP-BL-3 (proposed) | Sidebar width drift: `sidebar-spec.md` says `w-64`/`w-16`, code uses `w-56`/`w-14` | Pre-existing spec-vs-code drift, unrelated to responsiveness; resolve in one place (spec or code) separately. | sidebar-spec §5/§8 vs the four layouts |

## 7. Architecture threshold call (Step 3.4)

**Recommendation: `arch: skipped (below threshold)` is defensible, with one condition; otherwise run a brief arch pass limited to a single contract.**

Below-threshold reasons: no table, no service or API, no integration, no state machine, no transaction boundary, no authz/audit/quota/tenancy concern. This matches the PR #97 precedent.

The condition (raised in brainstorm section 6, and confirmed by this breakdown): RESP-2 introduces one new shared component that four layouts consume, and RESP-1's breakpoint constant is consumed by both the shell and EMR. If Step 6 is run in parallel waves (Dev A on layouts, Dev B on EMR), the manifest rule "Step 6 parallelism is legal only when `@arch-agent` froze the contract at 3.4" applies. Two ways to satisfy it, both cheap:

1. **Sequence instead of parallelise.** Wave order RESP-1 then RESP-2 then RESP-3/4/5, with Dev B's RESP-6/7 depending only on the RESP-1 constant. No arch pass needed; Step 4 records `arch: skipped (below threshold)` and marks the manifest sequential where the seam is shared.
2. **Brief arch pass** to freeze exactly two things: (a) the `useViewportMode` return shape and the location and name of the breakpoint constant; (b) the shared sidebar component's props (mode, open state, side/hand mode, nav items source, on-navigate callback). Nothing else.

PM preference: option 1, because the shared surface is two small files and the human has not asked for parallel speed. `@ba-agent` / human decide at Step 3; this document does not assume either. The choice is recorded here so 3.4 is not skipped reflexively.

## 8. Dependencies, risks, and edge cases

| # | Risk / dependency | Impact | Mitigation |
|---|---|---|---|
| R1 | Breakpoint gap: spec is silent for 769-1023 and 1024-1279 (section 2 proposes a rule) | A tester and a developer read the spec differently; 800px would be "drawer" or "rail" | BA confirms section 2 at Step 3; the values live in one constant so a change is one edit |
| R2 | D1 semantics (override discarded on band change) needs `uiStore.sidebarOpen` to stop being the only source of truth | Persisted preference and derived mode can disagree after a reload | Define once in RESP-2: derived mode wins on band change; persisted value applies only within the same band; add `@AC-RESP-2-7/-8` as the executable definition |
| R3 | Sidebar and TopNav offsets (`ml-*`, `left-*`) are duplicated in all 4 layouts (`PlatformLayout` also offsets TopNav via `left-56`/`left-14`) | Shell fix misses one offset and content is covered | RESP-3/4/5 each carry a "no covered controls" AC; RESP-8 sweeps all shells |
| R4 | Existing tests: `layouts/__tests__/ClinicLayout.test.tsx`, `AdminLayout.test.tsx` assert current markup | Tests fail for the right reason after RESP-3/4 | Dev A updates them in-task; QA verifies each `@AC-` tag has a named test |
| R5 | Right-hand mode (`handMode`) exists in the store and spec §7 | Drawer opens on the wrong side, or backdrop/offset mirror is missed | `@AC-RESP-2-10` |
| R6 | EMR state model: `isNewRecord` and the current record id must survive a re-layout (brainstorm 3, rec. for Tabs) | Data loss or a duplicate record on tab switch or rotation | Panels stay mounted (hidden, not unmounted); `@AC-RESP-6-7`, `@AC-RESP-7-3/-4/-6` |
| R7 | Rotation between 1024 and 768 flips EMR between 3-column and tabs | Unsaved input is lost | `@AC-RESP-6-7`; same component tree, layout differs only by CSS/mode |
| R8 | Soft keyboard viewport shrink (`@AC-RESP-7-7`) is hard to test in jsdom | Automation gap | QA may classify as manual/browser check at Step 7; PM accepts this |
| R9 | Two overlay layers in EMR portrait (sidebar drawer plus any EMR modal/drawer) | Stacked overlays confuse touch | Tabs (no EMR drawer) avoid this by design (brainstorm 3); z-index ordering is a Dev B check |
| R10 | Scope creep into Pets and Appointments | Branch grows past one reviewable PR | Backlog (section 6); `@AC-RESP-8-2` is only a no-worse guard |
| R11 | i18n: Thai labels are longer than English | Tabs or drawer labels clip at 768 | `@AC-RESP-8-4`; keys go through the existing i18n files (no hardcoded strings) |
| R12 | Sequencing: RESP-6 depends on the RESP-1 constant only, so EMR is not blocked on the sidebar work | Enables W1 parallelism only if arch freezes the seam (section 7) | Decide at Step 3 / 4 |

**Definition-of-Done items that apply (from `acceptance-criteria.md`):** TypeScript strict, no raw hex (tokens only), Material Symbols (no emoji) for the hamburger, touch targets >=44px, responsive tested at 768 and 1280 (this feature adds 1024), keyboard navigation, every `@AC-` tag has a passing test named after it. Backend and DB items (migrations, Zod, tenant tests) are not applicable.

## 9. Resolved open questions

Brainstorm section 5 questions, all closed by the Step 1 gate:

| # | Question | Resolution | Source |
|---|----------|------------|--------|
| Q1 | Does collapse preference survive a breakpoint change? | No; width-appropriate default wins | D1 -> `@AC-RESP-2-7/-8`, R2 |
| Q2 | Does the 768 drawer close on navigation? | Yes, auto-close | D2 -> `@AC-RESP-2-6` |
| Q3 | Is a `resize` listener required? | Yes, live on rotation | D3 -> `@AC-RESP-1-2/-3`, `@AC-RESP-5-2` |
| Q4 | Do Admin/Settings/Platform ship in this branch? | Yes, all 4 layouts | D4 -> RESP-4, RESP-5 (marked Should, but shipped in-branch) |
| Q5 | EMR portrait design? | Tabs (UIUX may refine) | D5 -> RESP-6/7 |
| Q6 | Pets and Appointments fixed panels? | Backlog, out of scope | D6 -> RESP-BL-1/2 |
| Q7 | Minimum SOAP-editor width at 768? | 320px | D7 -> `@AC-RESP-6-1` |

## 10. Questions still open (for `@ba-agent` at Step 3 / the human)

| # | Question | Default assumed here | Needed by |
|---|----------|----------------------|-----------|
| N1 | Confirm the breakpoint table in section 2 (in particular: drawer below 1024 and rail at 1024-1279; `sidebar-spec.md` §6 is silent on 769-1023). | As written in section 2 | Step 3 |
| N2 | Step 3.4 choice: skip arch and sequence Step 6 (PM preference), or brief arch pass to freeze the two shared seams. | Sequence, arch skipped | Step 3 |
| N3 | Reconcile the role Examples in `@AC-RESP-2-13`, `@AC-RESP-4-3`, `@AC-RESP-5-4`, `@AC-RESP-6-9` to `navAccess.ts` and `anemal-rbac-matrix` (Definition of Ready requires permission codes; PM has not re-derived them). | Illustrative rows | Step 3 |
| N4 | Confirm the Definition-of-Ready exemption for `@tenant` / `@validation` (section 5). | Not applicable, with regression guards | Step 3 |
| N5 | File RESP-BL-3 (sidebar width drift `w-56` vs spec `w-64`) as a backlog item, or ignore. | File it | Step 8 / scribe |
