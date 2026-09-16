// Prescription repository — Prisma access incl. atomic per-branch stock deduction (Phase 4).
import prisma from '../config/db'
import { NotFoundError } from '../utils/errors'
import { deductBranchStock } from './product.repository'
import type { CreatePrescriptionInput } from '../services/prescription.service'
import { ownerSummarySelect } from './owner.repository'

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

// HI-01: Prescription has no branchId column of its own — branch scope is enforced
// through its parent medicalRecord. Passing branchId here (instead of tenant-only)
// closes the fail-open gap where a branch-scoped user could read/delete another
// branch's prescription as long as the tenant matched.
export function findPrescription(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.prescription.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { medicalRecord: { branchId } } : {}),
    },
  })
}

export function findPrescriptionWithDetails(tenantId: number, id: number) {
  return prisma.prescription.findFirst({
    where: {
      id,
      tenantId,
      drug:          { is: { tenantId } },
      medicalRecord: { is: { tenantId, pet: { is: { tenantId, owner: { is: { tenantId } } } } } },
    },
    include: {
      drug: { select: { name: true, unit: true } },
      medicalRecord: {
        include: { pet: { include: { owner: { select: ownerSummarySelect } } } },
      },
    },
  })
}

// Atomic conditional deduction (branch_inventory) + create + 'out' movement. null when insufficient.
export function deductStockAndCreate(tenantId: number, branchId: number, data: CreatePrescriptionInput) {
  return prisma.$transaction(async (tx) => {
    const ok = await deductBranchStock(tx, tenantId, branchId, data.drugId, data.quantity)
    if (!ok) return null
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
    // Branch-scope the authoritative delete itself (HI-01), not only the preceding
    // findPrescription check — closes the check/use gap for the write.
    const deleted = await tx.prescription.deleteMany({
      where: { id, tenantId, medicalRecord: { branchId } },
    })
    if (deleted.count === 0) throw new NotFoundError('Prescription')
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
