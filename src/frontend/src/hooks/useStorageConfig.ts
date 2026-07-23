import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface StorageConfigData {
  provider: 'local' | 'custom_path'
  configured: boolean
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
