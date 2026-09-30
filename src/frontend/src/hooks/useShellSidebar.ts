/**
 * Shell sidebar state: the one place D1 (band semantics) and the sidebar's
 * layout footprint live. Called once per shell by the host layout, before any
 * early return. See docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md
 * and docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-arch.md section 4b.
 *
 * - expanded = uiStore.sidebarOpen in the 'expanded' band, local railExpanded in 'rail'.
 * - A band change discards drawerOpen and railExpanded and, on entering 'expanded',
 *   restores sidebarOpen to true. Mount never resets anything.
 * - Rail-band expansion PUSHES content (no overlay variant exists).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store/uiStore'
import { useViewportMode, type ViewportMode } from './useViewportMode'

export interface ShellSidebar {
  mode: ViewportMode
  /** Inline label visibility; false when mode === 'drawer'. */
  expanded: boolean
  /** Always false unless mode === 'drawer'. */
  drawerOpen: boolean
  /** Ready-made Tailwind classes for the sidebar's footprint. */
  offset: { main: string; top: string }
  /** 'expanded' band: persisted uiStore toggle. 'rail' band: local, non-persisted. */
  toggleExpanded: () => void
  openDrawer: () => void
  closeDrawer: () => void
}

// Complete literals so the Tailwind scanner sees every class. Private to this
// module: hosts and TopNav read `shell.offset`, never this table.
const OFFSET_EXPANDED = { main: 'ml-56', top: 'left-56' } as const
const OFFSET_COLLAPSED = { main: 'ml-14', top: 'left-14' } as const
const OFFSET_DRAWER = { main: 'ml-0', top: 'left-0' } as const

function offsetFor(mode: ViewportMode, expanded: boolean): ShellSidebar['offset'] {
  if (mode === 'drawer') return OFFSET_DRAWER
  return expanded ? OFFSET_EXPANDED : OFFSET_COLLAPSED
}

/**
 * Sidebar state for one shell. `drawerOpen` and `railExpanded` are hook-local
 * and never persisted; `offset` is derived on every render, never stored.
 */
export function useShellSidebar(): ShellSidebar {
  const mode = useViewportMode()
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const [railExpanded, setRailExpanded] = useState(false)
  const [drawerRequested, setDrawerRequested] = useState(false)
  const previousMode = useRef<ViewportMode>(mode)

  useEffect(() => {
    if (previousMode.current === mode) return
    previousMode.current = mode
    setDrawerRequested(false)
    setRailExpanded(false)
    if (mode === 'expanded') setSidebarOpen(true)
  }, [mode, setSidebarOpen])

  const toggleExpanded = useCallback((): void => {
    if (mode === 'expanded') toggleSidebar()
    else if (mode === 'rail') setRailExpanded((open) => !open)
  }, [mode, toggleSidebar])
  const openDrawer = useCallback((): void => setDrawerRequested(true), [])
  const closeDrawer = useCallback((): void => setDrawerRequested(false), [])

  let expanded = false
  if (mode === 'expanded') expanded = sidebarOpen
  else if (mode === 'rail') expanded = railExpanded

  return {
    mode,
    expanded,
    drawerOpen: mode === 'drawer' && drawerRequested,
    offset: offsetFor(mode, expanded),
    toggleExpanded,
    openDrawer,
    closeDrawer,
  }
}
