import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

export interface SubscriptionPlan {
  id:          number
  key:         string
  name:        string
  price:       number
  maxBranches: number
  maxUsers:    number
  maxOwners:   number | null
  maxPets:     number | null
  features:    string[]
}

export interface SubscriptionStatus {
  quota:        { maxBranches: number | null; maxUsers: number | null; maxOwners: number | null; maxPets: number | null }
  usage:        { users: number; branches: number; owners: number }
  withinLimits: { users: boolean; branches: boolean; owners: boolean }
  plans:          SubscriptionPlan[]
  currentPlanKey: string | null
}

export function useSubscriptionStatus() {
  return useQuery<SubscriptionStatus>({
    queryKey: ['subscription', 'status'],
    queryFn: () => api.get('/api/subscription/status').then((r) => r.data.data),
    retry: false,
  })
}
