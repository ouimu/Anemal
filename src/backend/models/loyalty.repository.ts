// Loyalty repository (Phase 4, FR-11) — points ledger + owner balance. Tenant-scoped.
import prisma from '../config/db'
import { NotFoundError } from '../utils/errors'

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

// HI-02: scoped `updateMany` instead of a bare `update({where:{id}})` on the tenant-
// scoped owner balance write.
export function applyEarn(tenantId: number, ownerId: number, points: number, invoiceId: number | null, tier: string) {
  return prisma.$transaction(async (tx) => {
    await tx.loyaltyTransaction.create({
      data: { tenantId, ownerId, invoiceId, pointsEarned: points, transactionType: 'earn' },
    })
    const updated = await tx.owner.updateMany({
      where: { id: ownerId, tenantId },
      data: { loyaltyPoints: { increment: points }, membershipTier: tier },
    })
    if (updated.count !== 1) throw new NotFoundError('Owner')
    return updated
  })
}

export function applyRedeem(tenantId: number, ownerId: number, points: number) {
  return prisma.$transaction(async (tx) => {
    await tx.loyaltyTransaction.create({
      data: { tenantId, ownerId, pointsRedeemed: points, transactionType: 'redeem' },
    })
    const updated = await tx.owner.updateMany({
      where: { id: ownerId, tenantId },
      data: { loyaltyPoints: { decrement: points } },
    })
    if (updated.count !== 1) throw new NotFoundError('Owner')
    return updated
  })
}
