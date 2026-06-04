// Medical-record repository — all Prisma access for medical_records + attachments.

import prisma from '../config/db'
import type {
  CreateMedicalRecordInput, UpdateMedicalRecordInput, AddAttachmentInput,
} from '../services/medical-record.service'

export function findByPet(tenantId: number, petId: number, skip: number, take: number) {
  return prisma.medicalRecord.findMany({
    where: { tenantId, petId },
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      doctor: { select: { id: true, name: true } },
      prescriptions: { include: { drug: { select: { id: true, name: true, unit: true } } } },
    },
  })
}

export function countByPet(tenantId: number, petId: number) {
  return prisma.medicalRecord.count({ where: { tenantId, petId } })
}

export function findById(tenantId: number, id: number) {
  return prisma.medicalRecord.findFirst({
    where: { id, tenantId },
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

export function createRecord(tenantId: number, data: CreateMedicalRecordInput) {
  return prisma.medicalRecord.create({ data: { ...data, tenantId } })
}

export function updateRecord(tenantId: number, id: number, data: UpdateMedicalRecordInput) {
  return prisma.medicalRecord.update({ where: { id, tenantId }, data })
}

export function createAttachment(tenantId: number, medicalRecordId: number, data: AddAttachmentInput) {
  return prisma.attachment.create({ data: { ...data, tenantId, medicalRecordId } })
}
