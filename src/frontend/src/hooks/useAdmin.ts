import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface TenantSettings {
  id:                  number
  tenantId:            number
  logoUrl:             string | null
  phone:               string | null
  email:               string | null
  website:             string | null
  address:             string | null
  taxId:               string | null
  defaultSlotMinutes:  number
  workStartTime:       string
  workEndTime:         string
  smsRemindersEnabled: boolean
  lineRemindersEnabled:boolean
  planTier:            string
  idleTimeoutMinutes:  number
  tenant: { name: string; subdomain: string }
}

export function useAdminSettings(enabled = true) {
  return useQuery<TenantSettings>({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get('/admin/settings').then(r => r.data.data),
    enabled,
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TenantSettings> & { name?: string }) =>
      api.put('/admin/settings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  })
}
