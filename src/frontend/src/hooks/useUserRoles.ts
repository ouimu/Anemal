/**
 * Hooks for multi-role assignment (T-5F-03).
 *
 * - useUserRolesQuery   — GET /clinic/users/:userId/roles
 * - useClinicRolesQuery — GET /clinic/roles (catalogue, cached 60 s)
 * - useAssignRoleMutation  — POST /clinic/roles/users/:userId/roles
 * - useRemoveRoleMutation  — DELETE /clinic/roles/users/:userId/roles/:roleId
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

/** Role shape returned by GET /clinic/roles and GET /clinic/users/:userId/roles */
export interface Role {
  id:                number
  name:              string
  isSystem:          boolean
  permissions:       string[]
  assignedUserCount: number
}

/** Fetch the current roles assigned to a specific user. */
export function useUserRolesQuery(userId: number) {
  return useQuery<Role[]>({
    queryKey: ['staff', userId, 'roles'],
    queryFn:  () => api.get(`/clinic/users/${userId}/roles`).then((r) => r.data.data as Role[]),
    enabled:  userId > 0,
  })
}

/** Fetch the full role catalogue for this tenant (cached 60 s). */
export function useClinicRolesQuery() {
  return useQuery<Role[]>({
    queryKey: ['clinic-roles'],
    queryFn:  () => api.get('/clinic/roles').then((r) => r.data.data as Role[]),
    staleTime: 60_000,
  })
}

interface AssignRoleVars {
  userId: number
  roleId: number
}

/** POST /clinic/roles/users/:userId/roles */
export function useAssignRoleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: AssignRoleVars) =>
      api.post(`/clinic/roles/users/${userId}/roles`, { roleId }),
    onSuccess: (_data, { userId }) => {
      void qc.invalidateQueries({ queryKey: ['staff', userId, 'roles'] })
      void qc.invalidateQueries({ queryKey: ['staff'] })
      void qc.invalidateQueries({ queryKey: ['clinic-roles'] })
    },
  })
}

interface RemoveRoleVars {
  userId: number
  roleId: number
}

/** DELETE /clinic/roles/users/:userId/roles/:roleId */
export function useRemoveRoleMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, roleId }: RemoveRoleVars) =>
      api.delete(`/clinic/roles/users/${userId}/roles/${roleId}`),
    onSuccess: (_data, { userId }) => {
      void qc.invalidateQueries({ queryKey: ['staff', userId, 'roles'] })
      void qc.invalidateQueries({ queryKey: ['staff'] })
      void qc.invalidateQueries({ queryKey: ['clinic-roles'] })
    },
  })
}
