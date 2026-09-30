# ADR-0033 — `useViewportMode` is the single source of truth for shell layout mode

**Status:** Accepted
**Date:** 2026-09-30
**Related:** ADR-0027 (shared modal, plane-neutral; import-allowlist test precedent) ·
`docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-arch.md` ·
`.claude/skills/anemal-design-system/references/sidebar-spec.md` §6
**Origin:** `/grill-with-docs` Step 3.5, feature `responsive-shell-emr-portrait`
(`docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-grill.md`, rows G-1..G-3)

## Context

The four shells (`ClinicLayout`, `AdminLayout`, `SettingsLayout`, `PlatformLayout`) sized the sidebar
only from the persisted `uiStore.sidebarOpen` and ignored the viewport, so at 768px the EMR left ~30px
for the SOAP editor. The fix needs every shell and the EMR screen to agree, at every moment, on which
of three layout modes is active. Tailwind's `lg:` / `xl:` classes could express the same bands, but
each file would then carry its own copy of the boundary and the shell and EMR could drift apart.

## Decision

1. **Three modes, two boundaries**, defined once in `src/frontend/src/hooks/useViewportMode.ts`
   (`VIEWPORT_BREAKPOINTS = { rail: 1024, expanded: 1280 }`):
   - width < 1024 → `drawer` (sidebar hidden, hamburger opens an overlay drawer)
   - 1024 – 1279 → `rail` (narrow icon rail, `w-14`; user may expand it, which **pushes** content)
   - ≥ 1280 → `expanded` (`w-56`)
2. **Any decision that changes structure or behaviour by mode reads `useViewportMode()`.** Layouts and
   the EMR portrait/tabs switch must not use `lg:` / `xl:` for that. Tailwind breakpoint classes remain
   fine for purely visual tweaks that do not decide which mode is active.
3. **Expanding the rail at 1024 pushes content; it does not overlay** (grill G-1, `@AC-RESP-3-3`). The
   sidebar sits at `z-[45]` in every mode, above the `z-40` top bar and below `z-50` dialogs and the
   idle-logout warning (grill G-2).

## Consequences

**Negative / accepted**
- With the rail manually expanded at 1024px the EMR SOAP editor is ~288px wide (default rail: ~456px).
  Opt-in, reversible, no worse than before. Recorded as known limitation **R13** in the tasks doc.
- One more hook file (~25 lines) instead of per-file class ternaries.

**Revisit trigger.** If a fourth band is needed, or expanding the rail must stop pushing content, change
`VIEWPORT_BREAKPOINTS` / the push rule here and supersede this ADR rather than adding `lg:` overrides.
