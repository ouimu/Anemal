/**
 * Zustand store for platform-plane authentication.
 * Kept separate from the clinic authStore — platform tokens carry no tenantId/branchId.
 *
 * Persisted to sessionStorage so a page refresh within the same tab preserves
 * the session, but closing the tab clears it automatically.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

/** Matches the real backend envelope from POST /platform/auth/login (and /platform/auth/me). */
export interface PlatformAuthPayload {
  token:        string
  refreshToken: string
  user: {
    id:    number
    name:  string
    email: string
    role:  string
  }
}

/** Storage key used in sessionStorage. */
const STORAGE_KEY = 'platform-auth'

export const usePlatformAuthStore = create<PlatformAuthState>()(
  persist(
    (set, get) => ({
      token:          null,
      platformUserId: null,
      role:           null,
      name:           null,
      plane:          null,

      // refreshToken is intentionally NOT stored — no silent-refresh interceptor
      // exists in platformApi yet (ADR-0004 D3, deferred by design, not an oversight).
      setAuth: (data) =>
        set({
          token:          data.token,
          platformUserId: data.user.id,
          role:           data.user.role,
          name:           data.user.name,
          plane:          'platform',
        }),

      clearAuth: () =>
        set({ token: null, platformUserId: null, role: null, name: null, plane: null }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name:    STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
