// Inventory transfer repository (Phase 4, FR-06-05) — atomic source→dest stock move.
import prisma from '../config/db'
import { ConflictError } from '../utils/errors'
import type { CreateTransferInput } from '../services/transfer.service'

export function createTransfer(tenantId: number, data: CreateTransferInput, performedBy?: number) {
  return prisma.$transaction(async (tx) => {
    // 1. Deduct from source branch (conditional — prevents over-transfer).
    const affected = await tx.$executeRaw`
      UPDATE branch_inventory
      SET "stockQty" = "stockQty" - ${data.qty}
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${data.fromBranchId}
        AND "productId" = ${data.productId} AND "stockQty" >= ${data.qty}
    `
    if (affected === 0) throw new ConflictError('Insufficient stock at source branch', 'INSUFFICIENT_STOCK')

    // 2. Increment destination branch (create row if absent).
    await tx.branchInventory.upsert({
      where: { tenantId_branchId_productId: { tenantId, branchId: data.toBranchId, productId: data.productId } },
      update: { stockQty: { increment: data.qty } },
      create: { tenantId, branchId: data.toBranchId, productId: data.productId, stockQty: data.qty, minStockQty: 0 },
    })

    // 3. Paired ledger movements.
    await tx.stockMovement.create({
      data: {
        tenantId, branchId: data.fromBranchId, itemId: data.productId, movementType: 'transfer_out',
        qty: data.qty, referenceType: 'transfer', destinationBranchId: data.toBranchId,
        notes: data.notes ?? null, performedBy: performedBy ?? null,
      },
    })
    const inbound = await tx.stockMovement.create({
      data: {
        tenantId, branchId: data.toBranchId, itemId: data.productId, movementType: 'transfer_in',
        qty: data.qty, referenceType: 'transfer', destinationBranchId: data.fromBranchId,
        notes: data.notes ?? null, performedBy: performedBy ?? null,
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
