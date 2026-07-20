/**
 * TanStack Query hooks for platform customer (tenant) management.
 * All endpoints require platform-plane JWT.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import platformApi from '../utils/platformApi'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Customer {
  id:           number
  name:         string
  subdomain:    string
  planId:       number | null
  planName:     string | null
  status:       'active' | 'trial' | 'suspended'
  userCount:    number
  trialEndsAt:  string | null
  createdAt:    string
}

export interface CustomerDetail extends Customer {
  email:         string | null
  phone:         string | null
  address:       string | null
  logoUrl:       string | null
  maxBranches:   number | null
  maxUsers:      number | null
  maxOwners:     number | null
  maxPets:       number | null
  companyTypeId: number | null
}

export interface CreateCustomerPayload {
  name:         string
  subdomain:    string
  planId:       number
}

export interface UpdateCustomerPayload {
  name?:          string
  planId?:        number
  companyTypeId?: number | null
}

/** Payload for PUT /platform/customers/:id/quota */
export interface UpdateQuotaPayload {
  maxBranches?: number | null
  maxUsers?:    number | null
  maxOwners?:   number | null
  maxPets?:     number | null
}

export interface CustomerUsage {
  branches: { current: number; limit: number | null }
  staff:    { current: number; limit: number | null }
  owners:   { current: number; limit: number | null }
  pets:     { current: number; limit: number | null }
}

/** A clinic_admin-role user of a tenant, as returned by the Clinic Admins tab endpoints. */
export interface TenantAdminUser {
  id:        number
  username:  string
  name:      string
  email:     string | null
  phone:     string | null
  isActive:  boolean
  createdAt: string
}

/** Response shape for create/reset — includes the plaintext password exactly once. */
export interface TenantAdminUserWithPassword extends TenantAdminUser {
  password: string
}

/** Payload for POST /platform/customers/:id/admin-users */
export interface CreateTenantAdminUserPayload {
  name:      string
  username:  string
  email?:    string
  phone?:    string
  password?: string
}

// ── Query keys ────────────────────────────────────────────────────────────────

const KEYS = {
  all:        ['platform', 'customers'] as const,
  detail:     (id: number) => ['platform', 'customers', id] as const,
  usage:      (id: number) => ['platform', 'customers', id, 'usage'] as const,
  adminUsers: (id: number) => ['platform', 'customers', id, 'admin-users'] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Fetch paginated customer list. */
export function usePlatformCustomers() {
  return useQuery<Customer[]>({
    queryKey: KEYS.all,
    queryFn: () =>
      platformApi.get('/platform/customers').then((r) => r.data.data),
  })
}

/** Fetch a single customer by id. */
export function usePlatformCustomer(id: number) {
  return useQuery<CustomerDetail>({
    queryKey: KEYS.detail(id),
    queryFn: () =>
      platformApi.get(`/platform/customers/${id}`).then((r) => r.data.data),
    enabled: id > 0,
  })
}

/** Raw shape returned by GET /platform/customers/:id/usage */
interface RawUsage {
  branches: number
  users:    number
  owners:   number
  pets:     number
  caps: {
    maxBranches: number | null
    maxUsers:    number | null
    maxOwners:   number | null
    maxPets:     number | null
  }
  overPlan: boolean
}

/** Fetch live usage stats for a customer. */
export function usePlatformCustomerUsage(id: number) {
  return useQuery<CustomerUsage>({
    queryKey: KEYS.usage(id),
    queryFn: () =>
      platformApi.get(`/platform/customers/${id}/usage`).then((r) => {
        const raw = r.data.data as RawUsage
        const usage: CustomerUsage = {
          branches: { current: raw.branches, limit: raw.caps.maxBranches },
          staff:    { current: raw.users,    limit: raw.caps.maxUsers },
          owners:   { current: raw.owners,   limit: raw.caps.maxOwners },
          pets:     { current: raw.pets,     limit: raw.caps.maxPets },
        }
        return usage
      }),
    enabled: id > 0,
  })
}

/** Create a new customer / tenant. */
export function useCreatePlatformCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCustomerPayload) =>
      platformApi.post('/platform/customers', payload).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

/** Update customer fields (plan, quotas, trial). */
export function useUpdatePlatformCustomer(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateCustomerPayload) =>
      platformApi.put(`/platform/customers/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}

/** Set per-tenant quota overrides (maxBranches/maxUsers/maxOwners/maxPets). */
export function useSetCustomerQuota(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateQuotaPayload) =>
      platformApi.put(`/platform/customers/${id}/quota`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
      qc.invalidateQueries({ queryKey: KEYS.usage(id) })
    },
  })
}

/** Suspend a tenant — blocks all clinic logins immediately. */
export function useSuspendCustomer(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      platformApi.post(`/platform/customers/${id}/suspend`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}

/** Reactivate a previously suspended tenant. */
export function useReactivateCustomer(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      platformApi.post(`/platform/customers/${id}/reactivate`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all })
      qc.invalidateQueries({ queryKey: KEYS.detail(id) })
    },
  })
}

/** Fetch clinic_admin-role users for a tenant (Clinic Admins tab). */
export function useTenantAdminUsers(id: number) {
  return useQuery<TenantAdminUser[]>({
    queryKey: KEYS.adminUsers(id),
    queryFn: () =>
      platformApi.get(`/platform/customers/${id}/admin-users`).then((r) => r.data.data),
    enabled: id > 0,
  })
}

/** Create an additional clinic_admin user for a tenant. */
export function useCreateTenantAdminUser(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTenantAdminUserPayload) =>
      platformApi.post(`/platform/customers/${id}/admin-users`, payload).then((r) => r.data.data as TenantAdminUserWithPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminUsers(id) }),
  })
}

/** Deactivate a clinic_admin user (soft delete — no reactivate, G-1). */
export function useDeactivateTenantAdminUser(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) =>
      platformApi.patch(`/platform/customers/${id}/admin-users/${userId}/deactivate`).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminUsers(id) }),
  })
}

/** Reset (or generate) a clinic_admin user's password. */
export function useResetTenantAdminUserPassword(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, password }: { userId: number; password?: string }) =>
      platformApi.patch(`/platform/customers/${id}/admin-users/${userId}/password`, { password })
        .then((r) => r.data.data as TenantAdminUserWithPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.adminUsers(id) }),
  })
}
