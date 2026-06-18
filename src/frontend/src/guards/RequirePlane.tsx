/**
 * RequirePlane — plane-isolation guard.
 *
 * Ensures the authenticated session belongs to the expected plane
 * ('clinic' | 'platform').  Cross-plane sessions are redirected to
 * their own plane's home rather than shown a generic error.
 */
import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/** Valid plane identifiers matching {@link AuthData.plane}. */
type Plane = 'clinic' | 'platform'

interface RequirePlaneProps {
  /** The plane this route belongs to. */
  plane: Plane
  children?: React.ReactNode
}

/** Maps a plane to its root dashboard path. */
const PLANE_HOME: Record<Plane, string> = {
  clinic:   '/clinic/dashboard',
  platform: '/platform/dashboard',
}

/**
 * Guards a route tree so that only sessions on the matching plane can
 * access it.  Unauthenticated users are sent to /login; authenticated
 * users on the wrong plane are sent to their own plane's dashboard.
 * No business logic — reads auth state only.
 */
export function RequirePlane({ plane, children }: RequirePlaneProps): React.ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const currentPlane    = useAuthStore((s) => s.plane)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (currentPlane !== plane) {
    return <Navigate to={PLANE_HOME[currentPlane as Plane] ?? '/login'} replace />
  }

  return children !== undefined ? <>{children}</> : <Outlet />
}
