import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export type DayHours = { open: string; close: string }
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type OperatingHoursMap = Record<DayKey, DayHours | null>

export function useOperatingHours() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/v1/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateOperatingHours() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { operatingHours: OperatingHoursMap }) =>
      api.put('/api/v1/settings/clinic/hours', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}
