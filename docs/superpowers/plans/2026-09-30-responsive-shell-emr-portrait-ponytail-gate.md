# Ponytail gate: Responsive Shell + EMR Portrait

2026-09-30 · Step 5 · Mode `gate` (re-gate #3) · Reviewer: @ponytail-agent · Branch verified: `feature/responsive-shell-emr-portrait`
Subject: `2026-09-30-responsive-shell-emr-portrait-arch.md` (frozen contract, section 4) together with
`2026-09-30-responsive-shell-emr-portrait.md` (plan, as edited by @pm-agent for R-3, A-6, A-7).
Re-read: the whole plan against arch §3, §4a-4d, §7, §12. Spot-checked in source: `components/Dialog.tsx`
(Escape handling, blocking policy) and ADR-0033 (prefix wording).

**History:**
- 1st gate, 2026-09-30: REJECT (drift D-1: the RESP-1i close/backdrop key had no channel in the frozen props). Fixed by R-1 and R-2.
- 2nd gate, 2026-09-30: REJECT (drift D-2: the RESP-8 "gate A-5" test required Escape to close only the blocking `Dialog` and keep the drawer open, which the contract cannot deliver). Fixed by R-3.

## Verdict: APPROVE

All 9 criteria pass, and the plan does not drift from the frozen contract. The arch doc is unchanged.

## R-3 / A-6 / A-7 resolution

| Item | Result | Evidence |
|---|---|---|
| R-3 (D-2): RESP-8 Escape test | **resolved** | Plan line 199 now asserts only what the contract freezes: with the drawer open and the blocking idle warning raised, one Escape press leaves the warning open and "stay signed in" usable. It cites ADR-0027 decision 1, which matches `Dialog.tsx`, where a topmost `blocking` dialog swallows Escape. It explicitly does **not** assert the drawer's state, and it states that `Dialog.tsx` and the `ResponsiveSidebar` contract are unchanged. The test extends `@AC-RESP-5-8`, so it adds no new AC. No unowned file has to change for it to pass. |
| A-6: RESP-2 dependency on RESP-1i | adopted | RESP-2 now depends on RESP-1 only, which is correct because `ResponsiveSidebar` and `useShellSidebar` read no i18n key. |
| A-7: §1 prefix-rule citation | adopted | §1 now says that arch §4a names only `lg:`/`xl:` and that the plan widens the ban to `sm:`..`2xl:`. The widening is stricter than the contract and follows ADR-0033's rationale (a CSS breakpoint must not be a second source of truth for a mode threshold). It narrows what workers may build, so it is not drift. |

## New drift or scope check

No new drift and no scope creep:
- The manifest, owners, waves and file count are unchanged from the 2nd gate: 11 new files (3 production), 7 edited production files, and 0 dependencies.
- The RESP-8 paragraph adds no source change and no new AC. "Or a QA-owned test file" can add at most 1 file at Step 7, which keeps the total under 15.
- No name, prop, class string or rule differs from arch §4a-4d. The two plan-introduced deltas (RESP-1i adding `i18n/index.ts` in W0, and UIUX A's `-uiux.md`) are declared in §6 and were accepted at the 2nd gate.

## 9-point check

| # | Criterion | Verdict | Why |
|---|---|---|---|
| 1 | Over-engineering? | no | 2 hooks and 1 component replace 4 inline sidebars and 6 offset ternaries. There is no extra layer, util, barrel or config. |
| 2 | Duplicate work? | no | 4 new i18n keys, none of which duplicates an existing key. Each layout keeps its own `NAV` and filter. `common.close` is not re-added. |
| 3 | Existing solution? | no | No library is needed. `Dialog` cannot host the drawer because of the z-order decision (G-2). |
| 4 | Scope too large? | no | 1 subsystem (frontend shell and EMR view). 10 production files: 3 new and 7 edited. |
| 5 | Too many deps? | no | 0 new dependencies. |
| 6 | Too many files? | no | 11 new files, or 12 at most if QA adds its own test file. |
| 7 | Too many APIs? | no | 2 hooks. 0 endpoints and 0 mutations. |
| 8 | Abstraction without 2nd impl? | no | No interface, port or base class. `ShellSidebar` is a return type, not a seam with implementers. |
| 9 | Pattern without named problem? | no | No whitelist pattern is declared (arch §5). The single rule names its problem in ADR-0033. |
| drift | Plan vs frozen contract | no | D-1 and D-2 are closed, and no new drift was found. |

## Approval

```
@pm-agent — Ponytail gate ✅ APPROVE — all 9 pass, no arch/plan drift. Proceed to execute-plan.
```

## Advisories (non-blocking, no resubmission)

- **A-8 (for @qa-agent at Step 7).** `Dialog.tsx` has no focus trap. The drawer's frozen Escape behaviour (close, then return focus to the hamburger, AC-RESP-2-12) can therefore move focus behind the idle warning. In the RESP-8 test, read "still usable" as "rendered and clickable". Do not read it as "holds keyboard focus", because focus is not something the contract freezes. If focus containment is wanted, it needs an AC and a `Dialog` change first.
- **A-9 (wording only).** RESP-1i step 4 still names "Dev A (RESP-2/2t)" as a consumer of the key names. Only RESP-2t (the hamburger label) consumes a key. This is harmless, and no edit is required.

LEDGER | mode=gate | verdict=APPROVE | criterion=— | R-3 resolved, no drift, all nine pass
