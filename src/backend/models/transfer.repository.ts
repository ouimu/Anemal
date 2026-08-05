// Inventory transfer repository (Phase 4, FR-06-05) — atomic source→dest stock move.
import prisma from '../config/db'
import { ConflictError } from '../utils/errors'
import type { CreateTransferInput } from '../services/transfer.service'

export function createTransfer(tenantId: number, data: CreateTransferInput, performedBy?: number) {
  return prisma.$transaction(async (tx) => {
    // R3-HI-05: read the source lot's expiry before deducting so it can be
    // carried to the destination side — otherwise a transfer silently drops
    // the expiry an FEFO/alert query at the destination branch relies on.
    const source = await tx.branchInventory.findUnique({
      where: { tenantId_branchId_productId: { tenantId, branchId: data.fromBranchId, productId: data.productId } },
      select: { lotNo: true, expiryDate: true },
    })

    // 1. Deduct from source branch (conditional — prevents over-transfer).
    const affected = await tx.$executeRaw`
      UPDATE branch_inventory
      SET "stockQty" = "stockQty" - ${data.qty}
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${data.fromBranchId}
        AND "productId" = ${data.productId} AND "stockQty" >= ${data.qty}
    `
    if (affected === 0) throw new ConflictError('Insufficient stock at source branch', 'INSUFFICIENT_STOCK')

    // 2. Increment destination branch (create row if absent), carrying the
    // source lotNo/expiryDate only on create — an existing destination row
    // is reconciled by the earliest-wins raw update below (step 2b), same
    // rule as stockIn's aggregate update.
    await tx.branchInventory.upsert({
      where: { tenantId_branchId_productId: { tenantId, branchId: data.toBranchId, productId: data.productId } },
      update: { stockQty: { increment: data.qty } },
      create: {
        tenantId, branchId: data.toBranchId, productId: data.productId, stockQty: data.qty, minStockQty: 0,
        lotNo: source?.lotNo ?? null, expiryDate: source?.expiryDate ?? null,
      },
    })

    // 2b. QA follow-up (post a563b7b): lot-mismatch clear + earliest-wins
    // expiry reconciliation on the destination aggregate, folded into ONE
    // atomic UPDATE computed under the row's UPDATE lock — mirrors the
    // stockIn fix in product.repository.ts (same CASE precedence: no
    // incoming lot -> keep; destination has no lot yet -> adopt source lot;
    // mismatch -> clear to NULL; else unchanged). This is symmetric with the
    // source side, which already loses its own lot identity via stockIn's
    // atomic UPDATE when a different lot is later received there.
    //
    // Expiry stays in the date domain (see product.repository.ts stockIn for
    // why binding a JS Date resolves to timestamptz and is
    // session-TimeZone-dependent once cast back to `date`): pass the
    // YYYY-MM-DD string cast to `::date` instead.
    const sourceLot = source?.lotNo ?? null
    if (source?.expiryDate) {
      const sourceExpiryDay = source.expiryDate.toISOString().slice(0, 10)
      await tx.$executeRaw`
        UPDATE "branch_inventory"
        SET
          "lotNo" = CASE
            WHEN ${sourceLot}::text IS NULL THEN "lotNo"
            WHEN "lotNo" IS NULL THEN ${sourceLot}::text
            WHEN "lotNo" IS DISTINCT FROM ${sourceLot}::text THEN NULL
            ELSE "lotNo"
          END,
          "expiryDate" = LEAST(COALESCE("expiryDate", ${sourceExpiryDay}::date), ${sourceExpiryDay}::date)
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${data.toBranchId} AND "productId" = ${data.productId}
      `
    } else if (sourceLot) {
      await tx.$executeRaw`
        UPDATE "branch_inventory"
        SET "lotNo" = CASE
          WHEN "lotNo" IS NULL THEN ${sourceLot}::text
          WHEN "lotNo" IS DISTINCT FROM ${sourceLot}::text THEN NULL
          ELSE "lotNo"
        END
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${data.toBranchId} AND "productId" = ${data.productId}
      `
    }

    // 3. Paired ledger movements — each carries the source lot/expiry as a
    // permanent per-movement record.
    await tx.stockMovement.create({
      data: {
        tenantId, branchId: data.fromBranchId, itemId: data.productId, movementType: 'transfer_out',
        qty: data.qty, referenceType: 'transfer', destinationBranchId: data.toBranchId,
        notes: data.notes ?? null, performedBy: performedBy ?? null,
        lotNo: source?.lotNo ?? null, expiryDate: source?.expiryDate ?? null,
      },
    })
    const inbound = await tx.stockMovement.create({
      data: {
        tenantId, branchId: data.toBranchId, itemId: data.productId, movementType: 'transfer_in',
        qty: data.qty, referenceType: 'transfer', destinationBranchId: data.fromBranchId,
        notes: data.notes ?? null, performedBy: performedBy ?? null,
        lotNo: source?.lotNo ?? null, expiryDate: source?.expiryDate ?? null,
      },
    })
    return inbound
  })
}

export function listTransfers(tenantId: number, branchId?: number) {
  return prisma.stockMovement.findMany({
    where: {
      tenantId,
      movementType: { in: ['transfer_out', 'transfer_in'] },
      ...(branchId ? { branchId } : {}),
    },
    include: { item: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
