// Audit log repository (Phase 4, FR-12) — write-once trail. Tenant-scoped.
import { Prisma } from '@prisma/client'
import prisma from '../config/db'

export interface AuditEntry {
  tenantId:   number
  userId?:    number | null
  action:     string
  tableName?: string | null
  recordId?:  number | null
  details?:   unknown
  ipAddress?: string | null
  userAgent?: string | null
}

export function create(entry: AuditEntry) {
  return prisma.auditLog.create({
    data: {
      tenantId:  entry.tenantId,
      userId:    entry.userId ?? null,
      action:    entry.action,
      tableName: entry.tableName ?? null,
      recordId:  entry.recordId ?? null,
      details:   (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  })
}

interface ListParams { skip: number; take: number; userId?: number; action?: string; from?: string; to?: string; branchId?: number | null }

// AuditLog.userId has no FK relation, so branch scoping is a two-step lookup: resolve which
// users belong to the branch (or have no branch assignment — visible everywhere, same rule as
// user.repository's findUsers), then filter logs to those actors (plus system/null-actor rows).
async function resolveBranchUserIds(tenantId: number, branchId?: number | null): Promise<number[] | null> {
  if (!branchId) return null
  const rows = await prisma.user.findMany({
    where: { tenantId, OR: [{ userBranches: { some: { branchId } } }, { userBranches: { none: {} } }] },
    select: { id: true },
  })
  return rows.map(r => r.id)
}

function listWhere(tenantId: number, { userId, action, from, to }: ListParams, branchUserIds: number[] | null) {
  let createdAt: { gte?: Date; lte?: Date } | undefined
  if (from || to) {
    createdAt = {}
    if (from) createdAt.gte = new Date(from)
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); createdAt.lte = t }
  }
  return {
    tenantId,
    ...(userId ? { userId } : {}),
    ...(action ? { action: { contains: action, mode: 'insensitive' as const } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(branchUserIds ? { OR: [{ userId: null }, { userId: { in: branchUserIds } }] } : {}),
  }
}

export async function list(tenantId: number, params: ListParams) {
  const branchUserIds = await resolveBranchUserIds(tenantId, params.branchId)
  return prisma.auditLog.findMany({
    where: listWhere(tenantId, params, branchUserIds),
    orderBy: { createdAt: 'desc' },
    skip: params.skip,
    take: params.take,
  })
}

export async function count(tenantId: number, params: ListParams) {
  const branchUserIds = await resolveBranchUserIds(tenantId, params.branchId)
  return prisma.auditLog.count({ where: listWhere(tenantId, params, branchUserIds) })
}
