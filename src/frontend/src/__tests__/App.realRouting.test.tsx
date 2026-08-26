/**
 * REAL App.tsx routing + loop-freedom coverage (ADR-0026).
 *
 * Originated as @qa-agent's Step 7 verification harness, promoted to a
 * deliverable because App.tsx had NO test coverage: seven mutations — deleting
 * 403 routes, ForbiddenView rendering ClinicLayout (the ADR's named loop
 * hazard), a literal infinite redirect — all left the suite green.
 *
 * Renders the REAL route tree, not a hand-written mirror. Only leaf stores,
 * hooks and two chrome components are mocked; RequireAuth, RequirePlane,
 * RequirePermission, ClinicLayout, AdminLayout and SettingsLayout are the real
 * implementations, so this exercises the actual authorization path.
 *
 * NOTE on an earlier claim: rendering real App was reported to exhaust ~4GB of
 * heap. That was a mock defect (a MockAuth missing `plane`, so RequirePlane
 * redirected forever), not an inherent cost — with the mocks below it runs in
 * about two seconds.
 *
 * LOOP GUARD: a redirect cycle does not always surface as React's "Maximum
 * update depth exceeded" — some cycles simply spin, and the ClinicLayout
 * mutation HANGS the runner rather than failing it. LoopGuard bounds the
 * navigation count so a cycle fails fast and legibly instead of eating the
 * machine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation, Link } from 'react-router-dom'
import { useRef } from 'react'

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

const auth: MockAuth = {
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

function setAuth(o: Partial<MockAuth>): void {
  auth.isAuthenticated = () => true
  auth.plane = 'clinic'
  auth.role = 'doctor'
  auth.hasPermission = () => false
  auth.permissions = []
  auth.permissionsLoaded = true
  auth.name = 'Alice'
  auth.companyName = 'Acme Clinic'
  auth.branchName = 'Main'
  auth.token = 'jwt'
  Object.assign(auth, o)
}

vi.mock('../store/authStore', () => ({
  useAuthStore: Object.assign(
    (selector: (s: MockAuth) => unknown) => selector(auth),
    { getState: () => auth },
  ),
}))

const ui = { theme: 'light', language: 'en', sidebarOpen: true, toggleSidebar: vi.fn() }
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector?: (s: typeof ui) => unknown) =>
    (selector ? selector(ui) : ui),
}))

vi.mock('../i18n', () => ({ useT: () => (k: string) => k }))
vi.mock('../hooks/useAuth', () => ({
  useLogout: () => vi.fn(),
  useLogin: () => ({
    branchSelection: null,
    loginMutation: { mutate: vi.fn(), isPending: false, error: null },
    selectBranchMutation: { mutate: vi.fn(), isPending: false, isError: false },
    resetBranchSelection: vi.fn(),
  }),
  IdentityLoadError: class extends Error {},
}))
vi.mock('../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { name: 'Acme Clinic' }, idleTimeoutMinutes: 15 } }),
}))
vi.mock('../hooks/useIdleLogout', () => ({
  useIdleLogout: () => ({ warning: false, secondsLeft: 30, stayLoggedIn: vi.fn() }),
}))
vi.mock('../hooks/usePersonalPreferences', () => ({
  usePreferenceHydration: () => undefined,
}))
vi.mock('../utils/queryClient', () => ({ clearServerState: () => Promise.resolve() }))
vi.mock('../components/TopNav', () => ({
  // Ported from the deleted App.routing.test.tsx: TopNav renders outside
  // <Outlet/>, so a link here is reachable FROM a 403 render. Keeps
  // ProfileMenu's react-query dependency out (covered by its own tests).
  default: () => (
    <div data-testid="topnav">
      <Link to="/preferences" data-testid="preferences-link">preferences</Link>
    </div>
  ),
}))
vi.mock('../components/IdleLogoutModal', () => ({ default: () => null }))

import App from '../App'

/**
 * Fails fast on an unbounded redirect cycle instead of letting the runner hang.
 * Mounted inside the router but outside <Routes>, so it survives navigations
 * and its ref accumulates across them.
 */
const MAX_NAVIGATIONS = 40
function LoopGuard() {
  const { pathname } = useLocation()
  const renders = useRef(0)
  renders.current += 1
  if (renders.current > MAX_NAVIGATIONS) {
    throw new Error(
      `Redirect loop: exceeded ${MAX_NAVIGATIONS} navigations, last at ${pathname}. ` +
      'ADR-0026: a 403 component must never render ClinicLayout/AdminLayout.',
    )
  }
  return null
}

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoopGuard />
      <App />
    </MemoryRouter>,
  )
}

/** The real ForbiddenView's heading key under the mocked useT. */
const FORBIDDEN = 'forbidden.title'

beforeEach(() => { setAuth({}) })

describe('REAL App.tsx — in-shell 403, all three trees', () => {
  it('/clinic denial -> in-shell /clinic/403 with ClinicLayout chrome', () => {
    setAuth({ role: 'doctor', hasPermission: (c) => c === 'crm.view' })
    at('/clinic/billing')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })

  it('/clinic-admin denial -> in-shell /clinic-admin/403 with AdminLayout chrome', () => {
    setAuth({ role: 'admin', hasPermission: (c) => c === 'clinic.profile.view' })
    at('/clinic-admin/users')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })

  it('/settings denial -> in-shell /settings/403 with SettingsLayout chrome (tree omitted by App.routing.test.tsx)', () => {
    setAuth({ role: 'staff', hasPermission: () => false })
    at('/settings/clinic-profile')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
    expect(screen.getByText('nav.backToDashboard')).toBeInTheDocument()
  })

  it('two-segment-deep /settings/storage/connecting denial -> /settings/403, not /settings/storage/connecting/403', () => {
    setAuth({ role: 'staff', hasPermission: () => false })
    at('/settings/storage/connecting')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('two-segment-deep /clinic/vaccinations-due/record denial -> /clinic/403', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/clinic/vaccinations-due/record')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })
})

describe('REAL App.tsx — loop freedom on every path in and out of 403', () => {
  it('zero-permission doctor at /clinic/dashboard terminates on the 403 with an empty nav and a reachable logout', () => {
    setAuth({ role: 'doctor', hasPermission: () => false, permissions: [], permissionsLoaded: true })
    at('/clinic/dashboard')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(document.querySelector('nav')?.querySelectorAll('a').length ?? -1).toBe(0)
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })

  it('zero-permission ADMIN at /clinic-admin/dashboard terminates on the 403 with an empty nav and a reachable logout', () => {
    setAuth({ role: 'admin', hasPermission: () => false, permissions: [], permissionsLoaded: true })
    at('/clinic-admin/dashboard')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(document.querySelector('nav')?.querySelectorAll('a').length ?? -1).toBe(0)
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
  })

  it('ADMIN denied inside /clinic/* is relocated by ClinicLayout:31 and TERMINATES (no /clinic/403 -> dashboard cycle)', () => {
    setAuth({ role: 'admin', hasPermission: () => false })
    at('/clinic/billing')
    // ClinicLayout relocates to /clinic-admin/dashboard, which denies -> /clinic-admin/403.
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('nav.adminPanel')).toBeInTheDocument()
  })

  it('ADMIN landing directly on /clinic/403 is relocated and TERMINATES', () => {
    setAuth({ role: 'admin', hasPermission: () => false })
    at('/clinic/403')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('nav.adminPanel')).toBeInTheDocument()
  })

  it('ADMIN with clinic.profile.view landing on /clinic/403 is relocated to an ALLOWED dashboard, not a cycle', () => {
    setAuth({ role: 'admin', hasPermission: (c) => c === 'clinic.profile.view' })
    at('/clinic/403')
    // Settles on the allowed AdminDashboard, which is React.lazy() — so the
    // stable terminal render here is App's Suspense <Loader/>, NOT a 403 and
    // NOT a redirect cycle (a cycle would throw "Maximum update depth").
    expect(screen.queryByText(FORBIDDEN)).toBeNull()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })

  it('non-admin landing on /clinic-admin/403 is relocated by AdminLayout:36 and TERMINATES on /clinic/403', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/clinic-admin/403')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('menu.signOut')).toBeInTheDocument()
    expect(screen.queryByText('nav.adminPanel')).toBeNull()
  })

  it('stale bookmark to the DELETED absolute /403: catch-all -> /login -> authenticated bounce -> in-shell /clinic/403', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/403')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
  })

  it('stale bookmark to /403 as an ADMIN also terminates in-shell', () => {
    setAuth({ role: 'admin', hasPermission: () => false })
    at('/403')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('nav.adminPanel')).toBeInTheDocument()
  })

  it('/preferences is reachable and terminal for a zero-permission session (no RequirePermission on it)', () => {
    setAuth({ role: 'doctor', hasPermission: () => false, permissions: [] })
    at('/preferences')
    expect(screen.queryByText(FORBIDDEN)).toBeNull()
  })

  it('legacy /admin/audit redirect terminates for an admin without audit.view', () => {
    setAuth({ role: 'admin', hasPermission: (c) => c === 'clinic.profile.view' })
    at('/admin/audit')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('nav.adminPanel')).toBeInTheDocument()
  })

  it('legacy /admin/branches redirect crosses into /settings and terminates', () => {
    setAuth({ role: 'admin', hasPermission: () => false })
    at('/admin/branches')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('an unmatched garbage URL for an authenticated user terminates (catch-all -> login bounce -> 403)', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/this/route/does/not/exist')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
  })

  it('PLANE ISOLATION: a platform-plane session hitting /clinic/403 is sent to its own plane, never the clinic 403', () => {
    setAuth({ role: 'ops', plane: 'platform', hasPermission: () => false })
    at('/clinic/403')
    expect(screen.queryByText(FORBIDDEN)).toBeNull()
    expect(screen.queryByTestId('topnav')).toBeNull()
  })

  it('permissionsLoaded:false renders the pending spinner, never a 403 (INV-PERM-1: unknown is not empty)', () => {
    setAuth({ role: 'doctor', hasPermission: () => false, permissionsLoaded: false })
    at('/clinic/dashboard')
    expect(screen.queryByText(FORBIDDEN)).toBeNull()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })
})

describe('REAL App.tsx — QA edge probes', () => {
  it('EDGE: case-variant URL /CLINIC/billing (react-router matches case-insensitively) still lands on a rendering in-shell 403', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/CLINIC/billing')
    // split('/')[1] yields 'CLINIC' -> /CLINIC/403; route matching is
    // case-insensitive, so this must still resolve in-shell, not cycle.
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    expect(screen.getByTestId('topnav')).toBeInTheDocument()
  })

  it('EDGE: trailing slash /clinic/billing/ still derives the clinic tree', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/clinic/billing/')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
  })

  it('INV-PERM-1 TENSION: while permissionsLoaded is FALSE (unknown), AdminLayout nav renders EMPTY — unknown shown as none', () => {
    setAuth({ role: 'admin', hasPermission: () => false, permissionsLoaded: false })
    at('/clinic-admin/dashboard')
    const navLinks = document.querySelector('nav')?.querySelectorAll('a').length ?? -1
    // Documents current behaviour; nav is cosmetic, never enforcement.
    expect(navLinks).toBe(0)
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })
})

// ── Ported from App.routing.test.tsx before its deletion (@qa-agent ruling) ──
// That file was a hand-written mirror of App.tsx and had already drifted: its
// inline ForbiddenView still carried `h-screen` (the styling Group 7 replaced
// with min-h-[60vh]) and it declared no /settings tree at all. These two cases
// were its only coverage not already here, and both are AC-load-bearing — so
// they move rather than die with it. Both now run against the REAL App.
describe('REAL App.tsx — escaping the denial (ported: AUTH-403-01/03/07)', () => {
  it('AUTH-403-01: a denied doctor still sees a nav item they DO hold, rendered in the real sidebar', () => {
    setAuth({ role: 'doctor', hasPermission: (c) => c === 'crm.view' })
    at('/clinic/billing')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    const petsLink = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === '/clinic/pets')
    expect(petsLink).toBeTruthy()
  })

  it('AUTH-403-01: clicking that held nav item escapes the 403 to a rendering route', () => {
    setAuth({ role: 'doctor', hasPermission: (c) => c === 'crm.view' })
    at('/clinic/billing')
    const petsLink = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === '/clinic/pets')!
    fireEvent.click(petsLink)
    // ClinicPets is lazy(), and this is a transition rather than a fresh mount,
    // so React <Suspense> HIDES the old subtree (display:none !important) instead
    // of unmounting it — queryByText would still find the 403 node. Assert on
    // visibility, which is the honest claim anyway: the denial is no longer shown.
    expect(screen.getByText(FORBIDDEN)).not.toBeVisible()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })

  it('AUTH-403-03/07: a non-logout affordance is present ON the 403 render and reaches a rendering route', () => {
    setAuth({ role: 'doctor', hasPermission: () => false })
    at('/clinic/dashboard')
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument()
    const link = screen.getByTestId('preferences-link')
    fireEvent.click(link)
    // /preferences carries no RequirePermission, so a zero-permission session
    // reaches it — the guaranteed escape hatch. PreferencesPage is lazy(), so
    // as above the denial is hidden by Suspense rather than unmounted.
    expect(screen.getByText(FORBIDDEN)).not.toBeVisible()
    expect(document.querySelector('.animate-spin')).not.toBeNull()
  })
})
