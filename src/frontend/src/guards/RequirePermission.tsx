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
import { Navigate, Outlet } from 'react-router-dom'
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
    return <Navigate to="/403" replace />
  }

  return children !== undefined ? <>{children}</> : <Outlet />
}
