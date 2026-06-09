// Branch + doctor-shift service (Phase 4).
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as branchRepo from '../models/branch.repository'

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM')

export const createBranchSchema = z.object({
  name:           z.string().trim().min(1).max(255),
  phone:          z.string().max(50).optional().nullable(),
  email:          z.string().email().max(255).optional().nullable(),
  address:        z.string().optional().nullable(),
  operatingHours: z.record(z.unknown()).optional(),
  isActive:       z.boolean().optional(),
}).strict()

export const updateBranchSchema = createBranchSchema.partial()

export const shiftSchema = z.object({
  doctorId:  z.number().int().positive(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: HHMM,
  endTime:   HHMM,
}).strict()

export type CreateBranchInput = z.infer<typeof createBranchSchema>
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>
export type ShiftInput = z.infer<typeof shiftSchema>

export class BranchError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'BRANCH_ERROR')
  }
}

export function listBranches(tenantId: number) {
  return branchRepo.findBranches(tenantId)
}

export async function getBranch(tenantId: number, id: number) {
  const branch = await branchRepo.findBranchById(tenantId, id)
  if (!branch) throw new BranchError('Branch not found', 404)
  return branch
}

export function createBranch(tenantId: number, data: CreateBranchInput) {
  return branchRepo.createBranch(tenantId, data)
}

export async function updateBranch(tenantId: number, id: number, data: UpdateBranchInput) {
  await getBranch(tenantId, id)
  return branchRepo.updateBranch(tenantId, id, data)
}

export async function listShifts(tenantId: number, branchId: number) {
  await getBranch(tenantId, branchId)
  return branchRepo.findShifts(tenantId, branchId)
}

export async function setShift(tenantId: number, branchId: number, data: ShiftInput) {
  await getBranch(tenantId, branchId)
  if (data.startTime >= data.endTime) throw new BranchError('startTime must be before endTime', 400)
  return branchRepo.upsertShift(tenantId, branchId, data)
}

export async function removeShift(tenantId: number, branchId: number, id: number) {
  await getBranch(tenantId, branchId)
  await branchRepo.deleteShift(tenantId, branchId, id)
}

// Returns a warning string if the doctor has shifts on that day but none cover the slot.
export async function shiftWarning(
  tenantId: number, branchId: number, doctorId: number, scheduledAt: Date,
): Promise<string | null> {
  const dayOfWeek = scheduledAt.getDay()
  const shift = await branchRepo.findCoveringShift(tenantId, branchId, doctorId, dayOfWeek)
  if (!shift) return null // no shift configured → no restriction
  const hhmm = scheduledAt.toTimeString().slice(0, 5)
  if (hhmm < shift.startTime || hhmm > shift.endTime) {
    return `Doctor is scheduled ${shift.startTime}–${shift.endTime} on this day; appointment is outside shift.`
  }
  return null
}
