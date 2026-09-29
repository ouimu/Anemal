# HANDOFF: responsive-shell-emr-portrait

**Lane:** A. Escalated from Lane B on 2026-09-28 because the fix spans more than 3 files and needs design work (bugfix.md §5). The human chose "Lane A: do it properly".
**Branch:** `feature/responsive-shell-emr-portrait` (from `main` @ `03efdf1`)
**Current step:** STEP 3 BA verdict READY-WITH-FIXES (2026-09-29): `@pm-agent` applies edits E1-E12 (sign-off §7); human answers Q1 (drop right-hand mode -> backlog RESP-BL-4?) and Q2 (accept ~288px SOAP if user manually expands sidebar at 1024?). Then 3.4 arch (brief pass vs constraints A-1..A-7 in sign-off), 3.4b ponytail arch-precheck, 3.5 grill.
**Human answers to BA questions (2026-09-29):** Q1 = DROP right-hand mode -> backlog RESP-BL-4; E1 is now to be applied (remove `@AC-RESP-2-10` and the right-hand part of `@AC-RESP-8-3`). Q2 = ACCEPT ~288px SOAP editor when the user manually expands the sidebar at 1024px (opt-in, reversible, no worse than today; default rail gives ~456px). Record it as a known limitation and note it in the Step 3.5 grill for a second look.
So `@pm-agent` now applies **E1-E12** (all of them).
**Agent registry note (2026-09-29):** in the session that ran Steps 1-3, only `arch-agent` and `ba-agent` were callable via `subagent_type`; `pm-agent`, `dev-agent`, `db-agent`, `qa-agent`, `uiux-agent`, `ponytail-agent`, `scribe-agent` returned "not found" although all `.claude/agents/*.md` frontmatter parses as valid YAML. Start the next session fresh and test `pm-agent` first. Literal next command: `Agent(subagent_type: "pm-agent")` applying E1-E12 from the BA sign-off §7 to the tasks doc (Q1 answered: drop right-hand mode).
BA sign-off doc: `docs/superpowers/plans/2026-09-29-responsive-shell-emr-portrait-ba-signoff.md`.

## Origin
Backlog item from i18n-completion QA (2026-09-25; listed in `.claude/roadmap/phase-history.md` I18N-BL): EMR is unusable at 768×1024 portrait.

## Root cause (confirmed 2026-09-28)
1. `src/frontend/src/layouts/ClinicLayout.tsx` sizes the sidebar only from the persisted `uiStore.sidebarOpen` (`w-56`/`w-14`, `ml-56`/`ml-14`) and ignores the viewport. `anemal-design-system/references/sidebar-spec.md` §6 requires this behaviour, which was never implemented:
   - ≥1280: expanded
   - 1024: collapsed by default
   - 768 and below: hidden, with a hamburger in the top bar opening an overlay drawer and no horizontal scroll

   AdminLayout, SettingsLayout and PlatformLayout probably share the gap; to be confirmed.
2. The EMR spec (`anemal-screen-specs/references/05-emr.md`) defines only a 3-fixed-column layout for 1024 landscape (`w-56` list + flex editor + `w-72` panel). There is no portrait rule. The design quick-ref says "Responsive: stack on narrow screens".

The result at 768: 768 − 224 (sidebar) − 224 (list) − 288 (panel) ≈ 30px left for the SOAP editor.

## Docs produced
- `docs/superpowers/plans/2026-09-28-responsive-shell-emr-portrait-brainstorm.md` — @pm-agent Step 1
  brainstorm. Gap inventory confirms all 4 layouts (`ClinicLayout`, `AdminLayout`, `PlatformLayout`,
  `SettingsLayout`) lack sidebar-spec §6 compliance (`SettingsLayout` has a partial, mount-only
  workaround at line 37-39, not the spec); EMR 3-column layout confirmed unusable at 768 (~32px
  editor); same fixed-panel defect shape also found in `ClinicPets.tsx:879` (`w-72`) and
  `ClinicAppointments.tsx:124` (`w-80`), recommended as backlog (`RESP-BL-1`/`RESP-BL-2`), not in-scope.
  Recommends **Option C**: shared sidebar component applied to `ClinicLayout`+`AdminLayout` (Must) and
  `SettingsLayout`+`PlatformLayout` (Should) + EMR portrait layout (tabs recommended, non-binding).
  Arch call: likely `skipped (below threshold)`, flagged one condition where a brief arch pass could be
  warranted (see doc §6). 7 open questions listed for the human/@ba-agent.

## Step 1 gate — APPROVED by human 2026-09-29
Decisions on brainstorm §5 open questions:
1. Manual collapse preference does NOT survive a breakpoint change — the width-appropriate default wins (choice ข).
2. The 768px drawer auto-closes on navigation (ก).
3. A `resize` listener is required — layout adapts live on rotation (ก).
4. `AdminLayout`, `SettingsLayout`, `PlatformLayout` ship in this branch with `ClinicLayout` (ก) — all 4 layouts.
5. EMR portrait design = **Tabs** (A). @uiux-agent/grill may still refine.
6. Pets (`w-72`) and Appointments (`w-80`) → backlog `RESP-BL-1` / `RESP-BL-2`, out of scope (ก).
7. Minimum SOAP-editor width at 768px = 320px (ok).

## Step 2 — done 2026-09-29
Output: `docs/superpowers/plans/2026-09-29-responsive-shell-emr-portrait-tasks.md` (8 tasks RESP-1..8, ~75 Gherkin Scenarios).
Process note: run via a general-purpose agent following `pm-agent.md`, not the real `pm-agent` type (orchestrator error, human accepted the result; use the real type next time).
Human answers 2026-09-29: N1 breakpoints OK (<1024 drawer, 1024-1279 rail, >=1280 expanded; EMR tabs at 1024). N2 = run a brief arch pass (Step 3.4), freeze hook return shape + sidebar props, do not skip. N4 @tenant/@validation exempt (frontend-only) — provided no bug results; keep role/tenant regression guards. N3 goes to @ba-agent.

## Next action
STEP 2: invoke `@pm-agent` — tasks + Gherkin AC (`.claude/standards/acceptance-criteria.md`) from the
brainstorm doc + the decisions above. Output: `docs/superpowers/plans/2026-09-29-responsive-shell-emr-portrait-tasks.md`.
Then STEP 3 (`@ba-agent`: validate + authz design, ⛔ BA sign-off).
