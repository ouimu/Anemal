# BA Sign-off — Branch-Select Login Flash / Delayed Dashboard Redirect

**Branch:** `fix/branch-select-login-flash`
**Pipeline step:** STEP 3 (@ba-agent — requirements validation, authorization design, gap analysis)
**Reviews:** `docs/superpowers/plans/2026-08-19-branch-select-login-flash-pm-tasks.md` (STEP 1+2)
**Author:** @ba-agent
**Date:** 2026-08-19

---

## VERDICT: APPROVED WITH CONDITIONS

| Part | Verdict | Note |
|---|---|---|
| **Part 1 — reorder** (`await applyLogin()` → `setBranchSelection(null)` → `navigate()`) | **APPROVED as specified** | Correct diagnosis, correct fix, no authorization surface touched. It is also a *prerequisite* for C1 below — see §Q2.4. |
| **Part 2 — dedupe** (`applyLogin` sets `permissionsLoaded` from the single `fetchMe()` result) | **APPROVED ONLY WITH C1–C3** | The happy path is sound and honours the existing contract. The **failure path as currently specified is unsafe** and must be defined before `/write-plan`. |
| **D2/D3 out-of-scope ruling** | **APPROVED — claim verified** | Only remaining production caller of `refreshPermissions()` is `RoleList.tsx:155`. See §Q6. |
| **PM's 8 AC** | **INCOMPLETE** | 5 new AC added (AC-9 … AC-13). See §Q5. |

**Blocking conditions (all must be resolved before `/write-plan`):** C1, C2, C3.
**Non-blocking conditions (fold into the plan):** C4, C5, C6.

---

## 0. Evidence base (verified, not assumed)

| Fact | Source |
|---|---|
| `setAuth` calls `set(data)` where `data: AuthData` has **no** `permissionsLoaded` key. Zustand `set` is a **shallow merge** → `permissionsLoaded` is **left untouched**, not forced false. | `src/frontend/src/store/authStore.ts:107–113` + `AuthData` iface `:10–25` |
| `clearAuth` is the only place that explicitly writes `permissionsLoaded: false`. | `authStore.ts:120` |
| `fetchMe()` swallows every failure: `if (!res.ok) return null`, `catch { return null }`. Uses raw `fetch`, **not** the axios instance — so the global 401 interceptor never fires for it. | `useAuth.ts:46–53`; `utils/api.ts:19,27–41` |
| A **disabled user** hitting `/auth/me` gets **404**, not 401 (`getMe` throws `AuthError('User not found', 404)` on `!user \|\| !user.isActive`). | `src/backend/services/auth.service.ts:251–253` |
| `/auth/me` 401 is produced only by `authMiddleware`: missing/malformed header, invalid/expired token, pending `branch_select` token reuse, `TENANT_SUSPENDED`. | `src/backend/middlewares/auth.middleware.ts:20–57` |
| `POST /auth/select-branch` re-verifies server-side: user still active (401), branch exists (404), non-admin branch assignment (403). Server is the sole authority. | `auth.service.ts:140–171`; `routes/auth.routes.ts:14` |
| `/403` is a dead-end stub: rendered **outside** `RequireAuth`, no nav, no logout, no recovery control. | `src/frontend/src/App.tsx:65–72, 180` |
| `LoginView` redirects any authenticated visitor away from `/login`. A session with a token but zero permissions therefore **cannot self-recover** to the login screen. | `LoginView.tsx:42–47` |
| The `permissionsLoaded=false` spinner renders **inside** the layout `Outlet`, so the sidebar logout button is still reachable. | `RequirePermission.tsx:49–55`; `AdminLayout.tsx:104`, `ClinicLayout.tsx:104`, `SettingsLayout.tsx:129` |
| TanStack Query **v5.101**: `await this.options.onSuccess?.(...)` runs **inside** the try; a throw lands in `catch` → `onError` → `dispatch({type:'error'})`. A throw from `onSuccess` **does** set `isError`. | `@tanstack/query-core/build/modern/mutation.js:123, 146, 191`; `src/frontend/package.json:15` |
| `LoginView` already renders an error box on `selectBranchMutation.isError`. | `LoginView.tsx:154–159` |
| Platform plane uses a **different store** (`platformAuthStore`, no `permissionsLoaded`, no `refreshPermissions`), a different axios instance, and a different login view. | `store/platformAuthStore.ts`; `views/platform/PlatformLoginView.tsx:9,24,34` |

---

## Q1 — Does routing permissions through `applyLogin`'s `fetchMe()` violate the `permissionsLoaded` contract?

**Answer: it HONOURS the contract. The comment is about provenance, not about which function makes the call.**

### The invariant `permissionsLoaded` actually protects

> **INV-PERM-1:** When `permissionsLoaded === true`, the `permissions` array in the store is the
> **authoritative, server-resolved permission set for the currently held token**, obtained from
> `/auth/me`. When `false`, the permission set is **UNKNOWN** — not "empty".

`permissionsLoaded` exists for one reason: `hasPermission()` is deny-by-default over an array, so
`permissions: []` is **ambiguous** — it is simultaneously the legitimate answer *"you hold no
permissions"* and the pre-fetch default *"we have not asked yet"*. `permissionsLoaded` is the bit that
disambiguates them, so `RequirePermission` does not 403 a legitimate user during the load window
(`RequirePermission.tsx:49`).

The invariant is therefore **not** "only `refreshPermissions()` may set this flag". It is
**"never claim to know the permission set when you don't"**.

### Applying that to Part 2

- `fetchMe()` calls `GET /auth/me` — the same endpoint, with the same freshly-issued token, resolved
  by the same server-side `resolvePermissions()`. Provenance is identical.
- `applyLogin` **already** writes `me?.permissions` into `setAuth` (`useAuth.ts:73`). The current code
  already sources permissions from `/auth/me` at login; it simply refuses to admit it, then re-fetches
  the identical endpoint solely to flip a boolean (`authStore.ts:163`). That second call is pure waste.
- Therefore setting `permissionsLoaded: true` from a **successful** `fetchMe()` is contract-**compliant**.

### The contract IS violated if — and only if —

`permissionsLoaded: true` is set when `me === null`, because then `permissions` is the `?? []` default
(`useAuth.ts:73`) whose provenance is *"the fetch failed"*, not *"the server said none"*. That is
option (a) in Q2, and it is the exact failure INV-PERM-1 exists to prevent. This is why C1 is blocking.

**Documentation defect (C5):** `authStore.ts:28` (`"True once refreshPermissions() has written…"`) and
`:111` (`"permissionsLoaded stays false"`) both describe the mechanism incorrectly today —
`set(data)` does **not** write `permissionsLoaded` at all. Both comments must be corrected to state
INV-PERM-1.

---

## Q2 — RULING: what must happen when `fetchMe()` returns null

### Q2.1 The ruling

> **RULING (binding, C1): Neither (a) nor (b). A `fetchMe()` failure must FAIL THE LOGIN ATOMICALLY.**
>
> When `fetchMe()` returns `null` inside `applyLogin`:
> 1. **`setAuth()` MUST NOT be called.** No token in the store, nothing written to `sessionStorage`.
> 2. **No navigation.** `navigate()` must not run.
> 3. **`setBranchSelection(null)` must not run** — the branch picker stays on screen (this is why Part 1's
>    reorder is a prerequisite, not merely cosmetic).
> 4. **A visible error is surfaced** on the screen the user is already looking at, telling them sign-in
>    could not be completed and to try again.
> 5. **The retry is the user re-tapping the branch** (or re-submitting credentials on the direct path).
>    No automatic retry (C4).
>
> `permissionsLoaded` is never set to `true` on this path — because no auth state is created at all, the
> question becomes moot. That is the point: **do not partially apply a login.**

### Q2.2 Why (a) is wrong — it manufactures an authorization answer and creates a trapped session

`permissionsLoaded: true` + `permissions: []` asserts *"the server resolved your permission set and it
is empty."* That is a **false statement about an authorization decision**, synthesised on the client
from a failed network call. It violates INV-PERM-1 and it violates the project rule that the server is
the security boundary — here the client would be inventing a deny where the server never issued one.

Worse, the resulting state is **unrecoverable without closing the tab**:

| Step | State |
|---|---|
| Token present in store + `sessionStorage` | `isAuthenticated() === true` |
| User lands on `/clinic/dashboard` | `RequirePermission perm="dashboard.view"` → `permissions: []` → `Navigate to="/403"` |
| `/403` renders `ForbiddenView` | Stub outside `RequireAuth`: **no nav, no logout, no retry** (`App.tsx:65–72`) |
| User types `/login` | `LoginView.tsx:42` sees `isAuthenticated` → `Navigate` back to the dashboard → back to `/403` |

Net user experience on a shared clinic tablet: **"Access Denied" with no way out**, for a user whose
only sin was a Wi-Fi blip during login. Escape requires closing the tab or clearing `sessionStorage` —
i.e. a support call, every time. Unacceptable.

### Q2.3 Why (b) is wrong — it is a lie that never resolves, and it leaves a live token behind

`permissionsLoaded: false` is *semantically* honest ("unknown"), which is why it is the lesser evil of
the two — and it is not a total dead end, because the spinner renders inside the layout `Outlet`, so
the sidebar logout button is still reachable (`ClinicLayout.tsx:104`). But:

- The spinner **never resolves**: nothing in the new flow ever re-attempts `/auth/me` (that was
  `refreshPermissions()`'s job, and Part 2 removes it from this path).
- It is indistinguishable from "slow network", so users will wait, then re-tap, then call support.
- **A valid token for a possibly-revoked identity has been written to `sessionStorage`.** It survives
  F5 (`loadPersisted()`, `authStore.ts:89–105`) and will be attached to every subsequent request by
  the axios interceptor (`api.ts:21–25`). Establishing a session you could not verify is the wrong
  default.

### Q2.4 Why the third option is both the safest AND the cheapest

The failure taxonomy of `fetchMe() === null` converges on one answer:

| Cause | HTTP | Correct outcome |
|---|---|---|
| Tablet Wi-Fi drop / offline mid-login | (network throw) | Don't sign in; let them retry |
| Backend 5xx | 5xx | Don't sign in; let them retry |
| Malformed body / JSON parse failure | 200 | Don't sign in; let them retry |
| Tenant suspended between step 1 and step 2 | 401 `TENANT_SUSPENDED` | **Must not** sign in |
| User deactivated between select-branch and `/auth/me` | **404** | **Must not** sign in |

Every branch says *do not establish a session*. One rule covers all five. And it is implementable
with **no new UI and no new state**:

- Part 1 already leaves `branchSelection` non-null until `applyLogin` resolves → the picker is still
  on screen when the failure happens.
- TanStack Query v5 awaits `onSuccess` inside its try/catch (`mutation.js:123,146,191`), so an error
  raised from `applyLogin` inside `selectBranchMutation.onSuccess` sets `isError` → the **existing**
  error box at `LoginView.tsx:154–159` renders automatically.

So the safe ruling is also the smallest diff — it satisfies the Ponytail simplicity gate rather than
fighting it. (Exact mechanism — throw vs. return-flag vs. folding `fetchMe` into `mutationFn` — is a
`/write-plan` decision; the **behaviour** above is the requirement.)

### Q2.5 Explicit non-requirement (scope control, C4)

Do **not** add automatic retry/backoff around `fetchMe()`. The user re-tapping the branch is the retry,
the picker is already on screen, and a retry loop would multiply `/auth/me` load during exactly the
incidents (backend 5xx) where load is the problem. AC-2's "exactly one `GET /auth/me`" must hold on the
failure path too (AC-9).

---

## Q3 — Is dropping `refreshPermissions()` from the login path a security regression?

**Answer: No. With C1 applied it is a net security IMPROVEMENT. Three independent reasons.**

**1. The 401 branch is cleanup, not a gate.** In today's code `refreshPermissions()` runs *after*
`setAuth()` has already written the token to `sessionStorage` (`useAuth.ts:61–79`). Its 401 branch
(`authStore.ts:136–139`) therefore *undoes* a session that was already established — it never
prevented one. Under C1 the session is **never created**, so there is nothing to undo and no window in
which a revoked identity's token sits in `sessionStorage`. Strictly stronger.

**2. For the exact scenario asked about — a revoked/disabled user — today's 401 branch does NOT fire.**
`getMe` throws **404** for `!user.isActive` (`auth.service.ts:253`), not 401. So a user disabled in the
race window between `POST /auth/select-branch` succeeding and `GET /auth/me` returning today falls into
the **D3** branch (`if (!res.ok) return`, `authStore.ts:142`) — token written, `permissionsLoaded` stuck
false, permanent spinner, session alive. **The current code already fails to eject the disabled user;
it just hangs instead.** C1 fixes that case rather than regressing it. (Note also: `selectBranch`
re-checks `isActive` server-side and 401s, so the user cannot even reach `applyLogin` unless disabled
inside that microsecond window.)

**3. No authorization guarantee depends on the client at all, and a second 401 ejector already exists.**
Every request is enforced server-side (`authMiddleware` → `requirePlane` → `requirePermission`). The
client-side 401 handling is a UX affordance. Independently of `refreshPermissions()`, the axios response
interceptor (`api.ts:27–41`) performs `clearAuth()` + hard redirect on **any** 401 from **any** `api.*`
call — and every real screen loads data through `api`. A stale session would be ejected on the first
data fetch regardless.

**Behaviour delta to accept knowingly:** for the tenant-suspended-mid-login edge case, the user will see
"could not complete sign-in" on the picker instead of being hard-redirected to `/login`. No session is
created either way; the security-relevant property is unchanged. (`login` already checks
`tenant.isActive` at step 1 — `auth.service.ts:55` — so suspension must land between step 1 and step 2.)

---

## Q4 — Plane isolation, admin bypass, and `useSwitchBranch`

| Path | Verdict | Evidence |
|---|---|---|
| **Admin bypass / single branch** (`branchId === null`, `loginMutation.onSuccess`, no picker) | **Affected — must be covered, see C3** | Shares `applyLogin` (`useAuth.ts:105`). Today it calls it as `void applyLogin(...).then(...)` with **no `.catch`**. Under C1 a `fetchMe` failure becomes a floating rejection: no navigate, no session (correct), but **no error shown and no `isError`** — a silent dead stop on the login form. Must be handled explicitly. |
| **Platform plane** (`/platform/*`) | **Unaffected — confirmed** | Separate store (`platformAuthStore.ts`, no `permissionsLoaded`, no `refreshPermissions`), separate axios instance (`platformApi`), separate login view (`PlatformLoginView.tsx:9,24,34`), separate route tree. `authStore.refreshPermissions()`'s `plane === 'platform'` branch (`authStore.ts:131`) is unreachable dead code — note only, not this branch's problem. **Planes do not fuse.** |
| **`useSwitchBranch`** (post-login branch change) | **AT RISK — highest-probability regression, see C2** | It calls `state.setAuth({...})` with `AuthData` only (`useAuth.ts:162–175`). It works today **only because `set(data)` is a shallow merge that leaves `permissionsLoaded` untouched** (i.e. `true`). If AUTHFLOW-4 changes `setAuth` to always write `permissionsLoaded` from a parameter defaulting to `false`, **every mid-session branch switch turns every permission-guarded route into a permanent spinner** — permissions are still in the store, but the flag now says "unknown". |
| **`resetBranchSelection`** ("back to login" button) | **Unaffected** | Distinct user-initiated call outside `onSuccess` (`useAuth.ts:133`). |
| **Session restore after F5** | **Unaffected** | `permissionsLoaded: persisted !== null && persisted.permissions.length > 0` (`authStore.ts:105`) — independent of `setAuth`. C1 improves it: a failed login now persists nothing, so there is no half-session to restore. |

---

## Q5 — Gap analysis on the PM's 8 acceptance criteria

**PM AC-1 … AC-8: accepted as written.** They are specific, observable and testable. Gaps are all on
the failure axis — the PM's set covers the happy path and the *mutation-level* error path (AC-6/AC-7)
but has **no AC for the `fetchMe()` failure path at all**, which is precisely where the risk is.

### New acceptance criteria (BA-added, mandatory)

**AC-9 (failure path — branch-select).**
Given a multi-branch user has tapped a branch and `POST /auth/select-branch` succeeded,
when `GET /auth/me` fails (network throw, 401, 404, or 5xx — parameterise the test across all four),
then: `setAuth()` is not called; `sessionStorage.getItem('vc_auth')` is null; `navigate()` is not called;
`branchSelection` is still non-null (picker still rendered); a user-visible error is shown; and
**exactly one** `GET /auth/me` request was issued (no retry).

**AC-10 (failure path — direct / admin-bypass login).**
Given an admin or single-branch user submits valid credentials (no picker), when `GET /auth/me` fails,
then: `setAuth()` is not called; nothing is written to `sessionStorage`; `navigate()` is not called; the
user remains on the credentials form with a **visible** error (not a silent stop, not an unhandled
promise rejection); and re-submitting the form retries cleanly.

**AC-11 (`permissionsLoaded` explicitness + switch-branch regression guard).**
Given any `setAuth()` call site, when it runs, then `permissionsLoaded` is written **explicitly** by that
call — never inherited by shallow merge. Specifically: after `useSwitchBranch` succeeds mid-session,
`useAuthStore.getState().permissionsLoaded === true` **and** `permissions` is unchanged, so no
`RequirePermission` route re-enters its loading state.

**AC-12 (no half-session persisted).**
Given a login attempt that fails at the `fetchMe()` step, when the tab is refreshed (F5),
then `loadPersisted()` finds no auth blob and the user lands on `/login` with the credentials form —
no restored token, no restored `branchSelection`.

**AC-13 (a genuinely permission-less user is still denied — "none" ≠ "unknown").**
Given `GET /auth/me` returns **200** with `permissions: []` (a legitimately zero-permission role),
when login completes, then `permissionsLoaded === true`, `permissions === []`, the session **is**
established, and `RequirePermission` denies to `/403`. This behaviour is unchanged by this fix and must
stay distinguishable from AC-9's failure case. (The resulting `/403` dead end is a **pre-existing**
defect — see AUTH-BL-3; do not fix it here.)

### Testability note on PM AC-8

AC-8 says `refreshPermissions()` must be "byte-for-byte unchanged". Byte-identity is not a runtime
assertion — restate it as: `RoleList`'s self-role-edit path still calls `refreshPermissions()` and its
observable behaviour (permissions refreshed, `permissionsLoaded` true) is unchanged; enforce the
"unchanged" part via the existing `RoleEditorView.test.tsx` / `RoleList.test.tsx` suites plus diff review.

---

## Q6 — Validation of the PM's D2/D3 out-of-scope ruling

**Verdict: the PM's claim is CORRECT and verified.**

Exhaustive search of `src/frontend/src` for `refreshPermissions`:

| Site | Kind | Post-fix status |
|---|---|---|
| `store/authStore.ts:43, 127` | declaration + implementation | remains, untouched |
| `hooks/useAuth.ts:79` | **login-path caller** | **removed by this fix** |
| `components/roles/RoleList.tsx:155` (invoked at the `updateMut.onSuccess` self-role check) | production caller | **only remaining production caller** |
| `hooks/useAuth.test.ts:37`, `__tests__/RoleEditorView.test.tsx:55,103,258,278`, `__tests__/RoleList.test.tsx:6–7` | test mocks | n/a |

So after this fix, D2 (401 → `clearAuth()` + `window.location.href='/login'`) and D3 (non-ok non-401 →
bare return, `permissionsLoaded` stuck false) are reachable **only** from the RoleList self-role-edit
path. They cannot fire on the login path. **Ruling upheld — keep them out of scope**, and Ponytail
scope-minimisation supports that.

**Two corrections to the PM's reasoning (neither changes the ruling):**

1. The PM writes that the reported "kicked out" symptom "was very likely the intermittent-401 race
   hitting `refreshPermissions()`". Plausible for *tenant-suspended / expired-token* 401s, but **not**
   for the disabled-user case — that returns **404**, which hits D3 (permanent spinner), not D2
   (redirect). Both symptoms are consistent with the reports; the dedupe removes both from the login
   path either way.
2. D3 acquires a **second** dormant caller shape under Part 2 if C1 is not applied — the "stuck
   spinner" would simply move from `refreshPermissions()` into `applyLogin()`. C1 is what actually
   removes D3 from the login path rather than relocating it. This is the strongest argument for C1.

**Backlog — confirmed, keep as PM wrote them, plus one more:**

- `AUTH-BL-1` — `refreshPermissions()` 401 hard-redirects instead of a graceful in-SPA session-expired
  prompt (RoleList path only). *(as PM)*
- `AUTH-BL-2` — `refreshPermissions()` leaves `permissionsLoaded` permanently false on non-401 non-ok
  (RoleList path only). *(as PM)*
- **`AUTH-BL-3` (NEW, BA-raised)** — `/403` is an unrecoverable dead end: the stub has no nav/logout
  (`App.tsx:65–72`) and `LoginView.tsx:42` bounces authenticated users away from `/login`, so any
  session that legitimately holds zero permissions (misconfigured custom role) traps the user until the
  tab is closed. Pre-existing, unrelated to this fix, but it is what makes option (a) in Q2 so harmful.
  Suggested fix: add a "Sign out" action to `ForbiddenView`.

---

## Conditions of approval

| ID | Blocking | Condition |
|---|---|---|
| **C1** | **YES** | Implement the Q2 ruling: a `fetchMe()` failure fails the login atomically — no `setAuth`, nothing persisted, no navigate, picker/form stays, visible error. `permissionsLoaded: true` may be written **only** on a successful `/auth/me` response. |
| **C2** | **YES** | `setAuth` must write `permissionsLoaded` **explicitly** at every call site (never rely on Zustand's shallow merge). `useSwitchBranch` must keep it `true`. Covered by AC-11. |
| **C3** | **YES** | The direct/admin-bypass path (`loginMutation.onSuccess`, `useAuth.ts:105`) must handle an `applyLogin` failure with the same guarantees — no silent floating rejection. Covered by AC-10. This is a deliberate, approved change to the "unchanged end-to-end" wording of PM AC-4. |
| **C4** | no | No automatic retry/backoff around `fetchMe()`. Exactly one `GET /auth/me` per login attempt, success or failure. |
| **C5** | no | Correct the misleading contract comments at `authStore.ts:28` and `authStore.ts:111` to state INV-PERM-1 (`permissionsLoaded === true` ⇒ permissions are the authoritative `/auth/me` set; `false` ⇒ **unknown**, not empty). |
| **C6** | no | Add the AC-9…AC-13 tests to the AUTHFLOW task list (they belong with AUTHFLOW-1/2/7, before AUTHFLOW-3/5 land, per `/tdd`). |

---

## Security, permissions & plane boundary

| Check | Result |
|---|---|
| Permission codes touched | **None.** No permission code is added, removed, or re-mapped. `references/permission-matrix.md` unchanged. |
| Deny-by-default preserved | **Yes** — and strengthened: C1 stops the client from synthesising a deny out of a failed fetch (INV-PERM-1). |
| Server as security boundary | **Unchanged.** `selectBranch` still re-verifies user-active / branch-exists / branch-assignment (`auth.service.ts:154–171`); no client-side trust is introduced. PM AC-7 correctly asserts this. |
| Plane isolation | **Unchanged.** Clinic and platform stores/APIs/routes remain fully separate; nothing in this fix crosses the boundary. |
| PII / audit | No new PII surface, no audit-log change. `clearServerState()` cache-purge paths (HI-09) are untouched. |
| Token handling | **Improved** — C1 removes the window in which an unverified session's token is written to `sessionStorage`. |

## NFR impact

| NFR | Impact |
|---|---|
| Performance | **Positive.** One `GET /auth/me` per login instead of two — halves login-path auth round-trips and removes the post-redirect dashboard spinner (the reported delay). |
| Availability / resilience | **Positive.** Login now fails cleanly and retryably under network loss instead of producing a trapped or hung session. |
| Maintainability | **Positive.** `permissionsLoaded` gains a single, stated invariant (C5) instead of a comment that misdescribes the mechanism. |
| Scalability | Marginal: ~50% fewer `/auth/me` calls at shift-change login peaks. |
| Security | Neutral-to-positive (see Q3). |

## Risk register

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-1 | `setAuth` refactor forces `permissionsLoaded:false` → every mid-session branch switch spins forever | **M** | **H** | C2 + AC-11 (explicit test on `useSwitchBranch`) |
| R-2 | C1 implemented only on the branch-select path; admin/direct path left with a silent floating rejection | **M** | **M** | C3 + AC-10 |
| R-3 | Implementer picks option (a) for expedience → trapped `/403` sessions in production on flaky tablet Wi-Fi | L | **H** | C1 is blocking; AC-9 asserts no `setAuth` and empty `sessionStorage` |
| R-4 | Error copy for the `fetchMe` failure is misleading ("branch selection failed" when select-branch actually succeeded) | **M** | L | Acceptable for this branch — reuse `login.selectBranchError`; a distinct i18n key is optional, flag at `/grill-with-docs` |
| R-5 | Regression in `loginMutation` goes unnoticed (no visible picker to flash) | L | **M** | PM AC-4 + AUTHFLOW-6 full-suite re-run + AC-10 |

## Assumptions

1. `fetchMe()` keeps using raw `fetch` (not the `api` axios instance), so the global 401 interceptor
   (`api.ts:27–41`) does **not** apply to it. If the implementer switches it to `api`, a 401 would
   trigger `clearAuth()` + hard redirect — a **different** behaviour that must be re-reviewed.
2. The mechanism for surfacing the C1 error is left to `/write-plan`; TanStack Query v5's
   `onSuccess`-throw semantics (verified above) make the zero-new-UI route available but not mandatory.
3. `/auth/me` returning 200 with a well-formed body is treated as authoritative; no client-side
   validation of the permission strings is required or wanted.

## Definition of Ready

| Criterion | Status |
|---|---|
| Objective stated | Yes (PM §1) |
| Actors/roles named | Yes — all clinic roles; `clinic_admin` admin-bypass path called out |
| Permission codes assigned | N/A — no code changes; enforcement contract restated |
| Business rules listed | Yes — INV-PERM-1 formalised (Q1) |
| Exceptions covered | Yes — **after** AC-9…AC-13 (was the gap) |
| NFR impact noted | Yes |
| AC testable by @qa-agent | Yes — 13 AC, all observable |
| Risks & dependencies recorded | Yes — R-1…R-5, AUTH-BL-1/2/3 |

**READY — conditional on C1, C2, C3 being resolved during `/grill-with-docs`.**

---

## Handoff

**Next step (mandatory, per CLAUDE.md):** `/grill-with-docs` (STEP 3.5). `/write-plan` is BLOCKED until
it runs and C1–C3 are resolved.

Grill agenda — the three things to stress-test:
1. **C1's exact error surface** — throw from `onSuccess` vs. fold `fetchMe` into `mutationFn` vs. explicit
   error state; and whether a distinct i18n key is warranted (R-4).
2. **C2's `setAuth` signature** — optional param vs. a separate `setAuthWithPermissions`; which shape
   makes the `useSwitchBranch` regression (R-1) structurally impossible rather than merely tested.
3. **C3's direct-login path** — making `loginMutation.onSuccess` async/awaited changes PM AC-4's
   "unchanged end-to-end" wording; confirm that deviation is accepted and reword AC-4.
