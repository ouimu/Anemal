// Zustand auth store — JWT persisted to web storage so sessions survive refresh.
// "Remember me" → localStorage (survives browser restart); otherwise → sessionStorage
// (survives F5 refresh, cleared when the tab/browser closes).
import { create } from 'zustand'

const STORAGE_KEY = 'vc_auth'

/** Shape written to web storage and held in memory. */
export interface AuthData {
  token:          string
  plane:          'clinic' | 'platform'
  userId:         number       // 0 for platform plane
  tenantId:       number       // 0 for platform plane
  branchId:       number | null
  roleIds:        number[]
  /** Transitional — keep until T-5B-02 removes role-string references. */
  role:           string
  /** Populated from /auth/me (or /platform/auth/me), never from JWT payload. */
  permissions:    string[]
  permSetVersion: number
  name:           string
}

interface AuthState extends AuthData {
  /** True once refreshPermissions() has written permissions from /auth/me into the store. */
  permissionsLoaded:  boolean
  setAuth:            (data: AuthData, remember: boolean) => void
  clearAuth:          () => void
  isAuthenticated:    () => boolean
  /**
   * Returns true when `code` is present in the current permissions array.
   * Deny-by-default: returns false when the permissions array is empty.
   */
  hasPermission:      (code: string) => boolean
  /**
   * Re-fetches /auth/me (clinic plane) or /platform/auth/me (platform plane)
   * using the stored token, then writes updated permissions and roleIds back to
   * the store AND to persisted storage.  The caller decides when to invoke this.
   */
  refreshPermissions: () => Promise<void>
}

/** Sentinel value used for the logged-out / pre-login state. */
const EMPTY: AuthData = {
  token:          '',
  plane:          'clinic',
  userId:         0,
  tenantId:       0,
  branchId:       null,
  roleIds:        [],
  role:           '',
  permissions:    [],
  permSetVersion: 0,
  name:           '',
}

/**
 * Normalises a raw persisted object so that any missing fields introduced
 * after the first release default gracefully rather than blowing up.
 */
function normalise(raw: Partial<AuthData>): AuthData {
  return {
    token:          raw.token          ?? '',
    plane:          raw.plane          ?? 'clinic',
    userId:         raw.userId         ?? 0,
    tenantId:       raw.tenantId       ?? 0,
    branchId:       raw.branchId       ?? null,
    roleIds:        Array.isArray(raw.roleIds) ? raw.roleIds : [],
    role:           raw.role           ?? '',
    permissions:    Array.isArray(raw.permissions) ? raw.permissions : [],
    permSetVersion: raw.permSetVersion ?? 0,
    name:           raw.name           ?? '',
  }
}

// Synchronously read persisted auth at module load — sessionStorage first (current
// tab), then localStorage (remembered).  Sync read means isAuthenticated() is already
// true on the first render after F5, so RequireAuth does not bounce to /login.
function loadPersisted(): AuthData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalise(JSON.parse(raw) as Partial<AuthData>)
  } catch {
    return null
  }
}

const persisted = loadPersisted()

export const useAuthStore = create<AuthState>((set, get) => ({
  ...EMPTY,
  ...(persisted ?? {}),
  permissionsLoaded: persisted !== null && persisted.permissions.length > 0,

  setAuth: (data, remember) => {
    try {
      const target = remember ? localStorage : sessionStorage
      const other  = remember ? sessionStorage : localStorage
      target.setItem(STORAGE_KEY, JSON.stringify(data))
      other.removeItem(STORAGE_KEY) // avoid a stale duplicate in the other storage
    } catch { /* storage unavailable (private mode) — keep in-memory only */ }
    // permissionsLoaded stays false — permissions come from /auth/me, not the login response
    set(data)
  },

  clearAuth: () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
    set({ ...EMPTY, permissionsLoaded: false })
  },

  isAuthenticated: () => get().token !== '',

  hasPermission: (code) => get().permissions.includes(code),

  refreshPermissions: async () => {
    const { token, plane } = get()
    if (!token) return

    const endpoint = plane === 'platform' ? '/platform/auth/me' : '/auth/me'
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.status === 401) {
      get().clearAuth()
      window.location.href = '/login'
      return
    }

    if (!res.ok) return

    const body = await res.json() as {
      permissions: string[]
      roleIds?: number[]
      permSetVersion?: number
    }

    const patch: Partial<AuthData> = {
      permissions:    Array.isArray(body.permissions) ? body.permissions : [],
      roleIds:        Array.isArray(body.roleIds)     ? body.roleIds     : get().roleIds,
      permSetVersion: body.permSetVersion             ?? get().permSetVersion,
    }

    // Persist the updated data so the next page load reflects the new permissions.
    const next: AuthData = { ...get(), ...patch }
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) !== null
          ? localStorage
          : sessionStorage
      stored.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* ignore */ }

    set({ ...patch, permissionsLoaded: true })
  },
}))
