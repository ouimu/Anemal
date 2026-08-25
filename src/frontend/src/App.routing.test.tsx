/**
 * App.routing.test.tsx — Group 3 (C-1, C-3, C-6; AUTH-403-01/02/03/06/07).
 *
 * DEVIATION FROM THE LITERAL "render real App" READING (recorded here per
 * C-11): rendering the actual `App` component inside a MemoryRouter reliably
 * exhausted the Vitest worker's heap (measured: >4GB, worker crash) — most
 * likely react-query retry/backoff loops fed by the mocked `fetch` across
 * App's many always-mounted hooks (idle-logout polling, admin-settings
 * query, preference hydration) compounding with Suspense/lazy() in a way
 * that a plain jsdom render doesn't bound the way a browser would. The plan
 * (§3, Task 3.1) names this exact fallback explicitly: "or exercising
 * RequirePermission + the three layouts together" via "a minimal harness".
 *
 * This harness therefore wires the REAL guard chain (`RequireAuth`,
 * `RequirePlane`, `RequirePermission`) and the REAL shell layouts
 * (`ClinicLayout`, `AdminLayout`) — the actual authorization-relevant code
 * this ADR changes — into a route tree that mirrors App.tsx's shape after
 * the Task 3.2 restructure exactly: same paths, same nesting, same guard
 * composition, including both two-segment-deep routes
 * (`vaccinations-due/record`). Only page CONTENT and LoginView's
 * presentational rendering are stubbed — those are unchanged by this ADR
 * and are covered by their own test files. `LoginBounceStub` reproduces
 * LoginView's authenticated-user bounce (LoginView.tsx:42-47) verbatim, so
 * the stale-bookmark chain (case 5) exercises the real bounce logic, not an
 * asserted-by-fiat shortcut.
 *
 * This does NOT independently prove App.tsx itself was edited — that is
 * covered by: (a) `guards/guards.test.tsx`, which imports the real
 * `RequirePermission` and would fail if the derivation regressed; (b) the
 * `ClinicLayout.test.tsx` / `AdminLayout.test.tsx` nav-honesty tests, which
 * import the real layouts; and (c) `npx tsc --noEmit`, which would fail
 * immediately if App.tsx's JSX referenced a route/element shape that didn't
 * type-check against the guard/layout signatures actually shipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate, Link } from 'react-router-dom'

vi.mock('./hooks/useAuth', () => ({
  useLogout: () => vi.fn(),
}))
vi.mock('./hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { name: 'Acme Clinic' } } }),
}))
vi.mock('./hooks/useIdleLogout', () => ({
  useIdleLogout: () => ({ warning: false, secondsLeft: 30, stayLoggedIn: vi.fn() }),
}))
vi.mock('./store/uiStore', () => ({
  useUiStore: () => ({ sidebarOpen: true, toggleSidebar: vi.fn() }),
}))
vi.mock('./i18n', () => ({
  useT: () => (key: string) => key,
}))
vi.mock('./components/TopNav', () => ({
  // §1 finding 3: TopNav is rendered by the layout outside <Outlet/>, so
  // AUTH-403-07 is already satisfied by nesting the 403 route correctly —
  // this stub keeps the /preferences link deterministic without pulling in
  // ProfileMenu's own react-query dependency (covered by its own tests).
  default: () => (
    <div data-testid="topnav">
      <Link to="/preferences" data-testid="preferences-link">preferences</Link>
    </div>
  ),
}))
vi.mock('./utils/queryClient', () => ({
  clearServerState: () => Promise.resolve(),
}))

interface MockAuth {
  isAuthenticated: () => boolean
  plane: 'clinic' | 'platform'
  role: string
  hasPermission: (code: string) => boolean
  permissions: string[]
  permissionsLoaded: boolean
  clearAuth: () => void
  name: string
  companyName: string
  branchName: string
  token: string
}

const authState: MockAuth = {
  isAuthenticated: () => true,
  plane: 'clinic',
  role: 'doctor',
  hasPermission: () => false,
  permissions: [],
  permissionsLoaded: true,
  clearAuth: vi.fn(),
  name: 'Alice',
  companyName: 'Acme Clinic',
  branchName: 'Main',
  token: 'jwt',
}

function setAuth(overrides: Partial<MockAuth>): void {
  authState.isAuthenticated = () => true
  authState.plane = 'clinic'
  authState.role = 'doctor'
  authState.hasPermission = () => false
  authState.permissions = []
  authState.permissionsLoaded = true
  authState.clearAuth = vi.fn()
  authState.name = 'Alice'
  authState.companyName = 'Acme Clinic'
  authState.branchName = 'Main'
  authState.token = 'jwt'
  Object.assign(authState, overrides)
}

vi.mock('./store/authStore', () => ({
  useAuthStore: (selector: (s: MockAuth) => unknown) => selector(authState),
}))

// Real guard + shell components — the actual authorization-relevant code.
import { RequireAuth, RequirePlane, RequirePermission } from './guards'
import ClinicLayout from './layouts/ClinicLayout'
import AdminLayout from './layouts/AdminLayout'

/** Mirrors App.tsx's inline ForbiddenView — body-only, no layout (C-3). */
function ForbiddenView() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 text-center">
      <h1>Access Denied</h1>
    </div>
  )
}

/** Reproduces LoginView.tsx:42-47's authenticated-user bounce verbatim. */
function LoginBounceStub() {
  if (authState.isAuthenticated()) {
    return (
      <Navigate
        to={authState.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard'}
        replace
      />
    )
  }
  return <div data-testid="login-page">login</div>
}

const stubPage = (id: string) => <div data-testid={id}>{id}</div>

/** Mirrors App.tsx's restructured tree shape exactly (Task 3.2). */
function TestApp() {
  return (
    <Routes>
      <Route path="/login" element={<LoginBounceStub />} />

      <Route
        path="/clinic-admin"
        element={<RequireAuth><RequirePlane plane="clinic"><AdminLayout /></RequirePlane></RequireAuth>}
      >
        <Route index element={<Navigate to="/clinic-admin/dashboard" replace />} />
        <Route path="dashboard" element={<RequirePermission perm="clinic.profile.view">{stubPage('admin-dashboard')}</RequirePermission>} />
        <Route path="users" element={<RequirePermission perm="staff.view">{stubPage('admin-users')}</RequirePermission>} />
        <Route path="403" element={<ForbiddenView />} />
      </Route>

      <Route
        path="/clinic"
        element={<RequireAuth><RequirePlane plane="clinic"><ClinicLayout /></RequirePlane></RequireAuth>}
      >
        <Route index element={<Navigate to="/clinic/dashboard" replace />} />
        <Route path="dashboard" element={<RequirePermission perm="dashboard.view">{stubPage('clinic-dashboard')}</RequirePermission>} />
        <Route path="pets" element={<RequirePermission perm="crm.view">{stubPage('clinic-pets')}</RequirePermission>} />
        <Route path="billing" element={<RequirePermission perm="billing.create">{stubPage('clinic-billing')}</RequirePermission>} />
        <Route path="vaccinations-due/record" element={<RequirePermission perm="vaccination.create">{stubPage('vacc-record')}</RequirePermission>} />
        <Route path="403" element={<ForbiddenView />} />
      </Route>

      <Route
        path="/preferences"
        element={<RequireAuth><RequirePlane plane="clinic"><div data-testid="preferences-page">preferences</div></RequirePlane></RequireAuth>}
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setAuth({})
})

describe('App routing — shape (a) 403 child routes', () => {
  it('in-shell denial: a doctor lacking billing.create still sees their own held nav item', () => {
    setAuth({ role: 'doctor', hasPermission: (code) => code === 'crm.view' })
    renderAt('/clinic/billing')
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    const petsLink = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/clinic/pets')
    expect(petsLink).toBeTruthy()
  })

  it('zero-permission recovery: empty sidebar, footer logout still present', () => {
    setAuth({ role: 'doctor', hasPermission: () => false, permissions: [], permissionsLoaded: true })
    renderAt('/clinic/dashboard')
    const nav = document.querySelector('nav')
    expect(nav?.querySelectorAll('a').length ?? 0).toBe(0)
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })

  it('no dead end: a /preferences link is present from the 403 render and it navigates to a rendering route', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    renderAt('/clinic/dashboard')
    const link = screen.getByTestId('preferences-link')
    expect(link).toBeInTheDocument()
    fireEvent.click(link)
    expect(screen.getByTestId('preferences-page')).toBeInTheDocument()
  })

  it('terminal render: the 403 element itself fires zero Navigate/redirect side effects', () => {
    // A non-admin role reaching /clinic/403 legitimately (not via
    // ClinicLayout's own pre-existing admin redirect, ClinicLayout.tsx:31 —
    // out of scope per Grill G3; nothing may depend on an admin reaching
    // /clinic/403, per ADR-0026 Consequences).
    setAuth({ role: 'doctor', hasPermission: () => false })
    renderAt('/clinic/403')
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByTestId('login-page')).toBeNull()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
  })

  it('stale bookmark resolves, not dead-ends: a zero-permission user hitting the deleted absolute /403 lands in-shell at /clinic/403', () => {
    setAuth({ role: 'doctor', hasPermission: () => false, permissions: [], permissionsLoaded: true })
    // /403 no longer exists as a route (Task 3.2) — the catch-all sends an
    // authenticated visitor to /login, whose bounce (LoginBounceStub, mirrors
    // LoginView.tsx:42-47) sends them to their dashboard, which denies them
    // and lands them on /clinic/403 in-shell.
    renderAt('/403')
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })

  it('two-segment-deep denial (vaccinations-due/record) also resolves to the tree-scoped /clinic/403, not a broken nested path', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    renderAt('/clinic/vaccinations-due/record')
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
  })
})
