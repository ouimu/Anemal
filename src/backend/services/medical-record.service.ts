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
  weightKg:         z.number().positive().max(999.99).optional().nullable(),
  temperatureC:     z.number().min(0).max(999.9).optional().nullable(),
  heartRateBpm:     z.number().int().positive().max(3000).optional().nullable(),
  respRateRpm:      z.number().int().positive().max(3000).optional().nullable(),
  anatomyAnnotation:z.any().optional().nullable(),
})

export const updateMedicalRecordSchema = createMedicalRecordSchema.partial().omit({ petId: true, doctorId: true })

export const registerAttachmentUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl:  z.string().url(),
  fileType: z.enum(['lab', 'xray', 'photo', 'other']).optional(),
})

export type CreateMedicalRecordInput = z.infer<typeof createMedicalRecordSchema>
export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordSchema>
export type RegisterAttachmentUrlInput = z.infer<typeof registerAttachmentUrlSchema>

export class MedicalRecordError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'MEDICAL_RECORD_ERROR')
  }
}

export async function listMedicalRecords(tenantId: number, branchId: number | null | undefined, petId: number, page = 1, limit = 10) {
  const skip = (page - 1) * limit
  const [records, total] = await Promise.all([
    recordRepo.findByPet(tenantId, branchId, petId, skip, limit),
    recordRepo.countByPet(tenantId, branchId, petId),
  ])
  return { records, total, page, limit }
}

export async function getMedicalRecord(tenantId: number, branchId: number | null | undefined, id: number) {
  const record = await recordRepo.findById(tenantId, branchId, id)
  if (!record) throw new MedicalRecordError('Medical record not found', 404)
  return record
}

export async function createMedicalRecord(tenantId: number, branchId: number | null | undefined, data: CreateMedicalRecordInput) {
  // FK ownership (petId/doctorId/appointmentId) is validated inside the write
  // transaction in the repository (CR-01) — not as a preceding, TOCTOU-prone read here.
  return recordRepo.createRecord(tenantId, branchId, data)
}

export async function updateMedicalRecord(tenantId: number, branchId: number | null | undefined, id: number, data: UpdateMedicalRecordInput) {
  const record = await getMedicalRecord(tenantId, branchId, id)

  const hasPaidInvoice = record.invoices?.some((inv: { paymentStatus: string }) => inv.paymentStatus === 'paid')
  if (hasPaidInvoice) throw new MedicalRecordError('Cannot edit a billed medical record', 403)

  return recordRepo.updateRecord(tenantId, id, data)
}

/**
 * Register a URL-reference attachment (ADR-0021 backward-compat — a
 * non-upload way to attach an externally-hosted file, e.g. a referral
 * letter link). `uploadedByUserId` stays null: a URL reference doesn't
 * correspond to an in-app upload action (EMR-ATTACH-9).
 */
export async function registerAttachmentUrl(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  data: RegisterAttachmentUrlInput,
) {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  return recordRepo.createAttachment(
    tenantId, medicalRecordId,
    { fileName: data.fileName, fileUrl: data.fileUrl, fileType: data.fileType },
    null,
  )
}
