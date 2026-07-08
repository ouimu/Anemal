/**
 * TanStack Query hooks for platform-level settings management.
 * All endpoints require platform-plane JWT.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import platformApi from '../utils/platformApi'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformSettings {
  appName:          string
  baseUrl:          string
  maintenanceMode:  boolean
  trialDays:        number
  smtpHost:         string | null
  smtpPort:         number | null
  smtpUser:         string | null
  smtpFrom:         string | null
}

export type UpdatePlatformSettingsPayload = Partial<PlatformSettings>

// ── Query keys ────────────────────────────────────────────────────────────────

const KEYS = {
  settings: ['platform', 'settings'] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Fetch current platform settings. */
export function usePlatformSettings() {
  return useQuery<PlatformSettings>({
    queryKey: KEYS.settings,
    queryFn: () =>
      platformApi.get('/platform/settings').then((r) => r.data.data),
  })
}

/** Update one or more platform settings fields. */
export function useUpdatePlatformSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdatePlatformSettingsPayload) =>
      platformApi.put('/platform/settings', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.settings }),
  })
}
