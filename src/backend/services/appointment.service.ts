import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as appointmentRepo from '../models/appointment.repository'
import { shiftWarning } from './branch.service'

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
export type AppointmentStatus = z.infer<typeof statusSchema>['status']

export class AppointmentError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'APPOINTMENT_ERROR')
  }
}

export async function listAppointments(tenantId: number, branchId: number | null | undefined, date?: string, doctorId?: number, week = false) {
  let startDate: Date
  let endDate: Date

  if (date) {
    startDate = new Date(date)
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + (week ? 7 : 1))
  } else {
    startDate = new Date()
    startDate.setHours(0, 0, 0, 0)
    endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 1)
  }

  return appointmentRepo.findInRange(tenantId, branchId, startDate, endDate, doctorId)
}

export async function getAppointment(tenantId: number, branchId: number | null | undefined, id: number) {
  const appt = await appointmentRepo.findById(tenantId, branchId, id)
  if (!appt) throw new AppointmentError('Appointment not found', 404)
  return appt
}

export async function createAppointment(tenantId: number, branchId: number | null, data: CreateAppointmentInput) {
  const start = new Date(data.scheduledAt)
  const end   = new Date(start.getTime() + data.durationMin * 60_000)

  const conflicts = await appointmentRepo.countDoctorConflicts(tenantId, branchId, data.doctorId, start, end)
  if (conflicts > 0) {
    throw new AppointmentError('Doctor already has an appointment in this time slot', 409)
  }

  // Soft doctor-shift check (Phase 4) — warns but does not block.
  const warning = branchId ? await shiftWarning(tenantId, branchId, data.doctorId, start) : null

  const appt = await appointmentRepo.createAppointment(tenantId, branchId, data, start)
  return { ...appt, shiftWarning: warning }
}

export async function createWalkIn(tenantId: number, branchId: number | null, petId: number, doctorId: number, reason?: string | null) {
  return appointmentRepo.createWalkIn(tenantId, branchId, petId, doctorId, reason)
}

export async function updateStatus(tenantId: number, branchId: number | null | undefined, id: number, status: AppointmentStatus) {
  await getAppointment(tenantId, branchId, id)
  return appointmentRepo.updateStatus(id, status)
}
