import { useQuery } from '@tanstack/react-query'
import api from '../utils/api'

export interface SubscriptionStatus {
  planTier:     string
  limits:       { maxUsers: number | null }
  usage:        { users: number }
  withinLimits: boolean
}

export function useSubscriptionStatus() {
  return useQuery<SubscriptionStatus>({
    queryKey: ['subscription', 'status'],
    queryFn: () => api.get('/api/subscription/status').then((r) => r.data.data),
    retry: false,
  })
}
