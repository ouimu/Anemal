/**
 * RequireAuth — authentication gate guard.
 *
 * Redirects unauthenticated visitors to /login.
 * Supports both outlet-based nesting and direct children wrapping:
 *   <Route element={<RequireAuth/>}><Route .../></Route>
 *   <RequireAuth><SomeComponent/></RequireAuth>
 *
 * Also mounts the clinic-plane idle-logout timer (see useIdleLogout) —
 * this is the single point shared by all three clinic route roots
 * (/clinic-admin, /clinic, /settings), so it only needs wiring once.
 */
import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAdminSettings } from '../hooks/useAdmin'
import { useIdleLogout } from '../hooks/useIdleLogout'
import IdleLogoutModal from '../components/IdleLogoutModal'
import { clearServerState } from '../utils/queryClient'

interface RequireAuthProps {
  children?: React.ReactNode
}

const DEFAULT_IDLE_MINUTES = 15

export function RequireAuth({ children }: RequireAuthProps): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const clearAuth       = useAuthStore((s) => s.clearAuth)
  const { data: settings } = useAdminSettings(isAuthenticated)
  const idleTimeoutMinutes = settings?.idleTimeoutMinutes ?? DEFAULT_IDLE_MINUTES

  const { warning, secondsLeft, stayLoggedIn } = useIdleLogout({
    timeoutMinutes: idleTimeoutMinutes,
    enabled: isAuthenticated,
    onLogout: () => {
      // HI-09: drop cached PII before clearing auth + navigating away.
      void clearServerState().finally(() => {
        clearAuth()
        window.location.href = '/login?reason=idle'
      })
    },
  })

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      {children !== undefined ? <>{children}</> : <Outlet />}
      <IdleLogoutModal open={warning} secondsLeft={secondsLeft} onStay={stayLoggedIn} />
    </>
  )
}
