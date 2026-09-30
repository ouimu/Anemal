/**
 * RESP-8 (Step 7, QA-owned) — @AC-RESP-4-3 at tablet portrait (drawer mode).
 *
 * The Admin-shell Scenario says a role without a screen's permission still cannot
 * reach it by address in drawer mode. The existing real-routing harness
 * (App.realRouting.test.tsx) pins `useViewportMode` to 'expanded', so it never proved
 * the drawer band. This harness renders the REAL App route tree (RequireAuth,
 * RequirePlane, RequirePermission, AdminLayout and the real ResponsiveSidebar; only
 * TopNav is a stub) with the viewport seam pinned to 'drawer'.
 *
 * Permission sets follow anemal-rbac-matrix references/permission-matrix.md (system
 * roles): doctor and clinic_staff hold clinic.profile.view and bloodbank.view, so they
 * enter AdminLayout and are stopped by RequirePermission, not by the layout redirect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

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

const CLINIC_COMMON = [
  'dashboard.view', 'crm.view', 'appointments.view', 'emr.view', 'inventory.view', 'inpatient.view',
  'clinic.profile.view', 'bloodbank.view',
]
const PERMS: Record<'doctor' | 'staff' | 'admin', string[]> = {
  doctor: CLINIC_COMMON,
  staff: [...CLINIC_COMMON, 'billing.create', 'grooming.view'],
  admin: [...CLINIC_COMMON, 'billing.create', 'grooming.view', 'staff.view', 'roles.view', 'audit.view'],
}

function signInAs(role: 'doctor' | 'staff' | 'admin'): void {
  const perms = PERMS[role]
  Object.assign(auth, {
    isAuthenticated: () => true,
    plane: 'clinic',
    role,
    permissions: perms,
    permissionsLoaded: true,
    hasPermission: (code: string) => perms.includes(code),
  })
}

vi.mock('../store/authStore', () => ({
  useAuthStore: Object.assign(
    (selector: (s: MockAuth) => unknown) => selector(auth),
    { getState: () => auth },
  ),
}))

const ui = { theme: 'light', language: 'en', sidebarOpen: true, toggleSidebar: vi.fn(), setSidebarOpen: vi.fn() }
vi.mock('../store/uiStore', () => ({
  useUiStore: (selector?: (s: typeof ui) => unknown) => (selector ? selector(ui) : ui),
}))

// Tablet portrait: the drawer band.
vi.mock('../hooks/useViewportMode', () => ({ useViewportMode: () => 'drawer' }))
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
vi.mock('../hooks/usePersonalPreferences', () => ({ usePreferenceHydration: () => undefined }))
vi.mock('../utils/queryClient', () => ({ clearServerState: () => Promise.resolve() }))
vi.mock('../components/TopNav', () => ({ default: () => <div data-testid="topnav" /> }))
vi.mock('../components/IdleLogoutModal', () => ({ default: () => null }))
// The guarded screens themselves: a marker is enough to prove "content shown / not shown".
vi.mock('../views/admin/UserManagementTab', () => ({ default: () => <div data-testid="screen-users" /> }))
vi.mock('../views/admin/AdminAudit', () => ({ default: () => <div data-testid="screen-audit" /> }))
vi.mock('../views/clinic/RoleEditorView', () => ({ default: () => <div data-testid="screen-roles" /> }))

import App from '../App'

function LocationProbe(): JSX.Element {
  return <div data-testid="loc">{useLocation().pathname}</div>
}

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <App />
    </MemoryRouter>,
  )
}

const FORBIDDEN = 'forbidden.title'

beforeEach(() => signInAs('doctor'))

describe('@AC-RESP-4-3 a role without the screen permission cannot reach it by address in drawer mode', () => {
  const denied = [
    { role: 'staff', path: '/clinic-admin/users', marker: 'screen-users' },
    { role: 'staff', path: '/clinic-admin/audit', marker: 'screen-audit' },
    { role: 'doctor', path: '/clinic-admin/roles', marker: 'screen-roles' },
  ] as const

  for (const row of denied) {
    it(`@AC-RESP-4-3 ${row.role} opening ${row.path} at 768px sees /clinic-admin/403, content not shown`, async () => {
      signInAs(row.role)
      at(row.path)
      expect(await screen.findByText(FORBIDDEN)).toBeInTheDocument()
      expect(screen.getByTestId('loc').textContent).toBe('/clinic-admin/403')
      expect(screen.queryByTestId(row.marker)).not.toBeInTheDocument()
      // Drawer band: the sidebar is closed (no aside in the tree) until the hamburger opens it.
      expect(document.querySelector('aside')).toBeNull()
    })
  }

  it('@AC-RESP-4-3 clinic_admin opening /clinic-admin/users at 768px sees the Users screen', async () => {
    signInAs('admin')
    at('/clinic-admin/users')
    expect(await screen.findByTestId('screen-users')).toBeInTheDocument()
    expect(screen.getByTestId('loc').textContent).toBe('/clinic-admin/users')
    expect(screen.queryByText(FORBIDDEN)).not.toBeInTheDocument()
  })
})
