import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface PaymentInput {
  promptpayId?:      string
  paymentQrUrl?:     string
  gbprimepayPublic?: string
  gbprimepaySecret?: string
}

export function usePaymentSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdatePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PaymentInput) =>
      api.put('/api/settings/clinic/payment', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
