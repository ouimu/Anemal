import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as petRepo from '../models/pet.repository'

export const createPetSchema = z.object({
  ownerId:             z.number().int().positive(),
  name:                z.string().min(1).max(100),
  species:             z.string().min(1).max(50),
  breed:               z.string().max(100).optional().nullable(),
  color:               z.string().max(100).optional().nullable(),
  birthDate:           z.string().optional().nullable(),
  gender:              z.enum(['male', 'female', 'unknown']).optional().nullable(),
  weightKg:            z.number().positive().max(999.99).optional().nullable(),
  microchipId:         z.string().max(50).optional().nullable(),
  photoUrl:            z.string().optional().nullable(),
  allergies:           z.string().optional().nullable(),
  underlyingConditions:z.string().optional().nullable(),
})

export const updatePetSchema = createPetSchema.partial().omit({ ownerId: true }).extend({
  isActive: z.boolean().optional(),
})

export type CreatePetInput = z.infer<typeof createPetSchema>
export type UpdatePetInput = z.infer<typeof updatePetSchema>

export class PetError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'PET_ERROR')
  }
}

export async function listPets(tenantId: number, page = 1, limit = 20, ownerId?: number, species?: string) {
  const skip = (page - 1) * limit
  const [pets, total] = await Promise.all([
    petRepo.findPets(tenantId, { skip, take: limit, ownerId, species }),
    petRepo.countPets(tenantId, ownerId, species),
  ])
  return { pets, total, page, limit }
}

export async function getPet(tenantId: number, id: number) {
  const pet = await petRepo.findPetById(tenantId, id)
  if (!pet) throw new PetError('Pet not found', 404)
  return pet
}

export async function createPet(tenantId: number, data: CreatePetInput) {
  const owner = await petRepo.findOwner(tenantId, data.ownerId)
  if (!owner) throw new PetError('Owner not found', 404)
  return petRepo.createPet(tenantId, data)
}

export async function updatePet(tenantId: number, id: number, data: UpdatePetInput) {
  await getPet(tenantId, id)
  return petRepo.updatePet(tenantId, id, data)
}
