// Appointment repository — all Prisma access (incl. the raw-SQL overlap check).

import prisma from '../config/db'
import type { CreateAppointmentInput, AppointmentStatus } from '../services/appointment.service'

export function findInRange(tenantId: number, branchId: number | null | undefined, start: Date, end: Date, doctorId?: number) {
  return prisma.appointment.findMany({
    where: {
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      scheduledAt: { gte: start, lt: end },
      ...(doctorId ? { doctorId } : {}),
    },
    include: {
      pet:    { select: { id: true, name: true, species: true, photoUrl: true } },
      doctor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
}

/**
 * Users bookable as a doctor for the given branch scope.
 * branchId === null means "no branch filter" (all-branches session), matching
 * the same convention findInRange already uses.
 * Doctor membership: any assigned role is either the system 'doctor' role
 * directly, or a custom role whose sourceRoleId traces back to it.
 */
export async function findDoctorsForBranch(tenantId: number, branchId: number | null) {
  const doctorSystemRole = await prisma.clinicRole.findFirst({
    where:  { key: 'doctor', tenantId: null, isSystem: true },
    select: { id: true },
  })
  const doctorRoleMatch = doctorSystemRole
    ? [{ key: 'doctor' }, { sourceRoleId: doctorSystemRole.id }]
    : [{ key: 'doctor' }]

  return prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      ...(branchId != null ? { userBranches: { some: { tenantId, branchId } } } : {}),
      userRoles: {
        some: {
          tenantId,
          role: { OR: doctorRoleMatch },
        },
      },
    },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

export function findById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.appointment.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
    },
    include: {
      pet:    { include: { owner: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
}

// Overlap: existingStart < newEnd AND (existingStart + existingDuration) > newStart
// branchId filter applied when present: a doctor's schedule is branch-scoped.
export async function countDoctorConflicts(tenantId: number, branchId: number | null | undefined, doctorId: number, start: Date, end: Date): Promise<number> {
  // DB columns are camelCase (Prisma maps tables, not columns) — must be double-quoted in raw SQL.
  if (branchId != null) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM appointments
      WHERE "tenantId" = ${tenantId}
        AND "branchId" = ${branchId}
        AND "doctorId" = ${doctorId}
        AND status NOT IN ('cancelled', 'no_show')
        AND "scheduledAt" < ${end}
        AND "scheduledAt" + ("durationMin" * interval '1 minute') > ${start}
    `
    return Number(rows[0]?.count ?? 0)
  }
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM appointments
    WHERE "tenantId" = ${tenantId}
      AND "doctorId" = ${doctorId}
      AND status NOT IN ('cancelled', 'no_show')
      AND "scheduledAt" < ${end}
      AND "scheduledAt" + ("durationMin" * interval '1 minute') > ${start}
  `
  return Number(rows[0]?.count ?? 0)
}

export function createAppointment(tenantId: number, branchId: number | null, data: CreateAppointmentInput, scheduledAt: Date) {
  return prisma.appointment.create({ data: { ...data, tenantId, branchId, scheduledAt } })
}

export function createWalkIn(tenantId: number, branchId: number | null, petId: number, doctorId: number, reason?: string | null) {
  return prisma.appointment.create({
    data: {
      tenantId,
      branchId,
      petId,
      doctorId,
      scheduledAt: new Date(),
      durationMin: 30,
      status: 'arrived',
      reason: reason ?? null,
    },
  })
}

export function updateStatus(id: number, status: AppointmentStatus) {
  return prisma.appointment.update({ where: { id }, data: { status } })
}
