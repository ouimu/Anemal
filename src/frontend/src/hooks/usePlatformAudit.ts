/**
 * TanStack Query hooks for platform audit log.
 * All endpoints require platform-plane JWT.
 */
import { useQuery } from '@tanstack/react-query'
import platformApi from '../utils/platformApi'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id:         number
  action:     string
  actorId:    number
  actorName:  string
  tenantId:   number | null
  tenantName: string | null
  details:    Record<string, unknown>
  createdAt:  string
}

export interface AuditFilters {
  from?:     string
  to?:       string
  action?:   string
  tenantId?: number
}

// ── Query keys ────────────────────────────────────────────────────────────────

const KEYS = {
  list: (filters: AuditFilters) => ['platform', 'audit', filters] as const,
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Fetch platform audit logs with optional filters. */
export function usePlatformAudit(filters: AuditFilters = {}) {
  return useQuery<AuditLog[]>({
    queryKey: KEYS.list(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.from)                  params.set('from', filters.from)
      if (filters.to)                    params.set('to', filters.to)
      if (filters.action)                params.set('action', filters.action)
      if (filters.tenantId !== undefined) params.set('tenantId', String(filters.tenantId))
      return platformApi
        .get(`/platform/audit?${params.toString()}`)
        .then((r) => r.data.data)
    },
  })
}
