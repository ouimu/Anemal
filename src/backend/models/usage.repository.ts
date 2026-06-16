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

export function countAppointmentsSince(tenantId: number, since: Date) {
  return prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: since } } })
}

export function countAppointmentsBetween(tenantId: number, from: Date, to: Date) {
  return prisma.appointment.count({ where: { tenantId, scheduledAt: { gte: from, lt: to } } })
}

export function countInvoicesSince(tenantId: number, since: Date) {
  return prisma.invoice.count({ where: { tenantId, createdAt: { gte: since } } })
}

export function findSettings(tenantId: number) {
  return prisma.tenantSettings.findUnique({ where: { tenantId } })
}

export function countVaccinationsBetween(tenantId: number, from: Date, to: Date) {
  return prisma.vaccination.count({ where: { tenantId, nextDueAt: { gte: from, lte: to } } })
}
