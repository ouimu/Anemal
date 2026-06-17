/**
 * Zustand store for platform-plane authentication.
 * Kept separate from the clinic authStore — platform tokens carry no tenantId/branchId.
 */
import { create } from 'zustand'

export interface PlatformAuthState {
  token:           string | null
  platformUserId:  number | null
  role:            string | null
  name:            string | null
  plane:           'platform' | null
  setAuth:         (data: PlatformAuthPayload) => void
  clearAuth:       () => void
  isAuthenticated: () => boolean
}

export interface PlatformAuthPayload {
  token:          string
  platformUserId: number
  role:           string
  name:           string
}

export const usePlatformAuthStore = create<PlatformAuthState>((set, get) => ({
  token:          null,
  platformUserId: null,
  role:           null,
  name:           null,
  plane:          null,

  setAuth: (data) =>
    set({
      token:          data.token,
      platformUserId: data.platformUserId,
      role:           data.role,
      name:           data.name,
      plane:          'platform',
    }),

  clearAuth: () =>
    set({ token: null, platformUserId: null, role: null, name: null, plane: null }),

  isAuthenticated: () => !!get().token,
}))
