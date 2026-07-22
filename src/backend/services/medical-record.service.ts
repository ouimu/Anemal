import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as recordRepo from '../models/medical-record.repository'
import { EMR_ATTACHMENT_MIME_ALLOWLIST, EMR_ATTACHMENT_MAX_SIZE_BYTES, assertStorageKeyPrefix } from './emr-attachment.constants'

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

export const addAttachmentSchema = z.object({
  fileName:      z.string().min(1).max(255),
  fileUrl:       z.string().url().optional(),
  storageKey:    z.string().min(1).optional(),
  mimeType:      z.enum(EMR_ATTACHMENT_MIME_ALLOWLIST).optional(),
  fileSizeBytes: z.number().int().positive().max(EMR_ATTACHMENT_MAX_SIZE_BYTES).optional(),
  fileType:      z.enum(['lab', 'xray', 'photo', 'other']).optional(),
}).refine(
  (data) => Boolean(data.fileUrl) !== Boolean(data.storageKey),
  { message: 'Provide exactly one of fileUrl or storageKey', path: ['fileUrl'] },
).refine(
  (data) => !data.storageKey || (data.mimeType !== undefined && data.fileSizeBytes !== undefined),
  { message: 'mimeType and fileSizeBytes are required when storageKey is provided', path: ['mimeType'] },
)

export type CreateMedicalRecordInput = z.infer<typeof createMedicalRecordSchema>
export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordSchema>
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>

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
  const pet = await recordRepo.findPet(tenantId, data.petId)
  if (!pet) throw new MedicalRecordError('Pet not found', 404)
  return recordRepo.createRecord(tenantId, branchId, data)
}

export async function updateMedicalRecord(tenantId: number, branchId: number | null | undefined, id: number, data: UpdateMedicalRecordInput) {
  const record = await getMedicalRecord(tenantId, branchId, id)

  const hasPaidInvoice = record.invoices?.some((inv: { paymentStatus: string }) => inv.paymentStatus === 'paid')
  if (hasPaidInvoice) throw new MedicalRecordError('Cannot edit a billed medical record', 403)

  return recordRepo.updateRecord(tenantId, id, data)
}

/**
 * Confirm an EMR attachment after upload (or register a legacy fileUrl
 * reference). `uploadedByUserId` is only recorded for the new binary-upload
 * path — a legacy `fileUrl`-only confirm doesn't necessarily correspond to
 * an in-app upload action, so it stays `null` there (EMR-ATTACH-9).
 */
export async function addAttachment(
  tenantId: number,
  branchId: number | null | undefined,
  medicalRecordId: number,
  data: AddAttachmentInput,
  uploadedByUserId: number,
) {
  await getMedicalRecord(tenantId, branchId, medicalRecordId)
  if (data.storageKey) assertStorageKeyPrefix(tenantId, medicalRecordId, data.storageKey)
  return recordRepo.createAttachment(tenantId, medicalRecordId, data, data.storageKey ? uploadedByUserId : null)
}
