# BA Sign-off (Step 3): Responsive Shell + EMR Portrait

**Lane:** A · **Step:** 3 (validate + authz design, BA sign-off gate) · **Author:** @ba-agent · **Date:** 2026-09-29
**Feature slug:** `responsive-shell-emr-portrait` · **Branch:** `feature/responsive-shell-emr-portrait`
**Inputs:** `2026-09-29-responsive-shell-emr-portrait-tasks.md` (Step 2), `2026-09-28-responsive-shell-emr-portrait-brainstorm.md` (Step 1), `HANDOFF-responsive-shell-emr-portrait.md` (D1-D7 + 2026-09-29 answers N1/N2/N4).
**Authority used:** `anemal-rbac-matrix` (`references/permission-matrix.md` §2 grid + route map), `src/frontend/src/layouts/navAccess.ts`, the four layouts, `App.tsx`, `guards/RequirePermission.tsx`, `guards/RequirePlane.tsx`, `views/clinic/ClinicEMR.tsx`, `.claude/standards/acceptance-criteria.md`.

---

## 0. Verdict

**READY-WITH-FIXES.**

The requirement is sound and traceable (NFR-08 Responsive, NFR-09 Touch UX, FR-05 EMR/SOAP on tablet). The four N3 `@authz` Examples tables were wrong or untestable as written; I fixed all four in place (section 3). Twelve further edits are listed in section 7. They are small (mostly added regression Scenarios and wording) and none reopens a human decision, except E1 (hand mode), which needs the human to confirm (Q1).

Before the orchestrator invokes @arch-agent at Step 3.4, @pm-agent applies section 7. @arch-agent may start in parallel from section 8. The fixes add Scenarios but do not change the two seams arch is freezing.

---

## 1. Objective and actors (confirmed)

| Item | Statement |
|---|---|
| Objective | A doctor can chart SOAP notes on a tablet held in portrait (768px). Every shell adapts to 768/1024/1280 and to live rotation, with no horizontal scroll. |
| Actors | Clinic plane: `clinic_admin`, `doctor`, `clinic_staff`, plus custom roles cloned from them. Platform plane: platform users (`PlatformLayout`). Primary persona: `doctor`. |
| Traceability | NFR-08 (tablet >= 768, desktop >= 1024), NFR-09 (44x44 touch targets), FR-05 group (EMR/SOAP on tablet). |
| Breakpoints | Confirmed by the human: `< 1024` drawer, `1024-1279` rail, `>= 1280` expanded. EMR switches to tabs below 1024. |
| Arch | A brief pass runs at Step 3.4 (human decision). Scope: freeze the `useViewportMode` return shape plus the constant, and the shared sidebar props. |

---

## 2. Definition of Ready check (`acceptance-criteria.md`)

| DoR item | Status | Note |
|---|---|---|
| Objective stated | PASS | Section 1. |
| Actor & role named | PASS | Tasks §1. |
| Permission codes assigned | PASS after fix | No new code, which is correct because there is no new route or action. The `@authz` guards now name the real codes (section 3). |
| Exception cases listed | PASS WITH GAPS | Tasks §8 R1-R12 is good. Missing items: sign-out reachability in the drawer, the idle-logout overlay order, EMR at 1024 with the sidebar manually expanded, and hand mode not being implemented (G-5, G-7, G-8, G-9). |
| NFR impact noted | PASS | Section 9 adds security and a11y notes. |
| AC in Gherkin, tagged, one `When` | PASS after fix | Two Background/role conflicts (RESP-2, RESP-6) are resolved with the `as "<role>" instead` wording. The `@tenant`/`@validation` exemption is confirmed with conditions (section 4). |
| Dependencies & risks recorded | PASS WITH GAPS | Add R13 and R14 (E11). |

---

## 3. N3: `@authz` Examples reconciled (done in place in the tasks doc)

| Tag | Problem as written | Fix applied |
|---|---|---|
| `@AC-RESP-2-13` | Its `Settings` row cannot fail: `ClinicLayout` `NAV` has no Settings item for any role. It also only checked 768, so it did not guard the real risk, which is the drawer rendering a different list from the inline modes. The Background signs in as `clinic_staff` while the Outline uses `<role>`. | The rows now use the only clinic-shell items that differ between roles: Billing (`billing.create`, which `doctor` lacks) and Grooming (`grooming.view`, which `doctor` lacks). `doctor`/Billing appears at 1280, 1024 and 768 as a mode-parity guard. The role conflict is resolved with "instead". |
| `@AC-RESP-4-3` | "An admin screen" is ambiguous. `doctor` and `clinic_staff` hold `clinic.profile.view`, so `/clinic-admin/dashboard`, `/usage`, `/settings` and `/subscription` render for them today, and the Scenario would fail or pass depending on the screen. The frontend never returns "403". `RequirePermission` redirects to `/<tree>/403`. | Converted to an Outline over screens whose codes the role lacks: `/clinic-admin/users` (`staff.view`), `/audit` (`audit.view`), `/roles` (`roles.view`), plus one positive `clinic_admin` row. The outcome is the `/clinic-admin/403` page. The server-side 403 is covered by the existing `roleEditor-t5f01.test.ts` and `rbac-regression.test.ts`. |
| `@AC-RESP-5-4` | Correct in intent but trivially true, and only one shell was checked. Platform items carry no clinic permission code. They are gated by the platform-plane session. | Now an Outline over the clinic, admin and settings shells (768 and 1024). It asserts that no `/platform/` link appears, which is the plane-separation guard. The companion direct-address Scenario is E3. |
| `@AC-RESP-6-9` | `clinic_staff | read-only` fails against unchanged code. `ClinicEMR.tsx` does **not** gate SOAP fields, save or "add prescription" on `emr.create`/`emr.edit`/`prescriptions.create`. Its only UI gate is `<Can perm="emr.attach">` (3 places). | The guard now asserts gate parity for the one gate that exists: the upload control on the "Attachments & Rx" tab. All three system roles hold `emr.attach`, so the negative row uses a custom role cloned from `clinic_staff` with `emr.attach` off. The missing SOAP UI gating is a pre-existing gap and goes to backlog `RESP-BL-5`. The server 403 on SOAP writes is covered by `vaccination-create-permission.test.ts` and `codex-review-regression.test.ts`. |

Permission decisions (no change to the matrix):

```
Module.Action: none new     Default roles: unchanged     Configurable: n/a
Rationale: layout-only change; no route, action or data scope added.
Risk if wrong: a shared sidebar that filters differently per mode or per plane
changes what a role SEES (not what it can REACH; route guards + server unchanged).
```

---

## 4. N4: `@tenant` / `@validation` exemption. Decision: CONFIRMED, with 3 conditions

**Why the exemption does not create bug risk:**

| Concern | Reasoning |
|---|---|
| `@tenant` (cross-tenant 404) | The server derives tenant scope from the JWT (`tenant_id`) on every repository call. The frontend cannot widen it. This feature adds no endpoint, query, request parameter or header. A viewport change cannot reach the server, so no layout choice can produce a cross-tenant read. |
| Residual real risk | The one way this change can cause a data bug is **inside** the tenant: the EMR refactor sends a different record id, loses `isNewRecord`, or double-creates on save after a tab switch or rotation. That is an integrity risk, not an isolation risk. It is already covered by `@AC-RESP-6-7`, `@AC-RESP-7-3`, `@AC-RESP-7-4` and `@AC-RESP-7-6`. |
| `@validation` (400 + envelope) | No input is added or changed. The SOAP fields move into a tab, but their names, their client-side handling and the save payload must not change. The Zod schemas on the server are untouched. |

**Conditions (binding; if any fails at Step 7, the exemption lapses and full `@tenant`/`@validation` Scenarios are required):**

| # | Condition | Verified by |
|---|---|---|
| C1 | No change to any API client call, query key, request parameter or response handling in `ClinicEMR.tsx` or the layouts, and no backend or DB file touched. | @qa-agent diff review at Step 7; E7 Scenarios `@AC-RESP-6-12` and `@AC-RESP-6-13` (request and payload parity). |
| C2 | Existing server suites stay green unchanged: `crossTenantRelation.*.test.ts`, `rbac-regression.test.ts`, `vaccination-create-permission.test.ts`, `codex-review-regression.test.ts`, `roleEditor-t5f01.test.ts`. | Red-suite gate (Step 8). |
| C3 | `@AC-RESP-6-10` stays in the AC as the tenant regression guard and is satisfied by C2. No new backend test is required. | Annotated in the tasks doc. |

---

## 5. Can the drawer/rail/tabs work change what a role sees or reaches?

**Reach (routes, server): no.** No route, `RequirePermission`, `RequirePlane` or server guard changes. Reach can change only if a host layout's entry gate is dropped during the refactor (G-2).

**Visibility: yes, and that is the real risk.** Today each shell filters its nav differently. A single shared sidebar creates pressure to normalise them, and normalising any of them changes who sees what.

AS-IS gate inventory (must be preserved exactly):

| Shell | Item filter today | Entry gate today | Existing tests |
|---|---|---|---|
| `ClinicLayout` | Per-item `perm` via `authStore.hasPermission` | `Navigate` to `/clinic-admin/dashboard` when no `CLINIC_NAV_PERMS` code is held and some `ADMIN_NAV_PERMS` code is | 5 tests (`ClinicLayout.test.tsx`) |
| `AdminLayout` | Per-item `perm` | `Navigate` to `/clinic/dashboard` when no `ADMIN_NAV_PERMS` code is held and some `CLINIC_NAV_PERMS` code is | 5 tests (`AdminLayout.test.tsx`) |
| `SettingsLayout` | **Legacy role string**: `roles: ['admin']`, not a permission code. Back-link target also uses `role === 'admin'`. | none (all clinic roles may enter) | **none** |
| `PlatformLayout` | none (static 4 items) | `platformAuthStore.isAuthenticated()` redirects to `/platform/login`; idle logout. Uses **no clinic `authStore`** (file header invariant). | **none** |

Findings (finding → impact → recommendation):

| ID | Finding | Impact | Recommendation |
|---|---|---|---|
| G-1 | The drawer is a new render path. If it is built from a different item list than the inline modes (for example, filtering applied only in the inline branch), items leak into the drawer. | Visibility regression per role. Reach is still blocked by `RequirePermission` and the server. | One filtered list feeds all three modes (constraint A-3). Guarded by the fixed `@AC-RESP-2-13`, new `@AC-RESP-4-4` and `@AC-RESP-5-6`. |
| G-2 | Moving nav into a shared component could move or drop the `Navigate` entry gates and the platform `isAuth` gate. | Tree entry changes. A platform shell could render without a platform session. | Entry gates stay in the host layouts (A-2). The existing 10 layout tests keep their assertions (E10). New `@AC-RESP-5-5`. |
| G-3 | `SettingsLayout` filters by `role === 'admin'` while its routes use permission codes. A dev "tidying" it to perm-based filtering during adoption would newly **show** Clinic Profile (`clinic.profile.view`) and Branches (`clinic.branch.view`) to `doctor` and `clinic_staff`, because both hold those codes. | Silent visibility change for two system roles, with no test to catch it (Settings has no tests). | Out of scope, and must be preserved byte-for-byte in behaviour. New `@AC-RESP-5-6` is the first test of it. The legacy gate itself goes to backlog `RESP-BL-6`. |
| G-4 | Plane fusion risk. If the shared sidebar reads `useAuthStore` (clinic) internally to filter items, `PlatformLayout` acquires a clinic-store dependency. In a browser holding a stale clinic session, the platform shell's items would be filtered by clinic permissions. | Breaks "planes never fuse". Platform nav could vanish or mis-filter. | The shared sidebar is plane-agnostic: no auth-store import, and it receives items already decided by the host (A-1). `@AC-RESP-5-4` and `@AC-RESP-5-5` guard it. |
| G-5 | `PlatformLayout` has no `ProfileMenu`. Its **only** sign-out is the sidebar footer. In drawer mode that is hidden until the drawer is opened. | If the drawer omits the footer, a platform user on a shared tablet cannot sign out. That is a security NFR. | New `@AC-RESP-2-14`: sign-out reachable in the drawer for all 4 shells. |
| G-6 | EMR: moving the attachments panel into a tab must carry its three `<Can perm="emr.attach">` wrappers with it. | Upload control shown to a role without `emr.attach`. The server still returns 403, but the UI would be misleading. | The fixed `@AC-RESP-6-9`. Panels are hidden, not unmounted (already R6). |
| G-7 | `handMode` exists in `uiStore` but **no layout consumes it and no UI toggles it** (grep: only `uiStore.ts`). `@AC-RESP-2-10` (drawer opens from the right) and `@AC-RESP-8-3` ("swap the hand mode … persists") test a feature that does not exist. | Scope creep: a half-implementation where only the drawer mirrors and the inline modes do not. `@AC-RESP-8-3` is not executable. | Drop `@AC-RESP-2-10` and the hand-mode clauses of `@AC-RESP-8-3`. File as `RESP-BL-4` (spec-vs-code drift, like RESP-BL-3). Human to confirm (Q1). |
| G-8 | At 1024 (rail) with the sidebar manually expanded in EMR, the editor is 1024 − 224 − 224 − 288 = **288px**, below the D7 minimum of 320. D7 binds 768 only. Today's default is the same 288px, so this is no worse. The rail default gives 456px. | An edge case where the editor is narrow by user choice. | Accept and record it as R13. UIUX A may choose overlay expansion in the rail band. Human awareness: Q2. |
| G-9 | `IdleLogoutModal` (platform) and the new drawer are both overlays. | The idle warning could render under the drawer and backdrop, and the user could be logged out without seeing it. | New `@AC-RESP-5-8` (`@edge`). |
| G-10 | The task table puts "remove mount-only `LAYOUT-04` workaround from `SettingsLayout`" under RESP-4 (AdminLayout), while SettingsLayout is RESP-5. | Wrong owner or sequence in the Step 4 manifest. | Move the clause to RESP-5 (E9). |

Observation (no action in this feature): `doctor` and `clinic_staff` can open `/clinic-admin/dashboard`, `/usage`, `/settings` and `/subscription` because they hold `clinic.profile.view`. That matches the current matrix (F-3 comments in both layouts). I record it here only because it explains why `@AC-RESP-4-3` had to name specific screens.

---

## 6. Business rules binding on Step 3.4-6

| ID | Rule |
|---|---|
| BR-1 | For a given role and shell, the set of visible nav items is identical in `expanded`, `rail` and `drawer` modes. |
| BR-2 | No item filter changes semantics. Clinic and Admin keep per-item `perm`. Settings keeps its legacy role filter and back-link target. Platform keeps its static list. |
| BR-3 | Host-layout entry gates (both `Navigate` redirects, platform `isAuth`, idle logout) are unchanged and stay in the host layouts. |
| BR-4 | The shared sidebar never imports a plane's auth store. |
| BR-5 | Sign-out is reachable in every mode in every shell. |
| BR-6 | EMR portrait issues the same requests and sends the same save payload as the three-column layout (exemption condition C1). |
| BR-7 | The drawer-open state is not persisted. It opens closed after a reload, so clinical content is never covered on load. |

---

## 7. Required edits before Step 3.4 (owner: @pm-agent, in the tasks doc)

| # | Edit |
|---|---|
| E1 | **(pending Q1)** Delete `@AC-RESP-2-10`. In `@AC-RESP-8-3`, change the `When` to "I toggle the collapse control and reload the page" and replace "the hand mode persists across the reload" with "the collapse choice made at 1280px is still applied after the reload". Rewrite R5 as "hand mode not implemented; RESP-BL-4". Add RESP-BL-4 to §6. |
| E2 | Add to RESP-2 (G-5): see block E2 below. |
| E3 | Add to RESP-5 (G-2, G-4): block E3. |
| E4 | Add to RESP-5 (G-3): block E4. |
| E5 | Add to RESP-5 (G-3): block E5. |
| E6 | Add to RESP-4 (G-1): block E6. |
| E7 | Add to RESP-6 (exemption C1): blocks E7a and E7b. |
| E8 | Add to RESP-5 (G-9): block E8. |
| E9 | Task table: move "remove mount-only `LAYOUT-04` workaround from `SettingsLayout`" from the RESP-4 title to RESP-5. |
| E10 | R4 mitigation: "Dev A may change selectors in `ClinicLayout.test.tsx`/`AdminLayout.test.tsx`, but may not delete or loosen any hidden/shown or redirect-target assertion. The 10 existing tests keep their intent. @qa-agent diffs the test files at Step 7." |
| E11 | §8: add **R13** (G-8, the 288px editor at 1024 with the sidebar manually expanded; accepted, no worse than today) and **R14** (G-3/G-4, pressure to normalise nav filters or read an auth store in the shared sidebar; mitigated by BR-2 and BR-4). §5: replace the text with "Exemption confirmed by BA with conditions C1-C3, see sign-off §4". §1 out of scope: add "converting `SettingsLayout`'s role filter to permission codes (RESP-BL-6); EMR UI gating on `emr.create`/`emr.edit`/`prescriptions.create` (RESP-BL-5)". |
| E12 | §10: mark N3 and N4 resolved (pointing to this doc) and N1/N2 answered (pointing to the HANDOFF). |

```gherkin
  # E2 — RESP-2
  @AC-RESP-2-14 @edge
  Scenario Outline: Sign out is reachable in drawer mode in every shell
    Given I am signed in and on a <shell> screen and my viewport is 768px wide
    When I open the drawer
    Then a "Sign out" control is shown in the drawer and is at least 44x44px

    Examples:
      | shell    |
      | clinic   |
      | admin    |
      | settings |
      | platform |

  # E3 — RESP-5
  @AC-RESP-5-5 @authz
  Scenario: A clinic session cannot open the platform shell at any width
    Given I am signed in to the clinic plane as "clinic_admin", I have no platform session, and my viewport is 768px wide
    When I open "/platform/customers" directly by address
    Then I am sent to "/platform/login"
    And no platform sidebar, drawer or hamburger is rendered

  # E4 — RESP-5
  @AC-RESP-5-6 @authz
  Scenario Outline: The settings sidebar keeps today's role filter in every mode
    Given I am signed in to "Clinic A" as "<role>" and my viewport is <width>px wide
    When the settings shell sidebar is displayed (opened as a drawer below 1024px)
    Then the item "<item>" is <visibility>

    Examples:
      | role         | width | item              | visibility |
      | clinic_admin | 1280  | Operating Hours   | shown      |
      | clinic_admin | 768   | Operating Hours   | shown      |
      | clinic_admin | 768   | Branches          | shown      |
      | doctor       | 1280  | Clinic Profile    | not shown  |
      | doctor       | 768   | Clinic Profile    | not shown  |
      | clinic_staff | 768   | Branches          | not shown  |
      | doctor       | 768   | Back to Dashboard | shown      |

  # E5 — RESP-5
  @AC-RESP-5-7
  Scenario Outline: Back to Dashboard from the settings drawer goes to the role's home
    Given I am signed in as "<role>", I am on "/settings/clinic-profile" at 768px, and the drawer is open
    When I tap "Back to Dashboard"
    Then I am on "<home>"
    And the drawer is closed

    Examples:
      | role         | home                    |
      | clinic_admin | /clinic-admin/dashboard |
      | doctor       | /clinic/dashboard       |

  # E6 — RESP-4
  @AC-RESP-4-4 @authz
  Scenario Outline: The admin sidebar shows the same role-gated items in every mode
    Given I am signed in to "Clinic A" as "<role>" instead and my viewport is <width>px wide
    When the admin shell sidebar is displayed on "/clinic-admin/dashboard" (opened as a drawer below 1024px)
    Then the item "<item>" is <visibility>

    Examples:
      | role         | width | item       | permission     | visibility |
      | clinic_admin | 768   | Users      | staff.view     | shown      |
      | clinic_admin | 1024  | Roles      | roles.view     | shown      |
      | clinic_staff | 1280  | Users      | staff.view     | not shown  |
      | clinic_staff | 768   | Users      | staff.view     | not shown  |
      | clinic_staff | 768   | Audit log  | audit.view     | not shown  |
      | doctor       | 768   | Roles      | roles.view     | not shown  |
      | doctor       | 768   | Blood Bank | bloodbank.view | shown      |

  # E7a — RESP-6
  @AC-RESP-6-12
  Scenario: Portrait EMR loads the same data as the three-column layout
    Given the requests made when "Mochi"'s record is opened at 1280px are recorded
    When I open the same record at 768px
    Then the same endpoints are requested with the same parameters

  # E7b — RESP-6
  @AC-RESP-6-13
  Scenario: Portrait EMR saves the same payload as the three-column layout
    Given the save payload sent for a SOAP note on "Mochi"'s record at 1280px is recorded
    When I save the same SOAP text on the same record at 768px from the "SOAP" tab
    Then the save request has the same endpoint, fields and values

  # E8 — RESP-5
  @AC-RESP-5-8 @edge
  Scenario: The idle-logout warning is not hidden behind the drawer
    Given I am signed in as a platform user at 768px and the drawer is open
    When the idle-logout warning is raised
    Then the warning is shown above the drawer and backdrop
    And its "stay signed in" control can be tapped
```

---

## 8. Constraints handed to @arch-agent (Step 3.4). These are constraints, not designs.

| ID | Constraint | Source |
|---|---|---|
| A-1 | The shared sidebar must not import `authStore` or `platformAuthStore`. The item list, or the decision about it, comes from the host layout. | BR-4, G-4 |
| A-2 | Entry gates (`Navigate` redirects, platform `isAuth` and idle logout) stay in the host layouts. The frozen props must not require moving them. | BR-3, G-2 |
| A-3 | One item list per render feeds all three modes. The props must not admit a separate drawer list. | BR-1, G-1 |
| A-4 | The props must carry what every shell renders today: a header (tenant name / "Admin Panel" / "Clinic Settings" / "Platform Console"), an optional pre-nav link (Settings "Back to Dashboard"), and a footer (user, role label, sign-out). Settings/Platform labels are hard-coded English today and the clinic/admin labels are i18n keys. The props must accept both without forcing a translation change. | BR-2, BR-5 |
| A-5 | The drawer-open state is non-persisted. The D1 band-override state is non-persisted. `sidebarOpen` persistence stays as it is. | BR-7, D1 |
| A-6 | The z-order has to be decided once: drawer and backdrop above the content, below `IdleLogoutModal` and any app-level modal. | G-9, R9 |
| A-7 | TopNav (clinic/admin/settings) and the `PlatformLayout` header both host the hamburger. `PlatformLayout` does not use `TopNav`. | R3 |

---

## 9. NFR impact

| NFR | Impact |
|---|---|
| Security | No server change. The risks are visibility (G-1, G-3) and plane fusion (G-4), which are guarded, and session control (G-5, G-9), for which Scenarios are added. |
| Touch (NFR-09) | Covered: `@AC-RESP-2-11`, `@AC-RESP-6-11`, E2. |
| A11y | Covered: Escape closes the drawer and focus returns (`@AC-RESP-2-12`). Recommended to UIUX A, not blocking: focus stays in the drawer while it is open; rail icons carry accessible names, because labels are hidden; hidden tab panels use `hidden`/`aria-hidden` so screen readers skip them. |
| Performance | One `resize` listener per mounted shell. Negligible. Hidden-but-mounted EMR panels fetch what they fetch today (the three-column layout already mounts them), so load is unchanged. |
| i18n | `@AC-RESP-8-4` covers the clinic drawer and EMR tabs. Settings and Platform labels are English-only today. That is pre-existing and not widened here. |
| Maintainability | Positive: four duplicated sidebars become one (brainstorm §1.1). |

---

## 10. Backlog additions (filed via @scribe-agent at Step 8)

| ID | Item | Why deferred |
|---|---|---|
| RESP-BL-4 | Hand mode (`uiStore.handMode`, sidebar-spec §7) is in the spec and store but not implemented in any layout, and there is no toggle UI. | Spec-vs-code drift like RESP-BL-3, not part of the portrait defect (pending Q1). |
| RESP-BL-5 | `ClinicEMR.tsx` shows editable SOAP fields, save and "add prescription" to roles without `emr.create`/`emr.edit`/`prescriptions.create`. The server returns 403 on save, so there is no escalation, but the UX misleads `clinic_staff`/`clinic_admin`. | Pre-existing UI-gating gap, separate authz UX fix. |
| RESP-BL-6 | `SettingsLayout` filters nav by legacy `role === 'admin'` instead of permission codes (routes already use codes). Behaviour for custom roles cloned from `clinic_admin` depends on the `role` string, not the permission set. | Changing it changes visibility for `doctor`/`clinic_staff` (G-3). That needs its own BA decision. |
| Doc drift | `sidebar-spec.md` §6 ("768 and below hidden", "1024 collapsed") should state the confirmed bands (<1024 drawer, 1024-1279 rail, >=1280 expanded). `anemal-screen-specs/references/05-emr.md` needs the portrait tabs rule from UIUX A. | Step 8 doc refresh. |

---

## 11. Questions for the human

| # | Question | BA recommendation / default |
|---|---|---|
| Q1 | Hand mode (right-hand sidebar) was never built: the store field exists, but no layout uses it and there is no toggle. Should we drop `@AC-RESP-2-10` and the hand-mode part of `@AC-RESP-8-3`, and file it as backlog RESP-BL-4? | **Yes, drop and backlog it.** Mirroring only the drawer would leave the app half left-handed and half right-handed. |
| Q2 | At 1024px, if a doctor manually expands the sidebar while in EMR, the SOAP editor is about 288px, below the 320px agreed for 768px. The default rail gives about 456px, and today's default is already 288px. Accept? | **Accept.** It is the user's choice, reversible, and no worse than today. UIUX A may make expansion overlay the content in that band. |

---

## 12. Handoff

- **Gate:** BA sign-off = READY-WITH-FIXES. The requirement may proceed to Step 3.4 once @pm-agent applies E2-E12 and the human answers Q1 (which decides E1). Q2 has a safe default.
- **Next:** @pm-agent applies section 7. Then @arch-agent does the brief pass (freeze the `useViewportMode` return shape plus the breakpoint constant, and the sidebar props) against constraints A-1 to A-7. Then @ponytail-agent `arch-precheck`, then `/grill-with-docs` (mandatory), which covers this doc and the arch output.
- **Files touched by BA:** the tasks doc (N3 Examples for `@AC-RESP-2-13`, `-4-3`, `-5-4`, `-6-9`, reconciliation notes, and the status line) and this file.
