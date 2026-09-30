/**
 * RESP-2 — useShellSidebar. See docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-arch.md
 * section 4b and ADR-0033. useViewportMode is mocked and flipped between rerenders;
 * the real uiStore is reset in beforeEach.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ViewportMode } from './useViewportMode'
import shellSidebarSource from './useShellSidebar.ts?raw'

let mockMode: ViewportMode = 'expanded'
vi.mock('./useViewportMode', () => ({
  useViewportMode: () => mockMode,
}))

import { useUiStore } from '../store/uiStore'
import { useShellSidebar } from './useShellSidebar'

const EXPANDED = { main: 'ml-56', top: 'left-56' }
const COLLAPSED = { main: 'ml-14', top: 'left-14' }
const DRAWER = { main: 'ml-0', top: 'left-0' }

function mountAt(mode: ViewportMode) {
  mockMode = mode
  return renderHook(() => useShellSidebar())
}

function switchTo(view: ReturnType<typeof mountAt>, mode: ViewportMode): void {
  mockMode = mode
  view.rerender()
}

beforeEach(() => {
  useUiStore.setState({ sidebarOpen: true })
  mockMode = 'expanded'
})

describe('useShellSidebar — offset table (arch 4b)', () => {
  it('expanded band, expanded: ml-56 / left-56', () => {
    const { result } = mountAt('expanded')
    expect(result.current.mode).toBe('expanded')
    expect(result.current.expanded).toBe(true)
    expect(result.current.offset).toEqual(EXPANDED)
  })

  it('expanded band, manually collapsed: ml-14 / left-14', () => {
    useUiStore.setState({ sidebarOpen: false })
    const { result } = mountAt('expanded')
    expect(result.current.expanded).toBe(false)
    expect(result.current.offset).toEqual(COLLAPSED)
  })

  it('rail band defaults to the collapsed rail: ml-14 / left-14', () => {
    const { result } = mountAt('rail')
    expect(result.current.expanded).toBe(false)
    expect(result.current.offset).toEqual(COLLAPSED)
  })

  it('@AC-RESP-3-3 rail band, expanded via the toggle: content is PUSHED (ml-56 / left-56)', () => {
    const { result } = mountAt('rail')
    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(true)
    expect(result.current.offset).toEqual(EXPANDED)
  })

  it('drawer mode: ml-0 / left-0 whether the drawer is closed or open, expanded false', () => {
    const { result } = mountAt('drawer')
    expect(result.current.expanded).toBe(false)
    expect(result.current.offset).toEqual(DRAWER)
    act(() => result.current.openDrawer())
    expect(result.current.drawerOpen).toBe(true)
    expect(result.current.offset).toEqual(DRAWER)
  })
})

describe('useShellSidebar — toggleExpanded routing', () => {
  it('expanded band routes to uiStore.toggleSidebar (persisted)', () => {
    const { result } = mountAt('expanded')
    act(() => result.current.toggleExpanded())
    expect(useUiStore.getState().sidebarOpen).toBe(false)
    expect(result.current.expanded).toBe(false)
  })

  it('rail band routes to local railExpanded and leaves the persisted field alone (A-5)', () => {
    const { result } = mountAt('rail')
    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(true)
    expect(useUiStore.getState().sidebarOpen).toBe(true)
    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(false)
  })

  it('drawer mode: toggleExpanded is a no-op', () => {
    useUiStore.setState({ sidebarOpen: false })
    const { result } = mountAt('drawer')
    act(() => result.current.toggleExpanded())
    expect(result.current.expanded).toBe(false)
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })
})

describe('useShellSidebar — D1 band semantics', () => {
  it('@AC-RESP-2-7 a manual collapse at expanded does not survive drawer then expanded', () => {
    const view = mountAt('expanded')
    act(() => view.result.current.toggleExpanded())
    expect(view.result.current.expanded).toBe(false)
    switchTo(view, 'drawer')
    switchTo(view, 'expanded')
    expect(view.result.current.expanded).toBe(true)
    expect(useUiStore.getState().sidebarOpen).toBe(true)
  })

  it('@AC-RESP-2-8 a manual collapse is kept while the width band does not change', () => {
    const view = mountAt('expanded')
    act(() => view.result.current.toggleExpanded())
    // 1400 -> 1300 is the same band: the mocked mode value does not change.
    view.rerender()
    expect(view.result.current.expanded).toBe(false)
  })

  it('@AC-RESP-2-9 rotating with the drawer open discards it and shows the expanded sidebar', () => {
    const view = mountAt('drawer')
    act(() => view.result.current.openDrawer())
    expect(view.result.current.drawerOpen).toBe(true)
    switchTo(view, 'expanded')
    expect(view.result.current.drawerOpen).toBe(false)
    expect(view.result.current.expanded).toBe(true)
    expect(view.result.current.offset).toEqual(EXPANDED)
  })

  it('a band change resets railExpanded', () => {
    const view = mountAt('rail')
    act(() => view.result.current.toggleExpanded())
    expect(view.result.current.expanded).toBe(true)
    switchTo(view, 'drawer')
    switchTo(view, 'rail')
    expect(view.result.current.expanded).toBe(false)
  })

  it('@AC-RESP-8-3 mount does not reset a persisted collapse (survives reload at 1280)', () => {
    useUiStore.setState({ sidebarOpen: false })
    const { result } = mountAt('expanded')
    expect(result.current.expanded).toBe(false)
    expect(useUiStore.getState().sidebarOpen).toBe(false)
  })

  it('BR-7 drawerOpen is never true outside drawer mode, even straight after openDrawer', () => {
    const { result } = mountAt('rail')
    act(() => result.current.openDrawer())
    expect(result.current.drawerOpen).toBe(false)
  })

  it('closeDrawer closes an open drawer', () => {
    const { result } = mountAt('drawer')
    act(() => result.current.openDrawer())
    act(() => result.current.closeDrawer())
    expect(result.current.drawerOpen).toBe(false)
  })

  it('A-5 drawerOpen and railExpanded are not written to the store', () => {
    const before = { ...useUiStore.getState() }
    const rail = mountAt('rail')
    act(() => rail.result.current.toggleExpanded())
    const drawer = mountAt('drawer')
    act(() => drawer.result.current.openDrawer())
    const after = useUiStore.getState()
    expect(after.sidebarOpen).toBe(before.sidebarOpen)
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
  })
})

describe('useShellSidebar — import allowlist census (A-1)', () => {
  it('imports only react, ../store/uiStore and ./useViewportMode', () => {
    const importLines = shellSidebarSource.match(/^import .+ from ['"].+['"]$/gm) ?? []
    const sources = importLines.map((line: string): string => line.match(/from ['"](.+)['"]$/)?.[1] ?? '')
    const allowlist = ['react', '../store/uiStore', './useViewportMode']
    for (const source of sources) expect(allowlist).toContain(source)
    expect(sources.length).toBeGreaterThan(0)
  })

  it('exports only useShellSidebar (values) and ShellSidebar (type): no class map', () => {
    const exported = shellSidebarSource.match(/^export (?:default )?(?:const|function|type|interface|enum|class) \w+/gm) ?? []
    expect(exported.map((line: string) => line.split(' ').pop())).toEqual(['ShellSidebar', 'useShellSidebar'])
  })
})
