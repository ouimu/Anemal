/**
 * Repository for platform_audit_logs table (platform-plane only).
 *
 * The `details` field is intentionally excluded from all queries — it is a
 * JSON blob that may contain PII and must never be surfaced via the API.
 *
 * This is separate from `audit.repository.ts` which operates on the
 * clinic-plane `audit_logs` table.
 *
 * @module platform-audit.repository
 */

import prisma from '../config/db'

/** Columns returned for every audit log entry. `details` is omitted (PII risk). */
const SELECT = {
  id: true,
  action: true,
  targetTenantId: true,
  performedByPlatformUserId: true,
  ipAddress: true,
  createdAt: true,
  // ponytail: details intentionally omitted — PII risk
} as const

/** Filter + pagination options for listPlatformAuditLogs. */
export interface ListPlatformAuditLogsOpts {
  from?: Date
  to?: Date
  action?: string
  tenantId?: number
  page: number
  limit: number
}

/** Shape of a single audit log row returned by the repository. */
export interface PlatformAuditLogRow {
  id: number
  action: string
  targetTenantId: number | null
  performedByPlatformUserId: number
  ipAddress: string | null
  createdAt: Date
}

/**
 * Returns a paginated list of platform audit log entries and the total count
 * matching the supplied filters.
 *
 * @param opts - Filter and pagination options.
 * @returns Object containing `items` array and `total` count.
 */
export async function listPlatformAuditLogs(
  opts: ListPlatformAuditLogsOpts,
): Promise<{ items: PlatformAuditLogRow[]; total: number }> {
  const where: Record<string, unknown> = {}

  if (opts.from ?? opts.to) {
    where.createdAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    }
  }
  if (opts.action) where.action = opts.action
  if (opts.tenantId) where.targetTenantId = opts.tenantId

  const [items, total] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.platformAuditLog.count({ where }),
  ])

  return { items, total }
}
