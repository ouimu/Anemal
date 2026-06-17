/**
 * useRoles — React Query hooks for the Clinic Role Editor (T-5F-01).
 *
 * All mutations call the pre-built backend endpoints.
 * The permission catalogue is fetched once and kept in the query cache.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

// ── Shape definitions ───────────────────────────────────────────────────────

export interface Role {
  id: string
  name: string
  isSystem: boolean
  permissions: string[]
  assignedUserCount: number
}

/** Module → permission codes mapping returned by GET /clinic/permissions */
export type PermissionCatalogue = Record<string, string[]>

interface CloneRolePayload {
  sourceRoleName: string
  newName: string
}

interface UpdatePermissionsPayload {
  roleId: string
  add: string[]
  remove: string[]
}

// ── Query keys ──────────────────────────────────────────────────────────────

const ROLES_KEY = ['clinic', 'roles'] as const
const PERMS_KEY = ['clinic', 'permissions'] as const

// ── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetches the full role list for the current tenant.
 * Requires `roles.view` on the backend.
 */
export function useRolesQuery() {
  return useQuery<Role[]>({
    queryKey: ROLES_KEY,
    queryFn: () =>
      api
        .get<{ success: boolean; data: Role[] }>('/clinic/roles')
        .then((r) => r.data.data),
    staleTime: 30_000,
  })
}

/**
 * Fetches the permission catalogue grouped by module.
 * Cached indefinitely for the session (permissions are static for a release).
 */
export function usePermissionCatalogueQuery() {
  return useQuery<PermissionCatalogue>({
    queryKey: PERMS_KEY,
    queryFn: () =>
      api
        .get<{ success: boolean; data: PermissionCatalogue }>('/clinic/permissions')
        .then((r) => r.data.data),
    staleTime: Infinity,
  })
}

/**
 * Clones a system role into a new custom role.
 * Invalidates the role list on success.
 */
export function useCloneRoleMutation() {
  const qc = useQueryClient()
  return useMutation<Role, Error, CloneRolePayload>({
    mutationFn: (payload) =>
      api
        .post<{ success: boolean; data: Role }>('/clinic/roles/clone', payload)
        .then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROLES_KEY })
    },
  })
}

/**
 * Updates the permission set of a custom role.
 * Sends a delta ({ add, remove }) rather than the full set.
 * Invalidates the role list on success.
 */
export function useUpdateRolePermissionsMutation() {
  const qc = useQueryClient()
  return useMutation<Role, Error, UpdatePermissionsPayload>({
    mutationFn: ({ roleId, add, remove }) =>
      api
        .put<{ success: boolean; data: Role }>(`/clinic/roles/${roleId}/permissions`, { add, remove })
        .then((r) => r.data.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROLES_KEY })
    },
  })
}

/**
 * Deletes a custom role.
 * Returns 409 with assignedCount if users are still assigned.
 * Invalidates the role list on success (200 only).
 */
export function useDeleteRoleMutation() {
  const qc = useQueryClient()
  return useMutation<void, Error & { response?: { status: number; data: { data?: { assignedCount: number } } } }, string>({
    mutationFn: (roleId) =>
      api.delete(`/clinic/roles/${roleId}`).then(() => undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROLES_KEY })
    },
  })
}
