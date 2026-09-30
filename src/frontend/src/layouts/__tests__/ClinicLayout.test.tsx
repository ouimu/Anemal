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
  useLocation: () => ({ pathname: '/clinic/dashboard' }),
}))

const { logoutSpy, useShellSidebarSpy } = vi.hoisted(() => ({
  logoutSpy: vi.fn(),
  useShellSidebarSpy: vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({
  useLogout: () => logoutSpy,
}))

vi.mock('../../components/TopNav', () => ({
  default: ({ shell }: { shell: ShellSidebar }) => (
    <div data-testid="topnav" data-offset-top={shell.offset.top} data-mode={shell.mode} />
  ),
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

describe('ClinicLayout — permission-based entry (F-3)', () => {
  // AUTH: role === 'admin' (clinic_admin) but holding a clinic-tree
  // permission (e.g. appointments.view, inventory.view, grooming.view) must
  // NOT be bounced to /clinic-admin/dashboard before RequirePermission runs.
  it('does not redirect an admin role that holds a clinic-tree permission (appointments.view)', () => {
    authState.role = 'admin'
    authState.hasPermission = (code: string) => code === 'appointments.view'
    render(<ClinicLayout />)
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument()
  })

  it('redirects an admin role with zero clinic-tree permissions but some admin-tree permission to /clinic-admin/dashboard', () => {
    authState.role = 'admin'
    authState.hasPermission = (code: string) => code === 'staff.view'
    render(<ClinicLayout />)
    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/clinic-admin/dashboard')
  })

  it('does not redirect (renders in-shell) when the role has zero permissions in either tree', () => {
    authState.role = 'admin'
    authState.hasPermission = () => false
    render(<ClinicLayout />)
    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument()
  })
})

// ── RESP-3: ClinicLayout adopts ResponsiveSidebar ───────────────────────────
const ALL_MODES: readonly ShellCase[] = ['expanded', 'rail', 'drawer']
const CLINIC_PERMS = [
  'dashboard.view', 'crm.view', 'appointments.view', 'emr.view',
  'inventory.view', 'billing.create', 'inpatient.view', 'grooming.view',
]

function holdPerms(role: string, held: readonly string[]): void {
  authState.role = role
  authState.hasPermission = (code: string) => held.includes(code)
}

function renderedLinks(): string[] {
  return screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to') ?? '')
}

describe('ClinicLayout — @AC-RESP-2-13 role-gated items are the same in every mode', () => {
  const doctorPerms = CLINIC_PERMS.filter((p) => p !== 'billing.create' && p !== 'grooming.view')
  const rows: ReadonlyArray<{ role: string; held: readonly string[]; route: string; shown: boolean }> = [
    { role: 'doctor', held: doctorPerms, route: '/clinic/billing', shown: false },
    { role: 'doctor', held: doctorPerms, route: '/clinic/grooming', shown: false },
    { role: 'doctor', held: doctorPerms, route: '/clinic/emr', shown: true },
    { role: 'clinic_staff', held: CLINIC_PERMS, route: '/clinic/billing', shown: true },
    { role: 'clinic_staff', held: CLINIC_PERMS, route: '/clinic/grooming', shown: true },
  ]

  for (const kind of ALL_MODES) {
    for (const row of rows) {
      it(`${row.role} / ${kind}: ${row.route} is ${row.shown ? 'shown' : 'not shown'}`, () => {
        shellState = shellFor(kind)
        holdPerms(row.role, row.held)
        render(<ClinicLayout />)
        const links = renderedLinks()
        if (row.shown) expect(links).toContain(row.route)
        else expect(links).not.toContain(row.route)
      })
    }
  }

  it('renders an identical item set in expanded, rail and drawer(open)', () => {
    holdPerms('doctor', CLINIC_PERMS.filter((p) => p !== 'billing.create'))
    const sets = ALL_MODES.map((kind) => {
      shellState = shellFor(kind)
      const view = render(<ClinicLayout />)
      const links = renderedLinks()
      view.unmount()
      return links
    })
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
    expect(sets[0].length).toBeGreaterThan(0)
  })

  it('drawer closed renders no navigation at all', () => {
    shellState = { ...shellFor('drawer'), drawerOpen: false }
    holdPerms('clinic_staff', CLINIC_PERMS)
    render(<ClinicLayout />)
    expect(screen.queryAllByTestId('navlink')).toHaveLength(0)
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
  })
})

describe('ClinicLayout — shell offset and top bar (@AC-RESP-3-2, @AC-RESP-3-3)', () => {
  for (const kind of ALL_MODES) {
    it(`content wrapper carries shell.offset.main and TopNav gets the shell (${kind})`, () => {
      shellState = shellFor(kind)
      holdPerms('doctor', CLINIC_PERMS)
      render(<ClinicLayout />)
      const main = screen.getByTestId('outlet').closest('main') as HTMLElement
      expect(main.className).toContain(shellState.offset.main)
      expect(screen.getByTestId('topnav').getAttribute('data-offset-top')).toBe(shellState.offset.top)
      expect(screen.getByTestId('topnav').getAttribute('data-mode')).toBe(kind)
    })
  }

  it('rail-band expansion pushes the content wrapper by the expanded width', () => {
    shellState = { ...shellFor('rail'), expanded: true, offset: { main: 'ml-56', top: 'left-56' } }
    holdPerms('doctor', CLINIC_PERMS)
    render(<ClinicLayout />)
    expect((screen.getByTestId('outlet').closest('main') as HTMLElement).className).toContain('ml-56')
  })

  it('A-2 calls useShellSidebar before the redirect early return', () => {
    holdPerms('admin', ['staff.view'])
    render(<ClinicLayout />)
    expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/clinic-admin/dashboard')
    expect(useShellSidebarSpy).toHaveBeenCalled()
    expect(screen.queryByTestId('topnav')).not.toBeInTheDocument()
  })
})

describe('ClinicLayout — drawer behaviour', () => {
  it('@AC-RESP-2-14 (clinic) Sign out is reachable in the drawer at 44px and signs out', () => {
    shellState = shellFor('drawer')
    holdPerms('doctor', CLINIC_PERMS)
    render(<ClinicLayout />)
    const signOut = screen.getByRole('button', { name: 'menu.signOut' })
    expect(signOut.className).toContain('min-h-[44px]')
    fireEvent.click(signOut)
    expect(logoutSpy).toHaveBeenCalledTimes(1)
  })

  it('tapping a nav item in the drawer closes it (shell.closeDrawer)', () => {
    shellState = shellFor('drawer')
    holdPerms('doctor', CLINIC_PERMS)
    render(<ClinicLayout />)
    fireEvent.click(screen.getAllByTestId('navlink')[0])
    expect(closeDrawer).toHaveBeenCalledTimes(1)
  })

  it('shows the company and branch in the sidebar header, the user in the footer', () => {
    shellState = shellFor('expanded')
    holdPerms('doctor', CLINIC_PERMS)
    render(<ClinicLayout />)
    expect(screen.getByText('Acme Clinic')).toBeInTheDocument()
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('@AC-RESP-5-4 no item links to /platform/ in any mode', () => {
    holdPerms('admin', CLINIC_PERMS)
    for (const kind of ALL_MODES) {
      shellState = shellFor(kind)
      const view = render(<ClinicLayout />)
      for (const href of renderedLinks()) expect(href).not.toContain('/platform/')
      view.unmount()
    }
  })
})
