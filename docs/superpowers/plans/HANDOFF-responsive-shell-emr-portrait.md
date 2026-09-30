# HANDOFF: responsive-shell-emr-portrait

**Lane:** A. Escalated from Lane B on 2026-09-28 (fix spans >3 files, needs design work). Human chose "Lane A: do it properly".
**Branch:** `feature/responsive-shell-emr-portrait` (from `main` @ `03efdf1`). Worktree = main repo checkout `D:/Development/Anemal`. Always run `git branch --show-current` first; if on `main`, `git switch feature/responsive-shell-emr-portrait`. Do NOT use `.claude/worktrees/kind-nash-e95334` (stale, detached).
**Last commit:** `07b9a61` (Steps 1-3 artefacts). Edits after it are UNCOMMITTED: tasks doc (E1-E12), arch doc, ponytail precheck doc, this HANDOFF.

## Current step
**STEP 5 ponytail gate — APPROVED 2026-09-30 (third pass).** Steps done: 1, 2, 3 (BA sign-off + E1-E12), 3.4 arch, 3.4b ponytail PASS, 3.5 grill (4 findings, 0 unresolved), 4 plan + manifest, 4b scribe refcheck PASS, 5 gate APPROVE (REJECT D-1 fixed by R-1/R-2, REJECT D-2 fixed by R-3). `/execute-plan` is unblocked.

**Literal next command:** Step 6 `/superpowers:execute-plan` on `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait.md`: W0 = RESP-1 + RESP-1i (`@dev-agent` Dev A), integration checkpoint, then W1 = Dev A ∥ `@uiux-agent` (RESP-6a design note) ∥ `@dev-agent` Dev B (RESP-6/7), integration checkpoint. Each delegation names its exclusive file scope from the plan §3. Step 6 has NOT started; no source under `src/` is changed yet. Human should decide whether to commit the docs first (all Steps 2-5 docs are uncommitted).

### Notes for Step 7 (`@qa-agent`)
- A-5/A-8: RESP-8 extra test = with drawer open + blocking idle warning up, one Escape leaves the warning open and "stay signed in" clickable (not keyboard focus; `Dialog` has no focus trap). Drawer state behind the warning is NOT asserted.
- Browser-only ACs (jsdom cannot check): no horizontal scroll, 320px editor, stacking, soft keyboard, label clipping, tap-target geometry.
- Thai labels for the 3 EMR tabs + hamburger (RESP-1i) are drafts; `i18n.coverage.test.ts` R-4 needs Thai != English. Uncertain wording -> `@ba-agent`.

### Backlog to file at Step 8 (`@scribe-agent`)
RESP-BL-1..6 (grill list omitted BL-3; plan §9 has all six); Lane D item for `ClinicEMR.tsx` (834 LOC); `ADR-DUP-1` row (renumber target is 0032, not 0029).

### Grill decisions (binding for Step 4)
- G-1 rail expansion at 1024 **pushes** content (`@AC-RESP-3-3` unchanged); ~288px SOAP editor stays known limitation R13.
- G-2 sidebar `z-[45]` in every mode (header z-40, Dialog/IdleLogoutModal z-50).
- G-3 ADR written: `docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md` (0032 reserved for backlog `ADR-DUP-1`); `CONTEXT.md` gained "Responsive shell" terms (Viewport mode, Rail, Drawer).
- G-4 `useShellSidebar` returns `offset: { main, top }`; no `SIDEBAR_INSET_CLASS` export.

### Manifest for Step 4 (`@pm-agent`)
- `components/TopNav.tsx` in Dev A's exclusive scope (`TopNav({ shell })`); tasks table omits it, add it.
- No worker owns `store/uiStore.ts` (unchanged).
- Waves: W0 = RESP-1 (`useViewportMode`, ~25 lines) then W1 = Dev A ∥ UIUX A ∥ Dev B.

## Frozen contract (from arch doc, see it for detail)
- `src/frontend/src/hooks/useViewportMode.ts`: `VIEWPORT_BREAKPOINTS = { rail: 1024, expanded: 1280 }`, `ViewportMode = 'expanded'|'rail'|'drawer'`, pure `viewportModeFor(width|undefined)`, `useViewportMode(): ViewportMode`, live `resize`.
- `hooks/useShellSidebar.ts` returns `{ mode, expanded, drawerOpen, offset: { main, top }, toggleExpanded, openDrawer, closeDrawer }`.
- `components/ResponsiveSidebar.tsx` props: `mode, expanded, drawerOpen, onToggleExpanded, onCloseDrawer, items, header, preNav?, footer`. No hand-mode prop. Exports `SidebarMenuButton`. Import-allowlist test blocks auth-store/i18n imports.
- Layouts keep own nav filters/gates/idle logout. Widths stay `w-56`/`w-14`.

## Human decisions on record
- Step 1 (2026-09-29): manual collapse does not survive breakpoint change; drawer auto-closes on navigation; live `resize` listener; all 4 layouts (Clinic, Admin, Settings, Platform); EMR portrait = Tabs; Pets/Appointments fixed panels -> backlog RESP-BL-1/2; min SOAP editor 320px at 768.
- Step 2: breakpoints OK; run brief arch pass (done); @tenant/@validation exempt (frontend-only) with regression guards C1-C3.
- Step 3: Q1 = drop right-hand sidebar mode -> backlog RESP-BL-4. Q2 = accept ~288px SOAP editor at 1024 when manually expanded.

## Docs produced
- `2026-09-28-responsive-shell-emr-portrait-brainstorm.md` (Step 1)
- `2026-09-29-responsive-shell-emr-portrait-tasks.md` (Step 2, E1-E12 applied 2026-09-30)
- `2026-09-29-responsive-shell-emr-portrait-ba-signoff.md` (Step 3)
- `2026-09-30-responsive-shell-emr-portrait-arch.md` (Step 3.4)
- `2026-09-30-responsive-shell-emr-portrait-ponytail-precheck.md` (Step 3.4b, PASS)
- `2026-09-30-responsive-shell-emr-portrait-grill.md` (Step 3.5, PASSED)
- `2026-09-30-responsive-shell-emr-portrait.md` (Step 4 plan + manifest)
- `2026-09-30-responsive-shell-emr-portrait-refcheck.md` (Step 4b, PASS)
- `2026-09-30-responsive-shell-emr-portrait-ponytail-gate.md` (Step 5, APPROVE)
- `docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md` (new ADR) · `CONTEXT.md` (3 terms added)

## Agent registry
All 9 project agents are callable via `subagent_type` as of 2026-09-30 (`pm-agent` verified). Agent-loading root cause is tracked in the separate `HANDOFF-agent-loading-fix.md` (not part of this feature; do not touch).

## After grill
Step 4 `@pm-agent` write-plan + work-partition manifest -> `docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait.md`; 4b `@scribe-agent` reference pre-check; 5 `@ponytail-agent` gate; 6 execute; 7 `@qa-agent`; 8 `@scribe-agent` finish-branch.
