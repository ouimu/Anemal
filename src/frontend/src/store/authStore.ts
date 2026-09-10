// Zustand auth store — JWT persisted to sessionStorage only, so a session
// always ends when the tab/browser/app closes (survives F5 refresh, nothing
// more). "Remember me" no longer affects session lifetime — see
// docs/adr/0010-remember-me-username-recall-not-session-persistence.md.
import { create } from 'zustand'
import api from '../utils/api'

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
  companyName:    string
  branchName:     string
  /**
   * INV-PERM-1: `permissionsLoaded === true` means `permissions` is the
   * authoritative, server-resolved set for the current token. `false` means
   * unknown — never treat as empty.
   */
  permissionsLoaded: boolean
}

interface AuthState extends AuthData {
  setAuth:            (data: AuthData) => void
  clearAuth:          () => void
  isAuthenticated:    () => boolean
  /**
   * Returns true when `code` is present in the current permissions array.
   * Deny-by-default: returns false when the permissions array is empty.
   */
  hasPermission:      (code: string) => boolean
  /**
   * Re-fetches /auth/me using the stored token, then writes updated permissions
   * and roleIds back to the store AND to persisted storage. The caller decides
   * when to invoke this. Clinic plane only — the platform plane has its own
   * store and its own /platform/auth/me handling (see F-5 note below).
   *
   * ADR-0026 decision 5: total contract over every exit — no token, a
   * network throw, a 401, a non-ok response, a malformed body, and success
   * each resolve `{ ok: boolean }` explicitly. `permissionsLoaded`/
   * `permissions` are only ever mutated on the success path (or reset by
   * `clearAuth()` on 401) — never fabricated to `[]`/`true` on a failure the
   * caller could not actually resolve (F-2, AUTH-INV-PERM-01).
   */
  refreshPermissions: () => Promise<{ ok: boolean }>
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
  companyName:    '',
  branchName:     '',
  permissionsLoaded: false,
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
    companyName:    raw.companyName    ?? '',
    branchName:     raw.branchName     ?? '',
    // OR, not typeof-guard: pre-fix builds could persist permissionsLoaded:
    // false alongside a fully populated permissions array (old refreshPermissions()
    // snapshotted the pre-update flag into the blob it wrote, before flipping it
    // in memory), so a false-but-present value must still be rescued by the
    // permissions.length fallback. Post-fix, setAuth never persists a non-empty
    // permissions array without permissionsLoaded: true, so "non-empty" continues
    // to genuinely imply "server-resolved" — INV-PERM-1 holds either way.
    permissionsLoaded: raw.permissionsLoaded === true
      || (Array.isArray(raw.permissions) && raw.permissions.length > 0),
  }
}

// Synchronously read persisted auth at module load — sessionStorage only, so
// isAuthenticated() is already true on the first render after F5 and
// RequireAuth does not bounce to /login. Also sweeps away any legacy
// "remembered" auth blob left in localStorage by the old remember-me
// behavior (runs every module load, independent of whether a session is
// being restored — see ADR-0010's legacy-token migration note).
function loadPersisted(): AuthData | null {
  try {
    localStorage.removeItem('vc_auth') // legacy sweep: old "remember me" persisted the full auth blob here
    const raw = sessionStorage.getItem(STORAGE_KEY)
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

  setAuth: (data) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch { /* storage unavailable (private mode) — keep in-memory only */ }
    // INV-PERM-1: permissionsLoaded === true ⇒ permissions is the
    // authoritative, server-resolved set for the current token. false ⇒
    // unknown, never treat as empty. Callers must pass it explicitly.
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
    const { token } = get()
    if (!token) return { ok: false }

    // F-5: this store is clinic-plane only. Nothing in production ever writes
    // plane: 'platform' here — the platform plane has its own store
    // (platformAuthStore) and its own 401 handler in platformApi.ts, which
    // correctly targets /platform/login. The previous code selected a
    // plane-correct ENDPOINT but a clinic-only REDIRECT below, so the file
    // simultaneously claimed and violated ADR-0026 decision 7. The dead branch
    // is removed rather than "fixed": a guard for an unreachable state gives
    // false confidence, and the same reasoning retired the AUTH-401-03 ternary.
    //
    // skipAuthRedirect: this store's own 401 branch below (clearAuth +
    // redirect, no clearServerState) is the pre-existing, load-bearing
    // behavior here — the shared api.ts interceptor's 401 handler does an
    // extra clearServerState() step this call has never done and must not
    // start doing as a side effect of routing through the shared client.
    let json: unknown
    try {
      const res = await api.get('/auth/me', { skipAuthRedirect: true })
      json = res.data
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        get().clearAuth()
        window.location.href = '/login?reason=session-expired'
        return { ok: false }
      }
      // Network throw or any other non-2xx — could not tell, not "no
      // permissions". Never mutate permissionsLoaded/permissions here
      // (F-2/AUTH-INV-PERM-01).
      return { ok: false }
    }
    const body = ((json as { data?: unknown }).data ?? json) as {
      permissions?: unknown
      roleIds?: number[]
      permSetVersion?: number
    }

    // F-2: a malformed `permissions` field must never manufacture "[] +
    // permissionsLoaded: true" (authoritatively none) out of "could not
    // tell". Bail out before touching the store at all.
    if (!Array.isArray(body.permissions)) return { ok: false }

    const patch: Partial<AuthData> = {
      permissions:    body.permissions,
      roleIds:        Array.isArray(body.roleIds) ? body.roleIds : get().roleIds,
      permSetVersion: body.permSetVersion         ?? get().permSetVersion,
    }

    // Persist the updated data so the next page load reflects the new permissions.
    const next: AuthData = { ...get(), ...patch, permissionsLoaded: true }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* ignore */ }

    set({ ...patch, permissionsLoaded: true })
    return { ok: true }
  },
}))
