# Auth Recovery Paths — Implementation Plan (Step 4 `/write-plan`)

**Branch:** `fix/auth-recovery-paths`
**Author:** @pm-agent
**Date:** 2026-08-25
**Inputs (read in full):**
- `docs/superpowers/plans/2026-08-21-auth-recovery-paths-pm-tasks.md` (Step 1+2)
- `docs/superpowers/plans/2026-08-21-auth-recovery-paths-ba-signoff.md` (Step 3 — APPROVED WITH CONDITIONS, C-1…C-11)
- `docs/superpowers/plans/2026-08-21-auth-recovery-paths-grill.md` (Step 3.5 — PASSED, findings G1…G5)
- `docs/adr/0026-authorization-ui-is-recoverable-and-honest.md` (accepted decision)

**Governing rule (repeat, do not re-litigate):** shape **(a)** — a `403` child route under
`/clinic-admin`, `/clinic`, `/settings`. No 403-rendering component may render `ClinicLayout` or
`AdminLayout` (F-1 loop), and none may re-compose sidebar chrome standalone (duplication). Nav
filtering is cosmetic only — no route guard may ever be weakened because a nav entry is hidden
(G2/ADR-0026 decision 4).

Source re-read for this plan (exact lines cited below): `App.tsx`, `guards/RequirePermission.tsx`,
`guards/RequireAuth.tsx`, `guards/guards.test.tsx`, `layouts/ClinicLayout.tsx`,
`layouts/AdminLayout.tsx`, `layouts/PlatformLayout.tsx`, `store/authStore.ts`,
`store/__tests__/authStore.test.ts`, `store/platformAuthStore.ts`, `components/roles/RoleList.tsx`,
`views/LoginView.tsx`, `utils/api.ts`, `utils/api.test.ts`, `utils/platformApi.ts`, `hooks/useAuth.ts`,
`hooks/useAuth.test.ts`, `__tests__/RoleList.test.tsx`, `__tests__/RoleEditorView.test.tsx`,
`__tests__/LoginView.i18n.test.tsx`, `components/ProfileMenu.tsx`, `i18n/index.ts`.

**Correction to the BA sign-off's own arithmetic (flagged, not a blocker):** §11 of the sign-off
states "22 AC"; the actual enumeration in §6 (8 upheld + 2 restated + 9 new − 1 withdrawn) totals
**19** uniquely named AC. This plan consolidates the 19 actually enumerated in §6, not 22 — see
§2 below. Flagged for @ba-agent's awareness; does not block Step 4. **Confirmed accepted by
@ponytail-agent's review** (`docs/superpowers/plans/2026-08-21-auth-recovery-paths-ponytail.md`).

**Revision note (post-Ponytail, this revision):** @ponytail-agent REJECTED the first pass on
Criterion 1 (over-engineering), all other criteria passed. Two findings adopted verbatim
(absolute `/403` deleted rather than made recoverable; `TREE_403` map replaced by one-segment
path derivation), one structural fix (Task 3.3 folded into 3.1, since it was verification-only),
and one BA/Ponytail conflict resolved by the coordinator in Ponytail's favor (AUTH-401-03/F-7
dropped — the ternary and its test were guarding a branch nothing in production can reach, the
same reasoning that already withdrew AUTH-403-04). Net: **29 → 25 numbered tasks** (this plan's
own recount against the shipped file — Tasks 3.3/3.4/3.5 removed, 3.3 folded into 3.1, Task 5.3
removed; the coordinator's message cited 33→29, which does not match a direct count of the
first-pass document as written — flagged in §7 below, not treated as a discrepancy worth
blocking on), **18 AC** (19 → 18, AUTH-401-03 dropped), new component API surface **1 → 0**.
Superseded content is struck through in place below rather than silently removed, so the
reasoning stays legible.

---

## 1. New facts found while grounding this plan (must shape the tasks)

1. **`ClinicLayout.tsx:76` already filters nav by permission** —
   `NAV.filter(item => !item.perm || hasPermission(item.perm))`. The *only* F-3 gap in
   `ClinicLayout` is line 11: `{ to: '/clinic/dashboard', ..., perm: undefined }`. C-10's
   "one word" fix is exactly this — `perm: 'dashboard.view'`.
2. **`AdminLayout.tsx` NAV array (lines 11-23) has no `perm` key on any of its 9 entries**, and
   line 76 is a bare `NAV.map(...)` with no filter. Both the filter *and* the per-item `perm`
   keys must be added. Mapped against `App.tsx`'s route guards:
   `dashboard→clinic.profile.view`, `/settings/clinic-profile`→`clinic.profile.view` (cross-tree
   link, still worth gating so it doesn't appear for a user who'd hit `/settings/403`),
   `users→staff.view`, `usage→clinic.profile.view`, `settings→clinic.profile.view`,
   `subscription→clinic.profile.view`, `blood-bank→bloodbank.view`, `audit→audit.view`,
   `roles→roles.view`.
3. **`TopNav`/`ProfileMenu` (with the `/preferences` link, `ProfileMenu.tsx:151`) is rendered by
   the layout itself, not by the routed `<Outlet/>` content** (`ClinicLayout.tsx:114`,
   `AdminLayout.tsx:114`, both call `<TopNav/>` outside `<main><Outlet/></main>`). Under shape
   (a), the 403 child route renders only inside `<Outlet/>` — **X3 (`/preferences` reachability,
   AUTH-403-07) is already satisfied by the existing shell composition once the 403 route is
   nested under it.** No new wiring needed for AUTH-403-07 beyond nesting the route correctly.
4. ~~`platformApi.ts` ... AUTH-401-03 kept ... ternary, costs nothing~~ — **superseded by
   Ponytail's Criterion-1 finding, adopted by the coordinator.** `authStore.ts:74`
   (`normalise()`) only ever *reads* `raw.plane ?? 'clinic'` — nothing in production code writes
   `plane: 'platform'` onto the clinic `authStore` (F-6, confirmed by grep). `platformApi.ts`
   (`utils/platformApi.ts:30-44`) already redirects platform 401s to `/platform/login` correctly,
   through its own isolated instance. So the defensive ternary in `authStore.ts:153` would guard
   a branch nothing can reach, and its test (old Task 5.3) would have to *forge* `plane:
   'platform'` onto the clinic store to exercise it — the same shape of unreachable-state
   objection that already withdrew AUTH-403-04 (§6.3 of the BA sign-off). Applying that reasoning
   inconsistently — withdrawing one unreachable-state AC while keeping another — was the actual
   defect in the first-pass plan. **Dropped: the plane ternary in `authStore.ts:153`, Task 5.3,
   and AC AUTH-401-03.** Recorded under **B-3** (`.claude/roadmap` backlog — already scheduled to
   delete the dead `/platform/auth/me` branch in `refreshPermissions`; this is the same branch).
   `api.ts` needs no plane branch either (its `useAuthStore` import is clinic-only by
   construction) — its task remains `?reason=` only.
5. **`RequirePermission` guards 27 distinct route elements** across the three trees (8 in
   `/clinic-admin`, 11 in `/clinic`, 8 in `/settings` — matches BA's count in §4.2). One is
   nested **two path segments deep**: `App.tsx:163`, `<Route path="storage/connecting">` under
   `/settings`, giving URL `/settings/storage/connecting`. A relative `<Navigate to="403"
   relative="path"/>` fired from that route resolves against the **URL**, not the route tree, and
   in react-router v6 that means dropping only the last URL segment —
   `/settings/storage/403`, not `/settings/403` (confirmed independently by @ponytail-agent,
   which also checked `relative="route"`: `/settings/storage/connecting/403` — also wrong).
   **This is exactly the failure C-4 warns about.** The plan below verifies relative-Navigate
   behaviour with a spike test targeting this specific route first (Task 2.1), then implements
   the fix as a **one-segment path derivation** — `pathname.split('/')[1]` — rather than a
   hand-maintained tree-prefix map (Ponytail's Criterion-1 finding: only three trees ever contain
   `RequirePermission`, the first URL segment identifies all three at any depth, and a derived
   value cannot drift out of sync with `App.tsx` the way a parallel hand-maintained map
   eventually would).

---

## 2. AC → task → test map (18 AC, each with a falsifiability clause per C-11/G5)

**AUTH-401-03 dropped this revision** (see Revision note above / §1 finding 4) — Ponytail's
unreachable-state objection, adopted by the coordinator over BA's original ruling to keep it.
19 → 18.

| AC ID | One-line requirement | Falsifiability clause — what reverting breaks | Test (new/extended) |
|---|---|---|---|
| AUTH-403-01 | Denial inside a permission-holder's own tree renders in-shell; held nav items work | Reverting Task 3.1–3.2 makes `/clinic/403` render the old absolute stub (no sidebar) — test fails because no sidebar nav exists to click | `App.routing.test.tsx` §"in-shell denial" |
| AUTH-403-02 | Zero-permission user: sidebar shows no denying items, footer logout present, logout ends session | Reverting Task 1.1/1.2 restores the Dashboard trap item / unfiltered admin NAV — test fails because a nav item is present for a route the mock denies | `App.routing.test.tsx` §"zero-permission recovery" + `ClinicLayout.test.tsx`/`AdminLayout.test.tsx` filter tests |
| AUTH-403-03 | From 403, ≥1 non-logout affordance reaches a rendering route (`/preferences`); `/login`→dashboard→403 chain is ≤3 navigations, exact | Reverting Task 3.2 restores the absolute `/403` with no shell → `/preferences` link assertion fails (element never renders under a shell); chain-length assertion fails because the old code terminates at a bare div at hop 1, not hop 3 in-shell | `App.routing.test.tsx` §"no dead end" |
| AUTH-403-05 | Nav honesty: no nav item leads to a route the user is denied | Reverting Task 1.1/1.2 makes a `dashboard.view`-lacking user see the Dashboard link (or any admin item) — test fails | `ClinicLayout.test.tsx`, `AdminLayout.test.tsx` (new files) |
| AUTH-403-06 | 403 route never redirects — no guard, no role-`<Navigate>` on it | Reverting Task 3.2 (adding a guard/redirect to the 403 element) would make this test's "zero navigation" assertion fail | `App.routing.test.tsx` §"terminal render" |
| AUTH-403-07 | `/preferences` reachable from 403 (X3) | Reverting Task 3.2 (unnesting the 403 route from the shell) removes `TopNav`/`ProfileMenu` from the render — link assertion fails | `App.routing.test.tsx` §"no dead end" (shared case with 403-03) |
| AUTH-REFRESH-01 | Self-edit + refresh non-ok → warning, not success toast | Reverting Task 4.4 (RoleList branching on outcome) restores the unconditional success toast — test fails | `RoleList.test.tsx` §"honest refresh" |
| AUTH-REFRESH-02 | Self-edit + refresh ok → success toast (regression guard) | Reverting Task 4.1–4.3 (authStore total contract) breaks the `.ok` read entirely — test throws instead of asserting | `RoleList.test.tsx` §"honest refresh" |
| AUTH-REFRESH-03 | `fetch` throw inside refresh is caught, not an unhandled rejection, same warning as 01 | Reverting Task 4.2 (try/catch) makes the throw escape `onSuccess` — test's rejection-tracking assertion fails | `authStore.test.ts` §"refreshPermissions total contract" + `RoleList.test.tsx` |
| AUTH-REFRESH-04 | Malformed `permissions` body ≠ authoritative empty | Reverting Task 4.3 (F-2 fix) restores `[] + permissionsLoaded:true` on malformed body — test's "still has 30 perms" assertion fails | `authStore.test.ts` §"F-2 malformed body" |
| AUTH-REFRESH-05 | Warning persists (no 4s auto-dismiss), carries a reload control | Reverting Task 4.5 (toast timeout guard) makes the warning vanish after the mocked 4s tick — test fails; reverting Task 4.6 (reload button) removes the clickable control — test fails to find it | `RoleList.test.tsx` §"warning persistence" |
| AUTH-REFRESH-06 | `refreshPermissions` total over all 5 exits | Reverting any of Task 4.1–4.3 makes at least one of the 5 exit-path tests assert `undefined` instead of `{ok:boolean}` | `authStore.test.ts` §"refreshPermissions total contract" (5 cases) |
| AUTH-INV-PERM-01 | Failed refresh leaves `permissionsLoaded`/`permissions` untouched | Reverting Task 4.1–4.3 either flips `permissionsLoaded` to `false` or lets the malformed-body branch fabricate `[]` — test fails | `authStore.test.ts` (already-passing pre-existing cases, re-run + one new untouched-on-401 case) |
| AUTH-401-01 | authStore 401 → `/login?reason=session-expired`; idle unaffected | Reverting Task 5.1 restores bare `/login` — `reason` param assertion fails; idle case is a separate pre-existing test, unaffected either way | `authStore.test.ts` §"401 reason" |
| AUTH-401-02 | `api.ts` interceptor 401 → same `reason=session-expired`; `skipAuthRedirect` unaffected | Reverting Task 5.2 restores bare `/login` on the dominant path — test fails; `skipAuthRedirect` case is the pre-existing `api.test.ts` test, re-run unmodified | `api.test.ts` §"reason param" (extended) |
| AUTH-401-04 | Unknown `?reason=` → no banner, value never reflected into DOM | Reverting Task 5.3 (allow-list) restores the old `=== 'idle'` boolean check, which happens to also satisfy "no banner for unknown reason" — so the *reflection* half of this AC is what's load-bearing: a naive `{t(reasonParam)}` interpolation would leak the raw string into the DOM and this test's `queryByText(rawReason)` assertion would find it | `LoginView.i18n.test.tsx` / new `LoginView.reason.test.tsx` |
| AUTH-TEST-F5 | `useAuth.test.ts:208` no longer vacuous | Re-introducing the mocked-`setAuth` vacuous assertion (i.e. reverting Task 6.1) is itself the defect being fixed — the new assertion targets a real, unmocked call path so it fails if that call path regresses | `useAuth.test.ts` (edited in place) |
| AUTH-TEST-N1 | `fetchMe` malformed-body → `IdentityLoadError` | Removing the `try/catch` around `res.json()` in `fetchMe` (`useAuth.ts:69-74`) makes the new `it.each` row fail — this is the falsifiability check named explicitly in the PM brief | `useAuth.test.ts` (new `it.each` row) |

---

## 3. Task list

Atomic, 2–5 min each, TDD (failing test written/extended before the production edit), dependency-ordered.
Exact paths under `src/frontend/src/` unless stated.

### Group 1 — Nav honesty (C-10, F-3 minimum fix — feeds Group 3's "must ship together" coupling)

- **1.1** `layouts/__tests__/ClinicLayout.test.tsx` (new file) — write failing test: render
  `ClinicLayout` with `hasPermission` mocked to deny `dashboard.view`; assert no `NavLink` to
  `/clinic/dashboard` is rendered. Then edit `layouts/ClinicLayout.tsx:11` —
  `perm: undefined` → `perm: 'dashboard.view'`. (Filter at line 76 already exists — no other
  change.) Re-run pre-existing manual sidebar tests if any exist under this file; none currently
  do, so this is the first coverage for `ClinicLayout`'s nav filter.
- **1.2** `layouts/__tests__/AdminLayout.test.tsx` (new file) — write failing test: render
  `AdminLayout` with `hasPermission` mocked to deny `staff.view`; assert no `NavLink` to
  `/clinic-admin/users` is rendered, while an item whose `perm` is held still renders. Then edit
  `layouts/AdminLayout.tsx`:
  - Add `perm` key to each of the 9 `NAV` entries (line 11-23) per the mapping in §1.2 above.
  - Line 76: `NAV.map(item => ...)` → `NAV.filter(item => !item.perm || hasPermission(item.perm)).map(item => ...)`.
  - Import `hasPermission` from `useAuthStore` (mirrors `ClinicLayout.tsx:26`).
  Depends on: none.

### Group 2 — Verify the relative-redirect mechanism (C-4, gates Group 3's routing shape)

- **2.1** `guards/RequirePermission.spike.test.tsx` (scratch test, deleted at end of Group 2 —
  not part of the shipped suite) — render `RequirePermission` under a `MemoryRouter` with
  `initialEntries: ['/settings/storage/connecting']`, nested exactly as `App.tsx` nests it
  (`/settings` → `storage/connecting`), deny the permission, and assert the resulting location.
  This is the verification step C-4 requires — run it, do not assume. **Keep this task as-is per
  Ponytail's review** — it independently confirmed both `relative="path"`
  (→ `/settings/storage/403`, wrong) and `relative="route"`
  (→ `/settings/storage/connecting/403`, also wrong), so the spike still earns its cost as real
  C-4 compliance, not speculative caution.
- **2.2** ~~Based on 2.1's outcome ... implement the explicit tree-prefix map fallback ...
  `TREE_403` ... `useLocation()` longest-prefix match ...~~ — **superseded by Ponytail's
  Criterion-1 finding.** No map is needed: only three trees ever contain `RequirePermission`
  (`/clinic-admin`, `/clinic`, `/settings`), and the first URL path segment identifies the tree
  at any nesting depth, including the two-segment-deep `storage/connecting` case from 2.1. Edit
  `guards/RequirePermission.tsx`: import `useLocation` from `react-router-dom`; replace line 61's
  `<Navigate to="/403" replace />` with:
  ```
  const { pathname } = useLocation()
  const tree = pathname.split('/')[1] // 'clinic-admin' | 'clinic' | 'settings'
  return <Navigate to={`/${tree}/403`} replace />
  ```
  Two lines, no map, no longest-prefix matching, no no-match branch to design for — and it
  cannot drift out of sync with `App.tsx`'s route tree the way a parallel hand-maintained map
  eventually would.
- **2.3** Delete the scratch spike test from 2.1; its finding (derivation over a map) is now
  proven by Group 3's routing tests instead. Record the outcome inline as a code comment above
  the `tree` line in `RequirePermission.tsx` (one line: why relative-Navigate was rejected,
  citing the two-segment-deep route that breaks both its modes) so a future engineer doesn't
  "simplify" it back.

### Group 3 — Shape (a) routing: 403 child routes (C-1, C-3, C-6, AUTH-403-01/02/03/06/07)

- **3.1** `App.routing.test.tsx` (new file) — write failing tests (`MemoryRouter` + the guard
  mocking pattern already used in `guards.test.tsx`, but exercising `App`'s actual route tree via
  a minimal harness, or exercising `RequirePermission` + the three layouts together):
  1. "in-shell denial" — a `doctor` role lacking `billing.create` navigating to `/clinic/billing`
     lands on a route that renders `ClinicLayout`'s sidebar (assert a `NavLink` the doctor *does*
     hold, e.g. `/clinic/pets`, is present and clickable).
  2. "zero-permission recovery" — `permissions: []`, `permissionsLoaded: true`: assert the
     sidebar `<nav>` contains zero `NavLink` elements, and the footer logout button is present.
  3. "no dead end" — from the 403 render, assert a link to `/preferences` is present and, when
     clicked, navigates to a location that renders (not another denial).
  4. "terminal render" — force `role: 'admin'` under a `/clinic/403` render (simulating the
     scenario ADR-0026 Consequences discusses) and assert **zero** `Navigate`/redirect side
     effect fires from the 403 element itself (it is not a no-op regression of `ClinicLayout:31`
     — that redirect is `ClinicLayout`'s own, pre-existing, and out of scope per Grill G3; this
     assertion is scoped to the 403 *element*, not the shell).
  5. "stale bookmark resolves, not dead-ends" — a zero-permission user navigates directly to the
     (now-deleted) absolute `/403`: the catch-all (`App.tsx:185`) sends them to `/login`;
     `LoginView`'s authenticated bounce (`LoginView.tsx:42-47`) sends them to their dashboard;
     the dashboard route denies them and lands them on `/clinic/403` **in-shell** — assert the
     chain terminates there, with real sidebar/footer-logout/`TopNav` present (this is Ponytail's
     Criterion-1 finding: the router already resolves this case better than a hand-rolled
     standalone fallback would, once verified end-to-end rather than assumed).
  Includes 3.1's former verification-only companion task (old Task 3.3 — folded in here, since
  running these assertions against the restructured tree *is* the verification step, not a
  separate task).
- **3.2** `App.tsx` — restructure the route tree:
  - **Delete** the standalone `<Route path="/403" element={<ForbiddenView/>}/>` (line 180)
    entirely — **not** replaced by a recoverable standalone fallback. Per Ponytail's Criterion-1
    finding (adopted, reverses this plan's original C-2 stance): the existing catch-all
    (`App.tsx:185`, `<Route path="*" element={<Navigate to="/login" replace/>}/>`) plus
    `LoginView`'s authenticated-user bounce already resolve a stale/direct `/403` hit to the
    correct in-shell 403 (sidebar, footer logout, `TopNav`/preferences link) in 3 hops — strictly
    more recoverable than a shell-less page with two hand-rolled links, at a cost of a deletion
    instead of a route + a prop + a test + a uiux item. It also closes Trap 1 (BA §3, Ruling 3):
    an unauthenticated visitor can no longer render `/403` directly and see a stale shell.
  - Add `<Route path="403" element={<ForbiddenView/>}/>` as a child of the `/clinic-admin` route
    (inside the block at lines 97-111), the `/clinic` route (lines 137-152), and the `/settings`
    route (lines 155-165).
  - `ForbiddenView` itself (lines 65-73) is unchanged — it already renders body-only content
    (icon/heading/copy), which is what makes it safe to nest three times: it does not render
    `ClinicLayout`/`AdminLayout`/`SettingsLayout`, satisfying C-3 by construction. **No
    `standalone` prop, no second render mode** — `ForbiddenView`'s API surface stays exactly what
    it is today.
  - Run `App.routing.test.tsx` from 3.1 (all 5 cases, including the new stale-bookmark case)
    against the restructured tree and confirm green.

### Group 4 — `refreshPermissions()` total contract + F-2 + honest RoleList warning (C-7, C-8, A2)

- **4.1** `store/__tests__/authStore.test.ts` — extend (do **not** create a second file, per
  BA's C-8 correction to the PM brief's AUTH-10). Add a new `describe('refreshPermissions total
  contract')` block with 5 failing cases, one per exit path in `authStore.ts:142-179`:
  1. `!token` → resolves `{ ok: false }` (no fetch call).
  2. `fetch` rejects (network throw) → resolves `{ ok: false }`, no unhandled rejection.
  3. `401` response → resolves `{ ok: false }`, `clearAuth()` called,
     `window.location.href` includes `reason=session-expired` (see Task 5.1).
  4. `!res.ok` (e.g. 500) → resolves `{ ok: false }`, `permissionsLoaded`/`permissions` unchanged.
  5. `200` with a well-formed body → resolves `{ ok: true }`, `permissionsLoaded: true`.
  Plus one more case for F-2:
  6. `200` with `permissions` missing/non-array → resolves `{ ok: false }`,
     `permissionsLoaded`/`permissions` **unchanged** (not flipped to `[]`/`true`).
- **4.2** `store/authStore.ts` — implement the total contract:
  - Change the interface (line 47): `refreshPermissions: () => Promise<{ ok: boolean }>`.
  - Line 144 `if (!token) return` → `if (!token) return { ok: false }`.
  - Wrap the `fetch` call (line 147) in `try { ... } catch { return { ok: false } }`.
  - Line 151-155 (401 branch): after `clearAuth()` and the redirect (Task 5.1 adds the reason
    param here), `return { ok: false }` instead of bare `return`.
  - Line 157 `if (!res.ok) return` → `return { ok: false }`.
  - Line 178 success branch: `set(...)`, then `return { ok: true }`.
- **4.3** `store/authStore.ts` — F-2 fix, same function: before building `patch` (line 166),
  validate `Array.isArray(body.permissions)`. If false, **do not** call `set(...)` at all — return
  `{ ok: false }` immediately, leaving `permissionsLoaded`/`permissions` at their pre-call values
  (this is what makes AUTH-INV-PERM-01 hold across this new branch too).
- **4.4** `components/roles/RoleList.tsx` — `handleSave`'s `onSuccess` (lines 173-179): reorder
  so the toast decision depends on the refresh outcome when the edited role is self-held:
  ```
  onSuccess: async () => {
    if (userRoleIds.map(String).includes(role.id)) {
      const result = await refreshPerms()
      if (!result.ok) {
        showWarningToast({ message: t('roles.refreshFailedWarning') }) // Task 4.6
        return
      }
    }
    showToast({ type: 'success', message: 'Permissions updated' })
  },
  ```
  When the edited role is not self-held, behavior is unchanged (immediate success toast).
- **4.5** `components/roles/RoleList.tsx` — the toast state and `showToast` helper (lines 29-32,
  161-164): add a `'warning'` variant to `ToastState['type']`, and make the 4-second
  `window.setTimeout` auto-dismiss **conditional** — skip it when `type === 'warning'`. Add a
  visual style branch alongside the existing success/error ternary (line 372-375) for `warning`
  (confirm token against `anemal-design-system` — no raw hex; reuse the existing `error`-family
  container tokens with distinct copy is acceptable per the design-system skill's variant
  guidance, subject to Group 7's uiux review).
- **4.6** `components/roles/RoleList.tsx` — add the reload control to the warning toast's JSX
  (inside the block from 4.5): a second button, `onClick={() => window.location.reload()}`,
  min 44×44px target, Material Symbols `refresh` icon, next to the existing dismiss button.
  Warning toasts do **not** get a dismiss-only exit — the reload button is the primary action;
  the existing `X` close button may remain but must not be the only control.
- **4.7** `__tests__/RoleList.test.tsx` — ripple fix (C-8 item 3): update the mock at lines 5-8
  from `refreshPermissions: () => Promise<void>` / `async () => {}` to
  `refreshPermissions: () => Promise<{ ok: boolean }>` / `async () => ({ ok: true })`. Add new
  test cases for AUTH-REFRESH-01/02/05 (mock rejects → warning shown, no auto-dismiss timer
  fires within 4s in a fake-timer test; mock resolves → success toast, existing 4s dismiss
  still fires — regression case for AUTH-REFRESH-05's third bullet).
- **4.8** `__tests__/RoleEditorView.test.tsx` — ripple fix (C-8 item 4): update the type at
  line 49, and the mock factories at lines 54-55, 102-103, 257-258, 277-278, from
  `async () => {}` to `async () => ({ ok: true })` (or `{ ok: false }` for a new failure-path
  case, if one is added here rather than in `RoleList.test.tsx` — prefer keeping the
  refresh-outcome branching tests in `RoleList.test.tsx` per 4.7 and only fix these mocks'
  *types* here so the suite compiles and the two existing AC-8 tests keep passing).
- **4.9** `hooks/useAuth.test.ts` — ripple fix (C-8 item 5): line 37,
  `refreshPermissions: vi.fn().mockResolvedValue(undefined)` →
  `.mockResolvedValue({ ok: true })`. No behavioral assertion in this file depends on the return
  value today, so this is a compile-only fix — confirm no test in this file breaks.
- **4.10** `i18n/index.ts` — add `roles.refreshFailedWarning` (EN + TH), copy: "Permissions were
  saved, but your session could not refresh. Reload to see your updated access." (EN); TH
  translation matching the existing `roles.*` key style. Referenced by Task 4.4.

### Group 5 — 401 explains itself (C-9: F-4 + AUTH-BL-1)

- **5.1** `store/__tests__/authStore.test.ts` — extend Group 4's total-contract test case 3
  (401 branch) to also assert `window.location.href` ends with `?reason=session-expired` (not
  `?reason=idle`). Then edit `store/authStore.ts:153`:
  `window.location.href = '/login'` → `` `/login?reason=session-expired` ``. **No plane branch
  here** — see the dropped item below.
- **5.2** `utils/api.test.ts` — add a failing case: 401 with no `skipAuthRedirect` →
  `window.location.href` is `/login?reason=session-expired`. Re-run the existing two cases
  unmodified (plain-401 case will need its literal `/login` assertion updated to match — this
  is the "restatement" the plan must apply, not a new AC). Edit `utils/api.ts:35`:
  `window.location.href = '/login'` → `` '/login?reason=session-expired' ``.
- ~~5.3 — add the AUTH-401-03 case: force `plane: 'platform'` on the in-memory clinic store...~~
  **Dropped.** This task existed only to exercise a defensive ternary that itself guards a state
  nothing in production writes (F-6: `authStore.ts:74` only ever *reads* `raw.plane ?? 'clinic'`;
  `platformApi.ts:30-44` already redirects real platform 401s to `/platform/login` correctly,
  through its own isolated instance). A test that must forge `plane: 'platform'` onto the clinic
  store to reach the branch it's testing is the same shape of problem that withdrew AUTH-403-04.
  Recorded under **B-3** instead (already-scheduled backlog item to delete the dead
  `/platform/auth/me` branch in `refreshPermissions` — this ternary would have been the same kind
  of dead weight, one door down).
- **5.3** (renumbered from 5.4) `views/LoginView.tsx` — replace the single `showIdleBanner`
  boolean (line 13) with an allow-list map:
  ```
  const REASON_COPY: Record<string, string> = {
    idle:              'login.idleLogoutMessage',
    'session-expired': 'login.sessionExpiredMessage',
  }
  const reasonParam = new URLSearchParams(window.location.search).get('reason')
  const reasonCopyKey = reasonParam !== null ? REASON_COPY[reasonParam] : undefined
  ```
  Update the banner JSX (lines 97-104) to render `t(reasonCopyKey)` when `reasonCopyKey` is
  defined, nothing otherwise. This satisfies AUTH-401-04: an unrecognised `reason` value is
  never looked up (returns `undefined`, no banner) and the raw query value is never interpolated
  into the DOM (only a fixed copy-key from the map is).
- **5.4** (renumbered from 5.5) `i18n/index.ts` — add `login.sessionExpiredMessage` (EN + TH),
  copy distinguishing it from idle per the BA doc's semantic caution: EN "Your session has ended
  — please sign in again." (deliberately not reusing idle's "due to inactivity" framing, since
  this reason is server-driven, not a client-side timer).
- **5.5** (renumbered from 5.6) `__tests__/LoginView.i18n.test.tsx` — re-run unmodified
  (regression guard for the existing `?reason=idle` Thai-banner test, pinned at line 44-49) —
  must stay green untouched. Add a new test file `__tests__/LoginView.reason.test.tsx` (or extend
  the i18n file) covering: `?reason=session-expired` renders the new banner; `?reason=bogus-value`
  renders no banner and `bogus-value` does not appear anywhere in the rendered output
  (AUTH-401-04's DOM-reflection check).

### Group 6 — Test-only fixes (F-5, N-1)

- **6.1** `hooks/useAuth.test.ts:208` — F-5. `setAuth` is mocked (line 35: `vi.fn()`), so
  `sessionStorage.getItem('vc_auth')` can never observe a real write — the assertion is vacuous.
  Delete it. Confirm AC-12 ("failed login leaves no persisted blob") remains proven by a
  real-store test elsewhere first — grep the suite for an `S-4`-labelled or equivalent
  non-mocked-store case per the PR #54 sign-off reference; if none exists, add one real-store
  case here instead of just deleting (do not leave AC-12 unproven).
- **6.2** `hooks/useAuth.test.ts` — N-1. Add one `it.each` row to the `fetchMe`-exercising test
  block: `{ ok: true, json: () => Promise.reject(new SyntaxError('bad json')) }` →
  `fetchMe` (exercised indirectly via `loginMutation`/`selectBranchMutation`, same as the
  existing T6 `it.each` block at lines 188-215) rejects with `IdentityLoadError` whose `cause` is
  the `SyntaxError`. Verify the test is falsifiable by confirming `useAuth.ts:69-74`'s
  `try/catch` around `res.json()` is what makes it pass (do not remove it — this is the
  verification step, not a code change task).

### Group 7 — @uiux-agent review (Step 6, light scope per the PM brief's original ruling)

- **7.1** @uiux-agent reviews, does **not** invent components:
  1. The zero-permission empty sidebar state (Group 1/3 output) — confirm a bare `<nav>` with
     only header/footer is acceptable Compassionate Care presentation, or specify (within the
     existing token set) a one-line "no menu items — contact your admin" hint row if the empty
     `<nav>` reads as broken rather than intentional.
  2. `ForbiddenView`'s body copy placement now that it renders inside `<main>` under a sidebar
     (Group 3) instead of full-bleed — confirm spacing/centering tokens still read correctly at
     the narrower content width.
  3. ~~The `standalone` variant (Task 3.4)~~ — **dropped**, that variant no longer exists
     (Ponytail Criterion-1: absolute `/403` deleted, not made recoverable — see Group 3).
  4. The warning toast (Task 4.5/4.6) — confirm the `warning` variant's token choice and the
     reload button's icon/placement.
  No new design tokens, icons, or component types expected; flag back to @pm-agent if any of the
  four items above turns out to need one.

### Group 8 — Regression re-run (not new tasks; explicit re-run list for @qa-agent)

Existing suites that must be re-run **unmodified first** (before any new case is added) to
confirm they are still green against the restructured routes/contracts, per the regression risk
list in the original PM brief (§4) and the grill record:
- `guards/guards.test.tsx` — **will need edits**, not just a re-run: the existing
  `'redirects to /403 when authenticated but permission missing'` cases (lines 155-162, 187-199)
  assert `data-to === '/403'` against a **mocked** `Navigate`, which does not exercise real
  routing — these stay valid as unit tests of `RequirePermission`'s *old* absolute-redirect
  behavior and must be updated to assert against the derived `` `/${tree}/403` `` output instead
  (mock `useLocation` alongside the existing `Navigate`/`Outlet` mocks at the top of the file, set
  `pathname` per case, assert the resulting `data-to`). This is a required edit, listed here
  rather than in Group 2/3 because it is the single highest-risk regression point — @qa-agent
  owns confirming it, not treating a stale pass as green.
- `store/__tests__/authStore.test.ts` (all pre-existing F-1/INV-PERM-1 cases, lines 39-113) —
  re-run unmodified, must stay green; Group 4/5 only add new `describe` blocks.
- `utils/api.test.ts` (existing 3 cases) — case 1 (line 25-31) needs its literal `/login`
  assertion updated to `/login?reason=session-expired` (Task 5.2); cases 2 and 3 (skipAuthRedirect,
  non-401) are unaffected and must stay green as-is.
- `__tests__/LoginView.i18n.test.tsx` — re-run unmodified, the `idle` case must stay green.
- `__tests__/RoleList.test.tsx`, `__tests__/RoleEditorView.test.tsx` — the two pre-existing
  Clone-lockdown / AC-7 / AC-8 cases must stay green after the Task 4.7/4.8 mock-type fixes;
  these fixes are compile/type corrections, not behavior changes, so no pre-existing assertion
  should need to change.

---

## 4. Dependency order (summary)

```
Group 1 (nav honesty)         ──┐
Group 2 (verify redirect)     ──┼──> Group 3 (403 routing) ──> Group 8 (guards.test.tsx fix)
                                 │                                        │
Group 4 (refresh contract)    ──┘                                        │
   └──> Group 5 (401 reason, depends on 4.2's return-shape existing)     │
Group 6 (F-5/N-1, independent) ───────────────────────────────────────────┤
Group 7 (uiux review) — after Groups 1/3/4 have a renderable diff ────────┘
```

Group 1 and Group 4 have no dependency on each other and can be built in either order; Group 3
depends on both Group 1 (so the sidebar it embeds is honest) and Group 2 (so it knows the
redirect target mechanism). Group 5 depends on Group 4's `{ ok: boolean }` contract existing on
the 401 branch. Group 6 is fully independent and can run first or last.

---

## 5. Scope discipline (for the Ponytail gate)

- **Files touched, production:** `App.tsx`, `guards/RequirePermission.tsx`, `layouts/ClinicLayout.tsx`,
  `layouts/AdminLayout.tsx`, `store/authStore.ts`, `components/roles/RoleList.tsx`, `utils/api.ts`,
  `views/LoginView.tsx`, `i18n/index.ts` — **9 files**, 0 new production files. `ForbiddenView`'s
  API surface is unchanged (no `standalone` prop — that variant was cut per Ponytail's review).
- **Files touched, tests:** `guards/guards.test.tsx` (edited), `store/__tests__/authStore.test.ts`
  (extended), `utils/api.test.ts` (extended), `__tests__/RoleList.test.tsx` (extended),
  `__tests__/RoleEditorView.test.tsx` (type fix only), `hooks/useAuth.test.ts` (extended),
  `__tests__/LoginView.i18n.test.tsx` (re-run unmodified) — plus **3 new test files**
  (`layouts/__tests__/ClinicLayout.test.tsx`, `layouts/__tests__/AdminLayout.test.tsx`,
  `App.routing.test.tsx`) and one scratch spike test deleted before ship (Task 2.1/2.3).
- **Total new files shipped: 3** (all test files) — well under the 15-file gate.
- **New endpoints/hooks/mutations: 0** — no backend change, no new API call, no new React Query
  hook. `refreshPermissions`'s *return type* changes; it is not a new API.
- **New dependencies: 0.**
- **New component API surface: 0** (was 1 — the `ForbiddenView standalone` prop — in the
  pre-Ponytail pass; cut along with the absolute `/403` route it served).
- **LOC estimate:** the routing restructure is now ~8 lines across `App.tsx` (3 nested routes,
  1 deletion) + `RequirePermission.tsx` (2-line derivation, down from a ~10-line map); the nav
  fixes are ~12 lines; the refresh contract is ~20 lines (no plane ternary); the RoleList warning
  is ~25 lines; the 401/reason work is ~10 lines (no plane branch). Production diff comfortably
  under 100 LOC; test diff is the bulk of the change, as expected for a recovery-path/honesty fix
  with a hard falsifiability requirement (C-11).

9 production files for a fix that touches three independent trust boundaries (routing, refresh
contract, 401 handling) is proportionate, not over-scoped — and this revision removes every
piece of surface Ponytail identified as buying safety the router or a two-line derivation already
provided for free: the absolute-`/403` recovery page, its `standalone` prop, its test, its uiux
review item, the `TREE_403` map, and the plane-correctness ternary + its forged-state test.

---

## 6. Handoff

Ready for re-review by **@ponytail-agent** against the 7-point gate (this is the revision
requested after the Criterion-1 REJECT). On APPROVE, proceeds to **Step 6 — /execute-plan**
(`@dev-agent` ∥ `@uiux-agent` per Group 7). No @db-agent task — no schema/migration touched,
confirmed in §0 of the BA sign-off ("No new endpoint... no DB change").

## 7. Note back to the coordinator (not a blocker)

The coordinator's revision request cited the pre-revision task count as 33 (giving "33 → 29").
A direct count of the numbered tasks as actually written in the prior version of this file
(1.1–7.1) totals **29**, not 33, so the corrected total after applying all four required edits is
**25**, not 29. I've applied the edits as specified regardless — the discrepancy is in the
before-number, not in which edits were requested or how they were applied — but flagging it so
the task-count figure the coordinator carries forward is the one that reconciles against the
file. Everything else in the revision request (the two adopted findings, the 3.3 fold, the
AUTH-401-03/B-3 drop) matches this document exactly.
