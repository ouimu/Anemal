// Usage repository — read-only aggregate counts for clinic dashboards.
// All counts are tenant-scoped; date windows are computed by the service.

import prisma from '../config/db'

export function countBranches(tenantId: number) {
  return prisma.branch.count({ where: { tenantId, isActive: true } })
}

export function countActivePets(tenantId: number) {
  return prisma.pet.count({ where: { tenantId, isActive: true } })
}

export function countOwners(tenantId: number) {
  return prisma.owner.count({ where: { tenantId } })
}

export function countUsers(tenantId: number) {
  return prisma.user.count({ where: { tenantId } })
}

export function countActiveUsers(tenantId: number) {
  return prisma.user.count({ where: { tenantId, isActive: true } })
}

export function countAppointmentsSince(tenantId: number, since: Date, branchId?: number | null) {
  return prisma.appointment.count({
    where: { tenantId, scheduledAt: { gte: since }, ...(branchId ? { branchId } : {}) },
  })
}

export function countAppointmentsBetween(tenantId: number, from: Date, to: Date, branchId?: number | null) {
  return prisma.appointment.count({
    where: { tenantId, scheduledAt: { gte: from, lt: to }, ...(branchId ? { branchId } : {}) },
  })
}

export function countInvoicesSince(tenantId: number, since: Date) {
  return prisma.invoice.count({ where: { tenantId, createdAt: { gte: since } } })
}

export function findSettings(tenantId: number) {
  return prisma.tenantSettings.findUnique({ where: { tenantId } })
}

export function countVaccinationsBetween(tenantId: number, from: Date, to: Date, branchId?: number | null) {
  // ponytail: NULL-branch pets show in every branch. When branchId provided, include pet.branchId = branchId OR NULL.
  if (branchId) {
    return prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(v.id)::bigint AS count
      FROM vaccinations v
      JOIN pets p ON p.id = v."petId"
      WHERE v."tenantId" = ${tenantId}
        AND v."nextDueAt" <= ${to}
        AND v."nextDueAt" >= ${from}
        AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)
    `.then(rows => Number(rows[0]?.count ?? 0))
  }
  return prisma.vaccination.count({ where: { tenantId, nextDueAt: { gte: from, lte: to } } })
}
