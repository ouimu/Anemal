// Grooming service (Phase 4, FR-09) — booking + per-groomer daily capacity guard.
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as groomingRepo from '../models/grooming.repository'

const GROOMER_DAILY_CAPACITY = 8

export const bookingSchema = z.object({
  petId:               z.number().int().positive(),
  groomerId:           z.number().int().positive().optional().nullable(),
  serviceType:         z.string().trim().min(1).max(255),
  scheduledAt:         z.string().datetime(),
  durationMin:         z.number().int().positive().max(480).optional(),
  specialInstructions: z.string().optional().nullable(),
}).strict()

export const statusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
}).strict()

export type BookingInput = z.infer<typeof bookingSchema>

export class GroomingError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'GROOMING_ERROR')
  }
}

export async function createBooking(tenantId: number, branchId: number | null, data: BookingInput, createdBy?: number) {
  if (data.groomerId) {
    const count = await groomingRepo.countGroomerBookingsOnDay(tenantId, data.groomerId, new Date(data.scheduledAt))
    if (count >= GROOMER_DAILY_CAPACITY) {
      throw new GroomingError(`Groomer is fully booked that day (max ${GROOMER_DAILY_CAPACITY})`, 409)
    }
  }
  return groomingRepo.createBooking(tenantId, branchId, data, createdBy)
}

export function listBookings(tenantId: number, branchId?: number, date?: string) {
  return groomingRepo.listBookings(tenantId, branchId, date)
}

export async function updateStatus(tenantId: number, id: number, status: string) {
  const existing = await groomingRepo.findById(tenantId, id)
  if (!existing) throw new GroomingError('Booking not found', 404)
  return groomingRepo.updateStatus(tenantId, id, status)
}
