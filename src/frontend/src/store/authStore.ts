// Zustand auth store — JWT persisted to web storage so sessions survive refresh.
// "Remember me" → localStorage (survives browser restart); otherwise → sessionStorage
// (survives F5 refresh, cleared when the tab/browser closes).
import { create } from 'zustand'

const STORAGE_KEY = 'vc_auth'

interface AuthData {
  token:    string
  userId:   number
  tenantId: number
  role:     string
  name:     string
}

interface AuthState {
  token:    string | null
  userId:   number | null
  tenantId: number | null
  role:     string | null
  name:     string | null
  setAuth:  (data: AuthData, remember: boolean) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

const EMPTY = { token: null, userId: null, tenantId: null, role: null, name: null }

// Synchronously read persisted auth at module load — sessionStorage first (current
// tab), then localStorage (remembered). Sync read means isAuthenticated() is already
// true on the first render after F5, so ProtectedRoute does not bounce to /login.
function loadPersisted(): AuthData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthData) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...EMPTY,
  ...(loadPersisted() ?? {}),
  setAuth: (data, remember) => {
    try {
      const target = remember ? localStorage : sessionStorage
      const other  = remember ? sessionStorage : localStorage
      target.setItem(STORAGE_KEY, JSON.stringify(data))
      other.removeItem(STORAGE_KEY) // avoid a stale duplicate in the other storage
    } catch { /* storage unavailable (private mode) — keep in-memory only */ }
    set(data)
  },
  clearAuth: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
    set(EMPTY)
  },
  isAuthenticated: () => !!get().token,
}))
