// Hospitalization (inpatient) repository (Phase 4, FR-08). Tenant + branch scoped.
import prisma from '../config/db'
import type { AdmitInput, EditInput, CareInput } from '../services/hospitalization.service'

const petSelect = { select: { id: true, name: true, species: true, photoUrl: true, owner: { select: { firstName: true, lastName: true } } } }

export function admit(tenantId: number, branchId: number | null, data: AdmitInput) {
  return prisma.hospitalization.create({
    data: {
      tenantId, branchId,
      petId: data.petId, reason: data.reason, cageNo: data.cageNo ?? null,
      doctorInCharge: data.doctorInCharge ?? null, dailyRate: data.dailyRate ?? 0, notes: data.notes ?? null,
    },
  })
}

export function findActive(tenantId: number, branchId?: number) {
  return prisma.hospitalization.findMany({
    where: { tenantId, status: 'admitted', ...(branchId ? { branchId } : {}) },
    include: { pet: petSelect, _count: { select: { careLogs: true } } },
    orderBy: { admittedAt: 'asc' },
  })
}

export function findById(tenantId: number, id: number) {
  return prisma.hospitalization.findFirst({
    where: { id, tenantId },
    include: {
      pet: petSelect,
      careLogs: {
        orderBy: { recordedAt: 'desc' },
        include: { performedByUser: { select: { id: true, name: true } } },
      },
    },
  })
}

export function findByIdWithCareCount(tenantId: number, id: number) {
  return prisma.hospitalization.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { careLogs: true } } },
  })
}

export function update(tenantId: number, id: number, data: EditInput) {
  return prisma.hospitalization
    .updateMany({
      where: { id, tenantId },
      data: {
        reason: data.reason, cageNo: data.cageNo ?? null, doctorInCharge: data.doctorInCharge ?? null,
        dailyRate: data.dailyRate ?? 0, notes: data.notes ?? null,
      },
    })
    .then(() => findById(tenantId, id))
}

export function remove(tenantId: number, id: number) {
  return prisma.hospitalization.deleteMany({ where: { id, tenantId } })
}

export function addCare(tenantId: number, hospitalizationId: number, data: CareInput, performedBy?: number) {
  return prisma.dailyInpatientCare.create({
    data: {
      tenantId, hospitalizationId,
      timeSlot: data.timeSlot, temperatureC: data.temperatureC ?? null, heartRateBpm: data.heartRateBpm ?? null,
      respRateRpm: data.respRateRpm ?? null, feedingStatus: data.feedingStatus ?? null,
      medicationGiven: data.medicationGiven ?? null, notes: data.notes ?? null, performedBy: performedBy ?? null,
    },
  })
}

export function markDischarged(tenantId: number, id: number) {
  return prisma.hospitalization
    .updateMany({ where: { id, tenantId }, data: { status: 'discharged', dischargedAt: new Date() } })
    .then(() => findById(tenantId, id))
}
