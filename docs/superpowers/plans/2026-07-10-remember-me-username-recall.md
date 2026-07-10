# Write-Plan — Remember Me: Username Recall (Clinic Login)

> Step 4, per CLAUDE.md Standard Pipeline. Input: `docs/superpowers/specs/2026-07-10-remember-me-username-design.md`
> (Steps 1–3.5 sign-off, zero open findings, all BA + grilling amendments folded into §2) and
> `docs/adr/0010-remember-me-username-recall-not-session-persistence.md`. Branch:
> `feat/remember-me-username-recall` (new, off `main`). TDD per task (red → green) per
> `superpowers:tdd` skill, `@dev-agent` scope. Frontend-only — no backend/schema/endpoint changes.

## Task list

**A — `rememberedUsernames.ts` helper (RM-1, RM-2)**

- A1. New file `src/frontend/src/utils/rememberedUsernames.ts`. Subdomain-scoped, case-insensitive
  on both parts, no size cap, thin wrapper over `localStorage` key `vc_remembered_usernames`
  (JSON array of `{ username, subdomain, lastUsedAt }`), try/catch degrade pattern matching
  `authStore.ts`'s existing style.
  ```ts
  export interface RememberedUsername {
    username:   string
    subdomain:  string
    lastUsedAt: number
  }

  const STORAGE_KEY = 'vc_remembered_usernames'

  function readAll(): RememberedUsername[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }

  function writeAll(entries: RememberedUsername[]): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) }
    catch { /* private mode / unavailable — degrade silently, matches authStore.ts pattern */ }
  }

  /** Entries saved under `subdomain` (case-insensitive). Relies on the write-time
   *  invariant (upsert always unshifts) for most-recent-first order — no re-sort on read. */
  export function list(subdomain: string): RememberedUsername[] {
    const needle = subdomain.toLowerCase()
    return readAll().filter(
      e => typeof e.subdomain === 'string' && e.subdomain.toLowerCase() === needle
    )
  }

  /** Case-insensitive match on (subdomain, username); last-typed casing wins for display. */
  export function upsert(subdomain: string, username: string): void {
    const sLower = subdomain.toLowerCase()
    const uLower = username.toLowerCase()
    const next = readAll().filter(e =>
      !(typeof e.subdomain === 'string' && e.subdomain.toLowerCase() === sLower
        && e.username.toLowerCase() === uLower)
    )
    next.unshift({ subdomain, username, lastUsedAt: Date.now() })
    writeAll(next)
  }

  export function remove(subdomain: string, username: string): void {
    const sLower = subdomain.toLowerCase()
    const uLower = username.toLowerCase()
    writeAll(readAll().filter(e =>
      !(typeof e.subdomain === 'string' && e.subdomain.toLowerCase() === sLower
        && e.username.toLowerCase() === uLower)
    ))
  }
  ```
  Entries missing `subdomain` fail the `typeof` guard and are never matched (defensive, per spec §2.1).
  Test file (write first, red → green): `src/frontend/src/utils/rememberedUsernames.test.ts`:
  - `'upsert — new entry is added'`
  - `'upsert — existing (subdomain, username) pair bumps to front and refreshes lastUsedAt'`
  - `'remove — present entry is removed'`
  - `'remove — absent entry is a no-op'`
  - `'corrupt JSON under the storage key recovers to an empty list'`
  - `'localStorage.getItem/setItem throwing degrades silently (no throw out of list/upsert/remove)'`
  - `'list(subdomain) returns only entries saved under that subdomain, matched case-insensitively (Dev-Clinic finds dev-clinic)'`
  - `'entry lacking a subdomain field is never returned by list'`
  - `'username matching is case-insensitive — upsert("dev-clinic","Alice") then upsert("dev-clinic","alice") results in exactly one entry, displaying "alice"'`

**B — Session storage simplification + legacy-token migration sweep (RM-3, RM-4)**

- B1. `src/frontend/src/store/authStore.ts`:
  - `AuthState.setAuth` signature: `(data: AuthData, remember: boolean) => void` → `(data: AuthData) => void`.
  - `setAuth` body: always write `sessionStorage`, drop the `remember ? localStorage : sessionStorage`
    branching entirely.
    ```ts
    setAuth: (data) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch { /* storage unavailable (private mode) — keep in-memory only */ }
      set(data)
    },
    ```
  - `loadPersisted()`: drop the `localStorage` fallback read; add the one-line legacy-migration
    sweep inside the existing try/catch (BA amendment §2.2 — runs on every module load,
    independent of whether a session is being restored):
    ```ts
    function loadPersisted(): AuthData | null {
      try {
        localStorage.removeItem('vc_auth') // legacy sweep: old "remember me" persisted the full auth blob here
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return normalise(JSON.parse(raw) as Partial<AuthData>)
      } catch {
        return null
      }
    }
    ```
  - `refreshPermissions()`: replace the `localStorage.getItem(STORAGE_KEY) !== null ? localStorage : sessionStorage`
    branch with an unconditional `sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))`.
  - Update the file-header comment (lines 1–3) — it currently describes the old
    remember→localStorage behavior; replace with a one-line sessionStorage-only description.
  - `clearAuth()` — **no change**, keeps removing from both storages defensively (spec §2.2).
  - Test file (new): `src/frontend/src/store/__tests__/authStore.test.ts`. `loadPersisted()` runs
    at module import time (`const persisted = loadPersisted()`), so each case that needs to
    control what's in storage *before* import must seed storage, then `vi.resetModules()` +
    `await import('../authStore')` to get a fresh module instance — do not rely on the
    already-imported singleton for these cases.
    - `'setAuth always writes sessionStorage and never localStorage'`
    - `'loadPersisted no longer reads localStorage — a value written only there is not picked up'`
      (seed `localStorage` only, fresh-import, assert `isAuthenticated()` is false)
    - `'browser-restart simulation — clear sessionStorage, keep localStorage — results in logged-out state'`
    - `'migration sweep — a legacy vc_auth value in localStorage is actively removed on module load'`
      (seed `localStorage.setItem('vc_auth', ...)`, fresh-import, assert `localStorage.getItem('vc_auth')` is `null` afterward — not merely ignored)

**C — `useAuth.ts`: subdomain-scoped persistence wiring (RM-5, RM-6)**

- C1. `applyLogin` signature drops `remember` (no longer forwarded into `setAuth`):
  ```ts
  async function applyLogin(
    login: LoginStep2Response,
    setAuth: (data: AuthData) => void,
    branchName = '',
  ): Promise<void> {
    const me = await fetchMe(login.token)
    setAuth({ /* ...unchanged fields... */ })   // no second `remember` argument
    try { await useAuthStore.getState().refreshPermissions() } catch { /* server enforces */ }
  }
  ```
  Test: `'applyLogin calls setAuth with a single AuthData argument (no remember flag)'`.
- C2. `useLogin()` — add carry-over state and direct-login persistence. Per spec §3 architecture
  row + BA delta, `pendingUsername` travels the same way `remember` already does via
  `setRemember(vars.remember)`:
  ```ts
  const [pendingUsername, setPendingUsername]   = useState('')
  const [pendingSubdomain, setPendingSubdomain] = useState('')
  // ...
  const loginMutation = useMutation({
    mutationFn: /* unchanged */,
    onSuccess: (res, vars) => {
      setRemember(vars.remember)
      setPendingUsername(vars.username)
      setPendingSubdomain(vars.subdomain)
      const data = res.data.data
      if (data.requiresBranchSelection) {
        setBranchSelection({ pendingToken: data.pendingToken, branches: data.branches })
      } else {
        const branchName = data.branchId === null ? t('nav.allBranches') : ''
        void applyLogin(data, setAuth, branchName).then(() => {
          if (vars.remember) rememberedUsernames.upsert(vars.subdomain, vars.username)
          else rememberedUsernames.remove(vars.subdomain, vars.username)
          navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
        })
      }
    },
  })
  ```
  Add `import * as rememberedUsernames from '../utils/rememberedUsernames'` at the top.
  Tests:
  - `'direct-login path — remember checked upserts (subdomain, username) after applyLogin resolves'`
  - `'direct-login path — remember unchecked removes (subdomain, username) after applyLogin resolves'`
- C3. `selectBranchMutation.onSuccess` — consume the stashed values for the two-step path:
  ```ts
  onSuccess: async (res, vars) => {
    const data = res.data.data
    const selectedBranch = branchSelection?.branches.find(b => b.id === vars.branchId)
    setBranchSelection(null)
    await applyLogin(data, setAuth, selectedBranch?.name ?? '')
    if (remember) rememberedUsernames.upsert(pendingSubdomain, pendingUsername)
    else rememberedUsernames.remove(pendingSubdomain, pendingUsername)
    navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
  },
  ```
  Test: `'branch-selection path — pendingUsername/pendingSubdomain stashed from loginMutation carry through to selectBranchMutation.onSuccess and drive the correct upsert/remove'`.
- C4. `useSwitchBranch` — drop the dead remember/localStorage check (now meaningless since
  tokens never land in `localStorage`):
  ```ts
  export function useSwitchBranch() {
    return useMutation({
      mutationFn: /* unchanged */,
      onSuccess: (res, { branchId, branchName }) => {
        const state = useAuthStore.getState()
        state.setAuth({
          token: res.data.data.token, plane: state.plane, userId: state.userId,
          tenantId: state.tenantId, branchId, roleIds: state.roleIds, role: state.role,
          permissions: state.permissions, permSetVersion: state.permSetVersion,
          name: state.name, companyName: state.companyName, branchName,
        })   // no second argument
      },
    })
  }
  ```
  No dedicated test required beyond a compile-level check (no prior test exercised this hook);
  covered indirectly by the full-suite regression gate (F1).
  All C-group tests land in one new file: `src/frontend/src/hooks/useAuth.test.ts` (colocated,
  matches `useIdleLogout.test.ts` / `usePlatformCustomers.test.ts` convention — no `__tests__` subfolder for hooks).

**D — i18n keys (precedes UI wiring, matches Batch-A's i18n-first convention)**

- D1. `src/frontend/src/i18n/index.ts` — add 3 key pairs.
  - `en` block, near the existing `login.*` keys (lines 114–129):
    - `'login.rememberedUsersTitle': 'Choose a username'`
    - `'login.forgetRememberedUser': 'Forget this username'`
    - `'login.rememberedUsersHint': 'Saved on this device'`
  - `th` block, near the matching `login.*` keys (lines 425–440):
    - `'login.rememberedUsersTitle': 'เลือกชื่อผู้ใช้'`
    - `'login.forgetRememberedUser': 'ลืมชื่อผู้ใช้นี้'`
    - `'login.rememberedUsersHint': 'บันทึกไว้บนอุปกรณ์นี้'`
  - No dedicated test — exercised by E-group render assertions and the existing
    `i18n.coverage.test.ts` / `LoginView.i18n.test.tsx` suites, which must stay green.

**E — `LoginView.tsx`: recall UX, popup, dismiss-on-type (RM-7, RM-8, RM-9)**

- E1. State + recall-on-mount effect + password-field ref. Add imports
  (`useEffect`, `useRef` from `'react'`; `* as rememberedUsernames` and
  `type { RememberedUsername }` from `'../utils/rememberedUsernames'`). Inside `LoginView()`,
  after the existing `useState` block:
  ```ts
  const [showRememberedPopup, setShowRememberedPopup] = useState(false)
  const [rememberedList, setRememberedList]           = useState<RememberedUsername[]>([])
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const entries = rememberedUsernames.list(detectedSubdomain)
    if (entries.length === 1) {
      setForm(p => ({ ...p, username: entries[0].username }))
      setRemember(true)
    } else if (entries.length >= 2) {
      setRememberedList(entries)
      setShowRememberedPopup(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only, spec §2.4
  }, [])
  ```
  `detectedSubdomain` is the existing auto-detected value already computed in the component body —
  reused as-is, not re-derived from the (possibly-edited) `form.subdomain` field, per spec §2.1
  ("the auto-detected one on mount").
  Attach `ref={passwordRef}` to the existing password `<input>` (currently ~line 210–217).
  Test (new file, see E2 for the shared test file path):
  - `'0 remembered usernames — renders blank form, checkbox unchecked, no popup'`
  - `'1 remembered username — pre-fills username, checks remember, no popup'`
  - `'2+ remembered usernames — popup renders, form stays blank until a pick is made'`
- E2. `RememberedUsersModal` — small, non-exported local component in the same file (kept inline
  rather than split out: it is tightly coupled to `LoginView`'s form/remember state and has no
  reuse elsewhere — matches the spec's "defer file-split... or inline if small enough" note,
  resolved here in favor of inline to keep new-file count minimal for the Ponytail gate).
  Placed above `export default function LoginView()`:
  ```tsx
  function RememberedUsersModal({
    entries, onPick, onRemove, onDismiss, t,
  }: {
    entries:  RememberedUsername[]
    onPick:   (entry: RememberedUsername) => void
    onRemove: (entry: RememberedUsername) => void
    onDismiss: () => void
    t: (key: string) => string
  }) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onDismiss}>
        <div
          className="bg-surface rounded-xl border border-outline-variant shadow-lg w-full max-w-sm mx-md p-lg"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-headline-xs font-headline font-bold text-on-surface">
              {t('login.rememberedUsersTitle')}
            </h2>
            <button
              type="button" aria-label="Close" onClick={onDismiss}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-outline">close</span>
            </button>
          </div>
          <div className="flex flex-col gap-xs">
            {entries.map(entry => (
              <div key={entry.username} className="flex items-center justify-between rounded-lg hover:bg-surface-container-low">
                <button
                  type="button" onClick={() => onPick(entry)}
                  className="flex-grow text-left px-md py-sm min-h-[44px] text-body-lg text-on-surface"
                >
                  {entry.username}
                </button>
                <button
                  type="button"
                  aria-label={`${t('login.forgetRememberedUser')}: ${entry.username}`}
                  onClick={() => onRemove(entry)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-outline hover:text-error"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  ```
  Render it conditionally, just before the closing `</div>` of `LoginView`'s root:
  `{showRememberedPopup && <RememberedUsersModal entries={rememberedList} onPick={handlePickRemembered} onRemove={handleRemoveRemembered} onDismiss={() => setShowRememberedPopup(false)} t={t} />}`
  (handlers defined in E3).
  Test: `'2+ remembered — popup lists all entries most-recent-first'` (seed helper storage with
  3 entries at distinct `lastUsedAt`, assert row order matches array order returned by `list()`).
- E3. Row-interaction handlers, inside `LoginView()`:
  ```ts
  function handlePickRemembered(entry: RememberedUsername) {
    setForm(p => ({ ...p, username: entry.username }))
    setRemember(true)
    setShowRememberedPopup(false)
    passwordRef.current?.focus()
  }

  function handleRemoveRemembered(entry: RememberedUsername) {
    rememberedUsernames.remove(detectedSubdomain, entry.username)
    setRememberedList(list => list.filter(e => e.username.toLowerCase() !== entry.username.toLowerCase()))
  }
  ```
  Explicit design note for `@dev-agent`: removing the last (or second-to-last) entry does **not**
  auto-transition the popup into the 0- or 1-remembered layout — it stays open with whatever
  remains until dismissed or a row is picked (matches spec §5's "updates the still-open popup
  without navigating" — no re-transition behavior is specified or required).
  Tests:
  - `'clicking a popup row fills username, checks remember, closes popup, focuses password field'`
  - `'X on a popup row removes just that entry and keeps the popup open with the remaining entries'`
  - `'dismissing the popup via backdrop or the close button falls back to blank form; user can still type an arbitrary username'`
- E4. Dismiss-on-type (grilling amendment — ADR-0010, not a focus-trapping dialog). Modify only
  the username `<input>`'s `onChange` (currently `onChange={set('username')}`, ~line 193):
  ```tsx
  onChange={e => {
    if (showRememberedPopup) setShowRememberedPopup(false)
    set('username')(e)
  }}
  ```
  The keystroke is not lost: `set('username')(e)` still runs synchronously against `e.target.value`
  in the same handler invocation, so the character that triggers the dismiss also lands in the field.
  Test: `'typing directly into the username field while the popup is open dismisses the popup and the keystroke is not lost'` — assert both `screen.queryByText(t('login.rememberedUsersTitle')))` is gone AND the username input's value reflects the typed character.
  Also add: `'list is filtered to the detected subdomain — a remembered entry saved under a different subdomain is neither pre-filled nor shown in the popup'` (seed one entry under a foreign subdomain and one or two under `'dev-clinic'` — jsdom's default `window.location.hostname` is `localhost`, which `LoginView`'s existing detection logic maps to `'dev-clinic'`; seed test fixtures accordingly, do not assume the raw hostname).
  All E-group tests land in one new file: `src/frontend/src/__tests__/LoginView.rememberMe.test.tsx`
  (kept separate from the existing `LoginView.i18n.test.tsx`, matching the
  `ClinicEMR.weightSync.test.tsx` precedent of a feature-scoped test file split from the general one).

## Test plan
Frontend: 4 new test files (`rememberedUsernames.test.ts`, `store/__tests__/authStore.test.ts`,
`hooks/useAuth.test.ts`, `__tests__/LoginView.rememberMe.test.tsx`, ~25 new cases total) +
full existing suite (181+ frontend tests, including `LoginView.i18n.test.tsx` and
`i18n.coverage.test.ts`) must stay green — no backend suite impact (zero backend files touched).

## Out of scope (restating spec §1/§6, logged per BA/grill decisions)
- Any cap on the number of remembered usernames.
- Wiring up the backend's existing (frontend-dead) refresh-token endpoints.
- Platform-console login (no remember-me equivalent exists there).
- Password/credential storage of any kind.
- Auto re-transitioning the 2+ popup to the 0/1-remembered layout when rows are removed down to that count (E3 design note).
- Live re-filtering of the popup if the user edits the Clinic ID/subdomain field after mount — `list()` runs once, off the auto-detected value (spec §2.1/§3).

## Cross-cutting
- F1. Regression gate — run full frontend suite after all tasks; must stay green. Not a new
  task — verification owned by `@qa-agent` at Step 7 (`/code-review`), not part of
  `/execute-plan`'s per-task loop.
- Documentation updates (`implementation-status-matrix.md` row, CLAUDE.md phase table, HTML docs)
  happen at Step 8 (`/anemal-finish-branch`), per CLAUDE.md Tracking rules — not execute-plan tasks.

## Ponytail self-check (Step 5 gate — restating spec/CLAUDE.md thresholds)

| Criterion | Threshold | This plan |
|---|---|---|
| Subsystems | ≤3 | 1 (frontend auth/login flow only — no backend, no schema) |
| Files touched | ≤15 new, ≤10 typical | 9 total: 4 modified (`authStore.ts`, `useAuth.ts`, `LoginView.tsx`, `i18n/index.ts`) + 5 new (`rememberedUsernames.ts` + 4 test files) |
| LOC estimate | ≤500 | ~480–500 combined (production ~190, tests ~300 across 4 new test files — test-heavy per this repo's TDD convention, comparable ratio to Batch-A's ~350–400 for a similarly-scoped change) |
| New endpoints | ≤3 | 0 |
| New dependencies | ≤5 | 0 |
| New files | ≤15 | 5 (1 production helper + 4 test files; `RememberedUsersModal` is a new *export* inside the existing `LoginView.tsx`, not a new file — deliberate, per E2) |
| Over-engineering / duplication / existing-solution-ignored | none | Reuses `authStore.ts`'s existing try/catch storage-degrade pattern, `LoginView.tsx`'s existing `set(field)` handler pattern, and the hook's existing `setRemember(vars.remember)` carry-over pattern for the new `pendingUsername`/`pendingSubdomain` state (C2) — no new abstraction layer, no state library, no routing change |

**Total: 10 implementation/test tasks across 5 groups (A: 1, B: 1, C: 4, D: 1, E: 4) + 1 cross-cutting regression gate.**
