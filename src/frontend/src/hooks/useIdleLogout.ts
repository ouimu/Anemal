// Client-side idle-timeout auto-logout. Tracks real DOM activity only —
// background API traffic (polling, silent token refresh) never resets the
// timer, otherwise a polling screen would never idle-logout.
// Cross-tab sync: any tab's activity writes a timestamp to a shared
// localStorage key; every tab listens for that key's storage event and
// resets its own timers, so an idle background tab doesn't log out a tab
// the user is actively using (see ADR-0001 for why enforcement stays
// client-side only).
import { useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const
const WARNING_SECONDS = 30
const THROTTLE_MS = 1000
export const IDLE_SYNC_KEY = 'vc_idle_ping'

export interface UseIdleLogoutOptions {
  timeoutMinutes: number
  onLogout: () => void
  enabled?: boolean
}

export interface UseIdleLogoutResult {
  warning: boolean
  secondsLeft: number
  stayLoggedIn: () => void
}

export function useIdleLogout({
  timeoutMinutes,
  onLogout,
  enabled = true,
}: UseIdleLogoutOptions): UseIdleLogoutResult {
  const [warning, setWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECONDS)

  const warnTimer     = useRef<ReturnType<typeof setTimeout>>()
  const logoutTimer   = useRef<ReturnType<typeof setTimeout>>()
  const tickInterval  = useRef<ReturnType<typeof setInterval>>()
  const throttleRef   = useRef(0)
  const onLogoutRef   = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    if (!enabled) return undefined

    function clearTimers() {
      clearTimeout(warnTimer.current)
      clearTimeout(logoutTimer.current)
      clearInterval(tickInterval.current)
    }

    function scheduleTimers() {
      clearTimers()
      setWarning(false)
      setSecondsLeft(WARNING_SECONDS)

      const totalMs = timeoutMinutes * 60_000
      const warnMs  = Math.max(totalMs - WARNING_SECONDS * 1000, 0)

      warnTimer.current = setTimeout(() => {
        setWarning(true)
        let remaining = WARNING_SECONDS
        tickInterval.current = setInterval(() => {
          remaining -= 1
          setSecondsLeft(remaining)
        }, 1000)
      }, warnMs)

      logoutTimer.current = setTimeout(() => {
        clearTimers()
        onLogoutRef.current()
      }, totalMs)
    }

    function noteActivity(broadcast: boolean) {
      scheduleTimers()
      if (broadcast) {
        try { localStorage.setItem(IDLE_SYNC_KEY, String(Date.now())) } catch { /* private mode */ }
      }
    }

    function handleActivity() {
      const now = Date.now()
      if (now - throttleRef.current < THROTTLE_MS) return
      throttleRef.current = now
      noteActivity(true)
    }

    function handleStorage(e: StorageEvent) {
      if (e.key === IDLE_SYNC_KEY) scheduleTimers()
    }

    scheduleTimers()
    ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }))
    window.addEventListener('storage', handleStorage)

    stayLoggedInRef.current = () => noteActivity(true)

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, handleActivity))
      window.removeEventListener('storage', handleStorage)
    }
  }, [timeoutMinutes, enabled])

  const stayLoggedInRef = useRef<() => void>(() => {})

  return {
    warning,
    secondsLeft,
    stayLoggedIn: () => stayLoggedInRef.current(),
  }
}
