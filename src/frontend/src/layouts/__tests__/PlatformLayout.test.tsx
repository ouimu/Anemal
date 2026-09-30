/**
 * RESP-5 — PlatformLayout adopts ResponsiveSidebar (ADR-0033, A-7).
 *
 * useShellSidebar, platformAuthStore and useIdleLogout are the seams; the real
 * ResponsiveSidebar, SidebarMenuButton and IdleLogoutModal/Dialog are never mocked.
 * jsdom cannot stack or lay out: z-order is asserted on classes, visual stacking is a
 * browser check (Step 7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ShellSidebar } from '../../hooks/useShellSidebar'

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children, onClick }: { to: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={to} data-testid="navlink" data-to={to} onClick={(e) => { e.preventDefault(); onClick?.() }}>{children}</a>
  ),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to} data-testid="link">{children}</a>,
  Outlet: () => <div data-testid="outlet" />,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate" data-to={to} />,
}))

interface MockPlatformAuth {
  isAuthenticated: () => boolean
  name: string
  clearAuth: () => void
}
const platformAuth: MockPlatformAuth = { isAuthenticated: () => true, name: 'Pat', clearAuth: vi.fn() }

vi.mock('../../store/platformAuthStore', () => ({
  usePlatformAuthStore: (selector: (s: MockPlatformAuth) => unknown) => selector(platformAuth),
}))

const { stayLoggedIn } = vi.hoisted(() => ({ stayLoggedIn: vi.fn() }))
const idleState = { warning: false, secondsLeft: 30, stayLoggedIn }
vi.mock('../../hooks/useIdleLogout', () => ({
  useIdleLogout: () => idleState,
}))

vi.mock('../../utils/queryClient', () => ({
  clearServerState: () => Promise.resolve(),
}))

let shellState: ShellSidebar
vi.mock('../../hooks/useShellSidebar', () => ({
  useShellSidebar: () => shellState,
}))

import PlatformLayout from '../PlatformLayout'

type ShellCase = 'expanded' | 'rail' | 'drawer'
const closeDrawer = vi.fn()
const openDrawer = vi.fn()

function shellFor(kind: ShellCase): ShellSidebar {
  const base = { toggleExpanded: vi.fn(), openDrawer, closeDrawer }
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
  platformAuth.isAuthenticated = () => true
  idleState.warning = false
  closeDrawer.mockClear()
  openDrawer.mockClear()
  stayLoggedIn.mockClear()
})

const topBar = (): HTMLElement => screen.getByRole('banner')

describe('PlatformLayout — @AC-RESP-5-3 mode and top-bar offset follow the shell', () => {
  const rows = [
    { kind: 'expanded', main: 'ml-56', top: 'left-56' },
    { kind: 'rail', main: 'ml-14', top: 'left-14' },
    { kind: 'drawer', main: 'ml-0', top: 'left-0' },
  ] as const
  for (const row of rows) {
    it(`${row.kind}: top bar carries ${row.top} and content carries ${row.main}`, () => {
      shellState = shellFor(row.kind)
      render(<PlatformLayout />)
      expect(topBar().className).toContain(row.top)
      expect((screen.getByTestId('outlet').closest('main') as HTMLElement).className).toContain(row.main)
    })
  }

  it('shows the hamburger in the platform header only in drawer mode (A-7) and it opens the drawer', () => {
    shellState = shellFor('expanded')
    const inline = render(<PlatformLayout />)
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
    inline.unmount()
    shellState = shellFor('rail')
    const rail = render(<PlatformLayout />)
    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
    rail.unmount()
    shellState = shellFor('drawer')
    render(<PlatformLayout />)
    const hamburger = screen.getByRole('button', { name: 'Open menu' })
    expect(topBar().contains(hamburger)).toBe(true)
    fireEvent.click(hamburger)
    expect(openDrawer).toHaveBeenCalledTimes(1)
  })

  it('renders the same four platform items in every mode', () => {
    const sets = (['expanded', 'rail', 'drawer'] as const).map((kind) => {
      shellState = shellFor(kind)
      const view = render(<PlatformLayout />)
      const routes = screen.getAllByTestId('navlink').map((el) => el.getAttribute('data-to'))
      view.unmount()
      return routes
    })
    expect(sets[0]).toEqual(['/platform/customers', '/platform/plans', '/platform/settings', '/platform/audit'])
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
  })
})

describe('PlatformLayout — @AC-RESP-5-5 entry gate', () => {
  it('without a platform session renders Navigate to /platform/login and no sidebar or hamburger', () => {
    platformAuth.isAuthenticated = () => false
    for (const kind of ['expanded', 'drawer'] as const) {
      shellState = shellFor(kind)
      const view = render(<PlatformLayout />)
      expect(screen.getByTestId('navigate').getAttribute('data-to')).toBe('/platform/login')
      expect(view.container.querySelector('aside')).toBeNull()
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument()
      expect(screen.queryByTestId('navlink')).not.toBeInTheDocument()
      view.unmount()
    }
  })
})

describe('PlatformLayout — drawer behaviour', () => {
  it('@AC-RESP-2-14 (platform) Sign out is reachable in the drawer at 44px', () => {
    shellState = shellFor('drawer')
    render(<PlatformLayout />)
    const signOut = screen.getByRole('button', { name: 'Sign out' })
    expect(signOut.className).toContain('min-h-[44px]')
  })

  it('tapping a platform item in the drawer closes it', () => {
    shellState = shellFor('drawer')
    render(<PlatformLayout />)
    fireEvent.click(screen.getAllByTestId('navlink')[0])
    expect(closeDrawer).toHaveBeenCalledTimes(1)
  })

  it('keeps the Platform Console header and Platform Admin footer labels', () => {
    render(<PlatformLayout />)
    expect(screen.getAllByText('Platform Console').length).toBeGreaterThan(0)
    expect(screen.getByText('Platform Admin')).toBeInTheDocument()
  })
})

describe('PlatformLayout — @AC-RESP-5-8 idle warning is above the drawer (class assert)', () => {
  it('sidebar layer z-[45], header z-40, idle warning through Dialog z-50, outside the sidebar tree', () => {
    shellState = shellFor('drawer')
    idleState.warning = true
    render(<PlatformLayout />)
    const panel = screen.getByRole('complementary', { name: 'Anemal' })
    expect(panel.className).toContain('z-[45]')
    const backdrop = document.querySelector('[data-testid="sidebar-backdrop"]') as HTMLElement
    expect(backdrop.className).toContain('z-[45]')
    expect(topBar().className).toContain('z-40')

    const warning = screen.getByRole('alertdialog')
    const warningLayer = warning.parentElement as HTMLElement
    expect(warningLayer.className).toContain('z-50')
    expect(panel.contains(warning)).toBe(false)
    expect(backdrop.contains(warning)).toBe(false)
  })

  it('its "stay signed in" control is usable while the drawer is open', () => {
    shellState = shellFor('drawer')
    idleState.warning = true
    render(<PlatformLayout />)
    fireEvent.click(screen.getByRole('button', { name: 'Stay logged in' }))
    expect(stayLoggedIn).toHaveBeenCalledTimes(1)
  })
})
