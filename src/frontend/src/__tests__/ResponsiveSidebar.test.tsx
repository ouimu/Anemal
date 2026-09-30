/**
 * RESP-2 — ResponsiveSidebar (presentational). Props in, MemoryRouter only.
 * Precedent: Dialog.test.tsx (including the `?raw` import-allowlist census).
 * See docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-arch.md section 4c.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import sidebarSource from '../components/ResponsiveSidebar.tsx?raw'
import ResponsiveSidebar, {
  SidebarMenuButton,
  type ResponsiveSidebarProps,
  type SidebarNavItem,
} from '../components/ResponsiveSidebar'

const ITEMS: readonly SidebarNavItem[] = [
  { to: '/clinic/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/clinic/pets', icon: 'pets', label: 'Pets' },
  { to: '/clinic/emr', icon: 'medical_services', label: 'EMR' },
]

function baseProps(over: Partial<ResponsiveSidebarProps> = {}): ResponsiveSidebarProps {
  return {
    mode: 'expanded',
    expanded: true,
    drawerOpen: false,
    onToggleExpanded: vi.fn(),
    onCloseDrawer: vi.fn(),
    items: ITEMS,
    header: { title: 'Acme Clinic', subtitle: 'Main' },
    footer: { name: 'Alice', roleLabel: 'doctor', initial: 'A', signOutLabel: 'Sign out', onSignOut: vi.fn() },
    ...over,
  }
}

function LocationProbe(): JSX.Element {
  return <div data-testid="loc">{useLocation().pathname}</div>
}

function renderSidebar(props: ResponsiveSidebarProps) {
  return render(
    <MemoryRouter initialEntries={['/clinic/dashboard']}>
      <ResponsiveSidebar {...props} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

const hrefs = (): (string | null)[] => screen.getAllByRole('link').map((a) => a.getAttribute('href'))

describe('ResponsiveSidebar — inline modes', () => {
  it('@AC-RESP-2-1 expanded: w-56 aside, labels shown, collapse toggle present', () => {
    renderSidebar(baseProps())
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('w-56')
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Acme Clinic')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })

  it('@AC-RESP-2-2 rail: w-14 aside, icons only, toggle expands (calls onToggleExpanded)', () => {
    const onToggleExpanded = vi.fn()
    renderSidebar(baseProps({ mode: 'rail', expanded: false, onToggleExpanded }))
    expect(screen.getByRole('complementary').className).toContain('w-14')
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(onToggleExpanded).toHaveBeenCalledTimes(1)
  })

  it('rail band expanded stays inline at w-56 (push, never an overlay)', () => {
    renderSidebar(baseProps({ mode: 'rail', expanded: true }))
    const aside = screen.getByRole('complementary')
    expect(aside.className).toContain('w-56')
    expect(screen.getByText('Pets')).toBeInTheDocument()
  })

  it('has no backdrop in inline modes', () => {
    renderSidebar(baseProps())
    expect(document.querySelector('[data-testid="sidebar-backdrop"]')).toBeNull()
  })

  it('nav links in inline modes do not call onCloseDrawer', () => {
    const onCloseDrawer = vi.fn()
    renderSidebar(baseProps({ onCloseDrawer }))
    fireEvent.click(screen.getByText('Pets'))
    expect(onCloseDrawer).not.toHaveBeenCalled()
  })
})

describe('ResponsiveSidebar — drawer mode', () => {
  const drawer = (over: Partial<ResponsiveSidebarProps> = {}) =>
    baseProps({ mode: 'drawer', expanded: false, drawerOpen: true, ...over })

  it('@AC-RESP-2-3 closed: nothing in flow, no sidebar node in the accessibility tree', () => {
    const { container } = renderSidebar(drawer({ drawerOpen: false }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(container.querySelector('aside')).toBeNull()
  })

  it('@AC-RESP-2-4 @AC-RESP-2-14 open: backdrop + panel with labels, footer and sign-out', () => {
    const onSignOut = vi.fn()
    renderSidebar(
      drawer({ footer: { name: 'Alice', roleLabel: 'doctor', initial: 'A', signOutLabel: 'Sign out', onSignOut } }),
    )
    const panel = screen.getByRole('dialog')
    expect(within(panel).getByText('Dashboard')).toBeInTheDocument()
    expect(within(panel).getByText('Acme Clinic')).toBeInTheDocument()
    expect(within(panel).getByText('Alice')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="sidebar-backdrop"]')).not.toBeNull()
    expect(within(panel).queryByRole('button', { name: /sidebar/i })).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('@AC-RESP-2-5 backdrop tap calls onCloseDrawer', () => {
    const onCloseDrawer = vi.fn()
    renderSidebar(drawer({ onCloseDrawer }))
    fireEvent.click(document.querySelector('[data-testid="sidebar-backdrop"]') as HTMLElement)
    expect(onCloseDrawer).toHaveBeenCalledTimes(1)
  })

  it('@AC-RESP-2-6 nav-item activation navigates and calls onCloseDrawer', () => {
    const onCloseDrawer = vi.fn()
    renderSidebar(drawer({ onCloseDrawer }))
    fireEvent.click(screen.getByText('Pets'))
    expect(onCloseDrawer).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('loc').textContent).toBe('/clinic/pets')
  })

  it('@AC-RESP-2-6 preNav activation calls onCloseDrawer (feeds @AC-RESP-5-7)', () => {
    const onCloseDrawer = vi.fn()
    renderSidebar(
      drawer({ onCloseDrawer, preNav: { to: '/clinic/dashboard', icon: 'arrow_back', label: 'Back to Dashboard' } }),
    )
    fireEvent.click(screen.getByText('Back to Dashboard'))
    expect(onCloseDrawer).toHaveBeenCalledTimes(1)
  })

  it('@AC-RESP-2-12 Escape closes the drawer and focus returns to the opener', () => {
    const onCloseDrawer = vi.fn()
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { rerender } = render(
      <MemoryRouter>
        <ResponsiveSidebar {...drawer({ onCloseDrawer, drawerOpen: false })} />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter>
        <ResponsiveSidebar {...drawer({ onCloseDrawer })} />
      </MemoryRouter>,
    )
    expect(opener).not.toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCloseDrawer).toHaveBeenCalledTimes(1)
    rerender(
      <MemoryRouter>
        <ResponsiveSidebar {...drawer({ onCloseDrawer, drawerOpen: false })} />
      </MemoryRouter>,
    )
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('other keys do not close the drawer', () => {
    const onCloseDrawer = vi.fn()
    renderSidebar(drawer({ onCloseDrawer }))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onCloseDrawer).not.toHaveBeenCalled()
  })

  it('removes the Escape listener when the drawer closes', () => {
    const onCloseDrawer = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <ResponsiveSidebar {...drawer({ onCloseDrawer })} />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter>
        <ResponsiveSidebar {...drawer({ onCloseDrawer, drawerOpen: false })} />
      </MemoryRouter>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCloseDrawer).not.toHaveBeenCalled()
  })
})

describe('ResponsiveSidebar — parity, tap targets, z-order', () => {
  it('A-3 renders the same items in expanded, rail and drawer(open)', () => {
    const sets = (['expanded', 'rail', 'drawer'] as const).map((mode) => {
      const view = renderSidebar(baseProps({ mode, expanded: mode === 'expanded', drawerOpen: mode === 'drawer' }))
      const result = hrefs()
      view.unmount()
      return result
    })
    expect(sets[0]).toEqual(ITEMS.map((i) => i.to))
    expect(sets[1]).toEqual(sets[0])
    expect(sets[2]).toEqual(sets[0])
  })

  it('@AC-RESP-2-11 (class assert) items, toggle, hamburger and sign-out carry 44px targets', () => {
    renderSidebar(baseProps())
    for (const link of screen.getAllByRole('link')) expect(link.className).toContain('min-h-[44px]')
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle.className).toContain('min-h-[44px]')
    expect(toggle.className).toContain('min-w-[44px]')
    expect(screen.getByRole('button', { name: 'Sign out' }).className).toContain('min-h-[44px]')
  })

  it('@AC-RESP-2-11 (class assert) the hamburger is 44x44', () => {
    render(<SidebarMenuButton onOpen={vi.fn()} label="Open menu" />)
    const button = screen.getByRole('button', { name: 'Open menu' })
    expect(button.className).toContain('min-h-[44px]')
    expect(button.className).toContain('min-w-[44px]')
  })

  it('@AC-RESP-2-11 (class assert) drawer items and sign-out carry 44px targets', () => {
    renderSidebar(baseProps({ mode: 'drawer', expanded: false, drawerOpen: true }))
    for (const link of screen.getAllByRole('link')) expect(link.className).toContain('min-h-[44px]')
    expect(screen.getByRole('button', { name: 'Sign out' }).className).toContain('min-h-[44px]')
  })

  it('SidebarMenuButton calls onOpen', () => {
    const onOpen = vi.fn()
    render(<SidebarMenuButton onOpen={onOpen} label="Open menu" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('A-6 the sidebar layer is z-[45] on the inline aside, the drawer panel and the backdrop', () => {
    const inline = renderSidebar(baseProps())
    expect(screen.getByRole('complementary').className).toContain('z-[45]')
    inline.unmount()
    renderSidebar(baseProps({ mode: 'drawer', expanded: false, drawerOpen: true }))
    expect(screen.getByRole('dialog').className).toContain('z-[45]')
    expect((document.querySelector('[data-testid="sidebar-backdrop"]') as HTMLElement).className).toContain('z-[45]')
  })

  it('uses no responsive-prefix classes and no other z layer (mode comes from props only)', () => {
    const code = sidebarSource.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/['"`\s](?:sm|md|lg|xl|2xl):/)
    expect(code).not.toMatch(/\bz-(?:10|20|30|40|50)\b/)
  })
})

describe('ResponsiveSidebar — plane-neutrality import allowlist (A-1, BR-4)', () => {
  it('imports only react, react-router-dom (NavLink, Link), ./MaterialIcon and a type-only useViewportMode', () => {
    const importLines = sidebarSource.match(/^import .+ from ['"].+['"]$/gm) ?? []
    const sources = importLines.map((line: string): string => line.match(/from ['"](.+)['"]$/)?.[1] ?? '')
    const allowlist = ['react', 'react-router-dom', './MaterialIcon', '../hooks/useViewportMode']
    for (const source of sources) expect(allowlist).toContain(source)
    expect(sources.length).toBeGreaterThan(0)
    const viewportImport = importLines.find((line: string) => line.includes('useViewportMode'))
    expect(viewportImport).toMatch(/^import type /)
    const routerImport = importLines.find((line: string) => line.includes('react-router-dom')) ?? ''
    expect(routerImport.replace(/[{}]/g, ' ').match(/\b(?:NavLink|Link)\b/g)?.sort()).toEqual(['Link', 'NavLink'])
    expect(routerImport).not.toMatch(/Navigate|useNavigate|useLocation/)
  })
})
