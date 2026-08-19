import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { clearServerState } from '../utils/queryClient'
import { useAuthStore } from '../store/authStore'
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

/** Thrown when `/auth/me` cannot be resolved for a freshly issued token. */
export class IdentityLoadError extends Error {}

/**
 * Resolves the caller's identity (roles/permissions) for a freshly issued
 * token. Per ADR-0024, identity resolution is atomic with login: any failure
 * here — network throw, non-2xx response, or a malformed body — rejects the
 * caller's mutation instead of being swallowed, so no `setAuth` with an
 * unresolved identity can ever happen. Every failure surfaces as
 * `IdentityLoadError` (the grill's C1 ruling: the UI must be able to show a
 * specific "could not load your permissions" message — see LoginView.tsx —
 * distinct from "could not select branch"). The original error is not
 * swallowed: it is attached via `cause` for diagnostics, not converted to a
 * generic/`null` value.
 */
async function fetchMe(token: string): Promise<MeResponse> {
  let res: Response
  try {
    res = await fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
  } catch (cause) {
    throw new IdentityLoadError('Could not load permissions', { cause })
  }
  if (!res.ok) throw new IdentityLoadError('Could not load permissions')
  try {
    const json = await res.json()
    return (json.data ?? json) as MeResponse
  } catch (cause) {
    throw new IdentityLoadError('Could not load permissions', { cause })
  }
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
    // Discriminated return: the branch-selection-required response has no
    // token yet (nothing to resolve identity for); the direct/admin response
    // has one and identity must resolve before the mutation can succeed
    // (ADR-0024 — atomic with login, one /auth/me call either way).
    mutationFn: async ({ remember: _rem, ...creds }: LoginPayload) => {
      const res = await api.post<{ success: boolean; data: LoginStep1Response | LoginStep2Response }>(
        '/auth/login', creds,
      )
      const data = res.data.data
      if (data.requiresBranchSelection) return { kind: 'branchSelection' as const, data }
      const me = await fetchMe(data.token)
      return { kind: 'ready' as const, data, me }
    },

    onSuccess: (result, vars) => {
      setRemember(vars.remember)
      setPendingUsername(vars.username)
      setPendingSubdomain(vars.subdomain)
      if (result.kind === 'branchSelection') {
        setBranchSelection({ pendingToken: result.data.pendingToken, branches: result.data.branches })
        return
      }
      const { data, me } = result
      // Admin bypass: branchId is null → use 'All Branches' label
      const branchName = data.branchId === null ? t('nav.allBranches') : ''
      setAuth({
        token:          data.token,
        plane:          'clinic',
        userId:         data.userId,
        tenantId:       data.tenantId,
        // data.branchId is what the issued JWT actually scopes requests to (null = admin
        // bypass, all branches). me.branchId is the user's assigned home branch — a different
        // concept — and must never be used here, or the switcher can show a branch selected
        // while every request is actually unscoped. data.branchId is always present.
        branchId:       data.branchId,
        roleIds:        me.roleIds,
        role:           data.role,
        permissions:    me.permissions,
        permSetVersion: me.permSetVersion ?? 0,
        name:           data.name,
        companyName:    data.companyName ?? '',
        branchName,
        permissionsLoaded: true,
      })
      if (vars.remember) rememberedUsernames.upsert(vars.subdomain, vars.username)
      else rememberedUsernames.remove(vars.subdomain, vars.username)
      navigate(data.role === 'admin' ? '/clinic-admin/dashboard' : '/clinic/dashboard')
    },
  })

  const selectBranchMutation = useMutation({
    mutationFn: async ({ pendingToken, branchId }: { pendingToken: string; branchId: number }) => {
      const res = await api.post<{ success: boolean; data: LoginStep2Response }>(
        '/auth/select-branch', { pendingToken, branchId },
      )
      const data = res.data.data
      const me = await fetchMe(data.token)
      return { data, me }
    },

    // A rejected mutationFn (either the POST itself, or fetchMe) skips
    // onSuccess entirely — no setAuth, no bookkeeping, no navigate, and
    // branchSelection (component state, untouched) keeps the picker mounted.
    onSuccess: ({ data, me }, vars) => {
      const selectedBranch = branchSelection?.branches.find(b => b.id === vars.branchId)
      setAuth({
        token:          data.token,
        plane:          'clinic',
        userId:         data.userId,
        tenantId:       data.tenantId,
        branchId:       data.branchId,
        roleIds:        me.roleIds,
        role:           data.role,
        permissions:    me.permissions,
        permSetVersion: me.permSetVersion ?? 0,
        name:           data.name,
        companyName:    data.companyName ?? '',
        branchName:     selectedBranch?.name ?? '',
        permissionsLoaded: true,
      })
      setBranchSelection(null)
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
  // HI-09: drop cached PII before clearing auth + navigating away, so a
  // shared-tablet next user cannot read the previous identity's queries.
  return () => {
    void clearServerState().finally(() => {
      clearAuth()
      navigate('/login')
    })
  }
}

/** Updates the JWT to a specific branch (or null = all-branches for admins). */
export function useSwitchBranch() {
  return useMutation({
    mutationFn: ({ branchId, branchName: _name }: { branchId: number | null; branchName: string }) =>
      api.post<{ success: boolean; data: { token: string } }>('/auth/switch-branch', { branchId }),

    onSuccess: (res, { branchId, branchName }) => {
      // HI-09: a branch switch is an identity-scope transition too — cached
      // owner/pet/invoice data fetched under the old branch scope must not
      // remain readable after switching to a different branch.
      void clearServerState()
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
        permissionsLoaded: true,
      })
    },
  })
}
