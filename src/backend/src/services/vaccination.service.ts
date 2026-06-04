import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as vaccinationRepo from '../models/vaccination.repository'

export const createVaccinationSchema = z.object({
  petId:          z.number().int().positive(),
  vaccineName:    z.string().min(1).max(100),
  administeredAt: z.string(),
  nextDueAt:      z.string().optional().nullable(),
  batchNo:        z.string().max(50).optional().nullable(),
  notes:          z.string().optional().nullable(),
})

export type CreateVaccinationInput = z.infer<typeof createVaccinationSchema>

export class VaccinationError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'VACCINATION_ERROR')
  }
}

export async function listVaccinations(tenantId: number, petId: number) {
  const pet = await vaccinationRepo.findPet(tenantId, petId)
  if (!pet) throw new VaccinationError('Pet not found', 404)
  return vaccinationRepo.findByPet(tenantId, petId)
}

export async function createVaccination(tenantId: number, data: CreateVaccinationInput) {
  const pet = await vaccinationRepo.findPet(tenantId, data.petId)
  if (!pet) throw new VaccinationError('Pet not found', 404)
  return vaccinationRepo.createVaccination(tenantId, data)
}

export async function getDueSoon(tenantId: number, days = 30) {
  const from = new Date()
  const to = new Date()
  to.setDate(to.getDate() + days)
  return vaccinationRepo.findDueSoon(tenantId, from, to)
}
