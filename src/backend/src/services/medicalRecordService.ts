import prisma from '../config/db'
import { AppError } from '../utils/errors'
import { z } from 'zod'

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

export class MedicalRecordError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'MEDICAL_RECORD_ERROR')
  }
}

export async function listMedicalRecords(tenantId: number, petId: number, page = 1, limit = 10) {
  const skip = (page - 1) * limit
  const where = { tenantId, petId }

  const [records, total] = await Promise.all([
    prisma.medicalRecord.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        doctor: { select: { id: true, name: true } },
        prescriptions: { include: { drug: { select: { id: true, name: true, unit: true } } } },
      },
    }),
    prisma.medicalRecord.count({ where }),
  ])

  return { records, total, page, limit }
}

export async function getMedicalRecord(tenantId: number, id: number) {
  const record = await prisma.medicalRecord.findFirst({
    where: { id, tenantId },
    include: {
      pet:    { include: { owner: { select: { firstName: true, lastName: true, phone: true } } } },
      doctor: { select: { id: true, name: true } },
      prescriptions: { include: { drug: true } },
      attachments: true,
      invoices: { select: { paymentStatus: true } },
    },
  })
  if (!record) throw new MedicalRecordError('Medical record not found', 404)
  return record
}

export async function createMedicalRecord(tenantId: number, data: CreateMedicalRecordInput) {
  const pet = await prisma.pet.findFirst({ where: { id: data.petId, tenantId } })
  if (!pet) throw new MedicalRecordError('Pet not found', 404)

  return prisma.medicalRecord.create({ data: { ...data, tenantId } })
}

export async function updateMedicalRecord(tenantId: number, id: number, data: UpdateMedicalRecordInput) {
  const record = await getMedicalRecord(tenantId, id)

  const hasPaidInvoice = record.invoices?.some((inv: any) => inv.paymentStatus === 'paid')
  if (hasPaidInvoice) throw new MedicalRecordError('Cannot edit a billed medical record', 403)

  return prisma.medicalRecord.update({ where: { id, tenantId }, data })
}

export async function addAttachment(tenantId: number, medicalRecordId: number, data: z.infer<typeof addAttachmentSchema>) {
  await getMedicalRecord(tenantId, medicalRecordId)
  return prisma.attachment.create({ data: { ...data, tenantId, medicalRecordId } })
}
