import prisma from '../config/db'
import { z } from 'zod'

export const createPetSchema = z.object({
  ownerId:             z.number().int().positive(),
  name:                z.string().min(1).max(100),
  species:             z.string().min(1).max(50),
  breed:               z.string().max(100).optional().nullable(),
  color:               z.string().max(100).optional().nullable(),
  birthDate:           z.string().optional().nullable(),
  gender:              z.enum(['male', 'female', 'unknown']).optional().nullable(),
  weightKg:            z.number().positive().optional().nullable(),
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

export class PetError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
    this.name = 'PetError'
  }
}

export async function listPets(tenantId: number, page = 1, limit = 20, ownerId?: number, species?: string) {
  const skip = (page - 1) * limit
  const where = {
    tenantId,
    isActive: true,
    ...(ownerId  ? { ownerId }  : {}),
    ...(species  ? { species }  : {}),
  }

  const [pets, total] = await Promise.all([
    prisma.pet.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
      include: { owner: { select: { id: true, firstName: true, lastName: true, phone: true } } },
    }),
    prisma.pet.count({ where }),
  ])

  return { pets, total, page, limit }
}

export async function getPet(tenantId: number, id: number) {
  const pet = await prisma.pet.findFirst({
    where: { id, tenantId, isActive: true },
    include: {
      owner: true,
      vaccinations: { orderBy: { administeredAt: 'desc' } },
      medicalRecords: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, createdAt: true, assessment: true, doctorId: true },
      },
    },
  })
  if (!pet) throw new PetError('Pet not found', 404)
  return pet
}

export async function createPet(tenantId: number, data: CreatePetInput) {
  const owner = await prisma.owner.findFirst({ where: { id: data.ownerId, tenantId } })
  if (!owner) throw new PetError('Owner not found', 404)

  const { birthDate, weightKg, ...rest } = data
  return prisma.pet.create({
    data: {
      ...rest,
      tenantId,
      birthDate: birthDate ? new Date(birthDate) : null,
      weightKg:  weightKg  ? weightKg            : null,
    },
  })
}

export async function updatePet(tenantId: number, id: number, data: UpdatePetInput) {
  await getPet(tenantId, id)
  const { birthDate, weightKg, ...rest } = data
  return prisma.pet.update({
    where: { id, tenantId },
    data: {
      ...rest,
      ...(birthDate !== undefined ? { birthDate: birthDate ? new Date(birthDate) : null } : {}),
      ...(weightKg  !== undefined ? { weightKg }                                           : {}),
    },
  })
}
