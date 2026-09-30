# Ponytail arch-precheck: Responsive Shell + EMR Portrait

2026-09-30 · Step 3.4b · Mode `arch-precheck` · Reviewer: @ponytail-agent
Input: `2026-09-30-responsive-shell-emr-portrait-arch.md` (arch brief, reviewed as the only subject).
Context read: `2026-09-29-...-ba-signoff.md` (A-1..A-7, G-8/Q2), `2026-09-29-...-tasks.md`, plus the current
`layouts/*.tsx`, `components/TopNav.tsx`, `store/uiStore.ts` and the `Dialog` census test, to check whether each
new piece replaces something real.
Criteria in scope: #1, #8, #9 only. Files, endpoints and dependencies were not counted because no plan exists yet.

```
@arch-agent — Ponytail arch-precheck

Verdict: PASS
#1 Over-engineering?         no — each new unit has at least 2 consumers or holds logic that would otherwise be copied 4 times
#8 Abstraction w/o 2nd impl? no — no interface, port or base class. `ShellSidebar` is a return-type shape, not a seam with implementers
#9 Pattern w/o problem?      no — §5 declares no whitelist pattern. The one structural rule (mode switches use the hook, not `lg:`/`xl:`) names its problem: a second threshold source would let the shell and EMR drift
Required before Step 3.5: none
```

## Per-unit justification

| Unit | Consumers / reason | Verdict |
|---|---|---|
| `useViewportMode` + `viewportModeFor` + `VIEWPORT_BREAKPOINTS` | Shell (through `useShellSidebar`) and EMR (Dev B). It is the only cross-worker seam and it returns a bare string. `viewportModeFor` is exported as a pure function so the test does not need a DOM. About 25 LOC. | Keep |
| `useShellSidebar` | Four hosts call it. D1 (mount does not reset, band change resets, the `setSidebarOpen(true)` write) is subtle and is covered by 4 ACs. Without the hook, this logic would be copied into Clinic/Admin/Settings/Platform. It uses the existing `uiStore.setSidebarOpen` and `toggleSidebar`, so `uiStore` is not changed. | Keep |
| `ResponsiveSidebar` | Replaces 4 near-identical inline sidebars (each layout is 132-151 LOC, and most of that is sidebar JSX and the `navClass` ternary). This is a net reduction. Props hold only what A-4 requires. There is no `side` prop and no second list. | Keep. This unit shrinks the codebase |
| `SidebarMenuButton` | Has 2 consumers (`TopNav`, `PlatformLayout` header; see A-7). It is a named export in `ResponsiveSidebar.tsx`, not a new file. | Keep |
| `SidebarInset` + `SIDEBAR_INSET_CLASS` | 6 call sites (4 `main` offsets, `TopNav`, platform header) replace today's copied `sidebarOpen ? 'ml-56' : 'ml-14'` / `'left-56' : 'left-14'` ternaries. | Keep. See the optional cut below |
| Import-allowlist census test | Enforces A-1/BR-4 and blocks R14 structurally. It reuses the existing `Dialog.test.tsx` `?raw` precedent (about 15 LOC per module). It needs no new helper or util file. | Keep |
| `z-[45]` sidebar layer | Decides A-6 once, with a single value. | Keep |

The total is 2 hooks, 1 component, 1 co-located export and 1 constant map. `uiStore.ts` is untouched. The design
follows the hook-plus-presentational-component layer contract and adds no pattern. The shape is right for what the
4 layouts need.

## Optional cut (advisory, not a grill item)

- **Collapse the `inset` indirection.** `ShellSidebar.inset: SidebarInset` is used only as a key into
  `SIDEBAR_INSET_CLASS`, at all 6 call sites. The hook could return the class pair directly
  (`offset: { main, top }`, still as literal Tailwind strings from one map inside the hook). That removes one
  exported type and one exported constant, and each call site becomes `shell.offset.main`. The saving is small, so
  this is **not** a FLAG. @arch-agent can take it or leave it before Step 4. If the map stays exported, keep it the
  only place these classes are spelled.

## Watch items for the Step 5 gate (no action now)

1. `SidebarMenuButton` stays inside `ResponsiveSidebar.tsx`. A separate file needs a stated reason.
2. The census tests stay inline, following the `Dialog` precedent. A shared "import-census" test helper for two
   call sites would trip #8.
3. The plan must not add `lg:`/`xl:` classes for mode-bound switches (§4a) or an overlay variant in the rail band
   (§8 closes it unless AC-RESP-3-3 changes). Either one is drift.
4. Hosts keep their `NAV` constants and filters verbatim (BR-2). The plan must not add a shared nav-config or
   filter util "while we're here". That would be scope creep, and it also breaks A-1/R14.

LEDGER | mode=arch-precheck | verdict=PASS | criterion=— | shared sidebar removes 4x duplication; no abstraction added
