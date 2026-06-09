// Hospitalization (inpatient) service (Phase 4, FR-08). Discharge auto-bills via invoice service.
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as hospRepo from '../models/hospitalization.repository'
import * as invoiceService from './invoice.service'

const TIME_SLOTS = ['08:00', '12:00', '16:00', '20:00'] as const

export const admitSchema = z.object({
  petId:          z.number().int().positive(),
  reason:         z.string().trim().min(1),
  cageNo:         z.string().max(50).optional().nullable(),
  doctorInCharge: z.number().int().positive().optional().nullable(),
  dailyRate:      z.number().nonnegative().default(0),
  notes:          z.string().optional().nullable(),
}).strict()

export const careSchema = z.object({
  timeSlot:        z.enum(TIME_SLOTS),
  temperatureC:    z.number().optional().nullable(),
  heartRateBpm:    z.number().int().optional().nullable(),
  respRateRpm:     z.number().int().optional().nullable(),
  feedingStatus:   z.string().max(255).optional().nullable(),
  medicationGiven: z.string().optional().nullable(),
  notes:           z.string().optional().nullable(),
}).strict()

export type AdmitInput = z.infer<typeof admitSchema>
export type CareInput = z.infer<typeof careSchema>

export class HospitalizationError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'HOSPITALIZATION_ERROR')
  }
}

export function admit(tenantId: number, branchId: number | null, data: AdmitInput) {
  return hospRepo.admit(tenantId, branchId, data)
}

export function listActive(tenantId: number, branchId?: number) {
  return hospRepo.findActive(tenantId, branchId)
}

export async function getHospitalization(tenantId: number, id: number) {
  const h = await hospRepo.findById(tenantId, id)
  if (!h) throw new HospitalizationError('Hospitalization not found', 404)
  return h
}

export async function logCare(tenantId: number, id: number, data: CareInput, performedBy?: number) {
  const h = await getHospitalization(tenantId, id)
  if (h.status !== 'admitted') throw new HospitalizationError('Cannot log care for a discharged patient', 409)
  return hospRepo.addCare(tenantId, id, data, performedBy)
}

// Discharge → mark discharged + auto-generate an invoice for the stay (days × dailyRate).
export async function discharge(tenantId: number, branchId: number, id: number, createdBy?: number) {
  const h = await getHospitalization(tenantId, id)
  if (h.status !== 'admitted') throw new HospitalizationError('Patient is not currently admitted', 409)

  const discharged = await hospRepo.markDischarged(tenantId, id)
  const rate = Number(h.dailyRate)

  let invoice = null
  if (rate > 0) {
    const ms = Date.now() - new Date(h.admittedAt).getTime()
    const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
    invoice = await invoiceService.createInvoice(tenantId, branchId, {
      petId: h.petId,
      items: [{ description: `Hospitalization (${days} day${days > 1 ? 's' : ''})`, itemType: 'service', qty: days, unitPrice: rate }],
      discount: 0, taxRate: 7,
    }, createdBy)
  }
  return { hospitalization: discharged, invoice }
}
