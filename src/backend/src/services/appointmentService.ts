import prisma from '../config/db'
import { z } from 'zod'

export const createAppointmentSchema = z.object({
  petId:       z.number().int().positive(),
  doctorId:    z.number().int().positive(),
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().positive().default(30),
  reason:      z.string().optional().nullable(),
  room:        z.string().max(50).optional().nullable(),
  notes:       z.string().optional().nullable(),
})

export const walkInSchema = z.object({
  petId:    z.number().int().positive(),
  doctorId: z.number().int().positive(),
  reason:   z.string().optional().nullable(),
})

export const statusSchema = z.object({
  status: z.enum(['scheduled', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show']),
})

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

export class AppointmentError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
    this.name = 'AppointmentError'
  }
}

export async function listAppointments(tenantId: number, date?: string, doctorId?: number, week = false) {
  let startDate: Date
  let endDate: Date

  if (date) {
    startDate = new Date(date)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    if (week) {
      endDate.setDate(endDate.getDate() + 7)
    } else {
      endDate.setDate(endDate.getDate() + 1)
    }
  } else {
    startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 1)
  }

  return prisma.appointment.findMany({
    where: {
      tenantId,
      scheduledAt: { gte: startDate, lt: endDate },
      ...(doctorId ? { doctorId } : {}),
    },
    include: {
      pet:    { select: { id: true, name: true, species: true, photoUrl: true } },
      doctor: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })
}

export async function getAppointment(tenantId: number, id: number) {
  const appt = await prisma.appointment.findFirst({
    where: { id, tenantId },
    include: {
      pet:    { include: { owner: true } },
      doctor: { select: { id: true, name: true } },
    },
  })
  if (!appt) throw new AppointmentError('Appointment not found', 404)
  return appt
}

export async function createAppointment(tenantId: number, data: CreateAppointmentInput) {
  const start = new Date(data.scheduledAt)
  const end   = new Date(start.getTime() + data.durationMin * 60_000)

  // Overlap: existingStart < newEnd AND (existingStart + existingDuration) > newStart
  const conflictCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM appointments
    WHERE tenant_id = ${tenantId}
      AND doctor_id = ${data.doctorId}
      AND status NOT IN ('cancelled', 'no_show')
      AND scheduled_at < ${end}
      AND scheduled_at + (duration_min * interval '1 minute') > ${start}
  `

  if (Number(conflictCount[0]?.count ?? 0) > 0) {
    throw new AppointmentError('Doctor already has an appointment in this time slot', 409)
  }

  return prisma.appointment.create({
    data: { ...data, tenantId, scheduledAt: start },
  })
}

export async function createWalkIn(tenantId: number, petId: number, doctorId: number, reason?: string | null) {
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

export async function updateStatus(tenantId: number, id: number, status: string) {
  await getAppointment(tenantId, id)
  return prisma.appointment.update({
    where: { id },
    data: { status: status as any },
  })
}
