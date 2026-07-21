/**
 * useClinicRolesQuery — fetches the tenant's full role catalogue (system +
 * custom), used by the unified Edit User role listbox.
 *
 * The multi-role assignment hooks that used to live here
 * (useUserRolesQuery, useAssignRoleMutation, useRemoveRoleMutation) were
 * removed with the multi-role retirement (D-7, ADR-0019) — their backend
 * endpoints no longer exist (removed in Plan A, docs/superpowers/plans/
 * 2026-07-20-unify-user-role-assignment-plan-a-backend.md).
 */
import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

/** Role shape returned by GET /clinic/roles. */
export interface Role {
  id:                number
  name:              string
  key:               string
  isSystem:          boolean
  permissions:       string[]
  assignedUserCount: number
}

/** Fetch the full role catalogue for this tenant (cached 60 s). */
export function useClinicRolesQuery() {
  return useQuery<Role[]>({
    queryKey: ['clinic-roles'],
    queryFn:  () => api.get('/clinic/roles').then((r) => r.data.data as Role[]),
    staleTime: 60_000,
  })
}

/** D-4: the Admin system role — sealed against clone/reassignment-of-scope UI affordances. */
export const SEALED_ROLE_KEY = 'clinic_admin'

/** Can the caller grant this role, given the permissions they themselves hold? */
export function isGrantable(role: Pick<Role, 'permissions'>, callerPermissions: ReadonlySet<string>): boolean {
  return role.permissions.every((code) => callerPermissions.has(code))
}

/** Does this role carry admin-level authority (used for the self-demotion confirm)? */
export function isAdminLevelRole(role: Pick<Role, 'key' | 'permissions'>): boolean {
  return role.key === SEALED_ROLE_KEY
    || role.permissions.includes('staff.assign_role')
    || role.permissions.includes('staff.manage')
}
