/**
 * Repository for platform_audit_logs table (platform-plane only).
 *
 * The `details` field is intentionally excluded from all list queries — it is a
 * JSON blob that may contain PII and must never be surfaced via the API.
 *
 * This is separate from `audit.repository.ts` which operates on the
 * clinic-plane `audit_logs` table.
 *
 * @module platform-audit.repository
 */

import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { redact } from '../utils/audit-sanitize'

/** Columns returned for every audit log entry. `details` DB column is omitted (PII risk). */
const SELECT = {
  id: true,
  action: true,
  targetTenantId: true,
  performedByPlatformUserId: true,
  ipAddress: true,
  createdAt: true,
  // ponytail: details DB column intentionally omitted — PII risk
  performedBy: {
    select: { name: true },
  },
  targetTenant: {
    select: { name: true },
  },
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

/** Shape of a single audit log row returned by the repository (frontend-normalized). */
export interface PlatformAuditLogRow {
  id:         number
  action:     string
  actorId:    number
  actorName:  string
  tenantId:   number | null
  tenantName: string | null
  details:    Record<string, never>
  ipAddress:  string | null
  createdAt:  Date
}

/** Input shape for creating a platform audit log entry. */
export interface PlatformAuditEntry {
  performedByPlatformUserId: number
  action:                    string
  targetTenantId?:           number | null
  details?:                  unknown
  ipAddress?:                string | null
}

/**
 * Write a single platform-plane audit log entry.
 *
 * @param entry - Audit entry fields; `targetTenantId` and `details` are optional.
 * @returns The created Prisma record.
 */
export function createPlatformAuditLog(entry: PlatformAuditEntry) {
  return prisma.platformAuditLog.create({
    data: {
      performedByPlatformUserId: entry.performedByPlatformUserId,
      action:                    entry.action,
      targetTenantId:            entry.targetTenantId ?? null,
      details:                   (entry.details != null ? redact(entry.details) : undefined) as Prisma.InputJsonValue | undefined,
      ipAddress:                 entry.ipAddress ?? null,
    },
  })
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

  if (opts.from || opts.to) {
    where.createdAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    }
  }
  if (opts.action) where.action = opts.action
  if (opts.tenantId) where.targetTenantId = opts.tenantId

  const [rows, total] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      select: SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    prisma.platformAuditLog.count({ where }),
  ])

  const items: PlatformAuditLogRow[] = rows.map((r) => ({
    id:         r.id,
    action:     r.action,
    actorId:    r.performedByPlatformUserId,
    actorName:  r.performedBy.name,
    tenantId:   r.targetTenantId,
    tenantName: r.targetTenant?.name ?? null,
    details:    {},
    ipAddress:  r.ipAddress,
    createdAt:  r.createdAt,
  }))

  return { items, total }
}
