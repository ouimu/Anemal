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
  maxPets:      number | null
  features:     string[]
  isRetired:    boolean
  createdAt:    string | null
}

/** UI-facing shape — matches the existing form state in PlatformPlansView.tsx. */
export interface CreatePlanPayload {
  key:          string
  name:         string
  price:        number
  maxBranches:  number | null
  maxUsers:     number | null
  maxOwners:    number | null
  maxPets:      number | null
  features?:    string[]
}

export type UpdatePlanPayload = Partial<Omit<CreatePlanPayload, 'key'>>

/** Wire shape the backend actually accepts (mirrors the existing backend GET translation in reverse). */
interface PlanWirePayload {
  key?:         string
  name?:        string
  priceMonth?:  number
  maxBranches?: number | null
  maxUsers?:    number | null
  maxOwners?:   number | null
  features?:    Record<string, true>
}

/**
 * Translates the UI-facing CreatePlanPayload/UpdatePlanPayload shape to the wire shape
 * the backend Zod schema expects. `price` -> `priceMonth`; `features: string[]` ->
 * `Record<string, true>` (boolean-flag catalogue, ADR-0003 D3 — no valued config).
 * Preserves key immutability: `key` is only ever included on create, never on update
 * (UpdatePlanPayload has no `key` field at the type level, so this is enforced by the
 * type system, not runtime logic).
 */
export function toWirePayload(payload: CreatePlanPayload | UpdatePlanPayload): PlanWirePayload {
  const { price, features, ...rest } = payload as CreatePlanPayload
  const wire: PlanWirePayload = { ...rest }
  if (price !== undefined) wire.priceMonth = price
  if (features !== undefined) {
    wire.features = features.reduce((acc, f) => { acc[f] = true; return acc }, {} as Record<string, true>)
  }
  return wire
}

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
      platformApi.post('/platform/plans', toWirePayload(payload)).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

/** Update an existing plan's fields. */
export function useUpdatePlatformPlan(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePlanPayload) =>
      platformApi.put(`/platform/plans/${id}`, toWirePayload(payload)).then((r) => r.data),
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
