// Prescription repository — Prisma access incl. atomic stock deduction.

import prisma from '../config/db'
import type { CreatePrescriptionInput } from '../services/prescription.service'

export function findMedicalRecord(tenantId: number, medicalRecordId: number) {
  return prisma.medicalRecord.findFirst({ where: { id: medicalRecordId, tenantId } })
}

export function findDrug(tenantId: number, drugId: number) {
  return prisma.inventoryItem.findFirst({ where: { id: drugId, tenantId, isActive: true } })
}

export function findPrescription(tenantId: number, id: number) {
  return prisma.prescription.findFirst({ where: { id, tenantId } })
}

// Atomic conditional deduction + create. Returns null when stock is insufficient
// (the conditional UPDATE affected 0 rows) so the service can raise a domain error.
// A matching 'out' stock movement is written in the same transaction (Phase 3 ledger).
export function deductStockAndCreate(tenantId: number, data: CreatePrescriptionInput) {
  return prisma.$transaction(async (tx) => {
    const affected = await tx.$executeRaw`
      UPDATE inventory_items
      SET "stockQuantity" = "stockQuantity" - ${data.quantity}
      WHERE id = ${data.drugId} AND "tenantId" = ${tenantId} AND "stockQuantity" >= ${data.quantity}
    `
    if (affected === 0) return null
    const prescription = await tx.prescription.create({ data: { ...data, tenantId, quantity: data.quantity } })
    await tx.stockMovement.create({
      data: {
        tenantId,
        itemId:        data.drugId,
        movementType:  'out',
        qty:           data.quantity,
        referenceType: 'prescription',
        referenceId:   prescription.id,
      },
    })
    return prescription
  })
}

// Delete + restock + compensating 'in' movement, all in one transaction.
export function deleteAndRestock(tenantId: number, id: number, drugId: number, quantity: number) {
  return prisma.$transaction(async (tx) => {
    await tx.prescription.delete({ where: { id } })
    await tx.inventoryItem.update({
      where: { id: drugId },
      data:  { stockQuantity: { increment: quantity } },
    })
    await tx.stockMovement.create({
      data: {
        tenantId,
        itemId:        drugId,
        movementType:  'in',
        qty:           quantity,
        referenceType: 'prescription',
        referenceId:   id,
      },
    })
  })
}
