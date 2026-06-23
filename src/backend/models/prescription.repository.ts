// Prescription repository — Prisma access incl. atomic per-branch stock deduction (Phase 4).
import prisma from '../config/db'
import type { CreatePrescriptionInput } from '../services/prescription.service'

export function findMedicalRecord(tenantId: number, medicalRecordId: number) {
  return prisma.medicalRecord.findFirst({ where: { id: medicalRecordId, tenantId } })
}

export function findDrug(tenantId: number, drugId: number) {
  return prisma.inventoryItem.findFirst({ where: { id: drugId, tenantId, isActive: true } })
}

export function findBranchStock(tenantId: number, branchId: number, productId: number) {
  return prisma.branchInventory.findUnique({
    where: { tenantId_branchId_productId: { tenantId, branchId, productId } },
  })
}

export function findPrescription(tenantId: number, id: number) {
  return prisma.prescription.findFirst({ where: { id, tenantId } })
}

export function findPrescriptionWithDetails(tenantId: number, id: number) {
  return prisma.prescription.findFirst({
    where: { id, tenantId },
    include: {
      drug: { select: { name: true, unit: true } },
      medicalRecord: {
        include: { pet: { include: { owner: true } } },
      },
    },
  })
}

// Atomic conditional deduction (branch_inventory) + create + 'out' movement. null when insufficient.
export function deductStockAndCreate(tenantId: number, branchId: number, data: CreatePrescriptionInput) {
  return prisma.$transaction(async (tx) => {
    const affected = await tx.$executeRaw`
      UPDATE branch_inventory
      SET "stockQty" = "stockQty" - ${data.quantity}
      WHERE "tenantId" = ${tenantId} AND "branchId" = ${branchId}
        AND "productId" = ${data.drugId} AND "stockQty" >= ${data.quantity}
    `
    if (affected === 0) return null
    const prescription = await tx.prescription.create({ data: { ...data, tenantId, quantity: data.quantity } })
    await tx.stockMovement.create({
      data: {
        tenantId, branchId, itemId: data.drugId, movementType: 'out', qty: data.quantity,
        referenceType: 'prescription', referenceId: prescription.id,
      },
    })
    return prescription
  })
}

// Delete + restock branch_inventory + compensating 'in' movement.
export function deleteAndRestock(tenantId: number, branchId: number, id: number, drugId: number, quantity: number) {
  return prisma.$transaction(async (tx) => {
    await tx.prescription.deleteMany({ where: { id, tenantId } })
    await tx.branchInventory.updateMany({
      where: { tenantId, branchId, productId: drugId },
      data: { stockQty: { increment: quantity } },
    })
    await tx.stockMovement.create({
      data: {
        tenantId, branchId, itemId: drugId, movementType: 'in', qty: quantity,
        referenceType: 'prescription', referenceId: id,
      },
    })
  })
}
