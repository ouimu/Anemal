# Step 4b Reference Pre-check: Responsive Shell + EMR Portrait

2026-09-30 · Lane A · Author: @scribe-agent · Branch verified: `feature/responsive-shell-emr-portrait` (conforms to `feature/` convention)
Inputs: `2026-09-30-responsive-shell-emr-portrait.md` (plan), `2026-09-30-responsive-shell-emr-portrait-arch.md` (arch), plus the docs they cite.
Read-only pass: no doc edited, nothing committed.

## Verdict: PASS (0 blocking defects, 4 non-blocking notes)

## Checklist

| # | Check | Result |
|---|-------|--------|
| 1 | Every path cited by plan and arch exists, or is marked NEW with an existing parent dir | PASS. All EXISTS paths resolve. The 10 hook/component/test paths plus the uiux note flagged MISS by the scan are exactly the plan's NEW set (section 7); every parent dir exists (`hooks/`, `components/`, `__tests__/`, `layouts/__tests__/`, `docs/superpowers/plans/`). None of the NEW files exists yet (no collision). |
| 2 | `src/frontend/src/test/setup.ts` | PASS. Exists and is named in `src/frontend/vite.config.ts` (`setupFiles`, environment `jsdom`). The plan's "Dev A to confirm" is already satisfied. |
| 3 | Scripts and commands | PASS. `package.json` has `test` = `vitest run`, `lint` = `eslint src --ext .ts,.tsx`, `build` = `tsc && vite build`. `npx tsc --noEmit` and `npx vitest run <path>` are valid. |
| 4 | ADR-0033 | PASS. `docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md` exists (untracked, part of this branch). Its one path reference is to the NEW `hooks/useViewportMode.ts`. |
| 5 | ADR-0027 citation (arch header, decision 2 plane-neutrality) | PASS with note N1. The intended file is `0027-shared-modal-dismissal-policy-and-plane-neutrality.md`; decision 2 "plane-neutral" exists there. |
| 6 | `src/frontend/src/i18n/index.ts` | PASS. Exists, 1147 lines (matches the plan). |
| 7 | `@AC-RESP-*` coverage | PASS. Tasks doc holds 1-1..1-4, 2-1..2-14 (2-10 removed), 3-1..3-3, 4-1..4-4, 5-1..5-8, 6-1..6-13, 7-1..7-7, 8-1..8-4. Every tag maps to a task in plan section 8. `@AC-RESP-2-10` is removed by the sign-off (tasks doc R5) and intentionally absent. |
| 8 | RESP task ids and backlog ids | PASS. Tasks doc defines RESP-1..8; the plan adds RESP-1i, RESP-2t and RESP-6a, all declared with owners and rationale. RESP-BL-1..6 all exist in the tasks doc. |
| 9 | Grounding claims checked against source | PASS. `SettingsLayout.tsx` LAYOUT-04 effect is at lines 36-38; the Settings role filter is at line 41; `TopNav.tsx` has `lg:w-80`, imports `uiStore`, and its class is built from `leftOffset`; `ClinicLayout.test.tsx` mocks `uiStore` at line 31; `ClinicEMR.tsx` has three `<Can perm="emr.attach">`; `Dialog.tsx` is `z-50`; `IdleLogoutModal` imports `Dialog` and both call sites exist (`RequireAuth.tsx`, `PlatformLayout.tsx`); `PlatformLayout` header is `z-40`; `Dialog.test.tsx` uses the `?raw` census precedent; the 6 `ClinicEMR.*.test.tsx` files exist; `crossTenantRelation.*.test.ts` (11 files) and `rbac-regression.test.ts` exist. |
| 10 | W1 file scopes do not overlap | PASS. Dev A (RESP-2, 2t, 3, 4, 5): hooks (2 + 2 tests), `ResponsiveSidebar.tsx` + test, `TopNav.tsx` + test, 4 layouts + 4 layout tests. Dev B (RESP-6, 7): `ClinicEMR.tsx` + `ClinicEMR.portrait.test.tsx`. UIUX A (RESP-6a): the uiux note only. The only repeated file is RESP-6/RESP-7 (`ClinicEMR.tsx`), same owner, sequenced. `i18n/index.ts` is W0 only (Dev A) and `uiStore.ts`, `App.tsx` and `navAccess.ts` are unowned and read-only. |
| 11 | New `.md` has an owner | PASS. The uiux note is owned by UIUX A. `docs/superpowers/plans/**` is already a `doc-map.md` row (`@pm-agent`), so no new row is needed. |
| 12 | Duplicated canonical table or rule | PASS. The plan points to the arch contract by reference (its section 1) and restates no signatures. |

## Non-blocking notes (for @pm-agent / orchestrator; no action needed before Step 5)

- **N1 (ADR-0027 ambiguity).** Two Accepted ADRs are numbered 0027, and the arch and plan cite "ADR-0027" by number only. The intended one is the modal / plane-neutrality file. Consider citing the full filename once. Separately, `ADR-DUP-1` in `.claude/roadmap/phase-history.md` says to renumber the modal ADR to 0029, but 0029, 0030 and 0031 are now taken by other ADRs. The reserved 0032 (used by the arch, grill and plan) is the free slot, or the next free number at fix time. Step 8 should update the `ADR-DUP-1` row, not this branch.
- **N2 (W0 scope).** The arch section 12 and grill binding #3 define W0 as RESP-1 only. The plan adds RESP-1i (`i18n/index.ts`), disclosed in plan sections 2.1 and 6 (delta a). Ponytail Step 5 should judge it. This is a declared delta, not a dangling reference.
- **N3 (backlog list).** The grill's backlog list omits `RESP-BL-3` (sidebar width drift). The plan section 9 includes it. The plan is the superset and correct, so Step 8 should file BL-1..6.
- **N4 (unresolved marker).** Plan section 7 says `SRC/test/setup.ts` needs "Dev A to confirm on first run". It is confirmed above; the line can be resolved when the plan is next touched.

## Scan details

Bare filename citations (`ClinicLayout.test.tsx`, `TopNav.tsx`, `uiStore.ts`, and so on) each resolve to exactly one tracked or untracked file, excluding archive and worktree copies. Patterns and placeholders (`ClinicEMR.*.test.tsx`, brace lists, `...-uiux.md`) were expanded by hand against the section 7 table. Slash commands, route strings and vi.mock specifiers are not file references.

Step 4b: PASS. Step 5 (`@ponytail-agent` mode `gate`) is unblocked as far as reference integrity goes.
