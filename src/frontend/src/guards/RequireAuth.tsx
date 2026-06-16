/**
 * RequireAuth — authentication gate guard.
 *
 * Redirects unauthenticated visitors to /login.
 * Supports both outlet-based nesting and direct children wrapping:
 *   <Route element={<RequireAuth/>}><Route .../></Route>
 *   <RequireAuth><SomeComponent/></RequireAuth>
 */
import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface RequireAuthProps {
  children?: React.ReactNode
}

/**
 * Renders children (or Outlet when no children provided) only when
 * the user has a valid authenticated session.  All auth state is read
 * from {@link useAuthStore} — no business logic lives here.
 */
export function RequireAuth({ children }: RequireAuthProps): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children !== undefined ? <>{children}</> : <Outlet />
}
