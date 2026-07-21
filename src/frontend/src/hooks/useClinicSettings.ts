import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export type VatMode = 'none' | 'exclusive' | 'inclusive'

export interface ClinicSettingsData {
  id:                   number
  tenantId:             number
  logoUrl:              string | null
  phone:                string | null
  email:                string | null
  website:              string | null
  address:              string | null
  taxId:                string | null
  vatMode:               VatMode
  vatRate:                string
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
  // Phase 3 fields — integrations (labApiKey arrives masked from API)
  labApiUrl?:  string | null
  labApiKey?:  string | null
}

export interface ClinicProfileInput {
  name?:    string
  logoUrl?: string
  address?: string
  phone?:   string
  email?:   string
  taxId?:   string
  website?: string
  vatMode?: VatMode
  vatRate?: number
}

export function useClinicSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateClinicProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ClinicProfileInput) =>
      api.put('/api/settings/clinic', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
