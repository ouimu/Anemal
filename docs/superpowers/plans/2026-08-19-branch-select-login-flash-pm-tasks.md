# PM Task Breakdown — Branch-Select Login Flash / Delayed Dashboard Redirect

**Branch:** `fix/branch-select-login-flash`
**Pipeline step:** STEP 1+2 (brainstorm scope confirmation + AC/task list)
**Owner:** @pm-agent
**Status:** Awaiting @ba-agent validation (STEP 3) → `/grill-with-docs` (STEP 3.5, MANDATORY) → `/write-plan` (STEP 4)

---

## 1. Scope decision

### IN scope (D1 — the reported bug)

The visible defect is entirely inside `selectBranchMutation.onSuccess` in
`src/frontend/src/hooks/useAuth.ts` (lines 114–127) plus the shared `applyLogin()` helper
(lines 55–80) it calls. Two changes, both confirmed against the current code:

1. **Reorder** — `setBranchSelection(null)` currently runs *before* `applyLogin()` resolves
   (line 121, before line 122). Because the auth token isn't in the store yet at that point,
   `LoginView`'s `isAuthenticated` check (line 10, guard at line 42) is still false, so the
   component falls through to the credentials form — the visible "back to login" flash. Move
   `setBranchSelection(null)` to *after* `applyLogin()` resolves, immediately before `navigate(...)`.
2. **Dedupe `/auth/me`** — `applyLogin()` (line 60) already calls `fetchMe()` (one `/auth/me`
   round-trip) to populate `roleIds`/`permissions` on `setAuth()`, but deliberately leaves
   `permissionsLoaded` false (authStore.ts line 111) and then calls
   `useAuthStore.getState().refreshPermissions()` (useAuth.ts line 79) — a **second** `/auth/me`
   round-trip — solely to flip `permissionsLoaded` to `true` (authStore.ts line 163). This is
   the dashboard-spinner delay (`RequirePermission` waits on `permissionsLoaded`). Fix:
   `applyLogin()` sets `permissionsLoaded: true` directly from the single `fetchMe()` result
   inside the same `setAuth()` call (or an immediately-following `set` patch); the
   `refreshPermissions()` call is removed from `applyLogin()`.

This single, localized change also benefits `loginMutation.onSuccess` (the admin-bypass /
single-branch path, lines 91–112), which calls the same `applyLogin()` — that path shows no
visible flash today (no picker to flash back to) but does pay the same duplicate round-trip
and delayed-`permissionsLoaded` spinner. Fixing `applyLogin()` fixes both call sites for free;
no extra scope, same file, same function.

### Ruled OUT of scope — D2 (hard 401 redirect) and D3 (permanent spinner)

Both defects live inside `authStore.refreshPermissions()` (authStore.ts lines 127–164):
D2 is the `res.status === 401` branch (line 136–139: `clearAuth()` + hard
`window.location.href = '/login'`); D3 is the bare `if (!res.ok) return` (line 142) that skips
setting `permissionsLoaded`, leaving a permanent spinner.

**Ruling: OUT of scope for this branch.** Once D1 lands, `refreshPermissions()` is no longer
called anywhere in the login flow — `applyLogin()` stops calling it entirely, and
`loginMutation`/`selectBranchMutation` never call it directly. So after this fix, D2 and D3
**cannot fire on the login path** the human is reporting (every staff member, every shift,
tablet) — the "kicked out" feeling reported was very likely the intermittent-401 race hitting
`refreshPermissions()`'s second, redundant `/auth/me` call during login, which D1's dedupe
removes at the source.

`refreshPermissions()` remains live for one other caller: `RoleList.tsx` (line 155,
self-role-edit refresh, AC-8 of the RBAC role editor). D2/D3 are real latent bugs *there*, but
fixing session-expiry UX (should a stale-token 401 hard-redirect or show a toast?) is a
cross-cutting authentication-UX decision, not a rider on a render-order bug fix, and touching
it here would pull in a second, unrelated code path against Ponytail's scope-minimization
gate. Logged as backlog tickets below instead of bundled in.

**Backlog tickets (not blocking this branch):**
- `AUTH-BL-1`: `refreshPermissions()` 401 handling hard-redirects (`window.location.href`)
  instead of a graceful in-SPA session-expired prompt — affects the RoleList self-edit-role
  refresh path only, post-D1-fix.
- `AUTH-BL-2`: `refreshPermissions()` leaves `permissionsLoaded` permanently `false` with no
  user-visible error when `/auth/me` returns a non-401 non-ok status — same path, dead-end
  spinner with no recovery.

### Admin-bypass and "back to login" button — explicitly unchanged

- Admin bypass (`branchId === null`, `loginMutation` path, no picker shown) is a different
  `onSuccess` handler (lines 95–111) — not touched by this fix, but covered by regression AC
  since it shares `applyLogin()`.
- The picker's own "back to login" button (`resetBranchSelection`, line 133) is a distinct,
  user-initiated `setBranchSelection(null)` call outside `selectBranchMutation.onSuccess` —
  not touched.

---

## 2. Acceptance criteria

AC-1: Given a multi-branch user has submitted valid credentials and is shown the branch
picker, when they tap a branch, then the credentials/login form is never rendered again before
the dashboard route renders — `setBranchSelection(null)` must not execute before
`applyLogin()` has resolved.

AC-2: Given a multi-branch user selects a branch, when `selectBranchMutation` succeeds, then
exactly one `GET /auth/me` request is issued for that login (verify via network-call
assertion in test — no second call from `refreshPermissions()`).

AC-3: Given a multi-branch user selects a branch, when `applyLogin()` resolves, then
`useAuthStore.getState().permissionsLoaded` is `true` before `navigate()` is called — the
dashboard's `RequirePermission` guard must not render its loading spinner after arrival.

AC-4: Given an admin user (or any single-branch user) logs in via `loginMutation` (no branch
picker shown), when login succeeds, then behavior is unchanged end-to-end: exactly one
`/auth/me` call, `permissionsLoaded` true before navigate, redirect to
`/clinic-admin/dashboard` or `/clinic/dashboard` per role, and `branchName` set to
`t('nav.allBranches')` when `branchId === null`.

AC-5: Given the branch picker is showing, when the user taps the existing "back to login"
button (`resetBranchSelection`), then the credentials form renders immediately — this
resets `branchSelection` via user action and is unaffected by the AC-1 reorder (negative case:
confirms the reorder didn't accidentally block the deliberate back-navigation).

AC-6: Given `POST /auth/select-branch` fails (network error or non-2xx), when
`selectBranchMutation` rejects, then the branch picker remains visible with its existing error
handling (no change to `onError`/error UI) — the reorder must not swallow or alter the mutation
error path.

AC-7 (negative/authorization): Given a user without any assigned branch selects a branch ID
not present in `branchSelection.branches` (tampered request), when `/auth/select-branch`
rejects with 4xx, then no `setAuth()`/`applyLogin()` runs and the user stays on the picker —
existing server-side branch-ownership check is unchanged and still the sole authority (no
new client-side trust introduced by the reorder).

AC-8: Given `refreshPermissions()` is invoked from `RoleList.tsx` (self-role-edit path,
unrelated to login), when it runs, then its existing behavior (including D2/D3) is
byte-for-byte unchanged by this fix — this branch only removes the call site inside
`applyLogin()`, not the function itself.

---

## 3. Task list

| Task ID | Description | File(s) | Est. |
|---|---|---|---|
| AUTHFLOW-1 | Add failing test: single-branch-select flow issues exactly one `/auth/me` call and `permissionsLoaded` is true before `navigate()` fires (mock `fetchMe`/`api`, assert call count) | `src/frontend/src/hooks/useAuth.test.ts` | 5 min |
| AUTHFLOW-2 | Add failing test: login form (`branchSelection` state) is never null-then-re-shown between branch tap and navigate — assert `setBranchSelection` call order relative to `applyLogin` resolution (spy/mock ordering) | `src/frontend/src/hooks/useAuth.test.ts` | 5 min |
| AUTHFLOW-3 | Modify `applyLogin()`: fold `permissionsLoaded: true` into the existing `setAuth()` call using the single `fetchMe()` result; delete the `refreshPermissions()` call at line 79 | `src/frontend/src/hooks/useAuth.ts` | 3 min |
| AUTHFLOW-4 | Modify `authStore.setAuth()` (or add an `applyLogin`-only patch) so `permissionsLoaded` can be set true at call time instead of always false — confirm no other `setAuth()` caller relies on the current "always false" contract (check `useSwitchBranch`, `loginMutation` admin path) | `src/frontend/src/store/authStore.ts` | 4 min |
| AUTHFLOW-5 | Reorder `selectBranchMutation.onSuccess`: `await applyLogin(...)` first, then `setBranchSelection(null)`, then remembered-username bookkeeping, then `navigate(...)` | `src/frontend/src/hooks/useAuth.ts` | 3 min |
| AUTHFLOW-6 | Run and confirm AUTHFLOW-1/2 tests now pass; run full `useAuth.test.ts` + `authStore` suites to catch regressions in `loginMutation` and `useSwitchBranch` paths | `src/frontend/src/hooks/useAuth.test.ts`, `src/frontend/src/store/authStore.ts` (test run only) | 4 min |
| AUTHFLOW-7 | Add regression test for AC-6: `selectBranchMutation` `onError` path (or absence of `onSuccess` side effects on rejection) unchanged | `src/frontend/src/hooks/useAuth.test.ts` | 3 min |
| AUTHFLOW-8 | Manual/E2E smoke on tablet viewport (768px/1024px per `anemal-design-system`): multi-branch login end-to-end, confirm no visible form flash and no spinner hang | manual — `@qa-agent` | 5 min |

Total: 8 tasks, ~32 min estimated.

---

## 4. Regression risk list

| Area | Risk | Why it's touched | Mitigation / test owner |
|---|---|---|---|
| `loginMutation` (admin-bypass / single-branch path, useAuth.ts:91–112) | Shares `applyLogin()` — a bug in the dedupe patch (AUTHFLOW-3/4) breaks this path too, silently, since it has no visible picker to flash and may go unnoticed | Same helper function is being edited | AC-4 + AUTHFLOW-6 explicit re-run |
| `useSwitchBranch` (useAuth.ts:151–177) | Does NOT call `applyLogin()` or `refreshPermissions()` — reuses `state.permissions` directly. Confirmed unaffected by this change, but must verify `permissionsLoaded` isn't left stale/false by a mid-session branch switch after this patch changes `setAuth()`'s default | Touches shared `setAuth()` in AUTHFLOW-4 | Add/confirm existing `useSwitchBranch` test still asserts `permissionsLoaded` stays true across a switch |
| Session restore after F5 (`loadPersisted()` / `sessionStorage`, authStore.ts ~line 105) | `persisted.permissions.length > 0` gates initial `permissionsLoaded` — unrelated code path, but sits in the same file being edited (AUTHFLOW-4) | File proximity only | No behavior change expected; confirm existing persisted-session tests still pass in AUTHFLOW-6 |
| Idle-logout / token-expiry flow | Not touched — lives in `refreshPermissions()`'s 401 branch, explicitly ruled out of scope (D2) | N/A — verifying non-interference | AC-8 confirms `refreshPermissions()` body is byte-identical post-fix |
| `permissionsLoaded` contract relied on by `RequirePermission` guard | Currently ALWAYS false after `setAuth()`, flipped true only by `refreshPermissions()`. This fix changes that contract for the `applyLogin()` call site specifically — any other code assuming "false right after setAuth, ever" would break | Core of the fix (AUTHFLOW-3/4) | AUTHFLOW-4's explicit audit step + AC-3/AC-4 cover the only two `setAuth()`-then-render call sites (`loginMutation`, `selectBranchMutation`) |
| RoleList self-role-edit refresh (RoleList.tsx:155) | Only remaining caller of `refreshPermissions()` after this fix — must keep working exactly as-is | Not edited, but its only caller (`applyLogin`) is | AC-8 (no behavior change) + existing `RoleList.test.tsx` / `RoleEditorView.test.tsx` suites re-run in AUTHFLOW-6 |

---

## Next step

Per CLAUDE.md Standard Pipeline: this output goes to **@ba-agent** (STEP 3) for requirements
validation and the D2/D3 scope ruling sign-off, then **MANDATORY** `/grill-with-docs`
(STEP 3.5) before `/write-plan` (STEP 4). Do not skip.
