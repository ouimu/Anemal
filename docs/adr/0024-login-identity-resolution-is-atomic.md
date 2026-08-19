# ADR-0024 — Login identity resolution is atomic

**Status:** Accepted
**Date:** 2026-08-19
**Supersedes:** none
**Related:** ADR-0010 (remember-me is username recall, not session persistence)
**Origin:** `/grill-with-docs` Step 3.5 gate —
`docs/superpowers/plans/2026-08-19-branch-select-login-flash-grill.md`

## Context

Clinic login is two-step for multi-branch users: `POST /auth/login` returns a
signed `pendingToken` plus the branch list, then `POST /auth/select-branch`
exchanges a chosen branch for the real access token. A session is only usable
once the client also knows *what the user may do*, which comes from
`GET /auth/me` — never from the login response.

The client treated those as three independent events. `applyLogin()` fetched
`/auth/me`, called `setAuth()`, then called `refreshPermissions()` which fetched
`/auth/me` **again**. Meanwhile `selectBranchMutation.onSuccess` cleared the
branch-picker state *before* awaiting any of it.

Three defects followed from that non-atomicity:

1. **The reported bug.** Clearing the picker before the token existed re-rendered
   the login credentials form — the branch picker is a conditional inside
   `LoginView`, not its own route — so users watched the login screen for a full
   `/auth/me` round-trip before being redirected. On a clinic tablet this reads
   as "I got kicked out".
2. **A duplicated identity call** on every single login.
3. **Half-built sessions.** `fetchMe()` swallows every error and returns `null`,
   so a failed identity fetch still produced a `setAuth()` — a token persisted to
   `sessionStorage`, surviving F5, for an identity the client could not resolve.
   A disabled account returns **404** from `/auth/me` (`auth.service.ts:253`),
   not 401, so the existing 401 ejector never fired for exactly the case that
   most needed it.

The tempting repairs were both wrong. Setting `permissionsLoaded: true` with an
empty permission array manufactures an authorization decision on the client from
a failed network call, and traps the user in a `/403` ⇄ `/login` bounce with no
nav and no logout. Leaving it `false` spins forever, because after this change
nothing re-attempts `/auth/me` from the login path.

## Decision

**A clinic session is established only when branch selection and identity
resolution have both succeeded. Partial results are discarded.**

1. `GET /auth/me` is folded into the same mutation as the branch-selection POST.
   The pair is one atomic unit: one `isPending`, one `isError`, one retry.
2. On any failure the client writes **nothing** — no `setAuth`, no
   `sessionStorage`, no navigation. The branch picker stays mounted with a
   specific error naming which half failed. Retry is re-tapping the branch.
3. The same guarantee applies to the single-branch / admin path, which shows no
   picker. One rule for both login shapes.
4. `permissionsLoaded` is a **required** field on the `setAuth` payload. It was
   previously never written at all — `set(data)` is a shallow merge and
   `AuthData` had no such key, so the flag was silently inherited. Making it
   required turns the `useSwitchBranch` regression into a compile error.
5. Exactly one `GET /auth/me` per login.

`permissionsLoaded` remains a **loading** flag and never an authorization input.
`hasPermission()` stays a pure array-membership test, so "this user has no
permissions" and "we do not yet know this user's permissions" remain distinct
states.

## Consequences

**Positive**
- The reported flash is structurally impossible: nothing can render between
  branch selection and the dashboard, because the picker is not dismissed until
  auth state exists.
- One fewer HTTP round-trip on every clinic login.
- No half-session can be persisted. A revoked user whose `/auth/me` 404s is now
  rejected at login instead of receiving a live token.
- Deny-by-default is strengthened — the client can no longer fabricate an empty
  permission set from a network error.

**Negative / risks**
- The user waits through both round-trips before the dashboard appears. This is
  honest latency, previously hidden behind a screen showing the wrong thing.
- One new i18n key in `en` + `th`.
- The retry story rests on two backend properties that are now load-bearing for
  frontend UX and must not regress:
  - **`pendingToken` is reusable.** Verification in `selectBranch()` is
    stateless — no consumption. Guarded by
    `src/backend/tests/integration/codex-review-regression.test.ts:307`. If it
    ever became single-use, a user whose `/auth/me` failed would be stranded on a
    picker that can never succeed.
  - **Retries do not burn the login rate limit.** `loginRateLimiter` sets
    `skipSuccessfulRequests: true`, and `POST /auth/select-branch` still returns
    200 on the retried path — it is the following `GET /auth/me` that fails.
    Merging the two into a single backend endpoint that 5xx's would silently
    destroy this property and rate-limit staff out mid-shift.

**Out of scope (backlog)**
- `AUTH-BL-1` — `refreshPermissions()` 401 → `clearAuth()` + hard
  `window.location.href` redirect.
- `AUTH-BL-2` — `refreshPermissions()` non-ok non-401 → bare return leaves
  `permissionsLoaded` stuck `false` forever.
- `AUTH-BL-3` — `/403` is an unrecoverable dead end for any legitimately
  zero-permission session: it is a stub outside `RequireAuth` with no nav and no
  logout, and `LoginView` bounces authenticated users away from `/login`.

After this change `refreshPermissions()`'s only remaining production caller is
`RoleList.tsx:155` (self-role-edit refresh).
