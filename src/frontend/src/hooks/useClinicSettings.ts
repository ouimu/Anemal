import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface ClinicSettingsData {
  id:                   number
  tenantId:             number
  logoUrl:              string | null
  phone:                string | null
  email:                string | null
  website:              string | null
  address:              string | null
  taxId:                string | null
  updatedBy:            number | null
  updatedAt:            string
  tenant:               { name: string; subdomain: string }
  // Optional fields from the full API response shape
  defaultSlotMinutes?:  number
  workStartTime?:       string
  workEndTime?:         string
  smsRemindersEnabled?: boolean
  lineRemindersEnabled?: boolean
  planTier?:            string
  // Phase 2 fields — operating hours
  operatingHours?: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', { open: string; close: string } | null>
  // Phase 2 fields — notifications (secret fields arrive masked from API)
  lineOaToken?:    string | null
  smsProvider?:    'thaibulksms' | 'thsms' | '' | null
  smsApiKey?:      string | null
  smsSenderName?:  string | null
  // Phase 2 fields — payment (gbprimepaySecret arrives masked from API)
  promptpayId?:       string | null
  paymentQrUrl?:      string | null
  gbprimepayPublic?:  string | null
  gbprimepaySecret?:  string | null
}

export interface ClinicProfileInput {
  name?:    string
  logoUrl?: string
  address?: string
  phone?:   string
  email?:   string
  taxId?:   string
  website?: string
}

export function useClinicSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateClinicProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ClinicProfileInput) =>
      api.put('/api/v1/settings/clinic', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
