# Idle-Timeout Auto-Logout — Frontend Core (Hook & Guards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `useIdleLogout` hook and `IdleLogoutModal`, and wire them into both plane guards (`RequireAuth` for clinic, `PlatformLayout` for platform) so any authenticated user is auto-logged-out after inactivity, with a 30s warning.

**Architecture:** A single frontend hook (`useIdleLogout`) tracks real DOM activity (mousedown/keydown/touchstart/scroll) with two timers (warn, logout) and a `localStorage`-backed cross-tab sync signal. It mounts once at each plane's authenticated-shell boundary. Enforcement is client-side only — no server-side token revocation (see [ADR-0001](../../adr/0001-idle-logout-client-side-only.md)).

**Tech Stack:** React 18 + Zustand + React Query + Vite (frontend), Vitest + Testing Library (tests).

**Depends on:** Plan 1 (`docs/superpowers/plans/2026-07-01-idle-logout-backend.md`) — must be merged first. Task 3 of this plan reads `TenantSettings.idleTimeoutMinutes` and `GET /admin/settings`, both produced there.

**Split note:** This is Plan 2 of 3 for the idle-logout feature (split per Ponytail Gate — original combined plan was over the 3-subsystem / 10-file limit). See also:
- Plan 1: `docs/superpowers/plans/2026-07-01-idle-logout-backend.md` (DB + backend — prerequisite)
- Plan 3: `docs/superpowers/plans/2026-07-01-idle-logout-ux.md` (settings UI + login banner — depends on this plan)

## Global Constraints

- Idle timeout range (clinic): 5–120 minutes, default 15.
- Warning countdown: fixed 30 seconds before logout.
- Activity events: `mousedown`, `keydown`, `touchstart`, `scroll` only — background API traffic never resets the timer.
- Activity recording (timer reset + cross-tab write) throttled to 1/second.
- No new npm dependencies.
- Full spec: [docs/superpowers/specs/2026-07-01-idle-logout-design.md](../specs/2026-07-01-idle-logout-design.md). BA sign-off recorded there.

---

### Task 1: Frontend — `useIdleLogout` hook

**Files:**
- Create: `src/frontend/src/hooks/useIdleLogout.ts`
- Test: `src/frontend/src/hooks/useIdleLogout.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface UseIdleLogoutOptions {
    timeoutMinutes: number
    onLogout: () => void
    enabled?: boolean // default true
  }
  export interface UseIdleLogoutResult {
    warning: boolean
    secondsLeft: number
    stayLoggedIn: () => void
  }
  export function useIdleLogout(options: UseIdleLogoutOptions): UseIdleLogoutResult
  ```
  Later tasks (2, 3, 4) consume this exact shape.

- [ ] **Step 1: Write the failing tests**

`src/frontend/src/hooks/useIdleLogout.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIdleLogout } from './useIdleLogout'

describe('useIdleLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onLogout after timeoutMinutes of no activity', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('shows a warning 30s before logout, without calling onLogout yet', () => {
    const onLogout = vi.fn()
    const { result } = renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.warning).toBe(true)
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('resets the timer on DOM activity, delaying logout', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(45_000) })
    act(() => { window.dispatchEvent(new Event('keydown')) })
    act(() => { vi.advanceTimersByTime(45_000) }) // 90s wall-clock, but only 45s since the reset
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('resets the timer when another tab reports activity via the storage event', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(50_000) })
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'vc_idle_ping', newValue: String(Date.now()) }))
    })
    act(() => { vi.advanceTimersByTime(50_000) }) // would exceed the original 60s window without the reset
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('stayLoggedIn() cancels the warning and resets the timer', () => {
    const onLogout = vi.fn()
    const { result } = renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.warning).toBe(true)
    act(() => { result.current.stayLoggedIn() })
    expect(result.current.warning).toBe(false)
    act(() => { vi.advanceTimersByTime(55_000) })
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('does nothing when enabled is false', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout, enabled: false }))
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(onLogout).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `src/frontend`): `npx vitest run src/hooks/useIdleLogout.test.ts`
Expected: FAIL — `Cannot find module './useIdleLogout'`.

- [ ] **Step 3: Write the implementation**

`src/frontend/src/hooks/useIdleLogout.ts`:

```ts
// Client-side idle-timeout auto-logout. Tracks real DOM activity only —
// background API traffic (polling, silent token refresh) never resets the
// timer, otherwise a polling screen would never idle-logout.
// Cross-tab sync: any tab's activity writes a timestamp to a shared
// localStorage key; every tab listens for that key's storage event and
// resets its own timers, so an idle background tab doesn't log out a tab
// the user is actively using (see ADR-0001 for why enforcement stays
// client-side only).
import { useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
const WARNING_SECONDS = 30
const THROTTLE_MS = 1000
export const IDLE_SYNC_KEY = 'vc_idle_ping'

export interface UseIdleLogoutOptions {
  timeoutMinutes: number
  onLogout: () => void
  enabled?: boolean
}

export interface UseIdleLogoutResult {
  warning: boolean
  secondsLeft: number
  stayLoggedIn: () => void
}

export function useIdleLogout({
  timeoutMinutes,
  onLogout,
  enabled = true,
}: UseIdleLogoutOptions): UseIdleLogoutResult {
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS)

  const warnTimer     = useRef<ReturnType<typeof setTimeout>>()
  const logoutTimer   = useRef<ReturnType<typeof setTimeout>>()
  const tickInterval  = useRef<ReturnType<typeof setInterval>>()
  const throttleRef   = useRef(0)
  const onLogoutRef   = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    if (!enabled) return undefined

    function clearTimers() {
      clearTimeout(warnTimer.current)
      clearTimeout(logoutTimer.current)
      clearInterval(tickInterval.current)
    }

    function scheduleTimers() {
      clearTimers()
      setWarning(false)
      setSecondsLeft(WARNING_SECONDS)

      const totalMs = timeoutMinutes * 60_000
      const warnMs  = Math.max(totalMs - WARNING_SECONDS * 1000, 0)

      warnTimer.current = setTimeout(() => {
        setWarning(true)
        let remaining = WARNING_SECONDS
        tickInterval.current = setInterval(() => {
          remaining -= 1
          setSecondsLeft(remaining)
        }, 1000)
      }, warnMs)

      logoutTimer.current = setTimeout(() => {
        clearTimers()
        onLogoutRef.current()
      }, totalMs)
    }

    function noteActivity(broadcast: boolean) {
      scheduleTimers()
      if (broadcast) {
        try { localStorage.setItem(IDLE_SYNC_KEY, String(Date.now())) } catch { /* private mode */ }
      }
    }

    function handleActivity() {
      const now = Date.now()
      if (now - throttleRef.current < THROTTLE_MS) return
      throttleRef.current = now
      noteActivity(true)
    }

    function handleStorage(e: StorageEvent) {
      if (e.key === IDLE_SYNC_KEY) scheduleTimers()
    }

    scheduleTimers()
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }))
    window.addEventListener('storage', handleStorage)

    stayLoggedInRef.current = () => noteActivity(true)

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity))
      window.removeEventListener('storage', handleStorage)
    }
  }, [timeoutMinutes, enabled])

  const stayLoggedInRef = useRef<() => void>(() => {})

  return {
    warning,
    secondsLeft,
    stayLoggedIn: () => stayLoggedInRef.current(),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `src/frontend`): `npx vitest run src/hooks/useIdleLogout.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/src/hooks/useIdleLogout.ts src/frontend/src/hooks/useIdleLogout.test.ts
git commit -m "feat: add useIdleLogout hook with cross-tab sync"
```

---

### Task 2: Frontend — `IdleLogoutModal` component

**Files:**
- Create: `src/frontend/src/components/IdleLogoutModal.tsx`

**Interfaces:**
- Consumes: nothing beyond props below.
- Produces:
  ```ts
  export interface IdleLogoutModalProps {
    open: boolean
    secondsLeft: number
    onStay: () => void
  }
  export default function IdleLogoutModal(props: IdleLogoutModalProps): JSX.Element | null
  ```
  Consumed by Task 3 (`RequireAuth`) and Task 4 (`PlatformLayout`).

*(No dedicated test file: the component is pure presentation with zero branching logic beyond `if (!open) return null`, and its behavior is already exercised end-to-end by `useIdleLogout.test.ts`'s `warning`/`secondsLeft` assertions plus the integration in Tasks 3–4. Ponytail: a render-only component this small doesn't need its own suite.)*

- [ ] **Step 1: Write the component**

`src/frontend/src/components/IdleLogoutModal.tsx`:

```tsx
export interface IdleLogoutModalProps {
  open:        boolean
  secondsLeft: number
  onStay:      () => void
}

export default function IdleLogoutModal({ open, secondsLeft, onStay }: IdleLogoutModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="alertdialog" aria-live="assertive">
      <div className="bg-surface rounded-xl p-6 max-w-sm w-full shadow-lvl3 text-center mx-4">
        <p className="text-headline-xs font-headline font-bold text-on-surface mb-2">
          Session expiring
        </p>
        <p className="text-body-md text-on-surface-variant mb-4">
          You&apos;ll be logged out in {secondsLeft}s due to inactivity.
        </p>
        <button
          type="button"
          onClick={onStay}
          className="min-h-[44px] px-6 bg-primary text-on-primary rounded-lg text-body-md font-semibold"
        >
          Stay logged in
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/frontend/src/components/IdleLogoutModal.tsx
git commit -m "feat: add IdleLogoutModal component"
```

---

### Task 3: Frontend — wire idle-logout into clinic plane (`RequireAuth`)

**Files:**
- Modify: `src/frontend/src/hooks/useAdmin.ts:4-27` (add `idleTimeoutMinutes` to `TenantSettings`, add `enabled` param to `useAdminSettings`)
- Modify: `src/frontend/src/guards/RequireAuth.tsx`
- Modify: `src/frontend/src/guards/guards.test.tsx`

**Interfaces:**
- Consumes: `useIdleLogout` (Task 1), `IdleLogoutModal` (Task 2), `TenantSettings.idleTimeoutMinutes` and `GET /admin/settings` (Plan 1, Task 2).
- Produces: `useAdminSettings(enabled?: boolean)` — existing callers (`ClinicSettingsTab.tsx`, Plan 3) keep working unchanged since the param is optional and defaults to `true`.

- [ ] **Step 1: Add `idleTimeoutMinutes` to the `TenantSettings` type and gate the query**

In `src/frontend/src/hooks/useAdmin.ts`, add the field to the interface (after `planTier: string`):

```ts
  idleTimeoutMinutes:  number
```

Then change the query hook to accept an `enabled` flag:

```ts
export function useAdminSettings(enabled = true) {
  return useQuery<TenantSettings>({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get('/admin/settings').then(r => r.data.data),
    enabled,
  })
}
```

- [ ] **Step 2: Update `guards.test.tsx` mocks for the new dependencies**

`RequireAuth` will import `useAdminSettings` and `useIdleLogout`. Add mocks to `src/frontend/src/guards/guards.test.tsx`, alongside the existing `vi.mock('../store/authStore', ...)` block (near line 36):

```ts
vi.mock('../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { idleTimeoutMinutes: 15 } }),
}))
vi.mock('../hooks/useIdleLogout', () => ({
  useIdleLogout: () => ({ warning: false, secondsLeft: 30, stayLoggedIn: vi.fn() }),
}))
```

Also add `clearAuth: vi.fn()` to the `MockStoreState` interface and `mockStoreState` object (both near lines 12–27), since `RequireAuth` now reads it:

```ts
interface MockStoreState {
  isAuthenticated: () => boolean
  plane: 'clinic' | 'platform'
  hasPermission: (code: string) => boolean
  permissions: string[]
  permissionsLoaded: boolean
  clearAuth: () => void
}
```

```ts
const mockStoreState: MockStoreState = vi.hoisted(() => ({
  isAuthenticated: (): boolean => false,
  plane: 'clinic' as 'clinic' | 'platform',
  hasPermission: (_code: string): boolean => false,
  permissions: [] as string[],
  permissionsLoaded: true,
  clearAuth: (): void => {},
}))
```

And in the `setStore` reset helper (near line 48):

```ts
function setStore(overrides: Partial<MockStoreState>): void {
  mockStoreState.isAuthenticated  = (): boolean => false
  mockStoreState.plane            = 'clinic'
  mockStoreState.clearAuth        = (): void => {}
  // ...(leave the remaining pre-existing lines in this function as-is)
  Object.assign(mockStoreState, overrides)
}
```

- [ ] **Step 3: Run the guard tests to confirm they still pass against current `RequireAuth`**

Run (from `src/frontend`): `npx vitest run src/guards/guards.test.tsx`
Expected: PASS (mocks added but `RequireAuth` unchanged yet, so this just confirms the mock setup doesn't break anything before the real change).

- [ ] **Step 4: Wire `useIdleLogout` + `IdleLogoutModal` into `RequireAuth`**

Replace `src/frontend/src/guards/RequireAuth.tsx` with:

```tsx
/**
 * RequireAuth — authentication gate guard.
 *
 * Redirects unauthenticated visitors to /login.
 * Supports both outlet-based nesting and direct children wrapping:
 *   <Route element={<RequireAuth/>}><Route .../></Route>
 *   <RequireAuth><SomeComponent/></RequireAuth>
 *
 * Also mounts the clinic-plane idle-logout timer (see useIdleLogout) —
 * this is the single point shared by all three clinic route roots
 * (/clinic-admin, /clinic, /settings), so it only needs wiring once.
 */
import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAdminSettings } from '../hooks/useAdmin'
import { useIdleLogout } from '../hooks/useIdleLogout'
import IdleLogoutModal from '../components/IdleLogoutModal'

interface RequireAuthProps {
  children?: React.ReactNode
}

const DEFAULT_IDLE_MINUTES = 15

export function RequireAuth({ children }: RequireAuthProps): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const clearAuth       = useAuthStore((s) => s.clearAuth)
  const { data: settings } = useAdminSettings(isAuthenticated)
  const idleTimeoutMinutes = settings?.idleTimeoutMinutes ?? DEFAULT_IDLE_MINUTES

  const { warning, secondsLeft, stayLoggedIn } = useIdleLogout({
    timeoutMinutes: idleTimeoutMinutes,
    enabled: isAuthenticated,
    onLogout: () => {
      clearAuth()
      window.location.href = '/login?reason=idle'
    },
  })

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      {children !== undefined ? <>{children}</> : <Outlet />}
      <IdleLogoutModal open={warning} secondsLeft={secondsLeft} onStay={stayLoggedIn} />
    </>
  )
}
```

- [ ] **Step 5: Run the guard tests again**

Run (from `src/frontend`): `npx vitest run src/guards/guards.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/src/hooks/useAdmin.ts src/frontend/src/guards/RequireAuth.tsx src/frontend/src/guards/guards.test.tsx
git commit -m "feat: wire idle-logout timer into clinic RequireAuth guard"
```

---

### Task 4: Frontend — wire idle-logout into platform plane (`PlatformLayout`)

**Files:**
- Create: `src/frontend/src/vite-env.d.ts`
- Modify: `src/frontend/src/layouts/PlatformLayout.tsx`

**Interfaces:**
- Consumes: `useIdleLogout` (Task 1), `IdleLogoutModal` (Task 2).

- [ ] **Step 1: Add Vite env typing for the platform idle-timeout var**

`src/frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_IDLE_TIMEOUT_MINUTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 2: Wire the hook + modal into `PlatformLayout`**

In `src/frontend/src/layouts/PlatformLayout.tsx`, add imports at the top:

```tsx
import { useIdleLogout } from '../hooks/useIdleLogout'
import IdleLogoutModal from '../components/IdleLogoutModal'
```

Add a constant near the top of the file (after the `NAV` array, before `usePlatformLogout`):

```tsx
const PLATFORM_IDLE_MINUTES = Number(import.meta.env.VITE_PLATFORM_IDLE_TIMEOUT_MINUTES) || 30
```

Inside `export default function PlatformLayout()`, add the hook call right after the existing `usePlatformAuthStore` selectors (before the `if (!isAuth) return ...` line), and render the modal in the returned JSX (wrap the existing top-level return in a fragment):

```tsx
export default function PlatformLayout() {
  const isAuth   = usePlatformAuthStore((s) => s.isAuthenticated())
  const name     = usePlatformAuthStore((s) => s.name)
  const clearAuth = usePlatformAuthStore((s) => s.clearAuth)
  const { sidebarOpen, toggleSidebar } = useUiStore()
  const logout = usePlatformLogout()

  const { warning, secondsLeft, stayLoggedIn } = useIdleLogout({
    timeoutMinutes: PLATFORM_IDLE_MINUTES,
    enabled: isAuth,
    onLogout: () => {
      clearAuth()
      window.location.href = '/platform/login?reason=idle'
    },
  })

  if (!isAuth) return <Navigate to="/platform/login" replace />

  const sidebarW  = sidebarOpen ? 'w-56' : 'w-14'
  const mainClass = sidebarOpen ? 'ml-56' : 'ml-14'
  // ...(leave the existing navClass function and JSX body untouched)
```

At the very end of the component's returned JSX (the outermost element currently returned), wrap it so `IdleLogoutModal` renders alongside it — locate the final `return (...)` in the file and change it from returning a single root element to returning a fragment containing that element plus the modal:

```tsx
  return (
    <>
      {/* ...existing outermost JSX unchanged... */}
      <IdleLogoutModal open={warning} secondsLeft={secondsLeft} onStay={stayLoggedIn} />
    </>
  )
```

- [ ] **Step 3: Typecheck the wiring**

`PlatformLayout.tsx` has no existing dedicated test file, and the `enabled`/timer/warning behavior itself is already covered by `useIdleLogout.test.ts` (Task 1) — what's left to verify here is purely that the JSX wiring and `import.meta.env` typing compile correctly.

Run (from `src/frontend`): `npx tsc --noEmit`
Expected: no errors. If `import.meta.env.VITE_PLATFORM_IDLE_TIMEOUT_MINUTES` errors as unknown, confirm `src/frontend/src/vite-env.d.ts` (Step 1) is included by `tsconfig.json`'s default `include` — it covers all `.d.ts` files under `src/` with no extra config needed.

The end-to-end behavior (warning → stay-logged-in / logout → redirect with banner) is exercised in Plan 3's manual QA pass, once the banner exists.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/src/vite-env.d.ts src/frontend/src/layouts/PlatformLayout.tsx
git commit -m "feat: wire idle-logout timer into platform layout"
```

---

## Final Verification (run once, after all 4 tasks)

- [ ] Frontend full suite: `cd src/frontend && npm test` — expect 0 failures.
- [ ] `cd src/frontend && npx tsc --noEmit` — expect 0 errors.

**Next:** Once this plan is merged, proceed to `docs/superpowers/plans/2026-07-01-idle-logout-ux.md` (Plan 3).
