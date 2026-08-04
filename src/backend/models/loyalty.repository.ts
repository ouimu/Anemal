// Loyalty repository (Phase 4, FR-11) — points ledger + owner balance. Tenant-scoped.
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { NotFoundError } from '../utils/errors'

// `client` accepts either the shared `prisma` instance or a caller-supplied
// `Prisma.TransactionClient` — both satisfy the same delegate shape, so earn/redeem
// callers that need this read inside their own transaction (HI-08) can pass `tx`.
type Client = Prisma.TransactionClient

export function getOwner(client: Client, tenantId: number, ownerId: number) {
  return client.owner.findFirst({ where: { id: ownerId, tenantId } })
}

export function findInvoiceOwner(client: Client, tenantId: number, invoiceId: number) {
  return client.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: { id: true, totalAmount: true, pet: { select: { ownerId: true } } },
  })
}

export function listByOwner(tenantId: number, ownerId: number) {
  return prisma.loyaltyTransaction.findMany({ where: { tenantId, ownerId }, orderBy: { createdAt: 'desc' }, take: 50 })
}

/**
 * HI-08: earn/redeem must run inside the caller's transaction (same tx as the invoice
 * mark-paid claim), not in an independent `prisma.$transaction`, so a mid-way failure
 * cannot leave a paid invoice with no ledger entry or vice versa. Accepts a
 * `Prisma.TransactionClient` — callers open the outer transaction.
 * HI-02: scoped `updateMany` instead of a bare `update({where:{id}})` on the tenant-
 * scoped owner balance write.
 */
export async function applyEarn(
  tx: Prisma.TransactionClient, tenantId: number, ownerId: number, points: number, invoiceId: number | null, tier: string,
) {
  await tx.loyaltyTransaction.create({
    data: { tenantId, ownerId, invoiceId, pointsEarned: points, transactionType: 'earn' },
  })
  const updated = await tx.owner.updateMany({
    where: { id: ownerId, tenantId },
    data: { loyaltyPoints: { increment: points }, membershipTier: tier },
  })
  if (updated.count !== 1) throw new NotFoundError('Owner')
  return updated
}

export async function applyRedeem(tx: Prisma.TransactionClient, tenantId: number, ownerId: number, points: number) {
  await tx.loyaltyTransaction.create({
    data: { tenantId, ownerId, pointsRedeemed: points, transactionType: 'redeem' },
  })
  const updated = await tx.owner.updateMany({
    where: { id: ownerId, tenantId },
    data: { loyaltyPoints: { decrement: points } },
  })
  if (updated.count !== 1) throw new NotFoundError('Owner')
  return updated
}
