/**
 * RESP-1 — viewport mode seam. See docs/adr/0033-viewport-mode-is-the-single-source-of-truth-for-shell-layout.md
 * and docs/superpowers/plans/2026-09-30-responsive-shell-emr-portrait-arch.md section 4a.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { VIEWPORT_BREAKPOINTS, viewportModeFor, useViewportMode } from './useViewportMode'

const ORIGINAL_WIDTH = window.innerWidth
const ORIGINAL_HEIGHT = window.innerHeight

function setViewport(width: number, height: number = ORIGINAL_HEIGHT): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height })
}

function fireResize(): void {
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

afterEach(() => {
  setViewport(ORIGINAL_WIDTH, ORIGINAL_HEIGHT)
  vi.restoreAllMocks()
})

describe('viewportModeFor (pure)', () => {
  it('exposes the frozen breakpoints', () => {
    expect(VIEWPORT_BREAKPOINTS).toEqual({ rail: 1024, expanded: 1280 })
  })

  it.each([
    [1600, 'expanded'],
    [1280, 'expanded'],
    [1279, 'rail'],
    [1024, 'rail'],
    [1023, 'drawer'],
    [768, 'drawer'],
    [480, 'drawer'],
  ] as const)('@AC-RESP-1-1 width %i maps to %s', (width, mode) => {
    expect(viewportModeFor(width)).toBe(mode)
  })

  it('@AC-RESP-1-4 undefined width (no window) maps to expanded', () => {
    expect(viewportModeFor(undefined)).toBe('expanded')
  })
})

describe('useViewportMode (live)', () => {
  it('@AC-RESP-1-1 reads the initial width on mount', () => {
    setViewport(768)
    const { result } = renderHook(() => useViewportMode())
    expect(result.current).toBe('drawer')
  })

  it('@AC-RESP-1-2 follows a live resize without remount', () => {
    setViewport(768)
    const { result } = renderHook(() => useViewportMode())
    expect(result.current).toBe('drawer')

    setViewport(1024)
    fireResize()
    expect(result.current).toBe('rail')

    setViewport(1280)
    fireResize()
    expect(result.current).toBe('expanded')
  })

  it('@AC-RESP-1-2 a height-only change (soft keyboard) does not alter the mode', () => {
    setViewport(768, 1024)
    const { result } = renderHook(() => useViewportMode())
    expect(result.current).toBe('drawer')

    setViewport(768, 400)
    fireResize()
    expect(result.current).toBe('drawer')
  })

  it('@AC-RESP-1-3 removes the resize listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useViewportMode())

    const added = addSpy.mock.calls.find(([type]) => type === 'resize')
    expect(added).toBeDefined()

    unmount()
    const removed = removeSpy.mock.calls.find(([type]) => type === 'resize')
    expect(removed).toBeDefined()
    expect(removed?.[1]).toBe(added?.[1])
  })
})
