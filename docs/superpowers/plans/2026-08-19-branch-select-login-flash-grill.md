# Grill Record — Branch-Select Login Flash Fix

**Pipeline step:** 3.5 (`/grill-with-docs`) — MANDATORY gate before `/write-plan`
**Date:** 2026-08-19
**Branch:** `fix/branch-select-login-flash`
**Inputs:**
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-pm-tasks.md` (@pm-agent, Step 2)
- `docs/superpowers/plans/2026-08-19-branch-select-login-flash-ba-signoff.md` (@ba-agent, Step 3 — APPROVED WITH CONDITIONS, C1/C2/C3)

**Outcome:** ALL FINDINGS RESOLVED — gate PASSED, `/write-plan` unblocked.

---

## 1. Blocking conditions from BA sign-off — resolutions

### C1 — Atomic failure when `fetchMe()` returns null

**Question grilled:** what exactly happens on screen, and by what mechanism, when
`GET /auth/me` fails after `POST /auth/select-branch` has already succeeded.

**Human ruling (asked in plain language, both answers "recommended" option):**
- Failure must show a **specific** message naming the cause — distinguish
  "could not select branch" from "could not load your permissions".
- The user must **stay on the branch picker**. No bounce back to the
  username/password form; retry = re-tap the branch, no re-typing.

**Engineering mechanism (decided by coordinator — implementation detail, not a
human decision):** fold `fetchMe()` into `selectBranchMutation`'s `mutationFn`
so `POST /auth/select-branch` + `GET /auth/me` are one atomic unit.

Rationale over the alternative (throw from `onSuccess`):
- `onSuccess` firing and *then* throwing is a confusing state to debug later.
- With the fetch inside `mutationFn`, TanStack's `isError` is the honest
  signal, `isPending` covers both round-trips (the picker's existing button
  spinner already reads `selectBranchMutation.isPending`), and retry is just
  re-invoking the mutation.
- No new component state and no new UI — the error box at
  `LoginView.tsx:154-159` already renders on `selectBranchMutation.isError`.

**RESOLVED.**

### C2 — `permissionsLoaded` must be written explicitly at every `setAuth` call site

**Finding restated:** `setAuth` never writes `permissionsLoaded`. `set(data)` is a
Zustand shallow merge and `AuthData` has no such key, so the flag is *inherited*
from whatever it was. The comment at `authStore.ts:111` describes intent, not
mechanism. This accident is the only reason `useSwitchBranch` works today
(regression **R-1**: making `setAuth` default the flag to `false` turns every
mid-session branch switch into a permanent spinner).

**Decision (coordinator — pure code-safety question, no user-visible choice):**
add `permissionsLoaded` as a **required** field on the `setAuth` payload.

Rationale: TypeScript then forces all call sites — `applyLogin`,
`useSwitchBranch`, platform login — to state the value explicitly. R-1 becomes a
**compile error** rather than a runtime spinner guarded only by a test. Rejected
alternatives: a separate `setAuthWithPermissions()` (leaves the fragile implicit
inherit in place for anyone calling plain `setAuth`) and a post-hoc
`set({ permissionsLoaded: true })` (smallest diff, leaves R-1 exactly as
reachable as today).

**RESOLVED.**

### C3 — Direct / admin login path has the same silent-failure defect

`useAuth.ts:105` calls `void applyLogin(...).then(...)` with no `.catch`, so a
`fetchMe()` failure on the no-picker path stops silently: no session (correct)
but no error shown either.

**Decision:** fix both paths to the same rule — atomic failure, visible error.
Shipping two different failure behaviours for the same function is not
defensible, and the human's C1 ruling ("show a specific message") applies
equally to a single-branch clinic and to an admin.

**PM AC-4 must be reworded** from "the admin-bypass path is unchanged
end-to-end" to: *"unchanged on success; on failure it now surfaces an error
instead of stopping silently."* Flagged for `/write-plan`.

**RESOLVED.**

---

## 2. New findings raised during grilling (not in the BA sign-off)

### G1 — Is `pendingToken` single-use? (CRITICAL — would have broken the whole retry design)

The C1 resolution depends entirely on "stay on the picker and re-tap the branch"
being a *working* retry. If `POST /auth/select-branch` consumed the pending token
on the first (successful) call, the retry would fail with an invalid-token error
and the user would be stranded on a picker that can never succeed — strictly
worse than the bug being fixed.

**Verified:** `handleSelectBranch` (`auth.controller.ts:27-33`) calls
`selectBranch(pendingToken, branchId)` with no consumption or revocation step —
verification is stateless. Confirmed by the existing regression test
`src/backend/tests/integration/codex-review-regression.test.ts:307`
— *"the same pending token still works on POST /auth/select-branch"*.

**RESOLVED — retry design is sound.** The write-plan must add a frontend test
asserting the retry path, since this backend property is now load-bearing for
frontend UX and nothing currently links the two.

### G2 — Does the retry burn the login rate limit? (would have made retry self-defeating)

`POST /auth/select-branch` is wrapped in `loginRateLimiter`
(`auth.routes.ts:14`), `max: MAX_LOGIN_ATTEMPTS` per window. If repeated retries
counted against it, a user hitting a flaky network would be rate-limited out of
their own clinic during a shift.

**Verified:** `rate-limit.middleware.ts:30` sets `skipSuccessfulRequests: true`.
Under the C1 design the `POST /auth/select-branch` itself returns **200** (it is
the subsequent `GET /auth/me` that fails), so each retry is skipped by the
counter.

**RESOLVED — retries do not consume login attempts.** Note this is *because*
`fetchMe` is folded into the same mutation while remaining a separate HTTP call;
if a future refactor merges branch selection and identity into one backend
endpoint that 5xx's, this property is lost. Recorded in the ADR consequences.

### G3 — i18n cost of the "specific message" ruling

Two locales only: `en` (`i18n/index.ts:127-128`) and `th` (`:457-458`). One new
key × 2 locales. Confirmed cheap; the human's choice of the more precise message
carries no meaningful cost.

**RESOLVED.**

### G4 — `refreshToken` from the login response is never stored (non-finding)

`LoginStep2Response.refreshToken` (`useAuth.ts:21`) is destructured but never
persisted by `applyLogin`. Investigated as a possible latent defect; it matches
the documented deliberate decision on the platform plane
(`platformAuthStore.ts:46` — *"refreshToken is intentionally NOT stored — no
silent-refresh interceptor"*).

**Not a finding. Out of scope, no backlog item.**

---

## 3. Tenant-isolation / RBAC check

No finding. The change is confined to client-side render ordering and the
client's permission-cache flag:

- No query, repository, or route is touched — every `tenant_id` scope is
  server-side and unmodified.
- The fix **strengthens** deny-by-default: today a `/auth/me` failure can persist
  a token with an empty permission set; after the fix no auth state is created at
  all unless identity resolution succeeded.
- Plane isolation unaffected — the platform plane uses a separate store, api
  instance, views and routes, and has no `permissionsLoaded` concept.
- `permissionsLoaded` is a *loading* flag, never an authorization input.
  `hasPermission()` remains a pure array membership test. "No permissions" and
  "permissions not yet known" must stay distinguishable — preserved by BA's
  AC-13.

---

## 4. Scope-creep check

D2 (`refreshPermissions` 401 → hard redirect) and D3 (non-ok non-401 → flag stuck
`false` forever) stay **OUT of scope**, as ruled by @pm-agent and upheld by
@ba-agent. Verified: after this fix `refreshPermissions()`'s only remaining
production caller is `RoleList.tsx:155`. Backlog: `AUTH-BL-1`, `AUTH-BL-2`,
plus `AUTH-BL-3` (`/403` is an unrecoverable dead end for a legitimately
zero-permission session — pre-existing).

The one *accepted* scope addition is C3 (the direct/admin login path), justified
above.

---

## 5. Carried into `/write-plan`

1. Fold `fetchMe` into `selectBranchMutation.mutationFn`; failure ⇒ no `setAuth`,
   no `sessionStorage` write, no navigate, `branchSelection` left non-null.
2. Same atomic-failure guarantee on the direct/admin `loginMutation` path (C3).
3. `permissionsLoaded` becomes a **required** field on the `setAuth` payload;
   update all call sites — `useSwitchBranch` must keep passing `true` (R-1).
4. Remove the duplicate `GET /auth/me` — one call per login.
5. New i18n key for the identity-load failure, `en` + `th`.
6. Reword PM AC-4 per C3.
7. Add a frontend test for the re-tap retry path (G1).

**Gate status: PASSED.** `/write-plan` unblocked.
