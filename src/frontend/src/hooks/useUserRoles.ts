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
