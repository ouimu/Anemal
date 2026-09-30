/**
 * Viewport mode: the single source of truth for shell layout bands.
 * See docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md.
 *
 * Mode-bound layout switches read this hook; they never use Tailwind responsive
 * prefixes, so the shell and the EMR cannot drift on the threshold.
 */
import { useEffect, useState } from 'react'

/** Minimum viewport widths (CSS px) at which each wider mode begins. */
export const VIEWPORT_BREAKPOINTS = { rail: 1024, expanded: 1280 } as const

export type ViewportMode = 'expanded' | 'rail' | 'drawer'

/**
 * Pure mapping from a viewport width to a mode.
 * width >= 1280 is 'expanded'; >= 1024 is 'rail'; otherwise 'drawer'.
 * An undefined width (no window, e.g. SSR) is 'expanded'.
 */
export function viewportModeFor(width: number | undefined): ViewportMode {
  if (width === undefined || width >= VIEWPORT_BREAKPOINTS.expanded) return 'expanded'
  if (width >= VIEWPORT_BREAKPOINTS.rail) return 'rail'
  return 'drawer'
}

function currentMode(): ViewportMode {
  return viewportModeFor(typeof window === 'undefined' ? undefined : window.innerWidth)
}

/**
 * Live viewport mode. Subscribes to window 'resize' and removes the listener
 * on unmount. Reads width only, so a soft keyboard (height change) never flips
 * the mode. No side effects and no store writes.
 */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(currentMode)

  useEffect(() => {
    const onResize = (): void => setMode(currentMode())
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return mode
}
