import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

export interface SubscriptionStatus {
  quota:        { maxBranches: number | null; maxUsers: number | null; maxOwners: number | null }
  usage:        { users: number; branches: number; owners: number }
  withinLimits: { users: boolean; branches: boolean; owners: boolean }
}

export function useSubscriptionStatus() {
  return useQuery<SubscriptionStatus>({
    queryKey: ['subscription', 'status'],
    queryFn: () => api.get('/api/subscription/status').then((r) => r.data.data),
    retry: false,
  })
}
