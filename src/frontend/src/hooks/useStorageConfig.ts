import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface StorageConfigData {
  provider: 'local' | 'custom_path' | 'google_drive'
  configured: boolean
  connected?: boolean
  smbHost?: string
  smbShare?: string
  smbUsername?: string
}

export interface StorageConfigInput {
  provider: 'local' | 'custom_path'
  smbHost?: string
  smbShare?: string
  smbUsername?: string
  smbPassword?: string
  confirmBaseChange?: boolean
}

export function useStorageConfig() {
  return useQuery<StorageConfigData>({
    queryKey: ['settings', 'clinic', 'storage-config'],
    queryFn:  () => api.get('/api/settings/clinic/storage-config').then(r => r.data.data),
  })
}

export function useUpdateStorageConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StorageConfigInput) =>
      api.put('/api/settings/clinic/storage-config', data).then(r => r.data.data as StorageConfigData),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'clinic', 'storage-config'] }),
  })
}

/** Calls the authenticated /authorize endpoint, returns { url } — the
 *  caller performs the actual browser navigation (window.location.href =
 *  url), never this hook, so the redirect stays a plain full-page nav. */
export function useGoogleAuthorize() {
  return useMutation({
    mutationFn: () => api.get<{ data: { url: string } }>('/api/settings/clinic/storage-config/google/authorize').then(r => r.data.data),
  })
}
