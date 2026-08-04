// Medical-record repository — all Prisma access for medical_records + attachments.

import prisma from '../config/db'
import { Prisma } from '@prisma/client'
import { NotFoundError } from '../utils/errors'
import type {
  CreateMedicalRecordInput, UpdateMedicalRecordInput,
} from '../services/medical-record.service'

export function findByPet(tenantId: number, branchId: number | null | undefined, petId: number, skip: number, take: number) {
  return prisma.medicalRecord.findMany({
    where: {
      tenantId,
      petId,
      ...(branchId != null ? { branchId } : {}),
    },
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      doctor: { select: { id: true, name: true } },
      prescriptions: { include: { drug: { select: { id: true, name: true, unit: true } } } },
    },
  })
}

export function countByPet(tenantId: number, branchId: number | null | undefined, petId: number) {
  return prisma.medicalRecord.count({
    where: {
      tenantId,
      petId,
      ...(branchId != null ? { branchId } : {}),
    },
  })
}

export function findById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.medicalRecord.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
    },
    include: {
      pet:    { include: { owner: { select: { firstName: true, lastName: true, phone: true } } } },
      doctor: { select: { id: true, name: true } },
      prescriptions: { include: { drug: true } },
      attachments: {
        include: { uploadedByUser: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      invoices: { select: { paymentStatus: true } },
    },
  })
}

export function findPet(tenantId: number, petId: number) {
  return prisma.pet.findFirst({ where: { id: petId, tenantId } })
}

/**
 * Recompute `Pet.weightKg` from the pet's chronologically latest medical record
 * that has a non-null weight (tenant-scoped, `createdAt DESC, id DESC` tiebreak).
 * Single atomic conditional `UPDATE ... SET x = (subquery)` — no pessimistic lock,
 * matching `prescription.repository.ts`'s guarded-raw-UPDATE-in-`$transaction`
 * convention. See ADR-0008.
 */
async function recomputePetWeight(tx: Prisma.TransactionClient, tenantId: number, petId: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE pets
    SET "weightKg" = (
      SELECT "weightKg" FROM medical_records
      WHERE "tenantId" = ${tenantId} AND "petId" = ${petId} AND "weightKg" IS NOT NULL
      ORDER BY "createdAt" DESC, id DESC LIMIT 1
    )
    WHERE id = ${petId} AND "tenantId" = ${tenantId}
  `
}

// Cross-tenant FK guard (CR-01): client-supplied petId/doctorId/appointmentId must
// belong to this tenant, validated inside the same transaction as the write.
export function createRecord(tenantId: number, branchId: number | null | undefined, data: CreateMedicalRecordInput) {
  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.findFirst({ where: { id: data.petId, tenantId }, select: { id: true } })
    if (!pet) throw new NotFoundError('Pet')
    const doctor = await tx.user.findFirst({ where: { id: data.doctorId, tenantId }, select: { id: true } })
    if (!doctor) throw new NotFoundError('Doctor')
    if (data.appointmentId != null) {
      const appointment = await tx.appointment.findFirst({ where: { id: data.appointmentId, tenantId }, select: { id: true } })
      if (!appointment) throw new NotFoundError('Appointment')
    }

    const record = await tx.medicalRecord.create({
      data: {
        ...data,
        tenantId,
        ...(branchId != null ? { branchId } : {}),
      },
    })
    if (data.weightKg != null) await recomputePetWeight(tx, tenantId, data.petId)
    return record
  })
}

export function updateRecord(tenantId: number, id: number, data: UpdateMedicalRecordInput) {
  return prisma.$transaction(async (tx) => {
    // Cross-tenant FK guard (CR-01): a client-supplied appointmentId must belong to
    // this tenant, validated inside the same transaction as the write.
    if (data.appointmentId != null) {
      const appointment = await tx.appointment.findFirst({ where: { id: data.appointmentId, tenantId }, select: { id: true } })
      if (!appointment) throw new NotFoundError('Appointment')
    }
    const record = await tx.medicalRecord.update({ where: { id, tenantId }, data })
    if (data.weightKg != null) await recomputePetWeight(tx, tenantId, record.petId)
    return record
  })
}

export interface AttachmentCreateData {
  fileName:       string
  fileUrl?:       string | null
  storageKey?:    string | null
  mimeType?:      string | null
  fileSizeBytes?: number | null
  fileType?:      string | null
}

export function createAttachment(
  tenantId: number,
  medicalRecordId: number,
  data: AttachmentCreateData,
  uploadedByUserId: number | null,
) {
  return prisma.attachment.create({
    data: {
      tenantId,
      medicalRecordId,
      fileName:   data.fileName,
      fileUrl:    data.fileUrl ?? null,
      fileType:   data.fileType ?? null,
      storageKey: data.storageKey ?? null,
      mimeType:   data.mimeType ?? null,
      fileSize:   data.fileSizeBytes ?? null,
      uploadedByUserId,
    },
  })
}

export function findAttachmentById(tenantId: number, medicalRecordId: number, attachmentId: number) {
  return prisma.attachment.findFirst({ where: { id: attachmentId, tenantId, medicalRecordId } })
}

export function deleteAttachmentById(tenantId: number, medicalRecordId: number, attachmentId: number) {
  return prisma.attachment.delete({ where: { id: attachmentId, tenantId, medicalRecordId } })
}
