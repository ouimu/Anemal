/**
 * AdminLayout nav-honesty tests (AUTH-403-05, C-10).
 *
 * AdminLayout.tsx's NAV array (previously lines 11-23) had no `perm` key on
 * any entry, and the render (previously line 76) was a bare `NAV.map(...)`
 * with no filter — every admin nav item rendered regardless of permission,
 * even for routes gated by RequirePermission in App.tsx. Reverting either the
 * per-item `perm` keys or the `.filter(...)` call must make this test fail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ShellSidebar } from '../../hooks/useShellSidebar'

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={to} data-testid="navlink" data-to={to} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
  ),
  Link: ({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={to} data-testid="link" data-to={to} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
  useLocation: () => ({ pathname: '/clinic-admin/dashboard' }),
}))

const { logoutSpy, useShellSidebarSpy } = vi.hoisted(() => ({
  logoutSpy: vi.fn(),
  useShellSidebarSpy: vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({
  useLogout: () => logoutSpy,
}))

vi.mock('../../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { name: 'Acme Clinic' } } }),
}))

// The sidebar state hook is the seam: a fixed ShellSidebar per mode, offset included.
// The real ResponsiveSidebar is never mocked.
let shellState: ShellSidebar
vi.mock('../../hooks/useShellSidebar', () => ({
  useShellSidebar: () => {
    useShellSidebarSpy()
    return shellState
  },
}))

vi.mock('../../i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('../../components/TopNav', () => ({
  default: ({ shell }: { shell: ShellSidebar }) => (
    <div data-testid="topnav" data-offset-top={shell.offset.top} data-mode={shell.mode} />
  ),
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

type ShellCase = 'expanded' | 'rail' | 'drawer'
const closeDrawer = vi.fn()

function shellFor(kind: ShellCase): ShellSidebar {
  const base = { toggleExpanded: vi.fn(), openDrawer: vi.fn(), closeDrawer }
  if (kind === 'expanded') {
    return { ...base, mode: 'expanded', expanded: true, drawerOpen: false, offset: { main: 'ml-56', top: 'left-56' } }
  }
  if (kind === 'rail') {
    return { ...base, mode: 'rail', expanded: false, drawerOpen: false, offset: { main: 'ml-14', top: 'left-14' } }
  }
  return { ...base, mode: 'drawer', expanded: false, drawerOpen: true, offset: { main: 'ml-0', top: 'left-0' } }
}

beforeEach(() => {
  shellState = shellFor('expanded')
  closeDrawer.mockClear()
  logoutSpy.mockClear()
  useShellSidebarSpy.mockClear()
})

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

// ── RESP-4: AdminLayout adopts ResponsiveSidebar ────────────────────────────
const ALL_MODES: readonly ShellCase[] = ['expanded', 'rail', 'drawer']
const ADMIN_PERMS = [
  'clinic.profile.view', 'staff.view', 'bloodbank.view', 'audit.view', 'roles.view',
]

function holdPerms(role: string, held: readonly string[]): void {
  authState.role = role
  authState.hasPermission = (code: string) => held.includes(code)
}

function renderedLinks(): string[] {
  return screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to') ?? '')
}

describe('AdminLayout — @AC-RESP-4-1 sidebar mode and offset follow the shell', () => {
  const rows: ReadonlyArray<{ kind: ShellCase; main: string; top: string }> = [
    { kind: 'expanded', main: 'ml-56', top: 'left-56' },
    { kind: 'rail', main: 'ml-14', top: 'left-14' },
    { kind: 'drawer', main: 'ml-0', top: 'left-0' },
  ]
  for (const row of rows) {
    it(`${row.kind}: TopNav gets the shell and the content wrapper carries ${row.main}`, () => {
      shellState = shellFor(row.kind)
      holdPerms('admin', ADMIN_PERMS)
      render(<AdminLayout />)
      const main = screen.getByTestId('outlet').closest('main') as HTMLElement
      expect(main.className).toContain(row.main)
      expect(screen.getByTestId('topnav').getAttribute('data-offset-top')).toBe(row.top)
      expect(screen.getByTestId('topnav').getAttribute('data-mode')).toBe(row.kind)
    })
  }

  it('A-2 calls useShellSidebar before the redirect early return', () => {
    holdPerms('doctor', ['appointments.view'])
    render(<AdminLayout />)
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/clinic/dashboard')
    expect(useShellSidebarSpy).toHaveBeenCalled()
  })
})

describe('AdminLayout — @AC-RESP-4-4 role-gated items are the same in every mode', () => {
  const staffPerms = ['clinic.profile.view']
  const doctorPerms = ['clinic.profile.view', 'bloodbank.view']
  const rows: ReadonlyArray<{ role: string; held: readonly string[]; route: string; shown: boolean; kinds: readonly ShellCase[] }> = [
    { role: 'clinic_admin', held: ADMIN_PERMS, route: '/clinic-admin/users', shown: true, kinds: ['drawer'] },
    { role: 'clinic_admin', held: ADMIN_PERMS, route: '/clinic-admin/roles', shown: true, kinds: ['rail'] },
    { role: 'clinic_staff', held: staffPerms, route: '/clinic-admin/users', shown: false, kinds: ['expanded', 'drawer'] },
    { role: 'clinic_staff', held: staffPerms, route: '/clinic-admin/audit', shown: false, kinds: ['drawer'] },
    { role: 'doctor', held: doctorPerms, route: '/clinic-admin/roles', shown: false, kinds: ['drawer'] },
    { role: 'doctor', held: doctorPerms, route: '/clinic-admin/blood-bank', shown: true, kinds: ['drawer'] },
  ]
  for (const row of rows) {
    for (const kind of row.kinds) {
      it(`${row.role} / ${kind}: ${row.route} is ${row.shown ? 'shown' : 'not shown'}`, () => {
        shellState = shellFor(kind)
        holdPerms(row.role, row.held)
        render(<AdminLayout />)
        if (row.shown) expect(renderedLinks()).toContain(row.route)
        else expect(renderedLinks()).not.toContain(row.route)
      })
    }
  }

  it('renders an identical item set in expanded, rail and drawer(open)', () => {
    holdPerms('doctor', doctorPerms)
    const sets = ALL_MODES.map((kind) => {
      shellState = shellFor(kind)
      const view = render(<AdminLayout />)
      const links = renderedLinks()
      view.unmount()
      return links
    })
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
    expect(sets[0].length).toBeGreaterThan(0)
  })

  it('@AC-RESP-5-4 no item links to /platform/ in any mode', () => {
    holdPerms('admin', ADMIN_PERMS)
    for (const kind of ALL_MODES) {
      shellState = shellFor(kind)
      const view = render(<AdminLayout />)
      for (const href of renderedLinks()) expect(href).not.toContain('/platform/')
      view.unmount()
    }
  })
})

describe('AdminLayout — drawer behaviour', () => {
  it('@AC-RESP-4-2 tapping a nav item in the admin drawer closes it', () => {
    shellState = shellFor('drawer')
    holdPerms('admin', ADMIN_PERMS)
    render(<AdminLayout />)
    fireEvent.click(screen.getAllByTestId('navlink')[0])
    expect(closeDrawer).toHaveBeenCalledTimes(1)
  })

  it('@AC-RESP-2-14 (admin) Sign out is reachable in the drawer at 44px and signs out', () => {
    shellState = shellFor('drawer')
    holdPerms('admin', ADMIN_PERMS)
    render(<AdminLayout />)
    const signOut = screen.getByRole('button', { name: 'menu.signOut' })
    expect(signOut.className).toContain('min-h-[44px]')
    fireEvent.click(signOut)
    expect(logoutSpy).toHaveBeenCalledTimes(1)
  })

  it('drawer closed renders no navigation', () => {
    shellState = { ...shellFor('drawer'), drawerOpen: false }
    holdPerms('admin', ADMIN_PERMS)
    render(<AdminLayout />)
    expect(screen.queryAllByTestId('navlink')).toHaveLength(0)
  })

  it('shows the tenant name and admin panel label in the sidebar header', () => {
    shellState = shellFor('expanded')
    holdPerms('admin', ADMIN_PERMS)
    render(<AdminLayout />)
    expect(screen.getByText('Acme Clinic')).toBeInTheDocument()
    expect(screen.getByText('nav.adminPanel')).toBeInTheDocument()
  })
})

// @AC-RESP-4-3 (a role without the screen's permission cannot reach it by address) is the
// existing route-guard behaviour, unchanged by this feature: RequirePermission redirects to
// /clinic-admin/403 (guards/guards.test.tsx and __tests__/App.realRouting.test.tsx, both read-only).
