/**
 * Can — inline permission gate for UI controls.
 *
 * Renders `children` only when the current user holds the given permission.
 * The server is the real security boundary; this is a display-only guard.
 *
 * @example
 *   <Can perm="staff.assign_role">
 *     <RolePicker … />
 *   </Can>
 */
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'

interface CanProps {
  /** Permission code to check, e.g. "staff.assign_role". */
  perm: string
  children: ReactNode
}

export default function Can({ perm, children }: CanProps): ReactElement | null {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  if (!hasPermission(perm)) return null
  return <Fragment>{children}</Fragment>
}
