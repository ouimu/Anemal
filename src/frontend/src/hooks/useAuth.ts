import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuthStore, AuthData } from '../store/authStore'
import { useT } from '../i18n'
import * as rememberedUsernames from '../utils/rememberedUsernames'

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
  branchId:     number | null   // null = all-branches scope (admin bypass)
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
  setAuth: (data: AuthData) => void,
  branchName = '',
): Promise<void> {
  const me = await fetchMe(login.token)
  setAuth({
    token:          login.token,
    plane:          'clinic',
    userId:         login.userId,
    tenantId:       login.tenantId,
    // login.branchId is what the issued JWT actually scopes requests to (null = admin
    // bypass, all branches). me.branchId is the user's assigned home branch — a different
    // concept — and must never be used here, or the switcher can show a branch selected
    // while every request is actually unscoped. login.branchId is always present.
    branchId:       login.branchId,
    roleIds:        me?.roleIds  ?? [],
    role:           login.role,
    permissions:    me?.permissions    ?? [],
    permSetVersion: me?.permSetVersion ?? 0,
    name:           login.name,
    companyName:    login.companyName ?? '',
    branchName,
  })
  try { await useAuthStore.getState().refreshPermissions() } catch { /* server enforces */ }
}

export function useLogin() {
  const [branchSelection, setBranchSelection]   = useState<BranchSelectionState | null>(null)
  const [remember, setRemember]                 = useState(false)
  const [pendingUsername, setPendingUsername]   = useState('')
  const [pendingSubdomain, setPendingSubdomain]  = useState('')
  const setAuth   = useAuthStore((s) => s.setAuth)
  const navigate  = useNavigate()
  const t         = useT()

  const loginMutation = useMutation({
    mutationFn: ({ remember: _rem, ...creds }: LoginPayload) =>
      api.post<{ success: boolean; data: LoginStep1Response | LoginStep2Response }>('/auth/login', creds),

    onSuccess: (res, vars) => {
      setRemember(vars.remember)
      setPendingUsername(vars.username)
      setPendingSubdomain(vars.subdomain)
      const data = res.data.data
      if (data.requiresBranchSelection) {
        setBranchSelection({ pendingToken: data.pendingToken, branches: data.branches })
      } else {
        // Admin bypass: branchId is null → use 'All Branches' label
        const branchName = data.branchId === null ? t('nav.allBranches') : ''
        void applyLogin(data, setAuth, branchName).then(() => {
          if (vars.remember) rememberedUsernames.upsert(vars.subdomain, vars.username)
          else rememberedUsernames.remove(vars.subdomain, vars.username)
          navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
        })
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
      await applyLogin(data, setAuth, selectedBranch?.name ?? '')
      if (remember) rememberedUsernames.upsert(pendingSubdomain, pendingUsername)
      else rememberedUsernames.remove(pendingSubdomain, pendingUsername)
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

/** Updates the JWT to a specific branch (or null = all-branches for admins). */
export function useSwitchBranch() {
  return useMutation({
    mutationFn: ({ branchId, branchName: _name }: { branchId: number | null; branchName: string }) =>
      api.post<{ success: boolean; data: { token: string } }>('/auth/switch-branch', { branchId }),

    onSuccess: (res, { branchId, branchName }) => {
      const state = useAuthStore.getState()
      state.setAuth({
        token:          res.data.data.token,
        plane:          state.plane,
        userId:         state.userId,
        tenantId:       state.tenantId,
        branchId,
        roleIds:        state.roleIds,
        role:           state.role,
        permissions:    state.permissions,
        permSetVersion: state.permSetVersion,
        name:           state.name,
        companyName:    state.companyName,
        branchName,
      })
    },
  })
}
