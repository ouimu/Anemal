// Audit log service (Phase 4, FR-12) — read-only access to the write-once trail.
import * as auditRepo from '../models/audit.repository'

interface ListAuditParams {
  page?: number
  limit?: number
  userId?: number
  action?: string
  from?: string
  to?: string
}

const MAX_LIMIT = 100

export async function listAudit(tenantId: number, params: ListAuditParams) {
  const page  = Math.max(1, params.page ?? 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? 50))
  const repoParams = {
    skip: (page - 1) * limit,
    take: limit,
    userId: params.userId,
    action: params.action,
    from: params.from,
    to: params.to,
  }
  const [items, total] = await Promise.all([
    auditRepo.list(tenantId, repoParams),
    auditRepo.count(tenantId, repoParams),
  ])
  return { items, total, page, limit }
}
