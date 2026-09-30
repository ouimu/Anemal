/**
 * RESP-5 — SettingsLayout adopts ResponsiveSidebar (ADR-0033).
 *
 * The useShellSidebar hook is the seam (fixed ShellSidebar per mode, offset included);
 * the real ResponsiveSidebar is never mocked. The role filter, dashboardPath and the
 * "Back to Dashboard" preNav stay in the host, unchanged (BR-2, G-3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ShellSidebar } from '../../hooks/useShellSidebar'
import settingsLayoutSource from '../SettingsLayout.tsx?raw'

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={to} data-testid="navlink" data-to={to} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
  ),
  Link: ({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={to} data-testid="link" data-to={to} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
  ),
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => ({ pathname: '/settings/clinic-profile' }),
}))

const { logoutSpy } = vi.hoisted(() => ({ logoutSpy: vi.fn() }))

vi.mock('../../hooks/useAuth', () => ({
  useLogout: () => logoutSpy,
}))

vi.mock('../../hooks/useAdmin', () => ({
  useAdminSettings: () => ({ data: { tenant: { name: 'Acme Clinic' } } }),
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
}
const authState: MockAuth = { role: 'admin', name: 'Alice' }

vi.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (s: MockAuth) => unknown) => selector(authState),
}))

let shellState: ShellSidebar
vi.mock('../../hooks/useShellSidebar', () => ({
  useShellSidebar: () => shellState,
}))

import SettingsLayout from '../SettingsLayout'

type ShellCase = 'expanded' | 'rail' | 'drawer'
const ALL_MODES: readonly ShellCase[] = ['expanded', 'rail', 'drawer']
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

function asRole(role: string): void {
  authState.role = role
}

const navRoutes = (): string[] => screen.queryAllByTestId('navlink').map((el) => el.getAttribute('data-to') ?? '')
const backLink = (): HTMLElement | undefined =>
  screen.queryAllByTestId('link').find((el) => el.textContent?.includes('nav.backToDashboard'))

beforeEach(() => {
  shellState = shellFor('expanded')
  asRole('admin')
  closeDrawer.mockClear()
  logoutSpy.mockClear()
})

describe('SettingsLayout — @AC-RESP-5-1 sidebar follows the shell modes', () => {
  const rows = [
    { kind: 'expanded', main: 'ml-56', top: 'left-56' },
    { kind: 'rail', main: 'ml-14', top: 'left-14' },
    { kind: 'drawer', main: 'ml-0', top: 'left-0' },
  ] as const
  for (const row of rows) {
    it(`${row.kind}: content carries ${row.main}, TopNav gets the shell`, () => {
      shellState = shellFor(row.kind)
      render(<SettingsLayout />)
      const main = screen.getByTestId('outlet').closest('main') as HTMLElement
      expect(main.className).toContain(row.main)
      expect(screen.getByTestId('topnav').getAttribute('data-offset-top')).toBe(row.top)
      expect(screen.getByTestId('topnav').getAttribute('data-mode')).toBe(row.kind)
    })
  }
})

describe('SettingsLayout — @AC-RESP-5-2 reacts to rotation without the mount-only workaround', () => {
  it('no innerWidth read and no mount effect remain in the layout source', () => {
    expect(settingsLayoutSource).not.toMatch(/innerWidth/)
    expect(settingsLayoutSource).not.toMatch(/LAYOUT-04/)
    expect(settingsLayoutSource).not.toMatch(/\buseEffect\b/)
    expect(settingsLayoutSource).not.toMatch(/uiStore|useUiStore/)
  })

  it('a mode change swaps the inline sidebar for a (closed) drawer on rerender, no reload', () => {
    shellState = shellFor('expanded')
    const view = render(<SettingsLayout />)
    expect(view.container.querySelector('aside')).not.toBeNull()
    shellState = { ...shellFor('drawer'), drawerOpen: false }
    view.rerender(<SettingsLayout />)
    expect(view.container.querySelector('aside')).toBeNull()
    expect((screen.getByTestId('outlet').closest('main') as HTMLElement).className).toContain('ml-0')
  })
})

describe('SettingsLayout — @AC-RESP-5-6 role filter is the same in every mode', () => {
  const rows: ReadonlyArray<{ role: string; label: string; route: string | null; shown: boolean; kinds: readonly ShellCase[] }> = [
    { role: 'admin', label: 'Operating Hours', route: '/settings/hours', shown: true, kinds: ['expanded', 'drawer'] },
    { role: 'admin', label: 'Branches', route: '/settings/branches', shown: true, kinds: ['drawer'] },
    { role: 'admin', label: 'Clinic Profile', route: '/settings/clinic-profile', shown: true, kinds: ['rail'] },
    { role: 'doctor', label: 'Clinic Profile', route: '/settings/clinic-profile', shown: false, kinds: ['expanded', 'drawer'] },
    { role: 'clinic_staff', label: 'Branches', route: '/settings/branches', shown: false, kinds: ['drawer'] },
  ]
  for (const row of rows) {
    for (const kind of row.kinds) {
      it(`${row.role} / ${kind}: ${row.label} is ${row.shown ? 'shown' : 'not shown'}`, () => {
        shellState = shellFor(kind)
        asRole(row.role)
        render(<SettingsLayout />)
        if (row.shown) expect(navRoutes()).toContain(row.route)
        else expect(navRoutes()).not.toContain(row.route)
      })
    }
  }

  it('doctor / drawer: Back to Dashboard is shown', () => {
    shellState = shellFor('drawer')
    asRole('doctor')
    render(<SettingsLayout />)
    expect(backLink()).toBeDefined()
  })

  it('renders an identical item set in expanded, rail and drawer(open)', () => {
    asRole('admin')
    const sets = ALL_MODES.map((kind) => {
      shellState = shellFor(kind)
      const view = render(<SettingsLayout />)
      const routes = navRoutes()
      view.unmount()
      return routes
    })
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
    expect(sets[0].length).toBeGreaterThan(0)
  })

  it('keeps the English literal labels as today (expanded)', () => {
    render(<SettingsLayout />)
    expect(screen.getByText('Operating Hours')).toBeInTheDocument()
    expect(screen.getByText('Storage')).toBeInTheDocument()
  })
})

describe('SettingsLayout — @AC-RESP-5-7 Back to Dashboard', () => {
  const rows = [
    { role: 'admin', home: '/clinic-admin/dashboard' },
    { role: 'doctor', home: '/clinic/dashboard' },
  ] as const
  for (const row of rows) {
    it(`${row.role}: goes to ${row.home} and closes the drawer`, () => {
      shellState = shellFor('drawer')
      asRole(row.role)
      render(<SettingsLayout />)
      const link = backLink() as HTMLElement
      expect(link.getAttribute('data-to')).toBe(row.home)
      fireEvent.click(link)
      expect(closeDrawer).toHaveBeenCalledTimes(1)
    })
  }
})

describe('SettingsLayout — @AC-RESP-5-4 plane separation and @AC-RESP-2-14 sign out', () => {
  it('@AC-RESP-5-4 no item links to /platform/ in any mode (clinic_admin)', () => {
    asRole('admin')
    for (const kind of ALL_MODES) {
      shellState = shellFor(kind)
      const view = render(<SettingsLayout />)
      const hrefs = [...navRoutes(), ...screen.queryAllByTestId('link').map((el) => el.getAttribute('data-to') ?? '')]
      for (const href of hrefs) expect(href).not.toContain('/platform/')
      view.unmount()
    }
  })

  it('@AC-RESP-2-14 (settings) Sign out is reachable in the drawer at 44px and signs out', () => {
    shellState = shellFor('drawer')
    render(<SettingsLayout />)
    const signOut = screen.getByRole('button', { name: 'Sign out' })
    expect(signOut.className).toContain('min-h-[44px]')
    fireEvent.click(signOut)
    expect(logoutSpy).toHaveBeenCalledTimes(1)
  })

  it('tapping a settings item in the drawer closes it', () => {
    shellState = shellFor('drawer')
    render(<SettingsLayout />)
    fireEvent.click(screen.getAllByTestId('navlink')[0])
    expect(closeDrawer).toHaveBeenCalledTimes(1)
  })
})
