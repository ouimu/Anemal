// Usage repository — read-only aggregate counts for clinic dashboards.
// All counts are tenant-scoped; date windows are computed by the service.

import prisma from '../config/db'

export function countBranches(tenantId: number) {
  return prisma.branch.count({ where: { tenantId, isActive: true } })
}

// A pet with no branch assignment (branchId = NULL) is counted under every branch, matching
// countOwners, countVaccinationsBetween, blood-bank's petBranchFilter, and the users `none`
// rule — so a NULL-branch pet's owner/vaccinations/donor record and the pet itself all agree.
export function countActivePets(tenantId: number, branchId?: number | null) {
  return prisma.pet.count({
    where: { tenantId, isActive: true, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) },
  })
}

// Owners have no branchId column of their own; an owner belongs to a branch through their
// pets. When a branch is selected, count owners who have at least one pet at that branch
// (a pet with no branch shows everywhere, same NULL rule as the pet count). No branch → all.
export function countOwners(tenantId: number, branchId?: number | null) {
  return prisma.owner.count({
    where: {
      tenantId,
      ...(branchId ? { pets: { some: { OR: [{ branchId }, { branchId: null }] } } } : {}),
    },
  })
}

// Staff are scoped by the userBranches assignment join (the "assigned branches" the admin
// edits), matching the Users management page. A user with no assignment shows in every
// branch (e.g. the admin). Keep this in sync with user.repository's findUsers filter.
function userBranchFilter(branchId?: number | null) {
  return branchId ? { OR: [{ userBranches: { some: { branchId } } }, { userBranches: { none: {} } }] } : {}
}

export function countUsers(tenantId: number, branchId?: number | null) {
  return prisma.user.count({ where: { tenantId, ...userBranchFilter(branchId) } })
}

export function countActiveUsers(tenantId: number, branchId?: number | null) {
  return prisma.user.count({ where: { tenantId, isActive: true, ...userBranchFilter(branchId) } })
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

export function countInvoicesSince(tenantId: number, since: Date, branchId?: number | null) {
  return prisma.invoice.count({ where: { tenantId, createdAt: { gte: since }, ...(branchId ? { branchId } : {}) } })
}

export function findSettings(tenantId: number) {
  return prisma.tenantSettings.findUnique({ where: { tenantId } })
}

export function countVaccinationsBetween(tenantId: number, from: Date, to: Date, branchId?: number | null) {
  // ponytail: NULL-branch pets show in every branch. When branchId provided, include pet.branchId = branchId OR NULL.
  if (branchId) {
    // R2-HI-02: tenant-scope the joined `pets` table too, not just `vaccinations`.
    return prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(v.id)::bigint AS count
      FROM vaccinations v
      JOIN pets p ON p.id = v."petId" AND p."tenantId" = ${tenantId}
      WHERE v."tenantId" = ${tenantId}
        AND v."nextDueAt" <= ${to}
        AND v."nextDueAt" >= ${from}
        AND (p."branchId" = ${branchId} OR p."branchId" IS NULL)
    `.then(rows => Number(rows[0]?.count ?? 0))
  }
  return prisma.vaccination.count({ where: { tenantId, nextDueAt: { gte: from, lte: to } } })
}
