// Cross-device sync for personal preferences (theme + language) via
// GET/PUT /api/settings/personal. uiStore stays the instant-apply source of truth;
// this layer hydrates it from the server on login and pushes user changes back.
import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'
import { useAuthStore } from '../store/authStore'
import { useUiStore, type Theme, type Language } from '../store/uiStore'

export interface PersonalPreferences {
  language:            Language
  defaultCalendarView: 'day' | 'week' | 'month'
  theme:               Theme
}

export type PersonalPreferencesInput = Partial<PersonalPreferences>

const QUERY_KEY = ['settings', 'personal'] as const

/** Raw query — only runs once authenticated. */
export function usePersonalPreferencesQuery() {
  const token = useAuthStore(s => s.token)
  return useQuery<PersonalPreferences>({
    queryKey: QUERY_KEY,
    queryFn: () => api.get('/api/settings/personal').then(r => r.data.data),
    enabled: !!token,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/** Persist a partial preference change to the server (fire-and-forget from the UI). */
export function useSavePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PersonalPreferencesInput) =>
      api.put('/api/settings/personal', data).then(r => r.data),
    onSuccess: (res) => {
      // keep the cache aligned with the server's echoed prefs
      if (res?.data) qc.setQueryData(QUERY_KEY, res.data)
    },
  })
}

/**
 * Mount once (in App) while authenticated: hydrates uiStore from the server the
 * first time prefs arrive. Guarded so later refetches never clobber a change the
 * user just made locally.
 */
export function usePreferenceHydration() {
  const { data } = usePersonalPreferencesQuery()
  const setTheme = useUiStore(s => s.setTheme)
  const setLanguage = useUiStore(s => s.setLanguage)
  const hydrated = useRef(false)

  useEffect(() => {
    if (hydrated.current || !data) return
    if (data.theme) setTheme(data.theme)
    if (data.language) setLanguage(data.language)
    hydrated.current = true
  }, [data, setTheme, setLanguage])
}
