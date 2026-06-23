/**
 * TanStack Query hooks for platform plan management.
 * All endpoints require platform-plane JWT.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import platformApi from '../utils/platformApi'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Plan {
  id:           number
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  features:     string[]
  isRetired:    boolean
  createdAt:    string | null
}

export interface CreatePlanPayload {
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  features?:    string[]
}

export type UpdatePlanPayload = Partial<Omit<CreatePlanPayload, 'key'>>

// ── Query keys ────────────────────────────────────────────────────────────────

const KEYS = {
  all:    ['platform', 'plans'] as const,
  detail: (id: number) => ['platform', 'plans', id] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Fetch all plans (including retired ones). */
export function usePlatformPlans() {
  return useQuery<Plan[]>({
    queryKey: KEYS.all,
    queryFn: () =>
      platformApi.get('/platform/plans').then((r) => r.data.data),
  })
}

/** Create a new plan. */
export function useCreatePlatformPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) =>
      platformApi.post('/platform/plans', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

/** Update an existing plan's fields. */
export function useUpdatePlatformPlan(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePlanPayload) =>
      platformApi.put(`/platform/plans/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}

/** Soft-retire a plan (cannot be assigned to new tenants). */
export function useRetirePlatformPlan(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      platformApi.delete(`/platform/plans/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
