import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore, AuthData } from '../store/authStore'

interface LoginPayload { subdomain: string; email: string; password: string; remember: boolean }

/** Response shape from POST /auth/login */
interface LoginResponse {
  token:    string
  userId:   number
  tenantId: number
  branchId?: number | null
  role:     string
  name:     string
}

/** Response shape from GET /auth/me */
interface MeResponse {
  userId:         number
  tenantId:       number
  branchId?:      number | null
  name:           string
  email:          string
  roleIds:        number[]
  permissions:    string[]
  permSetVersion?: number
}

/**
 * Fetches /auth/me with the supplied token.
 * Returns null on network/auth error so the caller can fall back to defaults.
 */
async function fetchMe(token: string): Promise<MeResponse | null> {
  try {
    const res = await fetch('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    return (json.data ?? json) as MeResponse
  } catch {
    return null
  }
}

export function useLogin() {
  const setAuth  = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: ({ remember: _remember, ...credentials }: LoginPayload) =>
      api.post<{ success: boolean; data: LoginResponse }>('/auth/login', credentials),

    onSuccess: async (res, variables) => {
      const login = res.data.data
      const me    = await fetchMe(login.token)

      const authData: AuthData = {
        token:          login.token,
        plane:          'clinic',
        userId:         login.userId,
        tenantId:       login.tenantId,
        branchId:       me?.branchId   ?? login.branchId ?? null,
        roleIds:        me?.roleIds    ?? [],
        role:           login.role,
        permissions:    me?.permissions    ?? [],
        permSetVersion: me?.permSetVersion ?? 0,
        name:           login.name,
      }

      setAuth(authData, variables.remember)

      // Populate permissionsLoaded before navigating so RequirePermission does
      // not flash to /403 on the first render. Fail open on network error —
      // the server is the enforcement boundary.
      try {
        await useAuthStore.getState().refreshPermissions()
      } catch { /* network error — proceed; server enforces permissions */ }

      navigate(
        login.role === 'admin'      ? '/clinic-admin/dashboard' :
        '/clinic/dashboard'
      )
    },
  })
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate  = useNavigate()
  return () => { clearAuth(); navigate('/login') }
}
