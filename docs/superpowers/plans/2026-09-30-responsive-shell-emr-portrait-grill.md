# Grill log — responsive-shell-emr-portrait (STEP 3.5)

Human-driven, 2026-09-30. Questions asked in plain Thai, one at a time, orchestrator agenda from the
arch brief (`2026-09-30-responsive-shell-emr-portrait-arch.md`), the ponytail pre-check and the BA
sign-off. BA sign-off gaps G-1..G-10 (authz, sign-out, idle overlay, EMR attachments) were already
closed by E1-E12 and are not re-asked; the ids below are this grill's own.

| # | Topic | Recommendation | Human answer | Status |
|---|---|---|---|---|
| G-1 | At 1024px the user manually expands the rail: does the sidebar **push** content or **overlay** it? (`@AC-RESP-3-3` says push; overlay would free the SOAP editor from ~288px back to ~456px.) Second look at R13 requested by the human. | Keep push. Expansion is opt-in and reversible, the default rail already gives ~456px, overlay adds a 4th sidebar behaviour and ponytail treats it as drift. | **Keep push; `@AC-RESP-3-3` unchanged; ~288px stays known limitation R13** | ✅ resolved → ADR-0033 |
| G-2 | Sidebar `z-50` ties with `Dialog` (`z-50`), so in drawer mode the idle-logout warning could be hidden behind the drawer (`@AC-RESP-5-8`). | Sidebar `z-[45]` in every mode (top bar z-40 < sidebar 45 < dialog/idle 50). | **Accepted** | ✅ resolved → ADR-0033 |
| G-3 | Record the breakpoint bands + "mode switches read `useViewportMode`, never `lg:`/`xl:`" as an ADR? | Yes — hard to reverse, surprising without context, real trade-off. Number **0033**, because 0032 is reserved for backlog `ADR-DUP-1`. | **Write it** | ✅ resolved → ADR-0033 + CONTEXT.md |
| G-4 | `useShellSidebar` returns an `inset` key (layouts look it up in `SIDEBAR_INSET_CLASS`) or ready-made `offset: { main, top }` classes? | `offset` — removes one exported type and one constant, no lookup for a layout to forget, offsets still live in one file. | **`offset` (option B)** | ✅ resolved → arch doc updated |

## Gate verdict — ✅ STEP 3.5 PASSED (2026-09-30)

All 4 findings resolved; **0 unresolved**. `/write-plan` (STEP 4) is unblocked once `@arch-agent` has
folded G-1..G-4 into the arch doc.

### Docs recorded (via `domain-modeling`)
- [ADR-0033](../../adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md) — viewport-mode bands, hook is the single source, rail push, z-order (G-1..G-3)
- `CONTEXT.md` § "Responsive shell" — Viewport mode · Rail · Drawer

### Binding changes to the STEP 4 plan
1. `useShellSidebar` returns `offset: { main, top }`; no `SIDEBAR_INSET_CLASS` export (G-4).
2. Sidebar layer `z-[45]` in all four layouts (G-2).
3. Manifest gaps for `@pm-agent`: `components/TopNav.tsx` in Dev A's exclusive scope (`TopNav({ shell })`);
   `store/uiStore.ts` unchanged and unowned; waves W0 = RESP-1 hook, then W1 = Dev A ∥ UIUX A ∥ Dev B.
4. Ponytail Step 5 will check: `SidebarMenuButton` stays in `ResponsiveSidebar.tsx`; allowlist tests inline;
   no `lg:`/`xl:` mode switches; no overlay expansion in the rail band; each layout keeps its own nav list/filter.

### Backlog to file at STEP 8 (`@scribe-agent`)
- `RESP-BL-1`, `RESP-BL-2` (Pets / Appointments fixed panels), `RESP-BL-4` (hand mode), `RESP-BL-5`, `RESP-BL-6`.
- ADR-0033 is the next free number *after* the reserved 0032 (`ADR-DUP-1`).
