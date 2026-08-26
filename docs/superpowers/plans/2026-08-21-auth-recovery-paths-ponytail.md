# Auth Recovery Paths — Ponytail Gate (Step 5)

**Reviewer:** @ponytail-agent
**Plan under review:** `docs/superpowers/plans/2026-08-21-auth-recovery-paths.md`
**Round 1:** 2026-08-25 — REJECT (Criterion 1), plan at `6adb5f8`
**Round 2:** 2026-08-25 — **APPROVE**, plan at `57d44fa`

---

# FINAL VERDICT: **APPROVE** — all 7 criteria pass

```
@pm-agent — Ponytail gate — APPROVE. All 7 pass. Proceed to execute-plan.
```

All six required edits from Round 1 landed, verified against the file at `57d44fa`, plus the
non-blocking AUTH-401-03 recommendation adopted. Direct count of the revised file confirms
**25 tasks** (`1.1–1.2, 2.1–2.3, 3.1–3.2, 4.1–4.10, 5.1–5.5, 6.1–6.2, 7.1`) — the coordinator's
corrected figure, not my verbal "29", is the right one. **18 AC. 9 production files, 0 new.
0 new component API surface. ~100 LOC production.**

---

## 1. Round 2 — seven-point check on `57d44fa`

| # | Criterion | Verdict | Why |
|---|---|---|---|
| 1 | Over-engineering? | **NO** | The whole cluster is gone: absolute `/403` deleted outright (not made recoverable), `standalone` prop gone, `TREE_403` map replaced by a 2-line derivation, Tasks 3.3/3.4/3.5 and Group 7.3 removed, plane ternary + forged-state test dropped. §2 confirms the derivation is not merely smaller but **structurally more correct** than what it replaced. |
| 2 | Duplicate work? | **NO** | Removing `TREE_403` also removed the second source of truth for route paths I flagged in Round 1. `ForbiddenView` now has exactly one render mode, nested three times. Nothing reimplements an existing function. |
| 3 | Existing solution? | **NO** | react-router genuinely does not cover this — and the case against it is now *stronger* than the plan states: there are **two** two-segment-deep guarded routes, not one (§2, Finding A). |
| 4 | Scope too large? | **NO** | 9 production files, 0 new, ~100 LOC (down from ~150), 3 subsystems, zero backend, zero DB. Groups 4/6/7/8 unchanged except the mandated deletions — nothing grew elsewhere to absorb the cuts. |
| 5 | Too many deps? | **NO** | Zero. |
| 6 | Too many files? | **NO** | 3 new files, all tests, each a C-11 falsifiability carrier. |
| 7 | Too many APIs? | **NO** | 0 endpoints, 0 hooks, 0 mutations, and now **0 new component API surface** (was 1). Only an existing store method's return type changes. |

**ALL NO → APPROVE.**

---

## 2. Criterion 1 — genuinely clear, not merely smaller

The coordinator asked specifically whether the one-segment derivation has a hidden failure mode.
I enumerated all 27 `RequirePermission` routes in `App.tsx` and checked four classes. Two findings
are worth carrying into implementation; neither blocks.

### Verified clear

| Failure class | Result |
|---|---|
| **Ambiguous first segment** | **None — and this is the strongest argument for the derivation.** See Finding B. |
| **Denied route outside the three trees** | None. All 27 guarded routes sit under `/clinic-admin` (8), `/clinic` (11), `/settings` (8). `/preferences` carries `RequireAuth` + `RequirePlane` only; `/platform/*` carries no `RequirePermission`; `/login`, the legacy `/admin/*` redirects, `/dashboard`, `/` and `*` carry none. `tree` is therefore always one of exactly three values. |
| **Router basename** | None. `main.tsx:12` mounts a bare `<BrowserRouter>` with no `basename`. Even if one were added later, react-router strips basename from `useLocation().pathname` and re-prepends it on `<Navigate to>`, so both sides of the derivation stay consistent by construction. |
| **Trailing slash / index route / `<Outlet/>` form** | None. `/clinic/` and `/clinic` both yield `clinic`. Index routes are `<Navigate>` elements, not `RequirePermission`, so the degenerate cases are unreachable anyway. All 27 call sites pass children, and the derivation reads the URL rather than the route, so it is insensitive to which form is used. |

### Finding A (carry into implementation, non-blocking) — there are **two** two-segment-deep guarded routes, not one

Both the original and revised plan name only `App.tsx:163` `storage/connecting`. There is a second:

```
App.tsx:148   <Route path="vaccinations-due/record"  perm="vaccination.create"    (under /clinic)
App.tsx:163   <Route path="storage/connecting"       perm="clinic.integrations.edit"  (under /settings)
```

This **strengthens** the ruling rather than threatening it — relative `<Navigate>` would have broken
at two routes in two different trees, and the derivation handles both identically
(`/clinic/vaccinations-due/record` → `clinic` → `/clinic/403`). Two consequences for @dev-agent:

- **Task 2.3's code comment must cite both routes**, not just `storage/connecting`, so a future
  engineer does not read the derivation as a workaround for one odd route and "simplify" it back.
- Task 2.1's spike may stay scoped to `storage/connecting` — the second route is the same shape and
  the spike's job is to disprove relative navigation once, not exhaustively.

### Finding B — the derivation is immune to a collision the rejected map had to handle

`/clinic-admin/users` **startsWith** `/clinic` (verified). A prefix-matched `TREE_403` map therefore
*required* longest-prefix-match logic purely to stop `/clinic-admin/*` denials being routed to
`/clinic/403` — a wrong-tree redirect that would have hit `ClinicLayout:31`, bounced the admin back
to `/clinic-admin/dashboard`, and re-denied. `pathname.split('/')[1]` returns the whole segment
(`'clinic-admin'`, never `'clinic'`), so the collision cannot occur.

**This is the answer to "genuinely clear vs merely smaller": the mechanism I required is not a
trimmed-down map, it is the mechanism that removes a correctness hazard the map only papered over
with extra logic.** Criterion 1 is clear on the merits, not on line count.

---

## 3. Non-blocking flags for @qa-agent (Step 7) — do not hold up execution

1. **The derivation risks being tested mock-against-mock.** Group 8 updates `guards/guards.test.tsx`
   to mock `useLocation` alongside the `Navigate` mock that file already uses. With both ends
   mocked, that case asserts the *expression* rather than the mechanism — thin under C-11/G5. Real
   coverage must come from `App.routing.test.tsx` through a live `MemoryRouter`. **Concretely: none
   of Task 3.1's five cases is currently a two-segment-deep denial** — case 1 uses `/clinic/billing`
   (one segment). Point one case at `/settings/storage/connecting` or
   `/clinic/vaccinations-due/record`, because that is the only scenario that distinguishes the
   derivation from the relative `<Navigate>` it replaced. Without it, the specific bug this
   mechanism exists to prevent has no falsifiable guard. Test-design call, @qa-agent's lane — not a
   simplicity objection.
2. **`/settings/403` renders inside a shell whose nav is still role-string filtered**
   (`SettingsLayout.tsx:41`, deferred to **B-2** by BA, grill, and ADR-0026). AUTH-403-05's one-line
   statement is therefore broader than what this branch tests. **Do not widen scope — B-2 stands.**
   Flagged so the AUTH-403-05 assertion is scoped to `ClinicLayout`/`AdminLayout` deliberately
   rather than discovered mid-review.

---

## 4. Confirmed applied from Round 1

| # | Required edit | Status in `57d44fa` |
|---|---|---|
| 1 | Task 2.2 → segment derivation, map deleted | Applied. Old text struck through, 2-line derivation in place, rationale recorded. |
| 2 | Task 3.2 → delete absolute `/403`, do not re-add | Applied, with the 3-hop catch-all chain written into the task. |
| 3 | Task 3.4 (`standalone` prop) deleted | Applied. `ForbiddenView` API unchanged from today. |
| 4 | Task 3.5 deleted | Applied — and replaced by something better: Task 3.1 case 5 now *proves* the catch-all chain end-to-end rather than assuming it. |
| 5 | Task 3.3 folded into 3.1 | Applied. |
| 6 | Group 7 item 3 deleted | Applied. |
| — | *Non-blocking:* drop AUTH-401-03 / F-7 ternary + forged-state test | **Adopted** by coordinator over BA's ruling; recorded under B-3. AC 19 → 18. |

Task 3.1 case 5 deserves note: I argued the catch-all chain from source reading, and the plan turned
that argument into an executable assertion. That is the right response to a gate finding — verify the
reviewer's reasoning, do not just delete on their say-so.

---

## 5. Round 1 record (2026-08-25, plan at `6adb5f8`) — superseded, retained as audit trail

**Verdict was REJECT on Criterion 1.** Criteria 2–7 all passed and were explicitly approved so they
would not be re-opened; they were re-verified unchanged in Round 2.

**Finding A — the absolute `/403` fallback was a fourth copy of a page guarding a case the router
already handles.** `ForbiddenView` would have rendered from four places: three tree children plus a
`standalone` variant with hand-rolled logout and `/preferences` links, its own test, and its own
uiux review item. Verified in `App.tsx`: the catch-all `<Route path="*">` → `/login` plus
`LoginView.tsx:42-47`'s authenticated bounce already resolve a stale `/403` hit to the **in-shell**
403 — real sidebar, real footer logout, real `TopNav`/preferences — in 3 hops, strictly more
recoverable than a shell-less page, at the cost of a deletion. It also closed BA's Trap 1 (an
unauthenticated visitor could render `/403` and see stale shell data).

**Finding B — `TREE_403` was a lookup table encoding a one-line function**, whose keys and values
were mechanically derivable from each other, plus a no-match branch for an unreachable case, plus a
drift hazard against `App.tsx`'s route table. Round 2's Finding B above adds the collision argument
that was not yet visible in Round 1.

**Also flagged non-blocking in Round 1 and since adopted:** AUTH-401-03 / F-7 paired a production
ternary guarding an unreachable branch (F-6: `authStore.ts:74` only ever *reads* `raw.plane ??
'clinic'`; `platformApi.ts:30-44` already handles real platform 401s correctly) with a test that had
to *forge* `plane: 'platform'` onto the clinic store to reach it — the same reasoning that withdrew
AUTH-403-04, applied inconsistently.

**Also recorded in Round 1, still standing:** having `RequirePermission` render `<ForbiddenView/>`
in place instead of navigating at all was considered and not pursued — it would satisfy
AUTH-403-06's "render, never redirects" invariant perfectly and need no tree knowledge whatsoever,
but C-1 locks the child-route shape across three gates. Recorded to show it was weighed; **not** a
rejection ground and not for re-litigation.

---

*@ponytail-agent — Step 5 complete. Verdict: **APPROVE**. `/execute-plan` (Step 6) is unblocked.
Two non-blocking flags in §3 are for @qa-agent at Step 7, not preconditions for execution.*
