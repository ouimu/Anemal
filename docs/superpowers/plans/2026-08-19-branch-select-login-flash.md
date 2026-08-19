# Implementation Plan — Branch-Select Login Flash / Delayed Dashboard Redirect

**Branch:** `fix/branch-select-login-flash`
**Pipeline step:** STEP 4 (`/superpowers:write-plan`)
**Owner:** @pm-agent
**Inputs:** PM Step-2 tasks, @ba-agent Step-3 sign-off (APPROVED WITH CONDITIONS C1–C3),
`/grill-with-docs` Step-3.5 record (ALL FINDINGS RESOLVED), ADR-0024.
**Next gate:** @ponytail-agent 7-criteria simplicity review — **do not execute until APPROVE.**

---

## 0. Deviation from Step-2 file scope (read this first)

The PM Step-2 "Files in scope" list and the BA/grill handoff both name
`useAuth.ts`, `authStore.ts`, `i18n/index.ts`, and their test files, but **not**
`LoginView.tsx`. Implementing the locked decisions makes that omission
unworkable:

- Decision 3 (a *distinct* i18n key for "could not load your permissions" vs.
  "could not select branch") and the C1/C3 atomic-failure mechanism (fold
  `fetchMe` into the mutation, let `isError` be the only signal) together mean
  **the component reading `selectBranchMutation.error` /
  `loginMutation.error` must decide which message to show.** That component is
  `LoginView.tsx` (error boxes at lines 154–159 and 57–59). There is no way to
  honor decision 3 without touching it.
- `LoginView.tsx` is therefore added to files in scope, along with its two
  existing test files (`__tests__/LoginView.i18n.test.tsx`,
  `__tests__/LoginView.rememberMe.test.tsx`) for a re-run/compile check — no
  new LoginView test file needed beyond Task 13's assertions, which extend an
  existing pattern.

No other file-scope deviation. Total touched: 4 source files
(`useAuth.ts`, `authStore.ts`, `i18n/index.ts`, `LoginView.tsx`) + 4 test
files (`useAuth.test.ts`, `authStore.test.ts`, `guards.test.tsx` [re-run
only, no edit expected], `LoginView.i18n.test.tsx`/`LoginView.rememberMe.test.tsx`
[re-run only]) — well inside the Ponytail file-count gate.

---

## 1. Consolidated acceptance criteria (13 total, PM AC-1..8 + BA AC-9..13)

| AC | Statement | Proven by test(s) |
|---|---|---|
| AC-1 | Credentials form never re-renders between branch tap and dashboard render | T4 |
| AC-2 | Exactly one `GET /auth/me` per successful branch-select login | T3, T9 |
| AC-3 | `permissionsLoaded === true` before `navigate()` fires (branch-select path) | T3 |
| AC-4 *(reworded per C3)* | Direct/admin login: unchanged on success; **on failure now surfaces an error instead of stopping silently** | T7, T8 |
| AC-5 | "Back to login" (`resetBranchSelection`) still shows the form immediately | T10 (existing behavior, re-run only — see §4) |
| AC-6 | `selectBranchMutation` rejection (branch-select POST itself fails) leaves existing error UI/picker unchanged | T11 |
| AC-7 | Server-side branch-ownership 4xx still the sole authority; no client trust added | T11 (same mechanism as AC-6 — a `mutationFn` throw either way) |
| AC-8 | `refreshPermissions()` behavior/callers outside login path (`RoleList.tsx`) unchanged | Re-run `RoleEditorView.test.tsx` / `RoleList.test.tsx` (§4) |
| AC-9 | `fetchMe()` failure (network/401/404/5xx) on branch-select path: no `setAuth`, no `sessionStorage` write, no navigate, picker stays, visible error, exactly one `/auth/me` call | T5, T6 |
| AC-10 | Same failure guarantee on direct/admin path: no silent stop, visible error, clean re-submit retry | T7, T8 |
| AC-11 | `permissionsLoaded` explicit at every `setAuth` call site; `useSwitchBranch` leaves it `true` | T1, T2, T12 |
| AC-12 | Failed login leaves no persisted auth blob — F5 lands on `/login` | T6 (asserts `sessionStorage.getItem('vc_auth')` is null) |
| AC-13 | `/auth/me` 200 with `permissions: []` (legit zero-permission role) still establishes session, `permissionsLoaded: true`, denies to `/403` — distinguishable from AC-9 | T13 |

13 AC, 13 named tests (T1–T13), zero orphaned AC.

---

## 2. Interface changes (decided here, per grill §5 "mechanism is a /write-plan decision")

**`src/frontend/src/store/authStore.ts`**
- `AuthData` gains a required field: `permissionsLoaded: boolean`. This *is*
  "the `setAuth` payload" the ADR refers to — `setAuth: (data: AuthData) =>
  void` already is the payload type, so adding it here is the literal
  smallest change that makes TypeScript reject any omission (C2).
- `AuthState` no longer redeclares `permissionsLoaded` separately (it now
  arrives via `AuthData`) — delete the standalone field at the current
  `authStore.ts:29` and its stale comment (C5).
- `EMPTY` gains `permissionsLoaded: false`.
- `normalise()` gains `permissionsLoaded: typeof raw.permissionsLoaded === 'boolean' ? raw.permissionsLoaded : Array.isArray(raw.permissions) && raw.permissions.length > 0`
  — trusts the persisted value going forward (now genuinely written by
  `setAuth`), falls back to the old heuristic only for a session blob
  persisted by pre-fix code still sitting in a user's `sessionStorage`.
- Delete the store-init override at current line 105
  (`permissionsLoaded: persisted !== null && persisted.permissions.length > 0`)
  — redundant now that `normalise()` computes it; the `...(persisted ?? {})`
  spread already carries the correct value.
- `setAuth()` body unchanged except the comment at current line 111
  (`"permissionsLoaded stays false…"`) is replaced with INV-PERM-1 verbatim
  from the BA sign-off: *"`permissionsLoaded === true` ⇒ `permissions` is the
  authoritative, server-resolved set for the current token. `false` ⇒
  unknown, never treat as empty."* Also correct the misdescribed doc comment
  at current line 28 to the same wording (C5).

**`src/frontend/src/hooks/useAuth.ts`**
- Delete `applyLogin()` entirely (was the joint point that let the duplicate
  `/auth/me` and the false-before-resolve ordering exist).
- Add:
  ```ts
  export class IdentityLoadError extends Error {}

  async function fetchMeOrThrow(token: string): Promise<MeResponse> {
    const me = await fetchMe(token)
    if (!me) throw new IdentityLoadError('Could not load permissions')
    return me
  }
  ```
  (`fetchMe()` itself is unchanged — it already swallows and returns `null`;
  `fetchMeOrThrow` is the new atomic boundary.)
- `selectBranchMutation.mutationFn` becomes:
  ```ts
  mutationFn: async ({ pendingToken, branchId }) => {
    const res = await api.post<{ success: boolean; data: LoginStep2Response }>(
      '/auth/select-branch', { pendingToken, branchId },
    )
    const data = res.data.data
    const me = await fetchMeOrThrow(data.token)
    return { data, me }
  },
  onSuccess: ({ data, me }, vars) => {
    const selectedBranch = branchSelection?.branches.find(b => b.id === vars.branchId)
    setAuth({
      token: data.token, plane: 'clinic', userId: data.userId, tenantId: data.tenantId,
      branchId: data.branchId, roleIds: me.roleIds, role: data.role,
      permissions: me.permissions, permSetVersion: me.permSetVersion ?? 0,
      name: data.name, companyName: data.companyName ?? '',
      branchName: selectedBranch?.name ?? '', permissionsLoaded: true,
    })
    setBranchSelection(null)
    if (remember) rememberedUsernames.upsert(pendingSubdomain, pendingUsername)
    else rememberedUsernames.remove(pendingSubdomain, pendingUsername)
    navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
  },
  ```
  A rejected `mutationFn` (either the POST itself, or `fetchMeOrThrow`) skips
  `onSuccess` entirely — no `setAuth`, no bookkeeping, no navigate, and
  `branchSelection` (component state, untouched) keeps the picker mounted.
  This is what makes AC-1/AC-6/AC-7/AC-9 all fall out of one code path.
- `loginMutation.mutationFn` becomes a discriminated return so the
  branch-selection-required response (no token yet, nothing to fetch) and the
  direct/admin response (has a token, must resolve identity now) are handled
  distinctly without a second mutation:
  ```ts
  mutationFn: async ({ remember: _rem, ...creds }: LoginPayload) => {
    const res = await api.post<{ success: boolean; data: LoginStep1Response | LoginStep2Response }>(
      '/auth/login', creds,
    )
    const data = res.data.data
    if (data.requiresBranchSelection) return { kind: 'branchSelection' as const, data }
    const me = await fetchMeOrThrow(data.token)
    return { kind: 'ready' as const, data, me }
  },
  onSuccess: (result, vars) => {
    setRemember(vars.remember)
    setPendingUsername(vars.username)
    setPendingSubdomain(vars.subdomain)
    if (result.kind === 'branchSelection') {
      setBranchSelection({ pendingToken: result.data.pendingToken, branches: result.data.branches })
      return
    }
    const { data, me } = result
    const branchName = data.branchId === null ? t('nav.allBranches') : ''
    setAuth({
      token: data.token, plane: 'clinic', userId: data.userId, tenantId: data.tenantId,
      branchId: data.branchId, roleIds: me.roleIds, role: data.role,
      permissions: me.permissions, permSetVersion: me.permSetVersion ?? 0,
      name: data.name, companyName: data.companyName ?? '', branchName,
      permissionsLoaded: true,
    })
    if (vars.remember) rememberedUsernames.upsert(vars.subdomain, vars.username)
    else rememberedUsernames.remove(vars.subdomain, vars.username)
    navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
  },
  ```
  An `IdentityLoadError` thrown inside `mutationFn` now rejects the whole
  mutation — TanStack sets `isError`/`error` — instead of today's
  `void applyLogin(...).then(...)` with no `.catch`, which is the silent
  floating-rejection defect BA flagged for C3.
- `useSwitchBranch.onSuccess` — add `permissionsLoaded: true` (literal, not
  read from `state.permissionsLoaded`) to its `setAuth(...)` call object.
  This is the one-line fix that turns R-1 from "works by accident via shallow
  merge" into "works because it's stated."

**`src/frontend/src/i18n/index.ts`**
- New key `login.selectBranchIdentityError`, inserted next to
  `login.selectBranchError` (`en` ~line 128, `th` ~line 458):
  - en: `"Could not load your permissions. Please try again."`
  - th: `"ไม่สามารถโหลดสิทธิ์การใช้งานของคุณได้ กรุณาลองใหม่อีกครั้ง"`

**`src/frontend/src/views/LoginView.tsx`**
- Picker error box (current lines 154–159): branch on error type —
  ```tsx
  {selectBranchMutation.isError && (
    <div className="...">
      <p className="text-body-md text-error">
        {selectBranchMutation.error instanceof IdentityLoadError
          ? t('login.selectBranchIdentityError')
          : t('login.selectBranchError')}
      </p>
    </div>
  )}
  ```
- Direct-form `errorMsg` (current lines 57–59): same instanceof check ahead
  of the existing server-message extraction, so an `IdentityLoadError` shows
  the new key instead of falling into the generic
  `login.invalidCredentials` fallback:
  ```ts
  const errorMsg = login.error
    ? (login.error instanceof IdentityLoadError
        ? t('login.selectBranchIdentityError')
        : ((login.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('login.invalidCredentials')))
    : null
  ```
- Import `{ IdentityLoadError }` from `../hooks/useAuth`.

---

## 3. Task list (2–5 min each, dependency order, TDD red→green per behavior)

| # | Task | File(s) | Est. |
|---|---|---|---|
| **T1** | Write failing test: `setAuth` requires `permissionsLoaded` at the type level — assert `sampleAuth` (updated to include `permissionsLoaded: true`) round-trips through `setAuth`/`sessionStorage`, and add a case for a persisted blob **without** `permissionsLoaded` (pre-fix legacy session) restoring via the `permissions.length > 0` fallback in `normalise()` | `src/frontend/src/store/__tests__/authStore.test.ts` | 5 min |
| **T2** | Implement authStore.ts interface change: add `permissionsLoaded` to `AuthData`, delete the standalone field on `AuthState` (old line 29), update `EMPTY`, `normalise()`, delete the redundant store-init override (old line 105), correct comments at old lines 28 & 111 to INV-PERM-1 (C5) | `src/frontend/src/store/authStore.ts` | 5 min |
| **T3** | Run T1 + full existing `authStore.test.ts` suite; confirm green, confirm `clearAuth()`'s existing `permissionsLoaded: false` still compiles (now redundant with `EMPTY` but harmless — leave as-is, no behavior change) | `src/frontend/src/store/authStore.ts` (test run only) | 2 min |
| **T4** | Write failing test: branch-select happy path issues exactly one `GET /auth/me` (mock `fetch` once, assert call count), `setAuth` is called with `permissionsLoaded: true`, and `navigate()` fires only after `setAuth` — assert via mock call order (AC-2, AC-3) | `src/frontend/src/hooks/useAuth.test.ts` | 5 min |
| **T5** | Write failing test: `setBranchSelection(null)` (picker dismissal) never happens before the resolved `setAuth` — assert via a spy/order check across the mocked `authState.setAuth` call and `result.current.branchSelection` staying non-null until the mutation settles (AC-1) | `src/frontend/src/hooks/useAuth.test.ts` | 5 min |
| **T6** | Write failing tests, parameterized across `fetch` rejecting / returning `{ok:false, status:401}` / `{ok:false, status:404}` / `{ok:false, status:500}`: after `POST /auth/select-branch` succeeds and `GET /auth/me` fails, `authState.setAuth` is never called, `sessionStorage.getItem('vc_auth')` is `null`, `navigateMock` is never called, `branchSelection` stays non-null, `selectBranchMutation.isError` is `true`, and exactly one `fetch` call was made (AC-9, AC-12, G1-adjacent — no retry happened automatically) | `src/frontend/src/hooks/useAuth.test.ts` | 5 min |
| **T7** | Implement `IdentityLoadError`, `fetchMeOrThrow`, delete `applyLogin`; rewrite `selectBranchMutation.mutationFn`/`onSuccess` per §2. Run T4/T5/T6 to green | `src/frontend/src/hooks/useAuth.ts` | 5 min |
| **T8** | Write failing test: re-tap retry after a T6-style failure — call `selectBranchMutation.mutate` again with the **same** `pendingToken`, mock the second attempt to succeed, assert `setAuth`/`navigate` now fire and only **one** `POST /auth/select-branch` + **one** `GET /auth/me` happened on the *retry* itself (total 2 of each across both attempts) — this is the G1 test the grill flagged as missing | `src/frontend/src/hooks/useAuth.test.ts` | 4 min |
| **T9** | Write failing tests for the direct/admin path: (a) success unchanged — one `/auth/me` call, `permissionsLoaded: true`, navigate fires (AC-4 success half); (b) `fetchMe` failure — `setAuth` never called, nothing in `sessionStorage`, `navigate` never called, `loginMutation.isError` is `true` (no unhandled rejection), re-`mutate()` after fixing the mock succeeds cleanly (AC-4 failure half, AC-10) | `src/frontend/src/hooks/useAuth.test.ts` | 5 min |
| **T10** | Implement discriminated `loginMutation.mutationFn`/`onSuccess` per §2. Run T8/T9 to green, run full existing `useAuth.test.ts` suite (remember-me tests) to confirm no regression | `src/frontend/src/hooks/useAuth.ts` | 5 min |
| **T11** | Write failing test: `useSwitchBranch` — after `mutate()` resolves, `authState.setAuth` was called with `permissionsLoaded: true` explicitly present in the payload object (not merely truthy from prior state) — the R-1 regression guard (AC-11) | `src/frontend/src/hooks/useAuth.test.ts` | 3 min |
| **T12** | Implement `permissionsLoaded: true` literal on `useSwitchBranch`'s `setAuth(...)` call. Run T11 to green | `src/frontend/src/hooks/useAuth.ts` | 2 min |
| **T13** | Write failing test: `selectBranchMutation` — `/auth/select-branch` succeeds and `/auth/me` returns `200` with `permissions: []` (legitimate zero-permission role); assert `setAuth` **is** called, `permissionsLoaded: true`, `permissions: []`, `navigate` fires — i.e. this is NOT treated as a failure, staying distinguishable from T6 (AC-13) | `src/frontend/src/hooks/useAuth.test.ts` | 3 min |
| **T14** | Confirm T13 passes against the T7 implementation (no code change expected — this is a characterization test proving AC-13 as a byproduct of T7's design, since `me` is only ever `null` on a fetch failure, never on a `200` with an empty array) | `src/frontend/src/hooks/useAuth.test.ts` (test run only) | 2 min |
| **T15** | Add the new i18n key `login.selectBranchIdentityError` to `en` (~line 128) and `th` (~line 458) | `src/frontend/src/i18n/index.ts` | 2 min |
| **T16** | Write failing test: picker error box shows `login.selectBranchIdentityError` text when `selectBranchMutation.error` is an `IdentityLoadError` instance, and `login.selectBranchError` text when it's a plain/axios error (extend `LoginView.i18n.test.tsx` or add `LoginView.errorMessages.test.tsx` following its existing `useLogin` mock pattern) | `src/frontend/src/__tests__/LoginView.errorMessages.test.tsx` (new, ~15 lines, following existing mock pattern) | 5 min |
| **T17** | Write failing test: direct-form `errorMsg` shows `login.selectBranchIdentityError` when `loginMutation.error` is an `IdentityLoadError`, and the existing server-message/`invalidCredentials` fallback otherwise | same file as T16 | 3 min |
| **T18** | Implement the two `errorMsg`/error-box branches in `LoginView.tsx` per §2, import `IdentityLoadError`. Run T16/T17 to green | `src/frontend/src/views/LoginView.tsx` | 4 min |
| **T19** | Full regression pass: re-run `useAuth.test.ts`, `authStore.test.ts`, `guards.test.tsx` (no edits expected — it mocks `MockStoreState` directly, not `AuthData`, but confirm `permissionsLoaded: true`/`false` fixtures still compile), `LoginView.i18n.test.tsx`, `LoginView.rememberMe.test.tsx`, and `RoleEditorView.test.tsx`/`RoleList.test.tsx` (AC-8 — `refreshPermissions()` only remaining caller) | all test files above (run only) | 4 min |
| **T20** | Manual/E2E smoke on tablet viewport (768px/1024px, per `anemal-design-system`): multi-branch login end-to-end — confirm no visible form flash, no spinner hang, and (new) pull network offline mid-select to see the specific error + successful re-tap | manual — `@qa-agent` | 5 min |

**Total: 20 tasks, ~85 min estimated.** (PM's Step-2 estimate of 8 tasks/~32 min
undercounted because it predated C1–C3 and the failure-path AC entirely —
expected growth given BA added 5 AC and the grill added the retry test.)

---

## 4. Existing tests that must be re-run (signature-change blast radius)

`AuthData`/`setAuth`'s new required field is a compile-time change — every
call site and every test fixture that builds an `AuthData`-shaped object
must still type-check:

| File | Why it's affected | Action |
|---|---|---|
| `src/frontend/src/hooks/useAuth.test.ts` | Mocks `authState.setAuth`; `step2Response`/`MeResponse` fixtures unaffected (those aren't `AuthData`), but new tests (T4–T14) assert on `setAuth`'s call payload shape | Extended in T1–T14, full suite re-run in T10/T19 |
| `src/frontend/src/store/__tests__/authStore.test.ts` | `sampleAuth: AuthData` literal — **will fail to compile** once `permissionsLoaded` is required | Updated in T1 |
| `src/frontend/src/guards/guards.test.tsx` | Has its own `MockStoreState` interface with `permissionsLoaded: boolean` already — does **not** import `AuthData`, so it does not need an edit, only a re-run to confirm | Re-run in T19, no edit expected |
| `src/frontend/src/__tests__/LoginView.i18n.test.tsx`, `LoginView.rememberMe.test.tsx` | Mock `useLogin()` return value directly (untyped-ish object literals for `loginMutation`/`selectBranchMutation`), not `AuthData` — no `permissionsLoaded` field involved, but they render `LoginView.tsx` which now imports `IdentityLoadError` | Re-run in T19, no edit expected |
| `src/backend/tests/integration/codex-review-regression.test.ts:307` | Backend test guarding the `pendingToken`-reusable property T8 depends on | **Not touched** — cited only as the existing guarantee T8's retry test relies on; do not modify |

No other `setAuth` call site exists outside `useAuth.ts` (confirmed:
`platformAuthStore.ts` is a fully separate store/type per BA Q4, and is
correctly excluded from this branch).

---

## 5. Explicitly not done here (unchanged from Step-2/Step-3 ruling)

- `AUTH-BL-1`, `AUTH-BL-2`, `AUTH-BL-3` — backlog, `refreshPermissions()`
  internals untouched.
- No automatic retry/backoff around `fetchMe` (C4) — T8's retry is
  user-initiated (re-tap), matching the picker's existing button.
- No change to `RoleList.tsx` or its tests beyond the re-run in T19.

---

## Next step

Per CLAUDE.md Standard Pipeline: this plan goes to **@ponytail-agent** (STEP
5) for the 7-criteria simplicity gate before `/execute-plan` (STEP 6). Flag
for Ponytail's review up front: file count is 4 source + up to 5 test files
(1 new), inside the 15-file gate; no new dependencies; no new API
endpoints/hooks (0, well under the 3 gate — `IdentityLoadError` is a class,
not an endpoint).
