import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import type { ClinicSettingsData } from './useClinicSettings'

export interface NotificationsInput {
  lineOaToken?:          string
  lineRemindersEnabled?: boolean
  smsProvider?:          'thaibulksms' | 'thsms' | ''
  smsApiKey?:            string
  smsSenderName?:        string
  smsRemindersEnabled?:  boolean
}

export interface NotificationsTestInput {
  channel: 'line' | 'sms'
}

export interface NotificationsTestResult {
  status:    'success' | 'error'
  message:   string
  timestamp: string
}

export function useNotificationsSettings() {
  return useQuery<ClinicSettingsData>({
    queryKey: ['settings', 'clinic'],
    queryFn: () => api.get('/api/settings/clinic').then(r => r.data.data),
  })
}

export function useUpdateNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NotificationsInput) =>
      api.put('/api/settings/clinic/notifications', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic'] }),
  })
}

export function useTestNotifications() {
  return useMutation({
    mutationFn: (data: NotificationsTestInput) =>
      api.post('/api/settings/clinic/notifications/test', data).then(r => r.data.data as NotificationsTestResult),
  })
}
