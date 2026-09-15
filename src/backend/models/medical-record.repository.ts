// Medical-record repository — all Prisma access for medical_records + attachments.

import prisma from '../config/db'
import { Prisma } from '@prisma/client'
import { NotFoundError } from '../utils/errors'
import { ownerSummarySelect } from './owner.repository'
import type {
  CreateMedicalRecordInput, UpdateMedicalRecordInput,
} from '../services/medical-record.service'

// XTI-9 (arch §5, R-4 narrowed): findByPet/countByPet each independently carry the
// `doctor` relation predicate in their own root `where` — no shared builder (that
// restructuring was rejected at the Step 5 gate; see arch §5 point 1).
export function findByPet(tenantId: number, branchId: number | null | undefined, petId: number, skip: number, take: number) {
  return prisma.medicalRecord.findMany({
    where: {
      tenantId,
      petId,
      doctor: { is: { tenantId } },
      ...(branchId != null ? { branchId } : {}),
    },
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      doctor: { select: { id: true, name: true } },
      // XTI-13 finding — same drug-hop gap as findById below, fixed the same way.
      prescriptions: { where: { tenantId, drug: { is: { tenantId } } }, include: { drug: { select: { id: true, name: true, unit: true } } } },
    },
  })
}

export function countByPet(tenantId: number, branchId: number | null | undefined, petId: number) {
  return prisma.medicalRecord.count({
    where: {
      tenantId,
      petId,
      doctor: { is: { tenantId } },
      ...(branchId != null ? { branchId } : {}),
    },
  })
}

export function findById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.medicalRecord.findFirst({
    where: {
      id,
      tenantId,
      pet: { is: { tenantId, owner: { is: { tenantId } } } },
      doctor: { is: { tenantId } },
      ...(branchId != null ? { branchId } : {}),
    },
    include: {
      pet:    { include: { owner: { select: ownerSummarySelect } } },
      doctor: { select: { id: true, name: true } },
      // XTI-13 finding (nonPiiT4 regression): the analyzer's static check does not
      // descend into a to-one relation nested inside an already-guarded to-many include,
      // so this needed a human-caught fix — `drug` (a to-one relation, InventoryItem) was
      // bare `true` with no tenant guard, leaking another tenant's whole InventoryItem row
      // through a corrupt prescription.drugId FK. Prisma cannot filter a to-one `include`
      // by a field on the related row (same reason as ADR-0027's root case), so the
      // predicate mirrors into `prescriptions`'s own `where` — dialect 1, one level deeper.
      prescriptions: { where: { tenantId, drug: { is: { tenantId } } }, include: { drug: true } },
      // XTI-14 (@db-agent veto) finding: uploadedByUser (InventoryItem sibling case —
      // required-vs-nullable matters here) was unguarded, leaking another tenant's staff
      // id+name. uploadedByUserId is nullable (onDelete: SetNull, a deleted uploader leaves
      // the attachment intact per ADR-0021) — a bare `is: { tenantId }` mirror would silently
      // drop every attachment whose uploader was later deleted, which is NOT the same as a
      // failed tenant check (E-4's null-relation rule). The OR fallback keeps both: a null
      // uploader passes, a present one must match this tenant.
      attachments: {
        where: {
          tenantId,
          OR: [{ uploadedByUser: { is: null } }, { uploadedByUser: { is: { tenantId } } }],
        },
        include: { uploadedByUser: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      invoices: { where: { tenantId }, select: { paymentStatus: true } },
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
