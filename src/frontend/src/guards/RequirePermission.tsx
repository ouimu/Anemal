/**
 * RequirePermission — permission-level route guard.
 *
 * Redirects to /403 when the authenticated user lacks the required
 * permission.  Supports an OR-list via the `any` prop so a route can
 * be accessible to holders of any one of several permissions.
 *
 * Usage:
 *   <RequirePermission perm="billing.view"/>
 *   <RequirePermission perm="billing.view" any={['billing.view','billing.create']}/>
 */
import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

interface RequirePermissionProps {
  /**
   * Primary permission code.  Used alone when `any` is not supplied;
   * included in the OR-check when `any` is also provided.
   */
  perm: string
  /**
   * Optional OR-list of permission codes.  The guard passes when the
   * user holds at least one of these codes.
   */
  any?: string[]
  children?: React.ReactNode
}

/**
 * Renders children (or Outlet) when the user holds the required
 * permission.  Sends unauthenticated users to /login; authorised
 * failures to /403.  Deny-by-default: empty permissions array always
 * fails.  No business logic — reads auth state only.
 */
export function RequirePermission({
  perm,
  any: anyList,
  children,
}: RequirePermissionProps): React.ReactElement {
  const isAuthenticated  = useAuthStore((s) => s.isAuthenticated())
  const hasPermission    = useAuthStore((s) => s.hasPermission)
  const permissionsLoaded = useAuthStore((s) => s.permissionsLoaded)
  const { pathname } = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!permissionsLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
      </div>
    )
  }

  const codes   = anyList !== undefined ? anyList : [perm]
  const allowed = codes.some((code) => hasPermission(code))

  if (!allowed) {
    // A relative <Navigate to="403"/> cannot be used here: it resolves by
    // appending onto the full matched URL (verified empirically against
    // react-router-dom 6.30.4 in RequirePermission.spike.test.tsx, deleted
    // after Group 2 landed), never by trimming to the tree root — so from a
    // two-segment-deep route such as /settings/storage/connecting or
    // /clinic/vaccinations-due/record it lands on
    // /settings/storage/connecting/403, not /settings/403, under BOTH
    // relative="path" and relative="route". Only three trees ever contain
    // RequirePermission (clinic-admin, clinic, settings), and the first URL
    // path segment identifies the tree at any nesting depth, so deriving it
    // here cannot drift out of sync with App.tsx the way a parallel
    // hand-maintained tree-prefix map eventually would.
    const tree = pathname.split('/')[1] // 'clinic-admin' | 'clinic' | 'settings'
    return <Navigate to={`/${tree}/403`} replace />
  }

  return children !== undefined ? <>{children}</> : <Outlet />
}
