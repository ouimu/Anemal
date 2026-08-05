// Branch + doctor-shift repository (Phase 4). Tenant-scoped.
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import type { CreateBranchInput, UpdateBranchInput, ShiftInput } from '../services/branch.service'

// operatingHours is a Prisma Json field; cast the loosely-typed Zod value.
const asJson = (v: unknown) => v as Prisma.InputJsonValue | undefined

export function findBranches(tenantId: number) {
  return prisma.branch.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
}

export function findBranchById(tenantId: number, id: number) {
  return prisma.branch.findFirst({ where: { id, tenantId } })
}

// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient`
// so R3-HI-04's quota-lock transaction can create the branch inside the same lock scope.
export function createBranch(tenantId: number, data: CreateBranchInput, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.branch.create({ data: { tenantId, ...data, operatingHours: asJson(data.operatingHours) } })
}

export function updateBranch(tenantId: number, id: number, data: UpdateBranchInput) {
  return prisma.branch
    .updateMany({ where: { id, tenantId }, data: { ...data, operatingHours: asJson(data.operatingHours) } })
    .then(() => findBranchById(tenantId, id))
}

// ── Doctor shifts ────────────────────────────────────────────────────────────
export function findShifts(tenantId: number, branchId: number) {
  return prisma.doctorShift.findMany({
    where: { tenantId, branchId },
    orderBy: [{ doctorId: 'asc' }, { dayOfWeek: 'asc' }],
  })
}

export function upsertShift(tenantId: number, branchId: number, data: ShiftInput) {
  return prisma.doctorShift.upsert({
    where: {
      tenantId_branchId_doctorId_dayOfWeek: {
        tenantId, branchId, doctorId: data.doctorId, dayOfWeek: data.dayOfWeek,
      },
    },
    update: { startTime: data.startTime, endTime: data.endTime },
    create: { tenantId, branchId, doctorId: data.doctorId, dayOfWeek: data.dayOfWeek, startTime: data.startTime, endTime: data.endTime },
  })
}

export function deleteShift(tenantId: number, branchId: number, id: number) {
  return prisma.doctorShift.deleteMany({ where: { id, tenantId, branchId } })
}

// Shift covering a doctor at a given weekday + "HH:MM" time (for appointment warnings).
export function findCoveringShift(tenantId: number, branchId: number, doctorId: number, dayOfWeek: number) {
  return prisma.doctorShift.findFirst({ where: { tenantId, branchId, doctorId, dayOfWeek } })
}
