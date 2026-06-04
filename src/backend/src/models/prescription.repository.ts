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
export function deductStockAndCreate(tenantId: number, data: CreatePrescriptionInput) {
  return prisma.$transaction(async (tx) => {
    const affected = await tx.$executeRaw`
      UPDATE inventory_items
      SET stock_quantity = stock_quantity - ${data.quantity}
      WHERE id = ${data.drugId} AND tenant_id = ${tenantId} AND stock_quantity >= ${data.quantity}
    `
    if (affected === 0) return null
    return tx.prescription.create({ data: { ...data, tenantId, quantity: data.quantity } })
  })
}

export function deleteAndRestock(id: number, drugId: number, quantity: number) {
  return prisma.$transaction([
    prisma.prescription.delete({ where: { id } }),
    prisma.inventoryItem.update({
      where: { id: drugId },
      data:  { stockQuantity: { increment: quantity } },
    }),
  ])
}
