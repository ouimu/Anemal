import prisma from '../config/db'
import { z } from 'zod'

export const createPrescriptionSchema = z.object({
  medicalRecordId:   z.number().int().positive(),
  drugId:            z.number().int().positive(),
  quantity:          z.number().positive(),
  unit:              z.string().max(50).optional().nullable(),
  dosageInstruction: z.string().optional().nullable(),
})

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>

export class PrescriptionError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
    this.name = 'PrescriptionError'
  }
}

export async function createPrescription(tenantId: number, data: CreatePrescriptionInput) {
  const record = await prisma.medicalRecord.findFirst({ where: { id: data.medicalRecordId, tenantId } })
  if (!record) throw new PrescriptionError('Medical record not found', 404)

  const drug = await prisma.inventoryItem.findFirst({ where: { id: data.drugId, tenantId, isActive: true } })
  if (!drug) throw new PrescriptionError('Drug/item not found', 404)

  // Atomically deduct stock inside transaction — conditional update returns null rows on insufficient stock
  const [updated] = await prisma.$transaction(async (tx) => {
    const result = await tx.$executeRaw`
      UPDATE inventory_items
      SET stock_quantity = stock_quantity - ${data.quantity}
      WHERE id = ${data.drugId} AND tenant_id = ${tenantId} AND stock_quantity >= ${data.quantity}
    `
    if (result === 0) throw new PrescriptionError(`Insufficient stock. Available: ${Number(drug.stockQuantity)} ${drug.unit ?? ''}`.trim(), 409)

    const prescription = await tx.prescription.create({ data: { ...data, tenantId, quantity: data.quantity } })
    return [prescription]
  })

  return updated
}

export async function deletePrescription(tenantId: number, id: number) {
  const prescription = await prisma.prescription.findFirst({ where: { id, tenantId } })
  if (!prescription) throw new PrescriptionError('Prescription not found', 404)

  await prisma.$transaction([
    prisma.prescription.delete({ where: { id } }),
    prisma.inventoryItem.update({
      where: { id: prescription.drugId },
      data:  { stockQuantity: { increment: Number(prescription.quantity) } },
    }),
  ])
}
