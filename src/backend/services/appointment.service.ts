import { z } from 'zod'
import { AppError } from '../utils/errors'
import prisma from '../config/db'
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

// arch §8.2 atomicity fix: the pet-existence FK check moves inside a transaction shared
// with the write, closing the TOCTOU gap between the check and the create. `findPetById`
// is called with `includeEmr: false` — this booking check needs only tenant/existence,
// not the EMR-shaped default include (arch §4.1 rev 3). `appointmentRepo.createAppointment`
// now accepts an optional `client` (added to close this gap fully, since leaving the create in
// its own nested transaction meant the check and write were never really one atomic unit) —
// passing `tx` here makes it run its advisory lock, conflict check, and insert directly against
// this same transaction instead of opening a second one.
export async function createAppointment(tenantId: number, branchId: number | null, data: CreateAppointmentInput) {
  const start = new Date(data.scheduledAt)

  return prisma.$transaction(async (tx) => {
    const pet = await petRepo.findPetById(tenantId, data.petId, false, tx)
    if (!pet) throw new AppointmentError('Pet not found', 404)

    const doctor = await appointmentRepo.findDoctorById(tenantId, data.doctorId)
    if (!doctor) throw new AppointmentError('Doctor not found', 404)

    // Soft doctor-shift check (Phase 4) — warns but does not block.
    const warning = branchId ? await shiftWarning(tenantId, branchId, data.doctorId, start) : null

    // R3-HI-01: conflict-check + insert happen atomically inside the repository
    // (advisory-lock-serialized transaction, now the SAME transaction as the pet check above) —
    // a lost race throws ConflictError (409), which propagates through the global error handler
    // like any other AppError.
    const appt = await appointmentRepo.createAppointment(tenantId, branchId, data, start, tx)
    return { ...appt, shiftWarning: warning }
  })
}

// arch §8.2 atomicity fix: same pattern as createAppointment — the pet-existence check and the
// insert now run inside the same shared transaction (`appointmentRepo.createWalkIn` also gained
// an optional `client` param for this).
export async function createWalkIn(tenantId: number, branchId: number | null, petId: number, doctorId: number, reason?: string | null) {
  return prisma.$transaction(async (tx) => {
    const pet = await petRepo.findPetById(tenantId, petId, false, tx)
    if (!pet) throw new AppointmentError('Pet not found', 404)

    const doctor = await appointmentRepo.findDoctorById(tenantId, doctorId)
    if (!doctor) throw new AppointmentError('Doctor not found', 404)

    return appointmentRepo.createWalkIn(tenantId, branchId, petId, doctorId, reason, tx)
  })
}

export async function updateStatus(tenantId: number, branchId: number | null | undefined, id: number, status: AppointmentStatus) {
  const result = await appointmentRepo.updateStatus(tenantId, branchId, id, status)
  if (result.count !== 1) throw new AppointmentError('Appointment not found', 404)
  return getAppointment(tenantId, branchId, id)
}
