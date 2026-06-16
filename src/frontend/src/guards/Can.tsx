/**
 * Can — inline permission visibility guard.
 *
 * Renders children only when the current user holds the required
 * permission.  Renders nothing (null) — never display:none — so
 * hidden nodes do not appear in the accessibility tree.
 *
 * Usage:
 *   <Can perm="billing.create"><Button/></Can>
 *   <Can any={['billing.view','billing.create']}><Button/></Can>
 */
import React from 'react'
import { useAuthStore } from '../store/authStore'

interface CanProps {
  /**
   * Single permission code.  Required unless `any` is provided.
   * When both are given the `any` OR-check is used.
   */
  perm?: string
  /**
   * OR-list of permission codes — passes when the user holds at
   * least one.
   */
  any?: string[]
  children: React.ReactNode
}

/**
 * Conditionally renders children based on the user's permissions.
 * Returns null (no DOM node) when access is denied — never
 * `display:none` — preserving accessible component trees.
 */
export function Can({ perm, any: anyList, children }: CanProps): React.ReactElement | null {
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const codes = anyList !== undefined ? anyList : perm !== undefined ? [perm] : []

  if (codes.length === 0) {
    return null
  }

  const allowed = codes.some((code) => hasPermission(code))

  return allowed ? <>{children}</> : null
}
