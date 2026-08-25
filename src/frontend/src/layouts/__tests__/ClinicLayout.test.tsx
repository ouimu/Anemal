/**
 * ClinicLayout nav-honesty tests (AUTH-403-05, C-10).
 *
 * ClinicLayout.tsx:76 already filters NAV by permission
 * (`NAV.filter(item => !item.perm || hasPermission(item.perm))`); the gap was
 * line 11's Dashboard entry carrying `perm: undefined`, so it always rendered
 * even though the route itself is gated on `dashboard.view`. Reverting the
 * one-word fix (`perm: undefined` -> `perm: 'dashboard.view'`) must make this
 * test fail, since the filter would then have nothing to exclude Dashboard on.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to} data-testid="navlink" data-to={to}>{children}</a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useLocation: () => ({ pathname: '/clinic/dashboard' }),
}))

vi.mock('../../hooks/useAuth', () => ({
  useLogout: () => vi.fn(),
}))

vi.mock('../../components/TopNav', () => ({
  default: () => <div data-testid="topnav" />,
}))

vi.mock('../../store/uiStore', () => ({
  useUiStore: () => ({ sidebarOpen: true, toggleSidebar: vi.fn() }),
}))

vi.mock('../../i18n', () => ({
  useT: () => (key: string) => key,
}))

interface MockAuth {
  role: string
  name: string
  companyName: string
  branchName: string
  hasPermission: (code: string) => boolean
}

const authState: MockAuth = {
  role: 'doctor',
  name: 'Alice',
  companyName: 'Acme Clinic',
  branchName: 'Main',
  hasPermission: () => false,
}

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: MockAuth) => unknown) => selector(authState),
}))

import ClinicLayout from '../ClinicLayout'

describe('ClinicLayout — nav honesty', () => {
  it('hides the Dashboard nav item when dashboard.view is not held', () => {
    authState.hasPermission = (code: string) => code !== 'dashboard.view'
    render(<ClinicLayout />)
    const links = screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to'))
    expect(links).not.toContain('/clinic/dashboard')
  })

  it('shows the Dashboard nav item when dashboard.view is held', () => {
    authState.hasPermission = () => true
    render(<ClinicLayout />)
    const links = screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to'))
    expect(links).toContain('/clinic/dashboard')
  })
})
