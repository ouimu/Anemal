import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface SystemSettingRow {
  category: string
  key:      string
  value:    string
  isSecret: boolean
}

export interface SmtpTestResult {
  success:  boolean
  message?: string
}

export function useSystemSettings() {
  return useQuery<SystemSettingRow[]>({
    queryKey: ['settings', 'system'],
    queryFn:  () => api.get('/admin/system-settings').then(r => r.data.data),
  })
}

export function useUpdateSystemSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/admin/system-settings/${key}`, { value }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'system'] }),
  })
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: () =>
      api.post('/admin/system-settings/smtp/test').then(r => r.data.data as SmtpTestResult),
  })
}
