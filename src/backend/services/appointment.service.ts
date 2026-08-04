import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as appointmentRepo from '../models/appointment.repository'
import * as petRepo from '../models/pet.repository'
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

export async function listBookableDoctors(tenantId: number, branchId: number | null) {
  return appointmentRepo.findDoctorsForBranch(tenantId, branchId)
}

export async function getAppointment(tenantId: number, branchId: number | null | undefined, id: number) {
  const appt = await appointmentRepo.findById(tenantId, branchId, id)
  if (!appt) throw new AppointmentError('Appointment not found', 404)
  return appt
}

export async function createAppointment(tenantId: number, branchId: number | null, data: CreateAppointmentInput) {
  const pet = await petRepo.findPetById(tenantId, data.petId)
  if (!pet) throw new AppointmentError('Pet not found', 404)

  const doctor = await appointmentRepo.findDoctorById(tenantId, data.doctorId)
  if (!doctor) throw new AppointmentError('Doctor not found', 404)

  const start = new Date(data.scheduledAt)

  // Soft doctor-shift check (Phase 4) — warns but does not block.
  const warning = branchId ? await shiftWarning(tenantId, branchId, data.doctorId, start) : null

  // R3-HI-01: conflict-check + insert now happen atomically inside the repository
  // (advisory-lock-serialized transaction) — a lost race throws ConflictError (409),
  // which propagates through the global error handler like any other AppError.
  const appt = await appointmentRepo.createAppointment(tenantId, branchId, data, start)
  return { ...appt, shiftWarning: warning }
}

export async function createWalkIn(tenantId: number, branchId: number | null, petId: number, doctorId: number, reason?: string | null) {
  const pet = await petRepo.findPetById(tenantId, petId)
  if (!pet) throw new AppointmentError('Pet not found', 404)

  const doctor = await appointmentRepo.findDoctorById(tenantId, doctorId)
  if (!doctor) throw new AppointmentError('Doctor not found', 404)

  return appointmentRepo.createWalkIn(tenantId, branchId, petId, doctorId, reason)
}

export async function updateStatus(tenantId: number, branchId: number | null | undefined, id: number, status: AppointmentStatus) {
  const result = await appointmentRepo.updateStatus(tenantId, branchId, id, status)
  if (result.count !== 1) throw new AppointmentError('Appointment not found', 404)
  return getAppointment(tenantId, branchId, id)
}
