import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface IntegrationsInput {
  labApiUrl?: string
  labApiKey?:  string
}

export interface IntegrationsTestResult {
  success: boolean
  status?:  number
  detail?:  string
}

export function useIntegrationsSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn:  () => api.get('/api/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateIntegrations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IntegrationsInput) =>
      api.put('/api/settings/clinic/integrations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}

export function useTestIntegrations() {
  return useMutation({
    mutationFn: () =>
      api.post('/api/settings/clinic/integrations/test').then(r => r.data.data as IntegrationsTestResult),
  })
}
