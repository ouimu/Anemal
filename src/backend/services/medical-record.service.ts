import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as recordRepo from '../models/medical-record.repository'

export const createMedicalRecordSchema = z.object({
  petId:            z.number().int().positive(),
  appointmentId:    z.number().int().positive().optional().nullable(),
  doctorId:         z.number().int().positive(),
  subjective:       z.string().optional().nullable(),
  objective:        z.string().optional().nullable(),
  assessment:       z.string().optional().nullable(),
  plan:             z.string().optional().nullable(),
  weightKg:         z.number().positive().optional().nullable(),
  temperatureC:     z.number().optional().nullable(),
  heartRateBpm:     z.number().int().positive().optional().nullable(),
  respRateRpm:      z.number().int().positive().optional().nullable(),
  anatomyAnnotation:z.any().optional().nullable(),
})

export const updateMedicalRecordSchema = createMedicalRecordSchema.partial().omit({ petId: true, doctorId: true })

export const addAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl:  z.string().url(),
  fileType: z.enum(['lab', 'xray', 'photo', 'other']).optional(),
})

export type CreateMedicalRecordInput = z.infer<typeof createMedicalRecordSchema>
export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordSchema>
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>

export class MedicalRecordError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'MEDICAL_RECORD_ERROR')
  }
}

export async function listMedicalRecords(tenantId: number, petId: number, page = 1, limit = 10) {
  const skip = (page - 1) * limit
  const [records, total] = await Promise.all([
    recordRepo.findByPet(tenantId, petId, skip, limit),
    recordRepo.countByPet(tenantId, petId),
  ])
  return { records, total, page, limit }
}

export async function getMedicalRecord(tenantId: number, id: number) {
  const record = await recordRepo.findById(tenantId, id)
  if (!record) throw new MedicalRecordError('Medical record not found', 404)
  return record
}

export async function createMedicalRecord(tenantId: number, data: CreateMedicalRecordInput) {
  const pet = await recordRepo.findPet(tenantId, data.petId)
  if (!pet) throw new MedicalRecordError('Pet not found', 404)
  return recordRepo.createRecord(tenantId, data)
}

export async function updateMedicalRecord(tenantId: number, id: number, data: UpdateMedicalRecordInput) {
  const record = await getMedicalRecord(tenantId, id)

  const hasPaidInvoice = record.invoices?.some((inv: { paymentStatus: string }) => inv.paymentStatus === 'paid')
  if (hasPaidInvoice) throw new MedicalRecordError('Cannot edit a billed medical record', 403)

  return recordRepo.updateRecord(tenantId, id, data)
}

export async function addAttachment(tenantId: number, medicalRecordId: number, data: AddAttachmentInput) {
  await getMedicalRecord(tenantId, medicalRecordId)
  return recordRepo.createAttachment(tenantId, medicalRecordId, data)
}
