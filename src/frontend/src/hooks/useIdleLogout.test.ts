import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIdleLogout } from './useIdleLogout'

describe('useIdleLogout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onLogout after timeoutMinutes of no activity', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('shows a warning 30s before logout, without calling onLogout yet', () => {
    const onLogout = vi.fn()
    const { result } = renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.warning).toBe(true)
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('resets the timer on DOM activity, delaying logout', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(45_000) })
    act(() => { window.dispatchEvent(new Event('keydown')) })
    act(() => { vi.advanceTimersByTime(45_000) }) // 90s wall-clock, but only 45s since the reset
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('resets the timer when another tab reports activity via the storage event', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(50_000) })
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'vc_idle_ping', newValue: String(Date.now()) }))
    })
    act(() => { vi.advanceTimersByTime(50_000) }) // would exceed the original 60s window without the reset
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('stayLoggedIn() cancels the warning and resets the timer', () => {
    const onLogout = vi.fn()
    const { result } = renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout }))
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.warning).toBe(true)
    act(() => { result.current.stayLoggedIn() })
    expect(result.current.warning).toBe(false)
    act(() => { vi.advanceTimersByTime(55_000) })
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('does nothing when enabled is false', () => {
    const onLogout = vi.fn()
    renderHook(() => useIdleLogout({ timeoutMinutes: 1, onLogout, enabled: false }))
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(onLogout).not.toHaveBeenCalled()
  })
})
