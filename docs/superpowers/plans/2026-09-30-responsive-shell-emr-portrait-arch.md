# Arch Brief: Responsive Shell + EMR Portrait

2026-09-30 · Tier: **Brief** · Step 3.4 (human N2: brief pass, do not skip) · Author: @arch-agent ·
Revised after Step 3.5 `/grill-with-docs` (G-1..G-4 folded in, section 11).
Sources: `2026-09-29-responsive-shell-emr-portrait-ba-signoff.md` (A-1..A-7, BR-1..BR-7, C1-C3),
`2026-09-29-responsive-shell-emr-portrait-tasks.md` (E1-E12 applied), `2026-09-28-...-brainstorm.md`,
`.claude/standards/architecture-rules.md`, ADR-0027 decision 2 (plane-neutral shared components),
**ADR-0033** (`docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md`).
Grounded in: `layouts/{Clinic,Admin,Settings,Platform}Layout.tsx`, `store/uiStore.ts`, `components/TopNav.tsx`,
`components/Dialog.tsx`, `guards/RequireAuth.tsx`.

## 1. Problem and assumptions

Four layouts carry near-identical sidebar JSX with a width set only by persisted `uiStore.sidebarOpen`
and no viewport awareness (Settings has a mount-only `innerWidth < 768` hack). EMR is a fixed 3-column
layout. Bands are confirmed: `< 1024` drawer, `1024-1279` rail, `>= 1280` expanded; EMR tabs below 1024.
Frontend-only: no table, API, permission code or route. No backend layer is touched (C1).

## 2. Hotspots

| Area | Nature | Handling |
|---|---|---|
| Band thresholds | rule, changes rarely, consumed by shell **and** EMR | one constant, one hook (section 4a, ADR-0033) |
| D1 override semantics | state-dependent, easy to get subtly wrong | one hook owns it, unit-tested (section 4b) |
| Per-shell nav filtering | rule-heavy, authz-adjacent, must NOT change | stays in each host layout (BR-2) |
| Offsets `ml-*` / `left-*` (R3) | duplicated in 4 layouts + TopNav + platform header | class strings private to `useShellSidebar.ts`, returned ready-made as `offset` (section 4b, G-4) |

## 3. Logical model delta

None. No entity, relation or state machine. UI state only:

| State | Where | Persisted |
|---|---|---|
| `sidebarOpen` (collapse choice in the expanded band) | `uiStore`, **unchanged** | yes, as today |
| `railExpanded` (manual expand in the rail band) | `useState` inside `useShellSidebar` | no (A-5) |
| `drawerOpen` | `useState` inside `useShellSidebar` | no (A-5, BR-7) |
| EMR active tab | `useState` inside `ClinicEMR` (Dev B) | no |

**`uiStore.ts` is not modified.** `handMode` stays untouched (RESP-BL-4).

## 4. Contract (FROZEN for Step 6)

### 4a. Viewport mode: the only cross-worker seam (Dev A produces, Dev B consumes)

File: `src/frontend/src/hooks/useViewportMode.ts` (test co-located: `useViewportMode.test.ts`).

```ts
export const VIEWPORT_BREAKPOINTS = { rail: 1024, expanded: 1280 } as const  // min widths, CSS px
export type ViewportMode = 'expanded' | 'rail' | 'drawer'

/** Pure. width >= 1280 → 'expanded'; >= 1024 → 'rail'; else 'drawer'; undefined → 'expanded'. */
export function viewportModeFor(width: number | undefined): ViewportMode

/** Live. Subscribes to window 'resize' (D3), removes the listener on unmount (AC-RESP-1-3).
 *  No window → 'expanded', no throw (AC-RESP-1-4). Reads width only, so a soft keyboard
 *  (height change) never flips the mode. No side effects, no store writes. */
export function useViewportMode(): ViewportMode
```

Rules (recorded as a lasting decision in **ADR-0033**):
- Returns the bare `ViewportMode` string. No object, no width, no setters.
- **Mode-bound layout switches read this hook; they never use Tailwind `lg:`/`xl:` classes.** A CSS
  breakpoint would be a second source of truth for the same threshold and the shell and EMR could drift.
  Cosmetic responsive classes unrelated to the mode (for example TopNav's `lg:w-80` search) are unaffected.
- EMR (Dev B): `const tabbed = useViewportMode() === 'drawer'`. The switch changes classes/`hidden` only.
  The three panels keep the same element type and tree position in both layouts, so React never
  remounts them on rotation (R6, R7, AC-RESP-6-7/-8, AC-RESP-7-3/-4/-6).

### 4b. Shell sidebar state (Dev A internal; frozen so RESP-3/4/5 and QA build against one shape)

File: `src/frontend/src/hooks/useShellSidebar.ts` (test co-located). Called **once per shell, by the
host layout, before any early return** (rules of hooks; A-2).

```ts
export interface ShellSidebar {
  mode: ViewportMode
  expanded: boolean        // inline label visibility; false when mode === 'drawer'
  drawerOpen: boolean      // always false unless mode === 'drawer'
  offset: { main: string; top: string }   // ready-made Tailwind classes (G-4), see table below
  toggleExpanded: () => void   // expanded band → uiStore.toggleSidebar; rail band → railExpanded
  openDrawer: () => void
  closeDrawer: () => void
}
export function useShellSidebar(): ShellSidebar
```

`offset` is the only way a host or TopNav learns the sidebar's footprint. The class strings live in a
**module-private** constant inside `useShellSidebar.ts`; nothing else is exported (no inset key type, no
class map). Each string is a complete literal so the Tailwind scanner sees it:

| Condition | `offset.main` | `offset.top` |
|---|---|---|
| `mode !== 'drawer'` and `expanded` | `ml-56` | `left-56` |
| `mode !== 'drawer'` and not `expanded` | `ml-14` | `left-14` |
| `mode === 'drawer'` (open or closed) | `ml-0` | `left-0` |

Widths are unchanged from today: `w-56` expanded, `w-14` collapsed.

D1 semantics, exact (the executable definition is AC-RESP-2-7/-8/-9 and AC-RESP-8-3):
- `expanded` = `sidebarOpen` in the expanded band, `railExpanded` in the rail band.
- On **mount**: no reset (so a collapse made at 1280 survives a reload at 1280, AC-RESP-8-3).
- On a **band change** (previous mode kept in a ref): `drawerOpen := false`, `railExpanded := false`,
  and, when the new band is `expanded`, `uiStore.setSidebarOpen(true)`. That is the only write to the
  persisted field besides the user's toggle.
- **Rail-band expansion pushes content** (G-1, AC-RESP-3-3): with `railExpanded` true the hook returns
  `offset = { main: 'ml-56', top: 'left-56' }`, so TopNav and the content shift by the expanded width.
  Overlay expansion in the rail band is **rejected**; there is no overlay variant in the contract.

### 4c. Shared sidebar component (props frozen)

File: `src/frontend/src/components/ResponsiveSidebar.tsx`, at the root of `components/` per the ADR-0027
plane-neutral convention. Test: `src/frontend/src/__tests__/ResponsiveSidebar.test.tsx` (Dialog precedent).

```ts
export interface SidebarNavItem { to: string; icon: string; label: string }  // label already rendered
export interface ResponsiveSidebarProps {
  mode: ViewportMode
  expanded: boolean
  drawerOpen: boolean
  onToggleExpanded: () => void
  /** The on-navigate callback. Called on nav-item or preNav activation in drawer mode (D2),
   *  and on backdrop tap and Escape (AC-RESP-2-5, -2-12). Host passes shell.closeDrawer. */
  onCloseDrawer: () => void
  items: readonly SidebarNavItem[]          // already filtered by the host; rendered as-is in every mode
  header: { title: string; subtitle?: string }
  preNav?: SidebarNavItem                   // Settings "Back to Dashboard" only
  footer: { name: string | null; roleLabel: string | null; initial: string;
            signOutLabel: string; onSignOut: () => void }
}
export default function ResponsiveSidebar(props: ResponsiveSidebarProps): JSX.Element
export function SidebarMenuButton(props: { onOpen: () => void; label: string }): JSX.Element  // hamburger
```

The component takes no offset prop: it sizes itself from `mode`/`expanded` (`w-56`/`w-14`); only the
hosts and TopNav consume `shell.offset`.

Behaviour frozen with the props:
- No `side`/hand-mode prop (RESP-BL-4). No second item list (A-3).
- Inline modes: `aside` `w-56` when `expanded`, else `w-14`; the collapse toggle is shown only inline.
  In the rail band the expanded `aside` stays in flow beside the content (push, G-1); it is never an
  overlay.
- Drawer mode: closed → no sidebar element in the layout flow or the accessibility tree; open →
  backdrop plus panel rendered with labels, footer and sign-out included (BR-5, AC-RESP-2-14). On
  close the panel returns focus to the element that was focused when it opened (the hamburger, AC-RESP-2-12).
- **Z-order (A-6), confirmed at Step 3.5 (G-2):** the sidebar layer (inline aside, drawer panel,
  backdrop) is `z-[45]` in every mode. TopNav and the platform header stay `z-40`. `Dialog` stays `z-50`,
  and both `IdleLogoutModal` call sites (`guards/RequireAuth.tsx`, `layouts/PlatformLayout.tsx`) render
  through `Dialog`. The idle warning is therefore above the drawer regardless of DOM order (AC-RESP-5-8).
- **Import allowlist** (A-1, BR-4, enforced by a census test as in ADR-0027): `react`,
  `react-router-dom` (`NavLink`, `Link` only), `./MaterialIcon`, and a type-only import from
  `../hooks/useViewportMode`. `useShellSidebar.ts` allowlist: `react`, `../store/uiStore`,
  `./useViewportMode`. Neither module may import `authStore`, `platformAuthStore`, `i18n`, an API client
  or `useIdleLogout`.

### 4d. Host changes (Dev A)

- `TopNav` signature becomes `TopNav({ shell }: { shell: ShellSidebar })`. It stops reading `uiStore`
  for the offset, applies `shell.offset.top` as its `left-*` class, and renders `SidebarMenuButton` when
  `shell.mode === 'drawer'`. `PlatformLayout`'s own header does the same (A-7).
- Each host keeps its `NAV` constant, its filter expression, its entry gate and (Platform) its idle
  logout **verbatim**, maps items to `SidebarNavItem` (Clinic/Admin via `t(label)`, Settings/Platform
  English as today), and applies `shell.offset.main` to its content wrapper.
- No host or TopNav composes an offset class itself (no `ml-${...}`, no local class map). The offset
  is read from `shell.offset` only.
- `SettingsLayout`: delete the `LAYOUT-04` mount effect (RESP-5). `dashboardPath` and the
  `roles.includes(role)` filter stay in the host unchanged (BR-2, G-3, RESP-BL-6).

## 5. Patterns used

None from the whitelist. Hook (logic) + presentational component (props only) is the frontend layer
contract in `architecture-rules.md` §1, not a pattern. No interface: one implementation.

## 6. Transaction and error boundary

Not applicable: no server call is added, changed or reordered (C1, BR-6). The hooks cannot throw on a
missing `window`.

## 7. Test strategy

| Subject | Mocks (the seam) | Real | Covers |
|---|---|---|---|
| `viewportModeFor` | none | pure | AC-RESP-1-1, -1-4 |
| `useViewportMode` | none: set `window.innerWidth`, dispatch `resize` in `act` | jsdom window | -1-2, -1-3 (spy `removeEventListener`) |
| `useShellSidebar` | `vi.mock('.../hooks/useViewportMode')`, flipped between `rerender`s | real `uiStore`, reset via `setState` in `beforeEach` | -2-7, -2-8, -2-9, -8-3 (mount does not reset); **`offset` equals the section 4b table** for expanded/collapsed/rail-collapsed/rail-expanded (push, -3-3)/drawer |
| `ResponsiveSidebar` | none (`MemoryRouter` only); props in | component | -2-4/5/6/11 (class assert)/12/14; **import-allowlist census** (A-1) |
| 4 layouts | `vi.mock('.../hooks/useShellSidebar')` returning a fixed `ShellSidebar` per mode, **including `offset`**, plus today's authStore/i18n/router/useAuth mocks | **real `ResponsiveSidebar`, never mocked**, or the parity check proves nothing | -2-13, -4-4, -5-4, -5-6, -5-7 iterate `expanded`/`rail`/`drawer`(open) and assert the same item set; the content wrapper carries the mocked `offset.main`; -5-5 via `isAuth=false` → `Navigate`, no sidebar |
| `TopNav` | `ShellSidebar` passed as a prop | component | carries `shell.offset.top`; hamburger present only when `mode === 'drawer'` (A-7) |
| `ClinicEMR` | `vi.mock('.../hooks/useViewportMode')`; `rerender` with a new mode simulates rotation; spy the API module | EMR tree | -6-2..-6-9, -6-12/-13 (calls under `expanded` vs `drawer` compared), -7-1..-7-6 |

Existing `ClinicLayout`/`AdminLayout` tests swap their `uiStore` mock for a `useShellSidebar` mock
(selector change, allowed by R4/E10); no hidden/shown or redirect-target assertion is removed.
jsdom cannot lay out or stack. No horizontal scroll (-3-1, -4-1, -5-1, -8-1), 320px editor (-6-1),
visual stacking (-5-8), label clipping (-8-4) and soft keyboard (-7-7) are browser checks; @qa-agent
picks manual vs automated at Step 7. C2 backend suites run unchanged (red-suite gate).

## 8. Risks and the most expensive spot

- **Most expensive:** `useShellSidebar`'s band-change effect. It is the only place D1 lives, and it is
  covered by four ACs. Acceptable because it is one small hook with pure-state tests.
- **R13 (known limitation, reconfirmed at Step 3.5, G-1):** at 1024 with the sidebar manually expanded,
  the EMR editor is about 288px (1024 - 224 - 224 - 288), below D7's 320px, which binds 768 only.
  Opt-in, reversible, no worse than today. Rail-band expansion **pushes** content (AC-RESP-3-3); the
  sign-off's overlay option is closed and is not available to UIUX A or Dev A. Revisiting it requires
  changing AC-RESP-3-3 first.
- R14 (normalising filters, auth store in the sidebar) is blocked structurally: filters never leave the
  hosts, and the allowlist census fails the build on an auth-store import.

## 9. A-1..A-7 → how satisfied

| ID | Satisfied by |
|---|---|
| A-1 | Items, header and footer arrive as props. Import allowlist plus census test (4c). The hook imports `uiStore` only, which is not an auth store. |
| A-2 | Hosts call `useShellSidebar` before their early returns. `Navigate` gates, `isAuth` and `useIdleLogout` stay in the hosts. The sidebar cannot import `Navigate`. |
| A-3 | A single `items` prop; there is no drawer-specific list. The same list renders in the inline and drawer branches. |
| A-4 | `header {title, subtitle?}`, `preNav?`, `footer {name, roleLabel, initial, signOutLabel, onSignOut}` take plain strings, so each host translates or not as it does today. |
| A-5 | `drawerOpen` and `railExpanded` are hook-local `useState`, non-persisted by construction. `uiStore` is unchanged and `sidebarOpen` persists as today. `offset` is derived on each render, never stored. |
| A-6 | Sidebar layer `z-[45]` in every mode, headers `z-40`, `Dialog`/`IdleLogoutModal` `z-50` (4c, G-2). |
| A-7 | `TopNav({ shell })` and `PlatformLayout`'s header both render the exported `SidebarMenuButton` in drawer mode and take their `left-*` from `shell.offset.top`. |

## 10. Self-review

Simpler? `uiStore` is untouched and there is one seam hook, one state hook and one component. The
offset classes now have a single owner and no exported map (G-4). · Abstraction without a second
implementation? None. · Pattern without a problem? None used. · Logic in the wrong place? D1 and offset
logic are in a hook; the component only handles Escape and focus. · Testable without UI?
`viewportModeFor` is pure; `useShellSidebar` (including `offset`) is tested via `renderHook`. ·
Isolation, planes, deny-by-default: unchanged. Plane separation gets **stricter** (census test on the
shared sidebar).

## 11. Step 3.5 grill outcomes (folded in)

| ID | Decision | Where applied |
|---|---|---|
| G-1 | Rail-band (1024) expansion **pushes** content per AC-RESP-3-3; overlay rejected. R13 stays a known limitation. | 4b D1 semantics, 4c behaviour, section 8 |
| G-2 | Sidebar layer `z-[45]` in every mode; header `z-40`; `Dialog`/`IdleLogoutModal` `z-50`. Confirmed. | 4c Z-order, A-6 |
| G-3 | ADR written: `docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md`. ADR number 0032 is reserved for backlog ADR-DUP-1 (renumber) and is not used here. | Header sources, 4a rules |
| G-4 | `useShellSidebar` returns `offset: { main, top }` (ready-made Tailwind classes) instead of an inset key. The exported class map and inset type are deleted; class strings are private to the hook file. | 2, 4b, 4c, 4d, 7, 9, 10 |

## 12. Manifest notes for Step 4

- `src/frontend/src/components/TopNav.tsx` is in **Dev A's exclusive scope** (the tasks table does not
  list it). Frozen signature: `TopNav({ shell }: { shell: ShellSidebar })`.
- `src/frontend/src/store/uiStore.ts` is **unchanged and unowned**: no worker may edit it.
- Waves: **W0** = RESP-1 (`useViewportMode`, the only cross-worker seam, Dev A). **W1** = Dev A
  (RESP-2..5) ∥ UIUX A ∥ Dev B (RESP-6/7). Integration checkpoint after each wave.

**Handoff:** @pm-agent `/write-plan` (Step 4), using section 12 for the work-partition manifest.
