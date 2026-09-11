/**
 * AdminLayout nav-honesty tests (AUTH-403-05, C-10).
 *
 * AdminLayout.tsx's NAV array (previously lines 11-23) had no `perm` key on
 * any entry, and the render (previously line 76) was a bare `NAV.map(...)`
 * with no filter — every admin nav item rendered regardless of permission,
 * even for routes gated by RequirePermission in App.tsx. Reverting either the
 * per-item `perm` keys or the `.filter(...)` call must make this test fail.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to} data-testid="navlink" data-to={to}>{children}</a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useLocation: () => ({ pathname: '/clinic-admin/dashboard' }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useLogout: () => vi.fn(),
}))

vi.mock('../../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { name: 'Acme Clinic' } } }),
}))

vi.mock('../../store/uiStore', () => ({
  useUiStore: () => ({ sidebarOpen: true, toggleSidebar: vi.fn() }),
}))

vi.mock('../../i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('../../components/TopNav', () => ({
  default: () => <div data-testid="topnav" />,
}))

interface MockAuth {
  role: string
  name: string
  hasPermission: (code: string) => boolean
}

const authState: MockAuth = {
  role: 'admin',
  name: 'Alice',
  hasPermission: () => false,
}

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: MockAuth) => unknown) => selector(authState),
}))

import AdminLayout from '../AdminLayout'

describe('AdminLayout — nav honesty', () => {
  it('hides the Users nav item when staff.view is not held, while a held item still renders', () => {
    authState.hasPermission = (code: string) => code !== 'staff.view'
    render(<AdminLayout />)
    const links = screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to'))
    expect(links).not.toContain('/clinic-admin/users')
    // dashboard.view (mapped from clinic.profile.view) is held → still present
    expect(links).toContain('/clinic-admin/dashboard')
  })

  it('shows the Users nav item when staff.view is held', () => {
    authState.hasPermission = () => true
    render(<AdminLayout />)
    const links = screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to'))
    expect(links).toContain('/clinic-admin/users')
  })
})

describe('AdminLayout — permission-based entry (F-3)', () => {
  // AUTH: a role with role !== 'admin' but holding an admin-tree permission
  // (e.g. doctor/clinic_staff granted bloodbank.view) must NOT be bounced to
  // /clinic/dashboard before RequirePermission ever runs.
  it('does not redirect a non-admin role that holds an admin-tree permission (bloodbank.view)', () => {
    authState.role = 'doctor'
    authState.hasPermission = (code: string) => code === 'bloodbank.view'
    render(<AdminLayout />)
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument()
  })

  it('redirects a role with zero admin-tree permissions but some clinic-tree permission to /clinic/dashboard', () => {
    authState.role = 'doctor'
    authState.hasPermission = (code: string) => code === 'appointments.view'
    render(<AdminLayout />)
    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/clinic/dashboard')
  })

  it('does not redirect (renders in-shell) when the role has zero permissions in either tree', () => {
    authState.role = 'doctor'
    authState.hasPermission = () => false
    render(<AdminLayout />)
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument()
  })
})
