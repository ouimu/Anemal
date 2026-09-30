# QA Sign-off (Step 7): Responsive Shell + EMR Portrait

2026-09-30 · Lane A · Step 7 · Author: @qa-agent · Branch `feature/responsive-shell-emr-portrait` (verified with `git branch --show-current`) vs `main`
Inputs: HANDOFF ("Step 6 facts for QA"), plan `2026-09-30-responsive-shell-emr-portrait.md` (RESP-8, §6, §8), arch `2026-09-30-responsive-shell-emr-portrait-arch.md` (§4a-4d, §7, §9), tasks `2026-09-29-responsive-shell-emr-portrait-tasks.md`, ADR-0033, ADR-0027, skills `anemal-coding-rules`, `anemal-rbac-matrix`, `anemal-design-system`.

## Verdict: **APPROVE** (re-verification, 2026-09-30, HEAD `7c96156`)

QA-Agent Approval: ✅ for the code gate. The one blocking finding, F-1 (drawer semantics and the census workaround), was fixed by Dev A in `7c96156` and re-verified (section 2a). No open blocking finding and no open `/code-review` finding that blocks: #1..#4 are triaged to backlog (F-2..F-5). Every `@AC-RESP` tag has a passing test or is explicitly browser-only, arch conformance A-1..A-7 passes, and there are no role or tenant regressions. The human browser checklist in section 7 (B-1..B-12) is still the Step 7 remainder; a failing B row reopens this sign-off.

First pass (superseded): CHANGES-REQUESTED on F-1.

| Count | |
|---|---|
| Findings | 10 total: 1 Medium blocking (F-1, **closed** in `7c96156`), 4 Low product (F-2..F-5, backlog), 2 Low test gaps fixed by QA (F-6, F-7), 3 Info (F-8..F-10) |
| Open blocking findings | 0 |
| `/code-review` (medium) findings | 4, triaged as F-2, F-3, F-4, F-5 below (no High) |
| Production code changed by QA | none |
| Tests added by QA | 18 (1 in `PlatformLayout.test.tsx`, 13 in `ResponsiveShell.integration.test.tsx`, 4 in `App.drawerRouting.test.tsx`) |

## 1. Run results

Re-run on HEAD `7c96156` (after the F-1 fix), from `src/frontend`: `npx tsc --noEmit` exit 0; `npm run lint` exit 0 (0 errors, the same 3 pre-existing `react-refresh/only-export-components` warnings); `npm run test` **89 files, 1010/1010 pass** (unchanged count: the F-1 fix edited existing assertions and added no tests); `npm run build` exit 0, built CSS contains `.z-\[45\]` and `.inset-0`. The backend was not re-run: the fix commit touches no backend file. The first-pass results below still hold.

| Check | Result |
|---|---|
| `npx tsc --noEmit` (src/frontend) | exit 0 |
| `npm run lint` | exit 0: 0 errors, 3 warnings, all pre-existing and outside the branch (`AuthedPetImage.tsx`, `ClinicBilling.tsx`) |
| `npm run test` (frontend) | **89 files, 1010/1010 pass** (Step 6 baseline 992; +18 QA tests) |
| `npm run build` | exit 0. Built CSS contains `.z-\[45\]`, `ml-0`, `left-0`, `order-3`, `contents`, `w-11` (the Tailwind scanner sees the literal classes) |
| `git diff main...HEAD --stat -- src/backend` | **empty** (backend untouched) |
| Backend `npm run test` (C2 / `@AC-RESP-6-10`) | Run 2: **114 suites, 1488/1488 pass**. Run 1: 3 failures in `tests/integration/rbac-regression.test.ts` ("socket hang up", then 401), green when run alone (with the 11 `crossTenantRelation.*` suites, 88/88) and green in run 2. The flake predates this branch (see F-9). |
| R4 diff of `ClinicLayout.test.tsx` / `AdminLayout.test.tsx` vs `main` | only the mock lines changed (`uiStore` mock became a `useShellSidebar` mock, and `NavLink` and TopNav stubs now take props). No hidden/shown or redirect-target assertion was removed or loosened. |
| Responsive-prefix grep on added non-test lines (`sm:`..`2xl:`) | none. TopNav's `hidden sm:block`, `sm:mx-0` and `lg:w-80` are pre-existing and cosmetic, so exempt. |
| `uiStore.ts`, `App.tsx`, `guards/` diff | empty |
| `handMode`, `SIDEBAR_INSET_CLASS` | no use outside `uiStore.ts`; no export |

## 2. Findings

| ID | Sev | Blocking | File:line | Finding | Fix |
|---|---|---|---|---|---|
| F-1 | Medium | **Closed** (`7c96156`, see 2a) | `src/frontend/src/components/ResponsiveSidebar.tsx:211-221` | **Dev A deviation 1.** The open drawer is modal in every way a user can see: a full-screen backdrop, focus moved into the panel, and Escape or backdrop tap to close. But it is announced as an `<aside>` (complementary landmark) with no `aria-modal`. Screen-reader virtual cursors and Tab can move into the page under the backdrop. The backdrop's `fixed left-0 top-0 h-screen w-screen` has the same effect as `fixed inset-0` and was written only so the MODAL-13 census would not count it, so the census now misses a modal root it was built to track. | **Recommendation: use `role="dialog" aria-modal="true"` and add a `KNOWN_BESPOKE_MODALS` entry.** On the panel: `role="dialog" aria-modal="true" aria-label={header.title}`. On the backdrop: `fixed inset-0`. In `__tests__/modal-consistency.test.ts`, add `'components/ResponsiveSidebar.tsx': { count: 2, reason: 'Navigation drawer (ADR-0033): not a Dialog consumer (no title/footer/dismissal-policy); closes on Escape, backdrop and navigation by design.' }`. This uses ADR-0027's own allowlist mechanism, so it needs no ADR-0027 policy change. Update the tests that find the open drawer with `getByRole('complementary')` so they use `getByRole('dialog', { name })`: `ResponsiveSidebar.test.tsx`, `PlatformLayout.test.tsx` (@AC-RESP-5-8), and the QA `ResponsiveShell.integration.test.tsx` (`drawerPanel()`). A focus trap stays out of scope, to match `Dialog`, which has none. Owner: Dev A. |
| F-2 | Low | No | `ResponsiveSidebar.tsx:199-206` | **Dev A deviation 5** (also `/code-review` #1). When the blocking idle warning is up, Escape still closes the drawer underneath it, and the cleanup moves focus to the hamburger behind the `aria-modal` alertdialog. Plan A-5/A-8 accepted this: the drawer state is not asserted, and "stay signed in" stays clickable (now tested). Focus was never inside the warning to begin with, because `Dialog` does not move focus. | Backlog **RESP-BL-7**: the drawer's key handler ignores Escape while any other `[aria-modal="true"]` element is open. No change to `Dialog`/ADR-0027. |
| F-3 | Low | No | `ResponsiveSidebar.tsx:115-146`, `hooks/useShellSidebar.ts` | `/code-review` #2. The drawer closes only when one of its own links is activated. Browser Back or Android hardware Back changes the route but leaves the drawer and backdrop open over the new page. D2 ("drawer auto-closes on navigation") reads as covering this; `@AC-RESP-2-6` only requires the tap case. | Backlog **RESP-BL-8**: each host adds a `useLocation().pathname` effect that calls `shell.closeDrawer`. The sidebar and hook import allowlists forbid router hooks, so doing it there is an arch change. |
| F-4 | Low | No | `views/clinic/ClinicEMR.tsx:823` | `/code-review` #3. In portrait with no record open (the initial state), the Attachments & Rx tab shows an empty body with no hint, because the right panel renders only when `selectedRecordId \|\| isNewRecord`. | When `tabbed` and no record is open, show the existing empty-state hint on that tab, or disable the tab. Can go with F-1 or to backlog. |
| F-5 | Low | No | `ClinicEMR.tsx:486-487`, `:421` | `/code-review` #4, and Dev B's own note. The `?petId=` deep link (Pets "Open EMR") lands on the SOAP tab and shows "Search for a patient…" although the pet is already selected. New Record and the visit list are on the Patient tab. | When `petId` is set and no record is open, start on `patient`, or make the empty-state copy say to pick a visit. Backlog or with F-1. |
| F-6 | Low | No (fixed by QA) | `__tests__/ResponsiveSidebar.test.tsx:249-261`, `hooks/useShellSidebar.test.ts:172-179` | The A-1 import-allowlist censuses match single-line `import … from '…'` only. A multi-line, side-effect, dynamic or `require` import of `authStore`/`i18n` would pass. | Added a hardened census in `__tests__/ResponsiveShell.integration.test.tsx` that scans every module specifier and bans the forbidden names. The original censuses were left unchanged. |
| F-7 | Low | No (fixed by QA) | `layouts/__tests__/AdminLayout.test.tsx:267` | `@AC-RESP-4-3` had no test named after it, only a comment pointing to `App.realRouting.test.tsx`, which pins `useViewportMode` to `'expanded'`. The Scenario is specifically "in drawer mode". | Added `__tests__/App.drawerRouting.test.tsx`. It runs the real `App` route tree at `drawer` with all four Example rows, and uses permission sets from `anemal-rbac-matrix` `references/permission-matrix.md`. |
| F-8 | Info | No | `ClinicEMR.tsx:642-655` | The EMR tablist has `role="tab"` buttons but no `role="tabpanel"`/`aria-controls` and no arrow-key roving. The `aria-label` repeats the visible text. | Backlog (a11y polish). |
| F-9 | Info | No | `src/backend/tests/integration/rbac-regression.test.ts:209-216` | Flaky under the full `--runInBand` run (socket hang up, then 401 on the next two requests). Green alone and on re-run. The backend is untouched by this branch. | For @scribe-agent's Step 8 red-suite gate: re-run once on a flake before calling `main` red. Consider a Lane B ticket. |
| F-10 | Info | No | `ResponsiveSidebar.tsx:185` (`h-screen`, pre-existing class) | On iOS/iPadOS Safari `100vh` can extend under the toolbar, which could hide the drawer's footer (Sign out). | Covered by browser check B-6 below. If it reproduces, use `h-[100dvh]` (backlog). |

`/code-review` triage: #1 is F-2, #2 is F-3, #3 is F-4, #4 is F-5. None is High, and none is a correctness break in the frozen contract.

**Deviation 1 judgement (asked by the orchestrator).** It is not an acceptable trade-off. The drawer behaves as a modal but is not announced as one, and the backdrop class was picked to get around a guard test instead of declaring the exception openly. ADR-0027's census exists so every hand-rolled modal root is listed with a reason. Adding the drawer to `KNOWN_BESPOKE_MODALS` is the intended route and does not change ADR-0027 policy.

### 2a. F-1 re-verification (HEAD `7c96156`)

| Check | Result | Evidence |
|---|---|---|
| Drawer panel is a modal dialog | PASS | `ResponsiveSidebar.tsx:219-228`: `<div role="dialog" aria-modal="true" aria-label={props.header.title} tabIndex={-1}>` replaces the `<aside>` |
| Backdrop is `fixed inset-0` | PASS | `ResponsiveSidebar.tsx:213-218`: `className="fixed inset-0 z-[45] bg-primary/30"`, still `aria-hidden` with `onClick={onCloseDrawer}` |
| Census allowlist entry | PASS | `__tests__/modal-consistency.test.ts:68-73`: `'components/ResponsiveSidebar.tsx': { count: 2, reason: … }`. The diff to that file is this entry only: `countHandRolledRoots`, the comment stripping, the other four entries and the IdleLogoutModal prose guard are unchanged, so no ADR-0027 census logic changed. Count 2 = backdrop + panel; the JSDoc that mentions `role="dialog"` is stripped by the scanner (test green). |
| Inline sidebar still a plain aside | PASS | `ResponsiveSidebar.tsx:242`: expanded/rail render `<aside>` with no role or `aria-modal`; tests still find it with `getByRole('complementary')` (`ResponsiveShell.integration.test.tsx:146-197`, `ResponsiveSidebar.test.tsx`) |
| Closed drawer leaves nothing | PASS | `@AC-RESP-2-3` now also asserts `queryByRole('dialog')` is absent |
| No behaviour regression: focus in on open, focus back to opener, Escape, backdrop, nav close | PASS | `DrawerPanel` effect and handlers unchanged apart from the ref type (`HTMLElement` to `HTMLDivElement`). Covered green by `ResponsiveSidebar.test.tsx` (@AC-RESP-2-5, -2-6, -2-12) and `ResponsiveShell.integration.test.tsx` (`drawerPanel()` now queries `dialog` by name "Anemal"; real hamburger to Escape to focus return, backdrop, navigate-closes, sign-out) |
| Production scope of the fix | PASS | `git diff HEAD~1 --stat` on non-test `src/frontend/src`: `ResponsiveSidebar.tsx` only (12+/8-) |
| Idle warning still above the drawer | PASS | `PlatformLayout.test.tsx` @AC-RESP-5-8 finds the panel as `dialog` "Anemal" (z-[45]) and the `alertdialog` separately; RESP-8 Escape test green |

## 3. Arch conformance (arch §4, §9; plan §1, §6)

| Item | Result | Evidence |
|---|---|---|
| A-1 no auth-store/i18n/API/idle import in `ResponsiveSidebar.tsx`/`useShellSidebar.ts` | PASS | imports are `react`, `react-router-dom` (`NavLink`, `Link`), `./MaterialIcon`, `import type` of `../hooks/useViewportMode`; the hook imports `react`, `../store/uiStore`, `./useViewportMode`. Both censuses and the QA hardened census are green. |
| A-2 hosts call `useShellSidebar` before early returns; gates and idle logout stay in hosts | PASS | Clinic/Admin: before the `Navigate` returns. Platform: before `if (!isAuth)`, with `useIdleLogout` and `IdleLogoutModal` unchanged. `A-2` tests exist in the Clinic/Admin tests. |
| Entry gates, idle logout, per-layout nav filters behave exactly as on `main` | PASS | Filter expressions are identical: `!item.perm \|\| hasPermission(item.perm)` (Clinic, Admin), `item.roles.includes(role ?? '')` (Settings), static `NAV` (Platform). Same `Navigate` targets. `dashboardPath` is unchanged. |
| A-3 one item list in all modes | PASS | a single `items` prop; parity tests in all four layouts and in the component |
| A-4 header, preNav and footer take plain strings | PASS | |
| A-5 `drawerOpen`/`railExpanded` not persisted; `uiStore` unchanged | PASS | hook-local `useState`; test "A-5 … not written to the store"; `uiStore.ts` diff is empty |
| A-6 / G-2 z-order `z-[45]` sidebar, `z-40` headers, `z-50` Dialog | PASS | class asserts plus the built CSS |
| A-7 TopNav and Platform header render `SidebarMenuButton` in drawer mode and use `shell.offset.top` | PASS | |
| G-1 rail expansion pushes content (`ml-56`/`left-56`), no overlay variant | PASS | `useShellSidebar.test` @AC-RESP-3-3, QA integration @AC-RESP-3-3 |
| G-4 `offset {main, top}`; module-private literals; no `SIDEBAR_INSET_CLASS` | PASS | export census in `useShellSidebar.test` |
| No hand mode, no `side` prop | PASS | |
| No `sm:`..`2xl:` mode switches (plan rule) | PASS | grep on the diff, plus source censuses in `ResponsiveSidebar.test` and `ClinicEMR.portrait.test` |
| Props and `ShellSidebar` shape match arch §4b/§4c exactly | PASS | Internal naming `drawerRequested` with a derived `drawerOpen` is not contract-visible, and it enforces BR-7 by construction. |
| EMR arch §4a: `tabbed = useViewportMode() === 'drawer'`, class/`hidden` only, same tree position | PASS | The tab bar sits in a stable `{tabbed && …}` slot. The panels keep their element types. DOM-identity tests @AC-RESP-6-7, @AC-RESP-7-3. |
| Layer rules (architecture-rules §1): logic in hooks, component presentational | PASS | |

No drift between the code and the arch doc. F-1 (an a11y and census matter, not a contract drift) is closed; the drawer's `role="dialog"` is internal markup, and the `ResponsiveSidebarProps` contract (arch §4b) is unchanged by the fix.

## 4. Role / tenant regression

| Check | Result |
|---|---|
| Platform shell never renders without a platform session (`@AC-RESP-5-5`) | PASS: `isAuth=false` gives `Navigate /platform/login` with no aside, hamburger or nav, in expanded and drawer |
| A clinic session cannot open the platform shell | PASS: `PlatformLayout` still reads only `platformAuthStore`; `App.tsx`/`RequirePlane` unchanged; server-side `requirePlane('platform')` untouched |
| SettingsLayout role filter identical (`@AC-RESP-5-6`) | PASS: expression is identical; table tested in 3 modes |
| Admin items role-gated (`@AC-RESP-4-4`), address-bar deny in drawer mode (`@AC-RESP-4-3`) | PASS: 4 Example rows through the real `App` at `drawer` (new QA test) |
| Clinic items role-gated (`@AC-RESP-2-13`), no `/platform/` item in clinic shells (`@AC-RESP-5-4`) | PASS |
| Sign out reachable in the drawer for all 4 shells (`@AC-RESP-2-14`) | PASS: Clinic, Admin, Settings, Platform layout tests, component test, and QA integration (real hook) |
| Tenant isolation (`@AC-RESP-6-10`) | PASS: backend untouched; `rbac-regression` plus 11 `crossTenantRelation.*` suites green; EMR request and payload parity (`@AC-RESP-6-12/-13`) |
| No PII in logs, no financial data to lower roles | N/A: frontend layout only; no new data path |

## 5. EMR checks

| Check | Result |
|---|---|
| Same data load (`@AC-RESP-6-12`) | PASS: the GET endpoint and params set at `drawer` equals `expanded` |
| Same save payload (`@AC-RESP-6-13`) | PASS: the PUT call args are deep-equal |
| No API-call change in the diff | PASS: no added or removed `api.` / `useQuery` / mutate line |
| No remount on tab switch or rotation (`@AC-RESP-6-7`, `-7-3`) | PASS: same DOM node before and after |
| `emr.attach` gate kept (`@AC-RESP-6-9`) | PASS: 3 `<Can perm="emr.attach">` on `main` and on HEAD; shown/absent on the portrait tab |
| State survives rotation (`-6-7`, `-6-8`, `-7-4`, `-7-6`) | PASS |

## 6. AC coverage map (one row per tag)

Test paths are relative to `src/frontend/src/`. "Browser" means jsdom cannot observe it; the check is in section 7.

| Tag | Test(s) | Status |
|---|---|---|
| @AC-RESP-1-1 | `hooks/useViewportMode.test.ts` | PASS |
| @AC-RESP-1-2 | `hooks/useViewportMode.test.ts` (2 tests, incl. height-only) | PASS |
| @AC-RESP-1-3 | `hooks/useViewportMode.test.ts` | PASS |
| @AC-RESP-1-4 | `hooks/useViewportMode.test.ts` | PASS |
| @AC-RESP-2-1 | `__tests__/ResponsiveSidebar.test.tsx`, `__tests__/TopNav.test.tsx` | PASS |
| @AC-RESP-2-2 | `ResponsiveSidebar.test.tsx`, `TopNav.test.tsx` | PASS |
| @AC-RESP-2-3 | `ResponsiveSidebar.test.tsx`, `TopNav.test.tsx`, `ResponsiveShell.integration.test.tsx` | PASS |
| @AC-RESP-2-4 | `ResponsiveSidebar.test.tsx`, `ResponsiveShell.integration.test.tsx` | PASS; "content does not shift" also browser B-2 |
| @AC-RESP-2-5 | `ResponsiveSidebar.test.tsx`, `ResponsiveShell.integration.test.tsx` | PASS |
| @AC-RESP-2-6 | `ResponsiveSidebar.test.tsx` (item, preNav), `ResponsiveShell.integration.test.tsx` (real router), layout drawer tests | PASS |
| @AC-RESP-2-7 | `hooks/useShellSidebar.test.ts`, `ResponsiveShell.integration.test.tsx` | PASS |
| @AC-RESP-2-8 | `hooks/useShellSidebar.test.ts` | PASS |
| @AC-RESP-2-9 | `hooks/useShellSidebar.test.ts`, `ResponsiveShell.integration.test.tsx` | PASS |
| @AC-RESP-2-11 | `ResponsiveSidebar.test.tsx` (class assert, 3 tests) | PASS (class); geometry browser B-3 |
| @AC-RESP-2-12 | `ResponsiveSidebar.test.tsx`, `ResponsiveShell.integration.test.tsx` (real hamburger to Escape, focus back on the hamburger) | PASS |
| @AC-RESP-2-13 | `layouts/__tests__/ClinicLayout.test.tsx` (7 Example rows x 3 modes) | PASS |
| @AC-RESP-2-14 | `ClinicLayout`, `AdminLayout`, `SettingsLayout`, `PlatformLayout` tests; `ResponsiveSidebar.test.tsx`; `ResponsiveShell.integration.test.tsx` | PASS; iOS toolbar browser B-6 |
| @AC-RESP-3-1 | offset part: `ClinicLayout.test.tsx` (content wrapper carries `offset.main`) | **Browser-only** (no horizontal scroll): B-1 |
| @AC-RESP-3-2 | `ClinicLayout.test.tsx`, `TopNav.test.tsx` | PASS |
| @AC-RESP-3-3 | `hooks/useShellSidebar.test.ts`, `TopNav.test.tsx`, `ClinicLayout.test.tsx`, `ResponsiveShell.integration.test.tsx` | PASS |
| @AC-RESP-4-1 | `layouts/__tests__/AdminLayout.test.tsx` (mode/offset) | PASS; no-scroll part browser B-1 |
| @AC-RESP-4-2 | `AdminLayout.test.tsx` | PASS |
| @AC-RESP-4-3 | `__tests__/App.drawerRouting.test.tsx` (**new, QA**; 4 Example rows, real `App` at `drawer`) | PASS |
| @AC-RESP-4-4 | `AdminLayout.test.tsx` | PASS |
| @AC-RESP-5-1 | `layouts/__tests__/SettingsLayout.test.tsx` | PASS; no-scroll part browser B-1 |
| @AC-RESP-5-2 | `SettingsLayout.test.tsx` (source census plus rerender swap) | PASS |
| @AC-RESP-5-3 | `layouts/__tests__/PlatformLayout.test.tsx` | PASS |
| @AC-RESP-5-4 | `ClinicLayout.test.tsx`, `AdminLayout.test.tsx`, `SettingsLayout.test.tsx` | PASS |
| @AC-RESP-5-5 | `PlatformLayout.test.tsx` | PASS |
| @AC-RESP-5-6 | `SettingsLayout.test.tsx` | PASS |
| @AC-RESP-5-7 | `SettingsLayout.test.tsx`, `ResponsiveSidebar.test.tsx` (preNav) | PASS |
| @AC-RESP-5-8 | `PlatformLayout.test.tsx` (class z-order; **new RESP-8 Escape test**); `ResponsiveShell.integration.test.tsx` (**new RESP-8 Escape test with the real drawer state**) | PASS; visual stacking browser B-4 |
| @AC-RESP-6-1 | none (320px editor) | **Browser-only**: B-5 |
| @AC-RESP-6-2 | `__tests__/ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-3 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-4 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-5 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-6 | `ClinicEMR.portrait.test.tsx` (rail, expanded) | PASS |
| @AC-RESP-6-7 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-8 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-9 | `ClinicEMR.portrait.test.tsx` (2 rows) | PASS |
| @AC-RESP-6-10 | backend `tests/integration/rbac-regression.test.ts`, `tests/integration/crossTenantRelation.*.test.ts` (existing, unchanged) | PASS (see F-9) |
| @AC-RESP-6-11 | `ClinicEMR.portrait.test.tsx` (class) | PASS (class); geometry browser B-3 |
| @AC-RESP-6-12 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-6-13 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-7-1 | `ClinicEMR.portrait.test.tsx` (3 tabs) | PASS |
| @AC-RESP-7-2 | `ClinicEMR.portrait.test.tsx` (3 tabs) | PASS |
| @AC-RESP-7-3 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-7-4 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-7-5 | `ClinicEMR.portrait.test.tsx` (no fixed width, marker reaches payload) | PASS; clipping geometry browser B-7 |
| @AC-RESP-7-6 | `ClinicEMR.portrait.test.tsx` | PASS |
| @AC-RESP-7-7 | none (soft keyboard) | **Browser/manual-only** (R8): B-8 |
| @AC-RESP-8-1 | none (layout) | **Browser-only**: B-1 |
| @AC-RESP-8-2 | none (layout) | **Browser-only**: B-9 |
| @AC-RESP-8-3 | `hooks/useShellSidebar.test.ts`, `ResponsiveShell.integration.test.tsx` (**new**, real store) | PASS; real reload browser B-10 |
| @AC-RESP-8-4 | `__tests__/i18n.coverage.test.ts` guards that keys exist and th differs from en | **Browser-only** (fit/clipping): B-11 |

`@AC-RESP-2-10` was intentionally removed at Step 3 (hand mode, RESP-BL-4). Every tag has a passing test or an explicit browser-only classification, so no tag blocks sign-off.

## 7. Browser-only checklist for the human (Step 7 remainder)

Run on a real tablet or on DevTools device emulation at the widths shown, signed in as `clinic_admin` unless noted. Tick each row.

| # | AC | Width / device | Check |
|---|---|---|---|
| B-1 | -3-1, -4-1, -5-1, -8-1 | 768, 1024, 1280 | Dashboard, Inventory, Billing, Inpatient, EMR, Admin Users, Settings: no horizontal scrollbar; no control covered by the sidebar or top bar |
| B-2 | -2-4 | 768 | Opening the drawer does not shift or resize the page underneath |
| B-3 | -2-11, -6-11 | 1280, 1024, 768 | Nav items, collapse toggle, hamburger, sign-out and EMR tabs measure at least 44x44px (DevTools box model) |
| B-4 | -5-8 | 768, platform user | Open the drawer, wait for the idle warning (or lower `VITE_PLATFORM_IDLE_TIMEOUT_MINUTES`): the warning sits above the drawer and backdrop; press Escape once and the warning stays; "Stay logged in" can be tapped. Repeat in the clinic shell (warning from `RequireAuth`). |
| B-5 | -6-1 | 768 portrait | EMR SOAP editor at least 320px wide with no horizontal scroll |
| B-6 | -2-14 | iPad Safari portrait | Drawer footer "Sign out" is fully visible above the Safari toolbar (F-10) |
| B-7 | -7-5 | 768 portrait | Anatomy canvas fits the width without clipping; a finger stroke draws |
| B-8 | -7-7 | real tablet, 768 portrait | With the soft keyboard up on Subjective, the save bar can still be reached |
| B-9 | -8-2 | 768 | Pets and Appointments are no worse than on `main` (compare side by side) |
| B-10 | -8-3 | 1280 | Collapse the sidebar, reload: it stays collapsed; role-gated items unchanged |
| B-11 | -8-4 | 768, en and th | Drawer labels and EMR tab labels (`ผู้ป่วย`, `บันทึก SOAP`, `ไฟล์แนบและรายการยา`) are not clipped and do not wrap out of their control |
| B-12 | F-3 | 768, Android tablet | (Informational) Open the drawer, press hardware Back, and note the result for RESP-BL-8 |

Thai wording `บันทึก SOAP`, `ไฟล์แนบและรายการยา` and `เปิดเมนู` is still waiting on @ba-agent review (HANDOFF). This does not block QA.

## 8. Tests added or changed by QA (tests only, no production code)

| File | Change |
|---|---|
| `src/frontend/src/layouts/__tests__/PlatformLayout.test.tsx` | +1 test: RESP-8 extra test (@AC-RESP-5-8, gate A-5/A-8). With the drawer open and the blocking idle warning up, one Escape leaves the alertdialog open and "Stay logged in" clickable. The drawer state is not asserted. |
| `src/frontend/src/__tests__/ResponsiveShell.integration.test.tsx` (new) | 13 tests. PlatformLayout with the real `useShellSidebar`, `uiStore`, `ResponsiveSidebar`, `Dialog` and router: drawer open, Escape and focus return, backdrop, navigate-closes, sign-out, rotation discard, RESP-8 Escape with the real drawer state, persisted collapse on mount, rail push, D1 reset. Also the hardened A-1 import census (F-6). |
| `src/frontend/src/__tests__/App.drawerRouting.test.tsx` (new) | 4 tests: @AC-RESP-4-3 through the real `App` route tree at `drawer` (F-7) |

These QA tests, together with Dev A's F-1 fix and the `complementary` to `dialog` query edits in `ResponsiveSidebar.test.tsx` and `PlatformLayout.test.tsx`, were committed in `7c96156`. The re-verification added no tests and changed only this document (uncommitted).

## 9. Backlog to add at Step 8 (@scribe-agent)

| ID | Source | Item |
|---|---|---|
| RESP-BL-7 | F-2 | Escape under the blocking idle warning also closes the drawer and moves focus behind the alertdialog: ignore Escape in the drawer while another `[aria-modal="true"]` is open |
| RESP-BL-8 | F-3 | Drawer stays open on browser/hardware Back: hosts close it on `pathname` change |
| RESP-BL-9 | F-4 | EMR portrait Attachments & Rx tab is blank with no record open: empty-state hint or disabled tab |
| RESP-BL-10 | F-5 | `?petId=` deep link opens on the SOAP tab: start on Patient when no record is open |
| RESP-BL-11 | F-8 | EMR tablist a11y polish: `tabpanel`/`aria-controls`, arrow-key roving |
| RESP-BL-12 | F-10 | iOS `h-[100dvh]` for the drawer, only if B-6 fails |
| Lane B ticket | F-9 | `rbac-regression` full-run flake (socket hang up); re-run once before calling `main` red |

These add to RESP-BL-1..6 and the existing Step 8 items. The IDs RESP-BL-9..12 are proposed; @scribe-agent may renumber.

## 10. Next

1. Human runs the section 7 browser checklist B-1..B-12 (B-12 informational). A failing row (other than B-12) reopens this sign-off.
2. Step 8: `@scribe-agent` `/anemal-finish-branch` (commit this document with the branch, file the section 9 backlog, red-suite gate with the F-9 re-run rule).
