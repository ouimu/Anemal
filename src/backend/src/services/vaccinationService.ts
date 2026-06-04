import prisma from '../config/db'
import { z } from 'zod'

export const createVaccinationSchema = z.object({
  petId:          z.number().int().positive(),
  vaccineName:    z.string().min(1).max(100),
  administeredAt: z.string(),
  nextDueAt:      z.string().optional().nullable(),
  batchNo:        z.string().max(50).optional().nullable(),
  notes:          z.string().optional().nullable(),
})

export type CreateVaccinationInput = z.infer<typeof createVaccinationSchema>

export class VaccinationError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
    this.name = 'VaccinationError'
  }
}

export async function listVaccinations(tenantId: number, petId: number) {
  const pet = await prisma.pet.findFirst({ where: { id: petId, tenantId } })
  if (!pet) throw new VaccinationError('Pet not found', 404)

  return prisma.vaccination.findMany({
    where: { tenantId, petId },
    orderBy: { administeredAt: 'desc' },
  })
}

export async function createVaccination(tenantId: number, data: CreateVaccinationInput) {
  const pet = await prisma.pet.findFirst({ where: { id: data.petId, tenantId } })
  if (!pet) throw new VaccinationError('Pet not found', 404)

  return prisma.vaccination.create({
    data: {
      ...data,
      tenantId,
      administeredAt: new Date(data.administeredAt),
      nextDueAt: data.nextDueAt ? new Date(data.nextDueAt) : null,
    },
  })
}

export async function getDueSoon(tenantId: number, days = 30) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days)

  return prisma.vaccination.findMany({
    where: {
      tenantId,
      nextDueAt: { lte: cutoff, gte: new Date() },
    },
    include: {
      pet: { select: { id: true, name: true, species: true, owner: { select: { firstName: true, lastName: true, phone: true } } } },
    },
    orderBy: { nextDueAt: 'asc' },
  })
}
