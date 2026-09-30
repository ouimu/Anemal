/**
 * RESP-8 (Step 7, QA-owned) — shell integration with the REAL state hook.
 *
 * The per-layout tests mock `useShellSidebar` and the component test passes props,
 * so neither proves the hook + TopNav-style header + ResponsiveSidebar wiring end to
 * end. This file mounts PlatformLayout (the only shell with no clinic auth/i18n
 * dependency) with the real `useShellSidebar`, real `uiStore`, real
 * `ResponsiveSidebar`, real `IdleLogoutModal`/`Dialog` and a real router. Only the
 * viewport seam (`useViewportMode`), the platform session and the idle timer are mocked.
 * `rerender` with a new mode simulates a rotation.
 *
 * jsdom cannot lay out, stack or clip: geometry stays a browser check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useUiStore } from '../store/uiStore'
import sidebarSource from '../components/ResponsiveSidebar.tsx?raw'
import shellHookSource from '../hooks/useShellSidebar.ts?raw'

const hoisted = vi.hoisted(() => ({
  mode: 'drawer' as 'expanded' | 'rail' | 'drawer',
  warning: false,
  stayLoggedIn: vi.fn(),
}))

vi.mock('../hooks/useViewportMode', () => ({
  useViewportMode: () => hoisted.mode,
}))

vi.mock('../store/platformAuthStore', () => ({
  usePlatformAuthStore: (selector: (s: { isAuthenticated: () => boolean; name: string; clearAuth: () => void }) => unknown) =>
    selector({ isAuthenticated: () => true, name: 'Pat', clearAuth: vi.fn() }),
}))

vi.mock('../hooks/useIdleLogout', () => ({
  useIdleLogout: () => ({ warning: hoisted.warning, secondsLeft: 30, stayLoggedIn: hoisted.stayLoggedIn }),
}))

vi.mock('../utils/queryClient', () => ({
  clearServerState: () => Promise.resolve(),
}))

import PlatformLayout from '../layouts/PlatformLayout'

function LocationProbe(): JSX.Element {
  return <div data-testid="loc">{useLocation().pathname}</div>
}

function renderShell(mode: 'expanded' | 'rail' | 'drawer') {
  hoisted.mode = mode
  const tree = () => (
    <MemoryRouter initialEntries={['/platform/customers']}>
      <Routes>
        <Route path="/platform" element={<PlatformLayout />}>
          <Route path="*" element={<LocationProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
  const utils = render(tree())
  return {
    ...utils,
    rotate(next: 'expanded' | 'rail' | 'drawer') {
      hoisted.mode = next
      utils.rerender(tree())
    },
  }
}

const hamburger = (): HTMLElement => screen.getByRole('button', { name: 'Open menu' })
const drawerPanel = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Anemal' })
const backdrop = (): HTMLElement | null => document.querySelector('[data-testid="sidebar-backdrop"]')

/** Keyboard-style open: focus the hamburger, then activate it. */
function openDrawerByKeyboard(): HTMLElement {
  const button = hamburger()
  button.focus()
  fireEvent.click(button)
  return button
}

beforeEach(() => {
  hoisted.mode = 'drawer'
  hoisted.warning = false
  hoisted.stayLoggedIn.mockClear()
  useUiStore.setState({ sidebarOpen: true })
})

describe('Responsive shell integration (real useShellSidebar) — drawer', () => {
  it('@AC-RESP-2-3 closed drawer: hamburger in the header, no sidebar node, content full width', () => {
    renderShell('drawer')
    expect(hamburger()).toBeInTheDocument()
    expect(drawerPanel()).toBeNull()
    expect(document.querySelector('aside')).toBeNull()
    expect((screen.getByTestId('loc').closest('main') as HTMLElement).className).toContain('ml-0')
  })

  it('@AC-RESP-2-4 @AC-RESP-2-12 hamburger opens the drawer; Escape closes it and focus returns to the hamburger', () => {
    renderShell('drawer')
    const button = openDrawerByKeyboard()
    expect(drawerPanel()).not.toBeNull()
    expect(backdrop()).not.toBeNull()
    expect(button).not.toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(drawerPanel()).toBeNull()
    expect(backdrop()).toBeNull()
    expect(button).toHaveFocus()
  })

  it('@AC-RESP-2-5 backdrop tap closes the drawer', () => {
    renderShell('drawer')
    openDrawerByKeyboard()
    fireEvent.click(backdrop() as HTMLElement)
    expect(drawerPanel()).toBeNull()
  })

  it('@AC-RESP-2-6 navigating from the drawer goes to the route and closes the drawer', () => {
    renderShell('drawer')
    openDrawerByKeyboard()
    fireEvent.click(screen.getByRole('link', { name: /Plans/ }))
    expect(screen.getByTestId('loc').textContent).toBe('/platform/plans')
    expect(drawerPanel()).toBeNull()
  })

  it('@AC-RESP-2-14 (platform, integrated) Sign out is in the open drawer at 44px', () => {
    renderShell('drawer')
    openDrawerByKeyboard()
    const panel = drawerPanel() as HTMLElement
    const signOut = screen.getByRole('button', { name: 'Sign out' })
    expect(panel.contains(signOut)).toBe(true)
    expect(signOut.className).toContain('min-h-[44px]')
  })

  it('@AC-RESP-2-9 rotating to the rail band with the drawer open discards the drawer', () => {
    const view = renderShell('drawer')
    openDrawerByKeyboard()
    expect(drawerPanel()).not.toBeNull()

    view.rotate('rail')

    expect(backdrop()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    expect(screen.getByRole('complementary').className).toContain('w-14')

    view.rotate('drawer')
    expect(drawerPanel()).toBeNull()
  })
})

describe('Responsive shell integration — RESP-8 extra test (A-5 / A-8, extends @AC-RESP-5-8)', () => {
  it('@AC-RESP-5-8 with the real drawer open, one Escape leaves the blocking idle warning open and "stay signed in" clickable', () => {
    const view = renderShell('drawer')
    openDrawerByKeyboard()
    hoisted.warning = true
    view.rotate('drawer') // re-render so the mocked idle hook raises the warning

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Drawer state behind the warning is intentionally not asserted (plan RESP-8).
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    const stay = screen.getByRole('button', { name: 'Stay logged in' })
    fireEvent.click(stay)
    expect(hoisted.stayLoggedIn).toHaveBeenCalledTimes(1)
  })
})

describe('Responsive shell integration — inline bands', () => {
  it('@AC-RESP-8-3 a collapse persisted at 1280 is applied on mount (reload) and offsets follow', () => {
    useUiStore.setState({ sidebarOpen: false })
    renderShell('expanded')
    expect(screen.getByRole('complementary').className).toContain('w-14')
    expect(screen.getByRole('banner').className).toContain('left-14')
    expect((screen.getByTestId('loc').closest('main') as HTMLElement).className).toContain('ml-14')
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })

  it('@AC-RESP-3-3 rail-band expansion pushes the header and content (left-56 / ml-56), not persisted', () => {
    renderShell('rail')
    expect(screen.getByRole('banner').className).toContain('left-14')
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByRole('complementary').className).toContain('w-56')
    expect(screen.getByRole('banner').className).toContain('left-56')
    expect((screen.getByTestId('loc').closest('main') as HTMLElement).className).toContain('ml-56')
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })

  it('@AC-RESP-2-7 a collapse made at 1280 does not survive drawer then back to 1280', () => {
    const view = renderShell('expanded')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByRole('complementary').className).toContain('w-14')
    view.rotate('drawer')
    view.rotate('expanded')
    expect(screen.getByRole('complementary').className).toContain('w-56')
    expect(screen.getByRole('banner').className).toContain('left-56')
  })
})

/**
 * Hardened A-1 census. The per-file censuses match single-line `import ... from '...'`
 * statements only; a multi-line import, a side-effect `import '...'`, a dynamic
 * `import('...')` or a `require('...')` would slip past them. This scans every module
 * specifier in the comment-stripped source.
 */
function moduleSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const found = new Set<string>()
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) for (const m of code.matchAll(re)) found.add(m[1])
  return Array.from(found).sort()
}

describe('Responsive shell — hardened import census (A-1, BR-4)', () => {
  it('ResponsiveSidebar.tsx reaches only react, react-router-dom, ./MaterialIcon and ../hooks/useViewportMode', () => {
    expect(moduleSpecifiers(sidebarSource)).toEqual(
      ['../hooks/useViewportMode', './MaterialIcon', 'react', 'react-router-dom'].sort(),
    )
  })

  it('useShellSidebar.ts reaches only react, ../store/uiStore and ./useViewportMode', () => {
    expect(moduleSpecifiers(shellHookSource)).toEqual(['../store/uiStore', './useViewportMode', 'react'].sort())
  })

  it('neither module names an auth store, i18n, an API client or the idle-logout hook anywhere in code', () => {
    for (const source of [sidebarSource, shellHookSource]) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code).not.toMatch(/authStore|platformAuthStore|i18n|useT\b|utils\/api|useIdleLogout/)
    }
  })
})
