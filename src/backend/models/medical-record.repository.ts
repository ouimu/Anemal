// Medical-record repository — all Prisma access for medical_records + attachments.

import prisma from '../config/db'
import { Prisma } from '@prisma/client'
import type {
  CreateMedicalRecordInput, UpdateMedicalRecordInput, AddAttachmentInput,
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
      attachments: true,
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

export function createRecord(tenantId: number, branchId: number | null | undefined, data: CreateMedicalRecordInput) {
  return prisma.$transaction(async (tx) => {
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
    const record = await tx.medicalRecord.update({ where: { id, tenantId }, data })
    if (data.weightKg != null) await recomputePetWeight(tx, tenantId, record.petId)
    return record
  })
}

export function createAttachment(tenantId: number, medicalRecordId: number, data: AddAttachmentInput) {
  return prisma.attachment.create({ data: { ...data, tenantId, medicalRecordId } })
}
