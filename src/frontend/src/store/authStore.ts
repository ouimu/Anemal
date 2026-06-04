// Zustand auth store — JWT kept in memory (not localStorage) for security
import { create } from 'zustand'

interface AuthState {
  token:    string | null
  userId:   number | null
  tenantId: number | null
  role:     string | null
  name:     string | null
  setAuth:  (data: { token: string; userId: number; tenantId: number; role: string; name: string }) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token:    null,
  userId:   null,
  tenantId: null,
  role:     null,
  name:     null,
  setAuth: (data) => set(data),
  clearAuth: () => set({ token: null, userId: null, tenantId: null, role: null, name: null }),
  isAuthenticated: () => !!get().token,
}))
