// Appointment repository — all Prisma access (incl. the raw-SQL overlap check).

import prisma from '../config/db'
import type { CreateAppointmentInput, AppointmentStatus } from '../services/appointment.service'

export function findInRange(tenantId: number, start: Date, end: Date, doctorId?: number) {
  return prisma.appointment.findMany({
    where: {
      tenantId,
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

export function findById(tenantId: number, id: number) {
  return prisma.appointment.findFirst({
    where: { id, tenantId },
    include: {
      pet:    { include: { owner: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
}

// Overlap: existingStart < newEnd AND (existingStart + existingDuration) > newStart
export async function countDoctorConflicts(tenantId: number, doctorId: number, start: Date, end: Date): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM appointments
    WHERE tenant_id = ${tenantId}
      AND doctor_id = ${doctorId}
      AND status NOT IN ('cancelled', 'no_show')
      AND scheduled_at < ${end}
      AND scheduled_at + (duration_min * interval '1 minute') > ${start}
  `
  return Number(rows[0]?.count ?? 0)
}

export function createAppointment(tenantId: number, data: CreateAppointmentInput, scheduledAt: Date) {
  return prisma.appointment.create({ data: { ...data, tenantId, scheduledAt } })
}

export function createWalkIn(tenantId: number, petId: number, doctorId: number, reason?: string | null) {
  return prisma.appointment.create({
    data: {
      tenantId,
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
