import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore, AuthData } from '../store/authStore'

interface LoginPayload { subdomain: string; username: string; password: string; remember: boolean }

interface LoginStep1Response {
  requiresBranchSelection: true
  pendingToken: string
  branches:     { id: number; name: string }[]
}

interface LoginStep2Response {
  requiresBranchSelection: false
  token:        string
  refreshToken: string
  userId:       number
  tenantId:     number
  branchId:     number
  role:         string
  name:         string
  companyName:  string
}

interface MeResponse {
  userId:          number
  tenantId:        number
  branchId?:       number | null
  name:            string
  email:           string
  roleIds:         number[]
  permissions:     string[]
  permSetVersion?: number
}

export interface BranchSelectionState {
  pendingToken: string
  branches:     { id: number; name: string }[]
}

async function fetchMe(token: string): Promise<MeResponse | null> {
  try {
    const res = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const json = await res.json()
    return (json.data ?? json) as MeResponse
  } catch { return null }
}

async function applyLogin(
  login: LoginStep2Response,
  remember: boolean,
  setAuth: (data: AuthData, remember: boolean) => void,
  branchName = '',
): Promise<void> {
  const me = await fetchMe(login.token)
  setAuth({
    token:          login.token,
    plane:          'clinic',
    userId:         login.userId,
    tenantId:       login.tenantId,
    branchId:       me?.branchId ?? login.branchId ?? null,
    roleIds:        me?.roleIds  ?? [],
    role:           login.role,
    permissions:    me?.permissions    ?? [],
    permSetVersion: me?.permSetVersion ?? 0,
    name:           login.name,
    companyName:    login.companyName ?? '',
    branchName,
  }, remember)
  try { await useAuthStore.getState().refreshPermissions() } catch { /* server enforces */ }
}

export function useLogin() {
  const [branchSelection, setBranchSelection] = useState<BranchSelectionState | null>(null)
  const [remember, setRemember]               = useState(false)
  const setAuth   = useAuthStore((s) => s.setAuth)
  const navigate  = useNavigate()

  const loginMutation = useMutation({
    mutationFn: ({ remember: _rem, ...creds }: LoginPayload) =>
      api.post<{ success: boolean; data: LoginStep1Response | LoginStep2Response }>('/auth/login', creds),

    onSuccess: (res, vars) => {
      setRemember(vars.remember)
      const data = res.data.data
      if (data.requiresBranchSelection) {
        setBranchSelection({ pendingToken: data.pendingToken, branches: data.branches })
      } else {
        // fallback (shouldn't happen with current backend)
        void applyLogin(data, vars.remember, setAuth).then(() =>
          navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
        )
      }
    },
  })

  const selectBranchMutation = useMutation({
    mutationFn: ({ pendingToken, branchId }: { pendingToken: string; branchId: number }) =>
      api.post<{ success: boolean; data: LoginStep2Response }>('/auth/select-branch', { pendingToken, branchId }),

    onSuccess: async (res, vars) => {
      const data = res.data.data
      const selectedBranch = branchSelection?.branches.find(b => b.id === vars.branchId)
      setBranchSelection(null)
      await applyLogin(data, remember, setAuth, selectedBranch?.name ?? '')
      navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
    },
  })

  return {
    branchSelection,
    loginMutation,
    selectBranchMutation,
    resetBranchSelection: () => setBranchSelection(null),
  }
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate  = useNavigate()
  return () => { clearAuth(); navigate('/login') }
}
