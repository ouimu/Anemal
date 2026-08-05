// Loyalty service (Phase 4, FR-11) — earn on paid invoice, tiered, redeem capped at 20%.
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { AppError } from '../utils/errors'
import * as loyaltyRepo from '../models/loyalty.repository'

const BAHT_PER_POINT = 100   // 100 baht spent = 1 point
const REDEEM_CAP_RATIO = 0.2 // points can cover at most 20% of an invoice

export const redeemSchema = z.object({
  ownerId:      z.number().int().positive(),
  points:       z.number().int().positive(),
  invoiceTotal: z.number().nonnegative().optional(),
}).strict()

export type RedeemInput = z.infer<typeof redeemSchema>

export class LoyaltyError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'LOYALTY_ERROR')
  }
}

export function tierFor(points: number): string {
  if (points >= 5000) return 'platinum'
  if (points >= 1500) return 'gold'
  if (points >= 500) return 'silver'
  return 'standard'
}

/**
 * Called after an invoice is marked paid. Best-effort (skips retail invoices with no
 * owner). HI-08: takes the caller's transaction so the earn happens atomically with the
 * invoice mark-paid claim and the payment-history row — never as an independent
 * `prisma.$transaction` that could commit (or fail) out of step with the payment itself.
 */
export async function earnOnPayment(
  tx: Prisma.TransactionClient, tenantId: number, invoiceId: number, totalAmount: number,
): Promise<void> {
  const ownerId = (await loyaltyRepo.findInvoiceOwner(tx, tenantId, invoiceId))?.pet?.ownerId
  if (!ownerId) return
  const points = Math.floor(totalAmount / BAHT_PER_POINT)
  if (points <= 0) return
  const owner = await loyaltyRepo.getOwner(tx, tenantId, ownerId)
  if (!owner) return
  const newTier = tierFor(owner.loyaltyPoints + points)
  await loyaltyRepo.applyEarn(tx, tenantId, ownerId, points, invoiceId, newTier)
}

export async function getOwnerLoyalty(tenantId: number, ownerId: number) {
  const owner = await loyaltyRepo.getOwner(prisma, tenantId, ownerId)
  if (!owner) throw new LoyaltyError('Owner not found', 404)
  const transactions = await loyaltyRepo.listByOwner(tenantId, ownerId)
  return {
    ownerId,
    points: owner.loyaltyPoints,
    membershipTier: owner.membershipTier,
    transactions,
  }
}

/**
 * HI-08: read-check-write wrapped in one transaction so two concurrent redemptions for
 * the same owner cannot both pass the `points > owner.loyaltyPoints` check against a
 * stale balance and jointly overdraw the ledger.
 */
export async function redeem(tenantId: number, data: RedeemInput) {
  return prisma.$transaction(async (tx) => {
    const owner = await loyaltyRepo.getOwner(tx, tenantId, data.ownerId)
    if (!owner) throw new LoyaltyError('Owner not found', 404)
    if (data.points > owner.loyaltyPoints) throw new LoyaltyError('Insufficient points', 400)
    if (data.invoiceTotal != null) {
      const cap = Math.floor(data.invoiceTotal * REDEEM_CAP_RATIO)
      if (data.points > cap) throw new LoyaltyError(`Points redeemed cannot exceed 20% of the invoice (max ${cap})`, 400)
    }
    await loyaltyRepo.applyRedeem(tx, tenantId, data.ownerId, data.points)
    // 1 point = 1 baht discount. applyRedeem returns a batch payload ({count}), not the
    // updated owner row (HI-02 scoped-updateMany fix) — compute the new balance from the
    // pre-redemption read above instead of a second round trip.
    return { ownerId: data.ownerId, pointsRedeemed: data.points, discount: data.points, remainingPoints: owner.loyaltyPoints - data.points }
  })
}
