# Auth Recovery Paths — PM Task Breakdown (Step 1+2)

**Branch:** `fix/auth-recovery-paths`
**Author:** @pm-agent
**Date:** 2026-08-21
**Inputs:** `.claude/roadmap/phase-history.md` backlog (`AUTH-BL-1/2/3`), PR #54 QA sign-off
(`docs/superpowers/plans/2026-08-19-branch-select-login-flash-qa-signoff.md`, carry-forwards
F-5/N-1/N-2), `anemal-rbac-matrix`, `anemal-design-system`.

Code read to ground this breakdown: `src/frontend/src/App.tsx` (L64-73 `ForbiddenView`, L160-230
route tree), `src/frontend/src/guards/{RequireAuth,RequirePermission,RequirePlane}.tsx`,
`src/frontend/src/store/authStore.ts`, `src/frontend/src/layouts/{ClinicLayout,AdminLayout,
PlatformLayout}.tsx`, `src/frontend/src/components/roles/RoleList.tsx` (L176-189 `handleSave`),
`src/frontend/src/hooks/useAuth.ts` (`fetchMe`, `useLogout`), `src/frontend/src/hooks/
useAuth.test.ts` (L208), `src/frontend/src/views/LoginView.tsx`.

---

## 1. Scope decision

### In scope (this branch)
| Item | Disposition |
|---|---|
| AUTH-BL-3 (`/403` dead end) | **In** — highest user impact, explicit human decision on record |
| AUTH-BL-2 (stale-permission toast) | **In** — corrected framing: not a stuck-flag bug, a false-success bug |
| AUTH-BL-1 (silent hard redirect on 401) | **In** |
| F-5 (vacuous `sessionStorage` assertion) | **In** — one-line test fix |
| N-1 (untested malformed-body path) | **In** — one `it.each` row |
| N-2 | **Ruled — see §2.6, won't-fix, backlog entry updated** |

### Explicitly deferred / out of scope
Backend eslint flat-config migration, `countRoleUsage` tenant-scoping, `schema.prisma:225` stale
comment, audit logging for repeated payment-route probes — all per the task brief, none touch the
frontend auth path this branch owns. Also **out of scope**: any new design-system component,
icon, or nav-item type. This branch reuses the existing `ClinicLayout` / `AdminLayout` sidebar
chrome and its existing, already-unconditional logout button — it does not invent new UI atoms.

### Technical framing that drives the task list (read before assigning Step 6)
`RequirePermission` (`guards/RequirePermission.tsx`) redirects to the **single absolute path**
`/403`, from any of four independent layout trees (`/clinic-admin/*` → `AdminLayout`, `/clinic/*`
→ `ClinicLayout`, `/settings/*` → `SettingsLayout`, `/platform/*` → `PlatformLayout`). It has no
way to know which tree the caller came from. Two implementation shapes were considered:

- **(a) Nest a `403` child route under all four layout trees** — the layout's own `<Outlet/>`
  then renders `ForbiddenView` and the sidebar "just works," but `RequirePermission`'s redirect
  target must become relative/plane-aware (4 call sites' worth of routing to verify), and
  `RequirePermission` is also used **inside** `SettingsLayout`, which is itself nested inside
  `/settings` (not a standalone shell) — needs its own child route too.
- **(b) A single "smart" `ForbiddenView`** that reads `role`/`plane` from `authStore` and renders
  the *already-existing* sidebar chrome (nav list + the unconditional logout footer button) as a
  lightweight standalone composition, keeping `/403` as one absolute route.

(b) touches one file and zero routing call sites; (a) is more "correct" MVC-wise but ripples
into 4 route trees. Given the Ponytail scope caps (≤10 files / ≤500 LOC / ≤3 endpoints) this is
squarely a (b)-shaped fix. **Recommendation to @dev-agent: build (b).** Final call stays with
@ba-agent at Step 3 / Ponytail at Step 5 — recorded here as a scope constraint, not a mandate.

**Confirmed already true (reduces scope):** `ClinicLayout` and `AdminLayout` render their
logout button in the sidebar footer **unconditionally** — it is not permission-gated and does
not depend on the nav-item list being non-empty (`ClinicLayout.tsx` L102-109). A zero-permission
user therefore already gets a working logout affordance for free as soon as `ForbiddenView`
reuses that chrome; AUTH-BL-3's "provide an explicit logout affordance" requirement does not
require inventing a new button, only wiring the existing shell into the `/403` render path.

### @uiux-agent involvement — ruling
**Yes, but lightly scoped.** `/403` is a new *reachable state* of an existing shell (a nav list
that may legitimately render zero items, plus body content replacing the routed page), not a new
screen from scratch. @uiux-agent's Step 6 task is a **review-and-approve** pass on:
1. The zero-nav-item empty state (is a bare sidebar with only the header/footer acceptable, or
   does it need a "no menu items — contact your admin" hint row?), and
2. Confirming the `ForbiddenView` body content (icon/heading/copy) still meets Compassionate
   Care tokens now that it renders inside the shell's content area instead of full-bleed.
No new component inventory, no new Tailwind tokens, no new icons expected.

---

## 2. Acceptance Criteria

Format: `ID | Actor/role | Device | AC`. Negative/authorization case marked **(neg)**.

### 2.1 AUTH-BL-3 — `/403` recovery path

- **AUTH-403-01** | any clinic role with ≥1 permission | Both | Landing on `/403` (via
  `RequirePermission` redirect) renders inside the caller's own layout shell (`ClinicLayout` or
  `AdminLayout`, matching `role`) — sidebar nav items the user *does* hold permission for are
  visible and clickable.
  - [ ] Given a `doctor` lacking `billing.create` navigates to `/clinic/billing`, redirected to
        `/403`, sidebar shows `dashboard`/`pets`/`emr`/etc. (doctor's actual permission set)
  - [ ] Clicking a visible sidebar nav item navigates away from `/403` successfully
  - [ ] Sidebar collapse/expand toggle still functions on `/403`

- **AUTH-403-02** | zero-permission clinic user | Both | A user whose `permissions: []` (a
  legitimate `/auth/me` 200 response per PR #54 AC-13) can end their session from `/403`.
  - [ ] Sidebar nav list renders empty (no items — deny-by-default, no fallback items)
  - [ ] Sidebar footer logout button is present and clickable (reusing the existing
        unconditional `ClinicLayout`/`AdminLayout` logout button — no new button built)
  - [ ] Clicking logout calls `useLogout()` (clears server cache, `clearAuth()`, navigates to
        `/login`) and the user cannot reach any clinic route without re-authenticating **(neg)**

- **AUTH-403-03** | any authenticated clinic role | Both | No redirect loop between `/403` and
  `/login`.
  - [ ] Authenticated user manually navigates to `/login` → bounced to their own dashboard route
        per existing `LoginView` behavior (unchanged)
  - [ ] If that dashboard route itself 403s (e.g. zero-permission user's index route redirects to
        `/clinic/dashboard`, gated on `dashboard.view`, which they lack) the app settles on
        `/403` in the shell — it does not flicker or bounce repeatedly between `/login` and
        `/403` **(neg — this is the literal AUTH-BL-3 trap scenario)**
  - [ ] `/403` itself carries no `RequirePermission`/`RequirePlane` guard that could re-trigger
        another redirect

- **AUTH-403-04** | platform user (`plane: platform`) | Web | Out of scope for this branch's
  `RequirePermission` fix (platform routes do not currently use `requirePermission`/`/403` per
  the route table), but the "smart" `ForbiddenView` must not crash if ever reached with
  `plane==='platform'` — falls back to a plain (no-sidebar) recoverable state with a platform
  logout link, not a hard error boundary.
  - [ ] Manually forcing `plane==='platform'` + navigating to `/403` renders without throwing

### 2.2 AUTH-BL-2 — honest refresh-failure messaging

- **AUTH-REFRESH-01** | Clinic Admin | Both | Editing a role that includes the admin's own
  current role, where the subsequent `refreshPermissions()` call fails (non-ok, non-401), shows
  a warning — not the pre-existing success toast — telling the user their change was saved but
  their own session could not refresh, and to reload.
  - [ ] `PUT` role-permissions succeeds (200) — role IS actually updated server-side, unaffected
  - [ ] `refreshPermissions()` resolves to a non-ok response
  - [ ] Toast shown is type `warning`/`error`-styled with the honest copy, not `Permissions
        updated` **(neg — the exact PR #54-style silent-divergence bug this branch closes)**

- **AUTH-REFRESH-02** | Clinic Admin | Both | Same edit, refresh succeeds — success toast still
  fires (regression guard on the happy path).
  - [ ] `PUT` 200 + `refreshPermissions()` resolves 200 → `Permissions updated` toast shown

- **AUTH-REFRESH-03** | Clinic Admin | Both | A network throw inside `refreshPermissions()`
  (fetch rejects) is caught, not an unhandled promise rejection inside `onSuccess`, and surfaces
  the same honest warning as AUTH-REFRESH-01.
  - [ ] `fetch` mocked to reject → no unhandled rejection escapes `handleSave`'s `onSuccess`
  - [ ] Warning toast shown, identical UX to the non-ok-response case

- **AUTH-INV-PERM-01** | (invariant, not role-scoped) | — | `permissionsLoaded` semantics
  (INV-PERM-1) are preserved across both new failure paths: `refreshPermissions()` failing
  (non-ok or network throw) must leave `permissionsLoaded` at its pre-call value — never flips it
  to `false` (would fabricate "unknown"), never flips it to `true` with a stale/unrefreshed array
  (would fabricate "resolved").
  - [ ] Test: `permissionsLoaded` is `true` before a failing `refreshPermissions()` call and
        remains `true` (with the OLD `permissions` array, untouched) after it fails
  - [ ] `authStore.permissions` array is unchanged (not cleared, not partially patched) on
        failure — only the success path calls `set({ ...patch, permissionsLoaded: true })`

### 2.3 AUTH-BL-1 — 401-on-refresh explains itself

- **AUTH-401-01** | any authenticated clinic/platform user | Both | A 401 from
  `refreshPermissions()` still hard-redirects (existing, correct, unchanged behavior — server
  says the token is dead) but the destination `/login` shows an explanatory banner, reusing the
  existing `?reason=` mechanic (`LoginView.tsx`'s `showIdleBanner` pattern).
  - [ ] `refreshPermissions()` 401 → `clearAuth()` → `window.location.href` includes a `reason=`
        param distinct from `idle` (e.g. `reason=session-expired`)
  - [ ] `LoginView` renders a banner for the new reason value with copy explaining "your session
        needs you to sign in again" (not idle-specific copy)
  - [ ] Existing `reason=idle` banner/copy is unaffected **(neg — regression check)**

### 2.4 F-5 — vacuous assertion

- **AUTH-TEST-F5** | (test-only) | — | `useAuth.test.ts:208`'s
  `expect(sessionStorage.getItem('vc_auth')).toBeNull()` — vacuous because the store is mocked in
  that test, so the assertion can never fail — is either deleted (if AC-12 is already proven
  elsewhere against the real store) or replaced with an assertion against the real
  (non-mocked) store for that specific test.
  - [ ] Grep confirms no remaining assertion in that test reads from a mocked store while
        claiming to prove a persisted-storage invariant
  - [ ] AC-12 ("failed login leaves no persisted blob") remains proven by at least one real-store
        test (`S-4` probe referenced in the PR #54 sign-off, or an equivalent added here)

### 2.5 N-1 — malformed-body path

- **AUTH-TEST-N1** | (test-only) | — | `fetchMe()` in `useAuth.ts` throws `IdentityLoadError` when
  `res.json()` rejects (malformed body / JSON parse failure on a 200).
  - [ ] New `it.each` row: `{ ok: true, json: () => Promise.reject(new SyntaxError()) }` →
        `fetchMe` rejects with `IdentityLoadError`, `cause` set to the `SyntaxError`
  - [ ] Removing the `try/catch` around `res.json()` in `fetchMe` makes this new test fail (i.e.
        it is not itself vacuous)

### 2.6 N-2 — ruling

**Won't-fix, confirmed.** Per the PR #54 sign-off (§6): the surviving mutation (M8 — an `await`
inserted inside `onSuccess` after picker dismissal) requires deliberately adding an `await` to a
function that, post-ADR-0024, receives an already-resolved `me` and has nothing left to await.
The realistic regression this class of bug represents (identity resolution moving back out of
`mutationFn`, i.e. un-doing ADR-0024) is already caught by mutation M12. No code or test change
proposed. Action: update `.claude/roadmap/phase-history.md`'s Backlog section to close N-2 with
this rationale (task AUTH-9 below) instead of leaving it as an open carry-forward.

---

## 3. Task list

Atomic, 2–5 min each, exact paths. Sequenced by dependency, not by module grouping.

| Task ID | File(s) | Description | Depends on |
|---|---|---|---|
| AUTH-1 | `src/frontend/src/store/authStore.ts` | Wrap `refreshPermissions()`'s `fetch` call in `try/catch`; on catch, treat identically to the non-ok branch (see AUTH-2) — do not let the rejection escape to the caller. | — |
| AUTH-2 | `src/frontend/src/store/authStore.ts` | Change `refreshPermissions()`'s return type to signal outcome (e.g. `Promise<{ ok: boolean }>` or throw a typed `RefreshPermissionsError` the caller can catch) instead of the current bare-return / silent-success shape, so `RoleList` can distinguish success from failure. Bare non-ok branch and the new catch branch both report failure this way. Leave the 401 branch's `clearAuth()` + redirect behavior as the terminal action (no return value needed there). | AUTH-1 |
| AUTH-3 | `src/frontend/src/store/authStore.ts` | On the 401 branch, append `?reason=session-expired` to the `window.location.href` redirect (was bare `/login`). | AUTH-1 |
| AUTH-4 | `src/frontend/src/views/LoginView.tsx`, `src/frontend/src/i18n/*` | Add a second banner branch alongside `showIdleBanner` for `reason=session-expired`, with its own copy key (e.g. `login.sessionExpiredMessage`); keep `reason=idle` banner untouched. | AUTH-3 |
| AUTH-5 | `src/frontend/src/components/roles/RoleList.tsx` | In `handleSave`'s `onSuccess`, reorder: call `refreshPerms()` first when `userRoleIds` includes the edited role, branch on its outcome (from AUTH-2) — success path keeps `showToast({ type: 'success', message: 'Permissions updated' })`; failure path shows a new `warning`/`error`-styled toast with copy explaining the save succeeded but the session couldn't refresh, "reload to see your updated permissions." When the edited role is NOT in `userRoleIds`, behavior is unchanged (immediate success toast, no refresh call). | AUTH-2 |
| AUTH-6 | `src/frontend/src/components/roles/RoleList.tsx` | Verify (and adjust if the existing `ToastState` type doesn't support it) that the toast component can render a third visual variant for "warning," or reuse `error` styling with distinct copy — confirm against `anemal-design-system` tokens (no raw hex). | AUTH-5 |
| AUTH-7 | `src/frontend/src/App.tsx` | Replace the standalone `ForbiddenView` + its standalone `<Route path="/403" element={<ForbiddenView/>}/>` with a "smart" version: wrap in `RequireAuth`, and internally branch on `useAuthStore(s => s.role)` / `plane` to render the matching sidebar shell (reuse `ClinicLayout`'s/`AdminLayout`'s nav-list + footer-logout composition — see §1's shape-(b) recommendation) around the existing "Access Denied" body copy. Platform-plane fallback renders a minimal no-sidebar state with a logout link (does not throw). | — |
| AUTH-8 | `src/frontend/src/hooks/useAuth.test.ts` | F-5: delete the vacuous line-208 assertion, or replace it with an assertion against a real (non-mocked) store instance for that test — confirm AC-12 stays proven elsewhere first. | — |
| AUTH-9 | `src/frontend/src/hooks/useAuth.ts`, `src/frontend/src/hooks/useAuth.test.ts` | N-1: add the malformed-body `it.each` row to the `fetchMe` test suite (see AC 2.5); no production code change expected unless the test reveals a real gap. | — |
| AUTH-10 | test files for AUTH-1/2/3 | Write/extend `authStore.test.ts` (create if it doesn't exist) covering AUTH-REFRESH-01/02/03 and AUTH-INV-PERM-01 — network-throw case, non-ok case, 401-with-reason case, and the `permissionsLoaded`/`permissions` untouched-on-failure invariant. | AUTH-1, AUTH-2, AUTH-3 |
| AUTH-11 | test files for RoleList | Extend `RoleList.test.tsx` (or create) covering AUTH-REFRESH-01/02 at the component level — mock `refreshPermissions` to reject/resolve and assert the correct toast fires. | AUTH-5 |
| AUTH-12 | test files for App/guards | Add/extend a routing test (`guards.test.tsx` or a new `App.test.tsx` case) covering AUTH-403-01/02/03 — partial-permission nav works, zero-permission logout works, no login/403 flicker loop. | AUTH-7 |
| AUTH-13 | `.claude/roadmap/phase-history.md` | Move `AUTH-BL-1`, `AUTH-BL-2`, `AUTH-BL-3` out of Backlog into a new Shipped-phases row once merged; close out `F-5`/`N-1` carry-forwards; rewrite the `N-2` line to record the won't-fix ruling (§2.6) instead of leaving it open. (@pm-agent, LAST per CLAUDE.md Tracking rules.) | AUTH-1..12 |
| AUTH-14 | `.claude/roadmap/index.md`, `README.md`, `.claude/specs/implementation-status-matrix.md`, `docs/index.html` | Standard doc refresh (Updated date, test counts, next-up note) per CLAUDE.md Tracking rules — LAST, after AUTH-13. | AUTH-13 |

**Task count: 14** (12 implementation/test tasks + 2 documentation tasks, the latter run only at
Step 8 per pipeline, not before).

---

## 4. Regression risk list

| Risk | Why it matters here | Mitigation / test owner |
|---|---|---|
| `RequirePermission` → `/403` redirect (`guards/RequirePermission.tsx`) | AUTH-7 changes what `/403` renders but not the redirect trigger itself — must confirm the guard's `<Navigate to="/403" replace/>` still fires identically for every existing gated route (nothing in this branch touches the guard's own logic, only the destination component) | @qa-agent: re-run existing `guards.test.tsx` unmodified first, confirm all green before adding new cases |
| `LoginView`'s authenticated-user bounce (`isAuthenticated` → `<Navigate to={role==='admin' ? ... : ...}/>`) | AUTH-403-03 depends on this bounce behavior being unchanged — a zero-permission user must still get bounced to their (403-triggering) dashboard, not stuck on `/login` itself, for the shell-embedded `/403` fix to be reachable at all | @qa-agent: explicit test for the exact bounce → re-403 sequence, not just "no crash" |
| Idle-logout flow (`RequireAuth.tsx`'s `onLogout` → `clearServerState()` → `clearAuth()` → `window.location.href = '/login?reason=idle'`) | AUTH-3/AUTH-4 add a **second** `reason=` value down the same `window.location.href` pattern — must not collide with or overwrite `reason=idle`'s existing banner branch, and must use the same hard-redirect-not-SPA-navigate approach for consistency (both are "the token is dead, full reload") | @qa-agent: verify both banners render independently; verify idle-logout's own test suite (if any) is untouched and green |
| `useSwitchBranch` / `permissionsLoaded` (R-1 regression class from PR #54) | `useSwitchBranch` calls `setAuth` with `permissionsLoaded: true` unconditionally — this branch does not touch `useSwitchBranch`, but AUTH-2's contract change to `refreshPermissions()`'s return shape must not be assumed by any other caller of `refreshPermissions` besides `RoleList` — confirm via grep that `RoleList.tsx` is still the only production caller before changing the signature | @dev-agent: grep `refreshPermissions` call sites as the first step of AUTH-2, confirm single-caller assumption still holds (stated as fact in the BA brief; must be re-verified, not re-trusted, since it's load-bearing for a signature change) |

---

## Summary for coordinator

- **Scope:** AUTH-BL-1/2/3 + F-5 + N-1 in; N-2 ruled won't-fix (rationale recorded, backlog entry to be closed at AUTH-13); backend eslint / `countRoleUsage` / schema comment / payment-probe audit logging stay out per brief.
- **@uiux-agent:** needed, but as a light review-and-approve pass on the embedded-403 empty-nav state and body copy placement — not a from-scratch screen design.
- **AC count:** 15 (AUTH-403-01..04, AUTH-REFRESH-01..03, AUTH-INV-PERM-01, AUTH-401-01, AUTH-TEST-F5, AUTH-TEST-N1, plus the N-2 ruling itself counted as resolved rather than an AC).
- **Task count:** 14 (AUTH-1 through AUTH-14).
- **N-2 ruling:** won't-fix — the surviving mutation requires an artificial `await` that post-ADR-0024 code has no reason to contain; the realistic regression it stood in for is already covered by mutation M12. Closed via documentation update (AUTH-13), no code/test change.
- **Key open technical question for @ba-agent/@ponytail-agent:** confirm the "smart shell-aware `ForbiddenView`" approach (§1) over duplicating a `403` child route across four layout trees — recommended here on Ponytail file-count/scope grounds but not yet gate-approved.
