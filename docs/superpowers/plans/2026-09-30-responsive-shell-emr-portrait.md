# Implementation Plan: Responsive Shell + EMR Portrait

2026-09-30 · Lane A · Step 4 (`/superpowers:write-plan`) · Author: @pm-agent · Branch `feature/responsive-shell-emr-portrait`
Feature slug: `responsive-shell-emr-portrait` · Frontend-only (no table, API, permission code or route; C1)

**arch: done, see arch doc** (`2026-09-30-responsive-shell-emr-portrait-arch.md`, tier Brief, contract frozen in §4, grill G-1..G-4 folded in §11, manifest notes §12).
This plan **references** the frozen contract; it does not redefine it. Where a task needs a signature, it points at the arch section. Any wish to change a name, prop, class string or rule below is an arch-doc change first, not a plan edit.

## 0. Inputs (all exist, verified)

| Doc | Path | Used for |
|---|---|---|
| Brainstorm (Step 1) | `docs/superpowers/plans/2026-09-28-responsive-shell-emr-portrait-brainstorm.md` | origin defect, decisions D1-D7 |
| Tasks + Gherkin AC (Step 2) | `docs/superpowers/plans/2026-09-29-responsive-shell-emr-portrait-tasks.md` | RESP-1..8, every `@AC-RESP-*` tag |
| BA sign-off (Step 3) | `docs/superpowers/plans/2026-09-29-responsive-shell-emr-portrait-ba-signoff.md` | BR-1..BR-7, A-1..A-7, C1-C3, E1-E12 |
| Arch brief (Step 3.4, frozen) | `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-arch.md` | contract §4a-4d, test strategy §7, manifest notes §12 |
| Ponytail arch-precheck (Step 3.4b) | `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-ponytail-precheck.md` | PASS; Step 5 watch items |
| Grill log (Step 3.5) | `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-grill.md` | G-1..G-4, binding changes to this plan |
| ADR-0033 | `docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md` | lasting decision: bands, hook is the only source, rail push, z-order |
| Handoff | `docs/superpowers/plans/HANDOFF-responsive-shell-emr-portrait.md` | resume state |
| AC rules / structure rules | `.claude/standards/acceptance-criteria.md`, `.claude/standards/architecture-rules.md` | Gherkin format, layer contract |

## 1. Frozen contract, by reference (do not restate in code review; check against the arch doc)

| Item | Where frozen |
|---|---|
| `VIEWPORT_BREAKPOINTS`, `ViewportMode`, `viewportModeFor`, `useViewportMode` in `hooks/useViewportMode.ts`; returns the bare mode string | arch §4a |
| `useShellSidebar(): ShellSidebar` in `hooks/useShellSidebar.ts`, returns `offset: { main, top }` (ready-made literal Tailwind classes, module-private constant, nothing else exported); D1 semantics; rail-band expansion **pushes** content (`ml-56`/`left-56`) | arch §4b, ADR-0033, G-1, G-4 |
| `ResponsiveSidebar` props and `SidebarMenuButton` (same file); no `side`/hand-mode prop; no offset prop; sidebar layer `z-[45]` in every mode; import allowlist | arch §4c, G-2 |
| `TopNav({ shell })`; hosts keep `NAV`, filters, entry gates, idle logout verbatim; hosts read `shell.offset.*` only | arch §4d |
| **No** responsive-prefix classes (`sm:` `md:` `lg:` `xl:` `2xl:`) for mode-bound switches (cosmetic ones such as TopNav `lg:w-80` are exempt); **no** overlay variant in the rail band; **no** hand mode | arch §4a rules (this plan is stricter: arch §4a names only `lg:`/`xl:`, the plan widens the ban to every prefix `sm:`..`2xl:`; the plan rule governs), §8, RESP-BL-4 |
| `store/uiStore.ts` unchanged and unowned | arch §3, §12 |

## 2. Work-partition manifest

Waves: **W0** (RESP-1 seam + i18n keys) then **W1** (Dev A ∥ UIUX A ∥ Dev B). One file has exactly one owner per wave. Integration checkpoint after each wave (section 5). `src/frontend/src` is abbreviated `SRC`.

| Task | Wave | Owner | Files it may write (exclusive) | Depends on | Contract referenced |
|------|------|-------|--------------------------------|------------|---------------------|
| RESP-1 | W0 | Dev A | `SRC/hooks/useViewportMode.ts` (new), `SRC/hooks/useViewportMode.test.ts` (new) | none | arch §4a |
| RESP-1i | W0 | Dev A | `SRC/i18n/index.ts` (new keys only, `en` and `th`; see 2.1) | none | arch §4c (labels arrive as props), §7 |
| RESP-2 | W1 | Dev A | `SRC/hooks/useShellSidebar.ts` (new), `SRC/hooks/useShellSidebar.test.ts` (new), `SRC/components/ResponsiveSidebar.tsx` (new), `SRC/__tests__/ResponsiveSidebar.test.tsx` (new) | RESP-1 | arch §4b, §4c |
| RESP-2t | W1 | Dev A | `SRC/components/TopNav.tsx`, `SRC/__tests__/TopNav.test.tsx` (new) | RESP-2 | arch §4d, A-7 |
| RESP-3 | W1 | Dev A | `SRC/layouts/ClinicLayout.tsx`, `SRC/layouts/__tests__/ClinicLayout.test.tsx` | RESP-2, RESP-2t | arch §4d, §7 |
| RESP-4 | W1 | Dev A | `SRC/layouts/AdminLayout.tsx`, `SRC/layouts/__tests__/AdminLayout.test.tsx` | RESP-2, RESP-2t | arch §4d, §7 |
| RESP-5 | W1 | Dev A | `SRC/layouts/SettingsLayout.tsx`, `SRC/layouts/PlatformLayout.tsx`, `SRC/layouts/__tests__/SettingsLayout.test.tsx` (new), `SRC/layouts/__tests__/PlatformLayout.test.tsx` (new) | RESP-2, RESP-2t | arch §4d, A-7 |
| RESP-6a | W1 | UIUX A | `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-uiux.md` (new, design note only; no code) | RESP-1 (constant), arch §4a | arch §4a (EMR rules), D5, D7 |
| RESP-6 | W1 | Dev B | `SRC/views/clinic/ClinicEMR.tsx`, `SRC/__tests__/ClinicEMR.portrait.test.tsx` (new) | RESP-1; RESP-6a for visual classes only (see 2.2) | arch §4a |
| RESP-7 | W1 | Dev B | same files as RESP-6 (same owner, sequenced inside Dev B's lane) | RESP-6 | arch §4a |
| RESP-8 | Step 7 | QA | tests only; no source file | RESP-3..RESP-7 | arch §7 |

No path appears twice within a wave. `SRC/store/uiStore.ts`, `SRC/App.tsx`, and every file not listed above are **unowned and read-only** for all Step 6 workers.

### 2.1 Manifest gap found at plan time: i18n keys

The arch doc and tasks list do not name `SRC/i18n/index.ts`, but two new user-visible strings need keys in both `en` and `th` (repo rule: no hardcoded strings; `SRC/__tests__/i18n.coverage.test.ts` enforces en/th parity and no dynamic keys in EMR): the hamburger label (passed to `SidebarMenuButton.label`) and the three EMR tab labels (`Patient`, `SOAP`, `Attachments & Rx`). That is **4 keys**. There is no key for a drawer close/backdrop label (Ponytail gate R-1): `ResponsiveSidebar` may not import `i18n` and `ResponsiveSidebarProps` has no prop to carry one (arch §4c). The backdrop is presentational (`aria-hidden`, tap closes) or uses an English literal like today's collapse-toggle `aria-label`; either way it adds no prop and no key. `index.ts` is one 1147-line shared file, so it gets **one owner in W0** (Dev A) and both W1 workers only consume keys. Key names are chosen by Dev A in W0 and written into the top of the W0 report so Dev B can use them. The hamburger key follows the existing `nav.*` naming; the EMR tab keys go in the **existing `clinic.emr.*` namespace** (not `emr.*`, which does not exist in the file). If the orchestrator prefers, this is the only item that could instead move to Dev B in W1, but never to both.

**Coverage-test constraint (Ponytail gate R-2), decision: option 1.** `SRC/__tests__/i18n.coverage.test.ts` rule R-4 requires every `clinic.emr.*` Thai value to differ from its English value, and `ALLOWED_SAME_AS_EN` is empty. So the three Thai tab labels are written to **differ from the English ones** (for example a Thai word or prefix around "SOAP", never a bare "SOAP"). Scope therefore stays at `SRC/i18n/index.ts` only; `i18n.coverage.test.ts` is **not** edited and is not added to any owner's file list. The exact Thai wording is a draft: if Dev A is uncertain, flag it for @ba-agent / glossary wording review (`CONTEXT.md` terms) rather than invent clinical terminology. Thai label length feeds the RESP-6a 320px check.

### 2.2 UIUX A vs Dev B inside W1

Tasks doc marks RESP-6 "UIUX A (design) then Dev B (build)". The manifest keeps them in the same wave because arch §4a already freezes everything structural (panel tree stable, switch by class/`hidden` only, `tabbed = useViewportMode() === 'drawer'`). Ordering inside W1: UIUX A delivers the design note **first** (tab bar visuals, 44px targets, pinned header/allergy/save bar layout, canvas fit, tokens only, Material Symbols). Dev B does steps 1-3 of RESP-6 (tests, tab state, panel structure) in parallel and applies visual classes from the note in step 4. UIUX A never edits `ClinicEMR.tsx`. The design note may refine D5 but may not introduce a drawer, an overlay, a new breakpoint or a remount.

## 3. Commands (from `src/frontend/package.json`, verified; run from `D:\Development\Anemal\src\frontend`)

| Purpose | Command | Notes |
|---|---|---|
| One test file | `npx vitest run src/hooks/useViewportMode.test.ts` | `vitest run` is the `test` script; path filter is a vitest arg |
| Frontend suite | `npm run test` | = `vitest run`; jsdom, setup `SRC/test/setup.ts` |
| Type check | `npx tsc --noEmit` | `npm run build` runs `tsc && vite build`; use `tsc --noEmit` per task, full `npm run build` at checkpoints |
| Lint | `npm run lint` | = `eslint src --ext .ts,.tsx` |
| Backend regression (C2) | run the backend suites unchanged at Step 7/8 (red-suite gate) | not touched by any task |

Every task's "done" line = its test files green + `npx tsc --noEmit` clean + `npm run lint` clean on touched files. Full `npm run test` at each wave checkpoint.

## 4. Tasks

Format per task: Task ID, Actor/role, Device, Description, Files, TDD steps (test first), AC tags covered, commands, Permission(s), Dependencies. Gherkin text lives in the tasks doc (`2026-09-29-...-tasks.md` section 4) and is **not** copied here; each test is named after its tag (`@AC-RESP-x-n` in the `it`/`describe` title) per the Definition of Done.

Permission(s) for every task: none new. The feature adds no permission code. Existing gates (`Can perm="emr.attach"`, per-item `perm`, `RequirePermission`, settings role filter, platform session) are preserved verbatim (BR-2, BR-3).

### RESP-1 — `useViewportMode` and breakpoint constant (W0)

**Actor/role:** doctor (persona), all shell users · **Device:** Both (Tablet primary)
**Description:** Implement arch §4a exactly. Pure `viewportModeFor`, live `useViewportMode` subscribing to `window` `resize`, removing the listener on unmount, no window means `'expanded'`, reads width only.
**Files:** `SRC/hooks/useViewportMode.ts`, `SRC/hooks/useViewportMode.test.ts` (co-located, precedent `SRC/hooks/useAuth.test.ts`).
**TDD steps:**
1. Write `viewportModeFor` table test: 1600, 1280, 1279, 1024, 1023, 768, 480, `undefined` (`@AC-RESP-1-1`, `@AC-RESP-1-4`). Run, red.
2. Write `renderHook` tests: set `window.innerWidth = 768`, mount, set 1024, dispatch `resize` inside `act`, expect `'rail'` (`@AC-RESP-1-2`); spy `window.removeEventListener`, unmount, expect a `'resize'` removal (`@AC-RESP-1-3`); a height-only change does not alter the mode. Red.
3. Implement until green. No store import, no side effects.
**AC covered:** `@AC-RESP-1-1`, `@AC-RESP-1-2`, `@AC-RESP-1-3`, `@AC-RESP-1-4`.
**Commands:** `npx vitest run src/hooks/useViewportMode.test.ts`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** none.

### RESP-1i — i18n keys (W0, manifest gap, see 2.1)

**Actor/role:** doctor, clinic_staff (Thai and English users) · **Device:** Both
**Description:** Add **4 keys**, `en` and `th`: the hamburger label (`nav.*`) and the EMR tabs `Patient` / `SOAP` / `Attachments & Rx` (existing `clinic.emr.*` namespace). No close/backdrop key (see 2.1, R-1). Static keys only (no template keys; `i18n.coverage.test.ts` R-5 rule for `ClinicEMR.tsx`). The three Thai `clinic.emr.*` values must differ from their English values so `i18n.coverage.test.ts` R-4 passes without editing that test (see 2.1, R-2 option 1).
**Files:** `SRC/i18n/index.ts` only.
**TDD steps:** 1. Run `npx vitest run src/__tests__/i18n.coverage.test.ts` (baseline green). 2. Add keys to `en` and `th`. 3. Re-run: parity and R-4 stay green. 4. Record the exact key names in the W0 report for Dev A (RESP-2/2t) and Dev B (RESP-6); flag any Thai label wording Dev A is unsure of for @ba-agent / glossary review.
**AC covered:** supports `@AC-RESP-8-4` and `@AC-RESP-6-2` (labels exist in both languages).
**Commands:** `npx vitest run src/__tests__/i18n.coverage.test.ts`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** none. Runs in W0 alongside RESP-1 (different files).

### RESP-2 — `useShellSidebar` + `ResponsiveSidebar` (W1, Dev A)

**Actor/role:** clinic_staff, doctor, clinic_admin, platform user · **Device:** Both
**Description:** Implement arch §4b (state hook, D1, `offset` table, push in the rail band) and §4c (presentational component and `SidebarMenuButton`, `z-[45]` everywhere, drawer backdrop, Escape, focus return, allowlist). No responsive-prefix mode switches (`sm:`..`2xl:`), no overlay variant, no `side` prop. The backdrop is presentational or uses an English literal; no i18n import, no new prop (R-1).
**Files:** `SRC/hooks/useShellSidebar.ts`, `SRC/hooks/useShellSidebar.test.ts`, `SRC/components/ResponsiveSidebar.tsx`, `SRC/__tests__/ResponsiveSidebar.test.tsx`.
**TDD steps:**
1. `useShellSidebar.test.ts`: `vi.mock('./useViewportMode')` flipped between `rerender`s, real `uiStore` reset by `setState` in `beforeEach`. Write failing tests for: `offset` equals the arch §4b table in expanded / collapsed / rail-collapsed / rail-expanded (push, `@AC-RESP-3-3`) / drawer; band change resets `drawerOpen` and `railExpanded` and sets `sidebarOpen` true when entering `expanded` (`@AC-RESP-2-7`, `@AC-RESP-2-9`); same-band width change keeps a manual collapse (`@AC-RESP-2-8`); **mount does not reset** a persisted collapse (`@AC-RESP-8-3`); `toggleExpanded` routes to `uiStore.toggleSidebar` (expanded band) or `railExpanded` (rail band); `drawerOpen` is never true outside `drawer` (BR-7); `drawerOpen` and `railExpanded` are not written to the store (A-5). Red, then implement.
2. `ResponsiveSidebar.test.tsx` (`MemoryRouter` only, props in, precedent `SRC/__tests__/Dialog.test.tsx`): inline modes render `w-56` / `w-14` and the collapse toggle only inline; drawer closed renders no sidebar node in flow or accessibility tree (`@AC-RESP-2-3`); drawer open renders backdrop + panel with labels, footer and sign-out (`@AC-RESP-2-4`, `@AC-RESP-2-14`); backdrop tap calls `onCloseDrawer` (`@AC-RESP-2-5`); nav-item and `preNav` activation in drawer mode calls `onCloseDrawer` (`@AC-RESP-2-6`, feeds `@AC-RESP-5-7`); Escape closes and focus returns to the opener (`@AC-RESP-2-12`); tap-target class assert `min-h-[44px]`/`min-w-[44px]` (or the design-system equivalent) on items, toggle, hamburger and sign-out (`@AC-RESP-2-11`, class assert only, geometry is a browser check); same `items` rendered in all three modes (A-3); `z-[45]` present on aside, panel and backdrop (A-6). Red, then implement.
3. Import-allowlist census inside `ResponsiveSidebar.test.tsx`, following the `Dialog.test.tsx` `?raw` precedent: `ResponsiveSidebar.tsx` imports only `react`, `react-router-dom` (`NavLink`, `Link`), `./MaterialIcon`, type-only `../hooks/useViewportMode`; add the same check for `useShellSidebar.ts` (`react`, `../store/uiStore`, `./useViewportMode`). Fails on `authStore`, `platformAuthStore`, `i18n`, an API client or `useIdleLogout` (A-1, BR-4). Census stays inline; no shared helper file.
4. Implement both units to green. Class strings for `offset` are complete literals in one module-private constant; nothing but `ShellSidebar` (type) and `useShellSidebar` is exported from the hook file; `SidebarMenuButton` stays in `ResponsiveSidebar.tsx`.
**AC covered:** `@AC-RESP-2-1`..`-2-9`, `@AC-RESP-2-11`, `@AC-RESP-2-12`, `@AC-RESP-2-14` (component-level), `@AC-RESP-3-3`, `@AC-RESP-8-3`.
**Commands:** `npx vitest run src/hooks/useShellSidebar.test.ts src/__tests__/ResponsiveSidebar.test.tsx`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** RESP-1.

### RESP-2t — `TopNav({ shell })` (W1, Dev A)

**Actor/role:** all shell users · **Device:** Both
**Description:** Arch §4d: signature `TopNav({ shell }: { shell: ShellSidebar })`, `left-*` from `shell.offset.top`, `SidebarMenuButton` only when `shell.mode === 'drawer'`; stop reading `uiStore` for the offset. `lg:w-80` search width stays (cosmetic, exempt).
**Files:** `SRC/components/TopNav.tsx`, `SRC/__tests__/TopNav.test.tsx`.
**TDD steps:** 1. Test with a `ShellSidebar` prop: carries the given `offset.top`; hamburger present iff `mode === 'drawer'` and calls `openDrawer`; `left-0` in drawer mode (`@AC-RESP-3-2`). Red. 2. Change the component. 3. Confirm no `ml-${...}`/`left-${...}` composition and no local class map.
**AC covered:** `@AC-RESP-2-1` (no hamburger), `@AC-RESP-2-3` (hamburger shown), `@AC-RESP-3-2`, `@AC-RESP-3-3`, `@AC-RESP-5-3` (top bar offset, with RESP-5).
**Commands:** `npx vitest run src/__tests__/TopNav.test.tsx`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** RESP-2.

### RESP-3 — `ClinicLayout` adopts the sidebar (W1, Dev A)

**Actor/role:** doctor, clinic_staff, clinic_admin · **Device:** Both
**Description:** Call `useShellSidebar()` once before any early return (A-2); keep `NAV`, per-item `perm` filter, `Navigate` gate and header/footer data in the host; map to `SidebarNavItem` (`t(label)`); wrap content with `shell.offset.main`; pass `shell` to `TopNav`; delete the inline sidebar JSX.
**Files:** `SRC/layouts/ClinicLayout.tsx`, `SRC/layouts/__tests__/ClinicLayout.test.tsx`.
**TDD steps:** 1. In the existing test replace the `uiStore` mock (line ~31) with a `vi.mock('../../hooks/useShellSidebar')` returning a fixed `ShellSidebar` per mode **including `offset`**; keep the auth/i18n/router/useAuth mocks; **real `ResponsiveSidebar`, never mocked**. Do not delete or loosen any hidden/shown or redirect-target assertion (R4, E10). 2. Add failing tests: the `AC-RESP-2-13` role x width x item table iterating `expanded`/`rail`/`drawer`(open), asserting the same visible item set (`@AC-RESP-2-13`); content wrapper carries the mocked `offset.main` (`@AC-RESP-3-2`); `Sign out` in the drawer (`@AC-RESP-2-14`, clinic row). 3. Refactor the layout. 4. Existing tests still pass.
**AC covered:** `@AC-RESP-2-13`, `@AC-RESP-2-14` (clinic), `@AC-RESP-3-1` and `@AC-RESP-3-2` (offset assertions; no-horizontal-scroll is a browser check at Step 7), `@AC-RESP-3-3`.
**Commands:** `npx vitest run src/layouts/__tests__/ClinicLayout.test.tsx`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** RESP-2, RESP-2t.

### RESP-4 — `AdminLayout` adopts the sidebar (W1, Dev A)

**Actor/role:** clinic_admin (also doctor, clinic_staff for gated cases) · **Device:** Both
**Description:** Same pattern as RESP-3. `RequirePermission` and the `/clinic-admin/403` redirect stay where they are (`App.tsx`, unchanged, read-only).
**Files:** `SRC/layouts/AdminLayout.tsx`, `SRC/layouts/__tests__/AdminLayout.test.tsx`.
**TDD steps:** as RESP-3 with the `AC-RESP-4-4` table (`Users`, `Roles`, `Audit log`, `Blood Bank`) in three modes, `@AC-RESP-4-1` mode per width via the mocked `ShellSidebar`, `@AC-RESP-4-2` drawer nav closes. `@AC-RESP-4-3` (role cannot reach screen by address) is the existing route-guard behaviour: assert it stays covered by the existing test or add the `403`-redirect case in this file without loosening anything.
**AC covered:** `@AC-RESP-4-1`, `@AC-RESP-4-2`, `@AC-RESP-4-3`, `@AC-RESP-4-4`, `@AC-RESP-2-14` (admin).
**Commands:** `npx vitest run src/layouts/__tests__/AdminLayout.test.tsx`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** RESP-2, RESP-2t.

### RESP-5 — `SettingsLayout` and `PlatformLayout` adopt the sidebar (W1, Dev A)

**Actor/role:** clinic_admin, doctor, clinic_staff (settings), platform user · **Device:** Both
**Description:** Settings: delete the `LAYOUT-04` mount effect (`SettingsLayout.tsx` lines ~36-38: `window.innerWidth < 768` + `toggleSidebar`); keep the `roles.includes(role)` filter, `dashboardPath` and the `preNav` "Back to Dashboard" in the host, English labels as today. Platform: keep the static `NAV`, the `isAuth` gate and idle logout in the host; its own header renders `SidebarMenuButton` in drawer mode and takes `left-*` from `shell.offset.top` (A-7).
**Files:** `SRC/layouts/SettingsLayout.tsx`, `SRC/layouts/PlatformLayout.tsx`, `SRC/layouts/__tests__/SettingsLayout.test.tsx` (new), `SRC/layouts/__tests__/PlatformLayout.test.tsx` (new).
**TDD steps:** 1. New `SettingsLayout.test.tsx` (mocks: `useShellSidebar`, authStore, router, useAuth; real `ResponsiveSidebar`): `AC-RESP-5-6` table in three modes; `@AC-RESP-5-7` "Back to Dashboard" goes to the role's home and calls `closeDrawer`; `@AC-RESP-5-4` (settings rows) no `/platform/` link; `@AC-RESP-5-2` no `innerWidth` read remains (source assertion or behaviour: mode change via mock re-render swaps inline to drawer with no mount effect). Red, refactor. 2. New `PlatformLayout.test.tsx` (mocks: `useShellSidebar`, `platformAuthStore`, `useIdleLogout`): mode/offset per width (`@AC-RESP-5-3`), hamburger in header in drawer mode, `isAuth=false` renders `Navigate` and no sidebar/hamburger (`@AC-RESP-5-5`), idle warning still rendered through `Dialog` and not inside the sidebar tree (`@AC-RESP-5-8` z-order asserted on classes: sidebar `z-[45]`, header `z-40`, `Dialog` `z-50`; visual stacking is a browser check). 3. Clinic-shell `@AC-RESP-5-4` rows for `clinic`/`admin` are asserted in RESP-3/RESP-4 test files (no `/platform/` href in the rendered item set); this task's files only cover the settings rows. 4. Settings/Platform `Sign out` in drawer (`@AC-RESP-2-14`).
**AC covered:** `@AC-RESP-5-1`, `@AC-RESP-5-2`, `@AC-RESP-5-3`, `@AC-RESP-5-4`, `@AC-RESP-5-5`, `@AC-RESP-5-6`, `@AC-RESP-5-7`, `@AC-RESP-5-8`, `@AC-RESP-2-14` (settings, platform).
**Commands:** `npx vitest run src/layouts/__tests__/SettingsLayout.test.tsx src/layouts/__tests__/PlatformLayout.test.tsx`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** RESP-2, RESP-2t. Time-box note: if the branch is time-boxed, this is the first item to cut, and only by a human decision (tasks doc section 3 sizing note).

### RESP-6a — EMR portrait design note (W1, UIUX A)

**Actor/role:** doctor · **Device:** Tablet (768 portrait), Both for the unchanged 1024/1280 layout
**Description:** One short design note (no code, no prose beyond a heading and one intro line), **a single table** with columns `element | Tailwind classes | AC tag` (A-4). Rows cover: tab bar (three tabs, `SOAP` default, tokens only, Material Symbols, no emoji), 44px targets, pinned region (patient header, allergy chip, save bar) visible on every tab, SOAP editor at least 320px at 768, anatomy canvas fit, Thai label lengths. Must respect arch §4a: same panel elements and tree position in both layouts, no drawer/overlay, no new breakpoint, no remount. Not a canonical spec: not registered in `doc-map.md`. Reads `anemal-design-system` and `anemal-screen-specs` first.
**Files:** `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-uiux.md` (new; the only file UIUX A writes).
**TDD steps:** not applicable (no code). Deliverable check: the note names Tailwind classes per element and maps each to a `@AC-RESP-6-*`/`-7-*` tag.
**AC covered (design inputs for):** `@AC-RESP-6-1`, `-6-2`, `-6-11`, `@AC-RESP-7-1`, `-7-2`, `-7-5`, `-7-7`, `@AC-RESP-8-4`.
**Commands:** none.
**Dependencies:** RESP-1 (constant), arch §4a.

### RESP-6 — EMR portrait tabs (W1, Dev B)

**Actor/role:** doctor, clinic_staff, custom roles (attachments gate) · **Device:** Tablet portrait; unchanged on landscape and Web
**Description:** In `ClinicEMR.tsx`: `const tabbed = useViewportMode() === 'drawer'`; add a local `activeTab` (`useState`, default `soap`, not persisted); the three existing panels keep element type and position and only get class/`hidden` changes; tab bar rendered only when `tabbed`; **keep `ClinicEMR.tsx` changes minimal (A-3)**: tab state, wiring and classes only, no extracted subcomponents and no file split in this branch (that would risk the no-remount guarantee; a Lane D backlog item for the 834-LOC file is raised at Step 8); selecting a different visit sets the tab to `soap`. `<Can perm="emr.attach">` (three places) untouched. No new request, no changed payload (C1, BR-6).
**Files:** `SRC/views/clinic/ClinicEMR.tsx`, `SRC/__tests__/ClinicEMR.portrait.test.tsx` (new; new file so existing `ClinicEMR.*.test.tsx` stay unowned and unchanged).
**TDD steps:**
1. New test file, `vi.mock('../hooks/useViewportMode')`, `rerender` with a new mode simulates rotation; spy the API module (mock pattern from `SRC/__tests__/ClinicEMR.characterization.test.tsx`; read it first, do not edit it). Write failing tests: tabs `Patient` / `SOAP` / `Attachments & Rx` present under `drawer`, `SOAP` selected, exactly one panel visible (`@AC-RESP-6-2`); `Patient` and `Attachments & Rx` selection show the right panel (`@AC-RESP-6-3`, `-6-4`); picking another visit returns to `SOAP` (`@AC-RESP-6-5`); no tab bar and three columns under `expanded` and `rail` (`@AC-RESP-6-6`); tab elements carry 44px classes (`@AC-RESP-6-11`, class assert); upload control shown/absent by `emr.attach` under `drawer` (`@AC-RESP-6-9`); calls under `expanded` vs `drawer` compared for endpoints and params, and the save payload compared (`@AC-RESP-6-12`, `@AC-RESP-6-13`). Red.
2. Rotation tests: type into "Subjective" at `rail`, `rerender` as `drawer`, text still present, same DOM node (no remount) (`@AC-RESP-6-7`); `drawer` on the `Attachments & Rx` tab then `rail` restores three columns (`@AC-RESP-6-8`). Red.
3. Implement tab state and mode wiring (structure and logic).
4. Apply visual classes from the RESP-6a note; keep existing tests green (`ClinicEMR.attachments`, `.characterization`, `.i18n`, `.petAvatar`, `.petIdParam`, `.weightSync`). jsdom default width is 1024 (`rail`), so unmocked existing tests keep the three-column path; if any existing test turns red, stop and escalate rather than editing it.
**AC covered:** `@AC-RESP-6-2`..`-6-9`, `@AC-RESP-6-11`, `@AC-RESP-6-12`, `@AC-RESP-6-13`. Browser checks (Step 7): `@AC-RESP-6-1` (320px, no horizontal scroll), `@AC-RESP-6-10` (satisfied by existing backend suites, `crossTenantRelation.*.test.ts`, `rbac-regression.test.ts`, which must stay green; no new backend test).
**Commands:** `npx vitest run src/__tests__/ClinicEMR.portrait.test.tsx src/__tests__/ClinicEMR.attachments.test.tsx src/__tests__/ClinicEMR.characterization.test.tsx src/__tests__/ClinicEMR.i18n.test.tsx`, `npx tsc --noEmit`, `npm run lint`.
**Dependencies:** RESP-1, RESP-1i; RESP-6a for step 4 only.

### RESP-7 — EMR portrait pinned chrome, state, canvas (W1, Dev B, after RESP-6 in the same lane)

**Actor/role:** doctor · **Device:** Tablet portrait
**Description:** Patient header, allergy chip and save bar rendered outside the switchable panels so they show on every tab; tab switch never unmounts panels (hidden, not unmounted; R6) so unsaved text, open record id and `isNewRecord` survive; anatomy canvas fits the portrait width and still accepts touch markers; the save bar stays reachable with the soft keyboard (a class/position choice from the RESP-6a note).
**Files:** `SRC/views/clinic/ClinicEMR.tsx`, `SRC/__tests__/ClinicEMR.portrait.test.tsx` (extended).
**TDD steps:** 1. Failing tests: header + allergy chip visible on each of the three tabs (`@AC-RESP-7-1`); save controls and status visible on each tab (`@AC-RESP-7-2`); typed text survives `SOAP` to `Attachments & Rx` and back (`@AC-RESP-7-3`); open record unchanged and not marked new after a tab switch (`@AC-RESP-7-4`); new unsaved record stays new and saving creates exactly one create call (`@AC-RESP-7-6`); canvas container has no fixed width larger than the portrait width (class assert) and a marker add still fires under `drawer` (`@AC-RESP-7-5`, touch handler part). 2. Implement. 3. Full EMR test group green.
**AC covered:** `@AC-RESP-7-1`..`-7-6`. Browser check only: `@AC-RESP-7-7` (soft keyboard, jsdom cannot observe; QA may classify manual, R8), canvas clipping geometry of `@AC-RESP-7-5`.
**Commands:** as RESP-6.
**Dependencies:** RESP-6.

### RESP-8 — Regression sweep (Step 7, QA)

**Actor/role:** clinic_admin (per AC) · **Device:** Both
**Description:** Tests and browser checks only, no source change. `@AC-RESP-8-1` (no horizontal scroll / no covered control at 768, 1024, 1280 on Dashboard, Inventory, Billing, Inpatient, EMR), `@AC-RESP-8-2` (Pets and Appointments no worse at 768), `@AC-RESP-8-3` (collapse survives reload at 1280; automated in `useShellSidebar.test.ts`, plus one browser reload check), `@AC-RESP-8-4` (Thai and English fit in drawer and EMR tabs). QA picks manual or automated per Scenario; jsdom cannot check layout, stacking, clipping or the keyboard.
**AC covered:** `@AC-RESP-8-1`..`-8-4`, plus the browser-check remainder listed in the arch doc §7 (`-3-1`, `-4-1`, `-5-1`, `-6-1`, `-5-8` stacking, `-7-7`).
**Commands:** `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, backend suites unchanged (C2). QA also diffs `ClinicLayout.test.tsx` and `AdminLayout.test.tsx` against `main` to confirm no hidden/shown or redirect-target assertion was removed or loosened (R4).
**Extra Step 7 QA test (gate A-5, extends `@AC-RESP-5-8`):** with the drawer open and the blocking idle-logout warning (`Dialog`) raised, one Escape press leaves the warning open and its 'stay signed in' action still usable. Reason: ADR-0027 decision 1, a blocking `Dialog` never closes on Escape. The drawer's state behind the warning is **not** asserted. Nothing changes in `Dialog.tsx` or the `ResponsiveSidebar` contract. Test lives in `PlatformLayout.test.tsx` scope or a QA-owned test file.
**Dependencies:** RESP-3..RESP-7.

## 5. Integration checkpoints

| After | Who runs | Check | Blocks |
|---|---|---|---|
| **W0** | orchestrator | `npx vitest run src/hooks/useViewportMode.test.ts src/__tests__/i18n.coverage.test.ts`, `npx tsc --noEmit`, `npm run lint`; `useViewportMode.ts` exports exactly `VIEWPORT_BREAKPOINTS`, `ViewportMode`, `viewportModeFor`, `useViewportMode` (arch §4a); i18n key names recorded in the W0 report | W1 start |
| **W1** | orchestrator, then @qa-agent Step 7 | full `npm run test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`; grep the diff for **any responsive prefix** (`sm:` `md:` `lg:` `xl:` `2xl:`) on mode-bound elements (sidebar, `TopNav` offset, EMR panels and tab bar): none allowed, since a `md:` switch is the same second source of truth at another threshold (cosmetic exemptions such as `lg:w-80` stay); no exported offset map, no `handMode` use, `uiStore.ts` untouched (`git diff --stat` shows no change), no file written outside its owner's list; the four layouts and `TopNav` compile against the single `ShellSidebar` type; existing `ClinicEMR.*` tests unmodified | Step 7 |

## 6. What @ponytail-agent Step 5 will check (arch-doc drift items)

Nine criteria on {arch doc + this plan}, ANY yes rejects. Items to be ready for, with the plan's answer:

| Watch item | Source | Where the plan holds it |
|---|---|---|
| `SidebarMenuButton` stays inside `ResponsiveSidebar.tsx` | precheck watch #1, grill binding #4 | RESP-2 step 4; manifest lists no separate file |
| Census tests stay inline, no shared helper file | precheck watch #2 | RESP-2 step 3; no helper path in the manifest |
| No responsive-prefix (`sm:`..`2xl:`) mode switches; no overlay variant in the rail band | arch §4a, §8, G-1, gate A-2 | section 1 table; W1 checkpoint grep (all prefixes) |
| Each layout keeps its own `NAV` list and filter | grill binding #4, BR-2, R14 | RESP-3/4/5 descriptions |
| `offset` returned as ready-made classes; no exported `SIDEBAR_INSET_CLASS`/inset type | G-4 | RESP-2 step 4; W1 checkpoint |
| `uiStore.ts` unchanged and unowned | arch §12 | manifest note under the table; W1 checkpoint |
| `TopNav.tsx` in Dev A's exclusive scope with the frozen signature | arch §12 | RESP-2t |
| File count vs need (new files: 2 hooks + 2 hook tests, 1 component + 1 test, 1 TopNav test, 2 layout tests, 1 EMR test, 1 design note = 11 new; 4 layouts + TopNav + ClinicEMR + i18n edited) | criteria on files | each new file names its AC; no new dependency, no new util or barrel |
| Drift from arch: any name, prop or class string that differs from §4a-4d | drift rule | section 1 is by reference; no restatement to drift from |
| Plan-introduced deltas the gate should judge | this plan | (a) `RESP-1i` adds `SRC/i18n/index.ts` to the manifest (not in arch §12; a required-by-repo-rule gap, section 2.1); (b) UIUX A's single output file `...-uiux.md` (new doc, not code) |

## 7. Path verification (Step 4b input for @scribe-agent)

Verified by Glob/Read/ls at plan time. **EXISTS** = present now. **NEW** = created by this plan, parent directory exists.

| Path | Status |
|---|---|
| `SRC/hooks/` (dir), `SRC/hooks/useAuth.test.ts` (co-located test precedent) | EXISTS |
| `SRC/hooks/useViewportMode.ts`, `.test.ts`, `SRC/hooks/useShellSidebar.ts`, `.test.ts` | NEW |
| `SRC/components/ResponsiveSidebar.tsx` | NEW |
| `SRC/components/TopNav.tsx`, `SRC/components/MaterialIcon.tsx`, `SRC/components/Dialog.tsx` | EXISTS |
| `SRC/__tests__/ResponsiveSidebar.test.tsx`, `TopNav.test.tsx`, `ClinicEMR.portrait.test.tsx` | NEW |
| `SRC/__tests__/Dialog.test.tsx`, `i18n.coverage.test.ts`, `ClinicEMR.{attachments,characterization,i18n,petAvatar,petIdParam,weightSync}.test.tsx` | EXISTS (read-only) |
| `SRC/layouts/{Clinic,Admin,Settings,Platform}Layout.tsx`, `SRC/layouts/navAccess.ts` | EXISTS (`navAccess.ts` read-only, unowned) |
| `SRC/layouts/__tests__/ClinicLayout.test.tsx`, `AdminLayout.test.tsx` | EXISTS |
| `SRC/layouts/__tests__/SettingsLayout.test.tsx`, `PlatformLayout.test.tsx` | NEW |
| `SRC/views/clinic/ClinicEMR.tsx` | EXISTS |
| `SRC/i18n/index.ts` | EXISTS |
| `SRC/store/uiStore.ts`, `SRC/App.tsx`, `SRC/guards/RequireAuth.tsx` | EXISTS (read-only, unowned) |
| `SRC/test/setup.ts` (vitest setup) | EXISTS (referenced from `src/frontend/vite.config.ts`; confirmed by the Step 4b refcheck) |
| `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-uiux.md` | NEW (UIUX A) |
| `docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md` and the 8 docs in section 0 | EXISTS |
| `.claude/standards/{acceptance-criteria,architecture-rules,tech-stack}.md` | EXISTS |

`SRC` = `src/frontend/src`.

## 8. AC-to-task coverage check

Every AC tag in the tasks doc maps to a task; automated in jsdom unless marked "browser".

| Tags | Task | Note |
|---|---|---|
| `@AC-RESP-1-1..1-4` | RESP-1 | |
| `@AC-RESP-2-1..2-9`, `-2-11`, `-2-12` | RESP-2 (+2t for hamburger) | `-2-11` class assert; geometry is a browser check |
| `@AC-RESP-2-13` | RESP-3 | |
| `@AC-RESP-2-14` | RESP-3, RESP-4, RESP-5 (one shell each) | |
| `@AC-RESP-3-1` | RESP-3 (offset) + browser (no scroll) | |
| `@AC-RESP-3-2`, `-3-3` | RESP-2t, RESP-3, RESP-2 | |
| `@AC-RESP-4-1..4-4` | RESP-4 | `-4-1` no-scroll is a browser check |
| `@AC-RESP-5-1..5-8` | RESP-5 (`-5-4` clinic/admin rows in RESP-3/4 test files) | `-5-1` scroll and `-5-8` stacking are browser checks |
| `@AC-RESP-6-1` | RESP-6a + RESP-6 | browser (320px) |
| `@AC-RESP-6-2..6-9`, `-6-11..6-13` | RESP-6 | |
| `@AC-RESP-6-10` | existing backend suites | must stay green; no new test |
| `@AC-RESP-7-1..7-6` | RESP-7 | |
| `@AC-RESP-7-7` | RESP-7 / QA | browser or manual (R8) |
| `@AC-RESP-8-1..8-4` | RESP-8 (QA); `-8-3` also in RESP-2 | |

**AC without a task: none.** `@AC-RESP-2-10` was removed by the sign-off (hand mode, RESP-BL-4) and is intentionally absent.

## 9. Backlog carried (not built here)

`RESP-BL-1` Pets `w-72`, `RESP-BL-2` Appointments `w-80`, `RESP-BL-3` sidebar width drift, `RESP-BL-4` hand mode, `RESP-BL-5` EMR UI gating on `emr.create`/`emr.edit`/`prescriptions.create`, `RESP-BL-6` Settings role filter to permission codes. Reasons in tasks doc section 6. Filed at Step 8 by @scribe-agent. ADR number 0032 stays reserved for `ADR-DUP-1`.

## 10. Handoff

Step 4b: `@scribe-agent` reference pre-check on this plan (section 7 table). Step 5: `@ponytail-agent` mode `gate` on {arch doc + this plan} (section 6). No code is written before `APPROVE`. Update `HANDOFF-responsive-shell-emr-portrait.md` to "Step 4 done, next: Step 4b" (orchestrator/scribe, not this task).
