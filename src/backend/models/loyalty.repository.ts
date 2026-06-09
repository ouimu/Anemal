// Loyalty repository (Phase 4, FR-11) — points ledger + owner balance. Tenant-scoped.
import prisma from '../config/db'

export function getOwner(tenantId: number, ownerId: number) {
  return prisma.owner.findFirst({ where: { id: ownerId, tenantId } })
}

export function findInvoiceOwner(tenantId: number, invoiceId: number) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true, totalAmount: true, pet: { select: { ownerId: true } } },
  })
}

export function listByOwner(tenantId: number, ownerId: number) {
  return prisma.loyaltyTransaction.findMany({ where: { tenantId, ownerId }, orderBy: { createdAt: 'desc' }, take: 50 })
}

export function applyEarn(tenantId: number, ownerId: number, points: number, invoiceId: number | null, tier: string) {
  return prisma.$transaction(async (tx) => {
    await tx.loyaltyTransaction.create({
      data: { tenantId, ownerId, invoiceId, pointsEarned: points, transactionType: 'earn' },
    })
    return tx.owner.update({ where: { id: ownerId }, data: { loyaltyPoints: { increment: points }, membershipTier: tier } })
  })
}

export function applyRedeem(tenantId: number, ownerId: number, points: number) {
  return prisma.$transaction(async (tx) => {
    await tx.loyaltyTransaction.create({
      data: { tenantId, ownerId, pointsRedeemed: points, transactionType: 'redeem' },
    })
    return tx.owner.update({ where: { id: ownerId }, data: { loyaltyPoints: { decrement: points } } })
  })
}
