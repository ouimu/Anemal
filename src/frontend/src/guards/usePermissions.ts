/**
 * usePermissions — thin hook over authStore for permission queries.
 *
 * Provides stable references: `hasPermission` is a bound function
 * that does not change identity across re-renders unless the store
 * slice it reads from changes.
 */
import { useCallback } from 'react'
import { useAuthStore } from '../store/authStore'

interface UsePermissionsResult {
  /** The full list of permission codes for the current session. */
  permissions: string[]
  /**
   * Returns true when `code` is present in the current permissions
   * array.  Deny-by-default: returns false when the array is empty.
   */
  hasPermission: (code: string) => boolean
}

/**
 * Returns the current user's permissions array and a stable
 * `hasPermission` helper memoized with {@link useCallback}.
 */
export function usePermissions(): UsePermissionsResult {
  const permissions     = useAuthStore((s) => s.permissions)
  const storeHasPerm    = useAuthStore((s) => s.hasPermission)
  const hasPermission   = useCallback((code: string) => storeHasPerm(code), [storeHasPerm])

  return { permissions, hasPermission }
}
