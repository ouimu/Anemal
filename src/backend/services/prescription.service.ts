import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as prescriptionRepo from '../models/prescription.repository'

export const createPrescriptionSchema = z.object({
  medicalRecordId:   z.number().int().positive(),
  drugId:            z.number().int().positive(),
  quantity:          z.number().positive(),
  unit:              z.string().max(50).optional().nullable(),
  dosageInstruction: z.string().optional().nullable(),
})

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>

export class PrescriptionError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'PRESCRIPTION_ERROR')
  }
}

export async function createPrescription(tenantId: number, branchId: number, data: CreatePrescriptionInput) {
  const record = await prescriptionRepo.findMedicalRecord(tenantId, data.medicalRecordId)
  if (!record) throw new PrescriptionError('Medical record not found', 404)

  const drug = await prescriptionRepo.findDrug(tenantId, data.drugId)
  if (!drug) throw new PrescriptionError('Drug/item not found', 404)

  const prescription = await prescriptionRepo.deductStockAndCreate(tenantId, branchId, data)
  if (!prescription) {
    const stock = await prescriptionRepo.findBranchStock(tenantId, branchId, data.drugId)
    const available = stock ? Number(stock.stockQty) : 0
    throw new PrescriptionError(`Insufficient stock at this branch. Available: ${available} ${drug.unit ?? ''}`.trim(), 409)
  }
  return prescription
}

export async function deletePrescription(tenantId: number, branchId: number, id: number) {
  const prescription = await prescriptionRepo.findPrescription(tenantId, branchId, id)
  if (!prescription) throw new PrescriptionError('Prescription not found', 404)
  await prescriptionRepo.deleteAndRestock(tenantId, branchId, id, prescription.drugId, Number(prescription.quantity))
}
