# Auth Recovery Paths — Ponytail Gate (Step 5)

**Reviewer:** @ponytail-agent
**Date:** 2026-08-25
**Plan under review:** `docs/superpowers/plans/2026-08-21-auth-recovery-paths.md` (@pm-agent, Step 4)
**Context read:** BA sign-off (C-1…C-11), grill record (G1…G5), ADR-0026
**Source verified independently:** `App.tsx`, `guards/RequirePermission.tsx`, `layouts/ClinicLayout.tsx`,
`layouts/AdminLayout.tsx`, `store/authStore.ts`, `components/roles/RoleList.tsx`, `utils/api.ts`,
`utils/platformApi.ts`, `views/LoginView.tsx`, frontend test-file inventory.

---

# VERDICT: **REJECT** — Criterion 1 (over-engineering)

One cluster, two required cuts. Everything else in the plan is proportionate and is explicitly
approved below so it is not re-opened on resubmit.

---

## 1. Seven-point check

| # | Criterion | Verdict | Why |
|---|---|---|---|
| 1 | Over-engineering? | **YES** | The absolute `/403` fallback (`standalone` prop, Tasks 3.4/3.5) and the `TREE_403` map (Task 2.2) both exist to answer "which tree, and what if none?" — a question the existing catch-all already answers, and which the first path segment answers in one line. See §2. |
| 2 | Duplicate work? | NO | Nothing reimplements an existing function. `AdminLayout`'s filter mirrors `ClinicLayout:76`'s one-line expression — mirroring one line across two call sites is correct; extracting a shared helper would be the over-engineered option. (`TREE_403` does duplicate route knowledge already in `App.tsx`; counted under #1, same fix.) |
| 3 | Existing solution? | NO | react-router's relative navigation was checked, not assumed. I verified the plan's §1 finding 5 independently: `resolvePath('403', '/settings/storage/connecting')` pops the last segment → `/settings/storage/403`, and `relative="route"` appends → `/settings/storage/connecting/403`. Neither form works for the two-segment route at `App.tsx:163`. The framework genuinely does not cover this. No toast library needed (existing inline `ToastState`), no new i18n mechanism (existing `useT`). |
| 4 | Scope too large? | NO | 9 production files edited, **0 new production files**, under 150 LOC production diff, 3 subsystems (routing/guards, auth store + api client, roles UI), zero backend, zero DB. Under every threshold. C-9's `api.ts` inclusion is **not** creep — see §3. |
| 5 | Too many deps? | NO | Zero new dependencies, transitive or direct. |
| 6 | Too many files? | NO | 3 new files, all tests, none trivial — each carries falsifiability for a named AC under C-11. |
| 7 | Too many APIs? | NO | 0 new endpoints, 0 new hooks, 0 new mutations. One *changed* return type on an existing store method. The single piece of new component API surface is the `standalone` prop — which §2 removes, taking new API surface to exactly zero. |

**ANY YES → REJECT.**

---

## 2. The rejection — Criterion 1

```
@pm-agent — Ponytail gate

Criterion 1: Over-engineering — REJECT
```

### Finding A — the absolute `/403` fallback is a fourth copy of a page guarding a case the router already handles

`ForbiddenView` would end up rendered from four places: three tree children plus a `standalone`
variant with hand-rolled logout and `/preferences` links (Task 3.4), its own test case (Task 3.5),
and its own @uiux-agent review item (Group 7.3).

Verified in `App.tsx`: the catch-all `<Route path="*" element={<Navigate to="/login" replace/>}/>`
exists, and `LoginView.tsx:42-47` bounces an authenticated user to `/clinic-admin/dashboard` or
`/clinic/dashboard`. So if `<Route path="/403">` is simply **deleted**:

- **Stale bookmark to `/403`, authenticated:** `*` → `/login` → bounce → dashboard →
  `RequirePermission` denies → `/clinic/403` **in-shell, with the real sidebar, the real footer
  logout, and `/preferences` via the real `TopNav`.** That is strictly *more* recoverable than the
  standalone variant, which has no shell at all. It is also exactly the E3 chain the BA already
  traced as terminating, and exactly what AUTH-403-03 already asserts (3 navigations or fewer).
  No new AC, no new test.
- **Stale bookmark to `/403`, unauthenticated:** `*` → `/login` → login form. This also closes the
  small leak the BA noted at Trap 1 (today's shell-less `/403` renders for an unauthenticated user).

BA's stated justification was "stale bookmarks and any future `RequirePermission` mount that resolves
unexpectedly." The first is covered above. The second is speculative future-proofing — and it too
lands on the same recoverable chain (see Finding B). BA itself flagged this as "trimmable by
Ponytail"; the plan itself says "if trimmed, this task and its one test case are the only things to
drop."

**Ruling: it is not earning its place. Trim it.**

### Finding B — `TREE_403` is a lookup table encoding a one-line function, plus a fallback branch for an unreachable case

The proposed map's keys and values are mechanically derivable from each other (`k` becomes
`k + '/403'`), and it needs longest-prefix-match logic plus a no-match branch. Verified against
`App.tsx`: only three trees contain any `RequirePermission` (`/preferences` has none, `/platform/*`
has none), and the **first path segment uniquely identifies all three** — including the two-segment
case `/settings/storage/connecting`, whose segment `[1]` is `settings`.

The map also introduces a drift hazard the derivation cannot have: a tree added to `App.tsx` but
forgotten in `TREE_403` silently misroutes, and the map is a second source of truth for route paths
that already live in `App.tsx`.

**Ruling: a map is not the minimum mechanism.**

### Suggested fix — precise

1. **Task 2.2** — replace the map, the longest-prefix match, and the no-match fallback with segment
   derivation in `guards/RequirePermission.tsx` (add `useLocation` to the existing
   `react-router-dom` import):

   ```
   const { pathname } = useLocation()
   // Relative <Navigate> cannot be used: react-router resolves it against the URL, so the
   // two-segment route /settings/storage/connecting (App.tsx:163) yields /settings/storage/403.
   // The first path segment identifies the tree at any nesting depth.
   const tree = pathname.split('/')[1]
   ...
   if (!allowed) return <Navigate to={`/${tree}/403`} replace />
   ```

   Keep Task 2.1's spike and Task 2.3's explanatory comment — the spike is cheap C-4 compliance with
   real option value (if relative navigation *had* worked, `RequirePermission` would need no tree
   knowledge at all), and the comment is what stops a future engineer "simplifying" this back.
2. **Task 3.2** — **delete** `<Route path="/403" element={<ForbiddenView/>}/>` outright. Do not
   re-add it. Net route change becomes +2, not +3.
3. **Task 3.4 — DELETE.** No `standalone` prop on `ForbiddenView`. `ForbiddenView` stays exactly as
   it is today (body-only content), which is what makes nesting it three times safe under C-3.
4. **Task 3.5 — DELETE.** Its scenario is already covered by AUTH-403-03's chain-length assertion.
5. **Group 7 item 3 — DELETE.** There is no `standalone` variant left to review.
6. **Task 3.3 — FOLD into 3.1.** The plan states it verbatim as "verification-only… no further
   `App.tsx` change needed here" — running the tests you just wrote is not a task.

**Net effect:** 33 tasks becomes 29. New component API surface: 1 prop becomes 0.
`RequirePermission` delta: ~10 LOC becomes 2 LOC. One fewer route. Zero AC lost, zero locked outcome
weakened.

```
Resubmit when: the plan shows Task 2.2 as segment derivation, Task 3.2 deleting the absolute
/403 route rather than re-adding it, and Tasks 3.3/3.4/3.5 + Group 7.3 removed.
No other change is required, and no other section should be touched.
```

---

## 3. Explicitly approved — do not re-open on resubmit

These were scrutinised and pass. They are not to be trimmed, re-argued, or "simplified" in response
to this rejection.

- **33 tasks with 0 new production files — not padding.** Audited group by group. Group 2 is a
  deliberate spike-then-implement (C-4 mandates verification, not assumption). Group 8 is a re-run
  list, not tasks. Groups 4 and 5 are 16 tasks for three genuinely separate contracts
  (`refreshPermissions` totality, F-2, the 401 reason), five of which are the one-line mock-type
  ripples the BA enumerated in its C-8 table. Only Task 3.3 is a non-task, and it is folded above.
- **Three new test files — justified, keep all three.** `layouts/` currently contains **zero** test
  files (verified), so `ClinicLayout.test.tsx` and `AdminLayout.test.tsx` cannot fold into anything,
  and one-file-per-component matches the existing `__tests__/` convention. `App.routing.test.tsx`
  cannot fold into `guards/guards.test.tsx`: that file **mocks `Navigate`** (which is why its
  assertions read `data-to === '/403'`), and the AUTH-403-01/02/03/06/07 cases require real rendering
  inside a real layout. A mocked-`Navigate` file and a real-routing file cannot coexist. Under C-11
  these are the falsifiability carriers for five AC — folding them would produce exactly the vacuous
  assertions G5 exists to ban.
- **C-9's `api.ts` interceptor — fair, not creep.** Verified `utils/api.ts:31-35`: the interceptor
  hard-codes `/login` and fires on every axios 401, while `refreshPermissions` fires only from
  `RoleList` after a role save. AUTH-BL-1 *is* "unexplained hard 401 redirect". Fixing the rare path
  and leaving the common one unexplained would be the defect, not the discipline. Two one-line
  changes at two existing sites, zero new structure.
- **Group 4's warning toast (Tasks 4.4–4.6).** Extends the existing inline `ToastState` union rather
  than adding a toast library or a new component. The persistence and reload control are locked by
  BA A2 and ADR-0026 decision 6; the conditional-timeout approach is the cheapest way to get them.
- **Group 1 (nav honesty).** Verified: `ClinicLayout.tsx:11` is `perm: undefined` with the filter
  already at line 76 (a one-word fix), and `AdminLayout.tsx:76` is a bare `NAV.map` with no `perm`
  keys on any of its 9 entries. C-10's two-edit cap is respected exactly.
- **Group 6 (F-5, N-1) and Group 8's `guards.test.tsx` edit.** Minimal and correctly placed.

---

## 4. Non-blocking flags (do **not** hold up resubmit)

1. **AUTH-401-03 / F-7 is priced low and delivered higher.** BA kept it as "one ternary, costs
   nothing" — but the plan materialises it as a production ternary (Task 5.1) *plus* Task 5.3, a test
   that must forcibly synthesise `plane: 'platform'` on the clinic store. I verified F-6 holds: the
   clinic `authStore` only ever reads `plane` from its own sessionStorage key
   (`authStore.ts:74`, `raw.plane ?? 'clinic'`), nothing writes `'platform'` to it, and
   `utils/platformApi.ts:38` already redirects platform 401s to `/platform/login` correctly. The
   plan's own §1 finding 4 confirms `api.ts` needs no plane branch at all. So this is production code
   plus a forged-state test for a branch that cannot execute — the same reasoning that **withdrew**
   AUTH-403-04, applied inconsistently. BA ruled explicitly to keep it, so I am **not** making this a
   condition. My recommendation: drop Task 5.3 and the ternary, and record it alongside **B-3**
   (which already schedules the dead `/platform/auth/me` branch for deletion). @pm-agent's call.
2. **`/settings/403` will render inside a shell whose nav is still role-string filtered**
   (`SettingsLayout.tsx:41`, deferred to **B-2** by BA, grill, and ADR-0026). AUTH-403-05's one-line
   statement ("no nav item leads to a route the user is denied") is therefore broader than what this
   branch tests. **Do not widen scope to fix it — B-2 stands.** Flagged so @qa-agent scopes the
   AUTH-403-05 assertion to `ClinicLayout`/`AdminLayout` deliberately rather than discovering the gap
   mid-review.
3. **Considered and not pursued:** having `RequirePermission` render `<ForbiddenView/>` in place
   instead of navigating at all — it would satisfy AUTH-403-06's "render, never redirects" invariant
   perfectly and need no tree knowledge whatsoever. C-1 locks the child-route shape across three
   gates, so this is recorded only to show it was weighed, **not** as a rejection ground and not for
   re-litigation.

---

*@ponytail-agent — Step 5 complete. Verdict: REJECT (Criterion 1). `/execute-plan` remains blocked
until the six edits in §2 land. Estimated rework: under 15 minutes — all six are deletions or a
one-line replacement.*
