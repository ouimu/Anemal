// Vaccination repository — all Prisma access for the vaccinations table.

import prisma from '../config/db'
import type { CreateVaccinationInput } from '../services/vaccinationService'

export function findPet(tenantId: number, petId: number) {
  return prisma.pet.findFirst({ where: { id: petId, tenantId } })
}

export function findByPet(tenantId: number, petId: number) {
  return prisma.vaccination.findMany({ where: { tenantId, petId }, orderBy: { administeredAt: 'desc' } })
}

export function createVaccination(tenantId: number, data: CreateVaccinationInput) {
  return prisma.vaccination.create({
    data: {
      ...data,
      tenantId,
      administeredAt: new Date(data.administeredAt),
      nextDueAt: data.nextDueAt ? new Date(data.nextDueAt) : null,
    },
  })
}

export function findDueSoon(tenantId: number, from: Date, to: Date) {
  return prisma.vaccination.findMany({
    where: { tenantId, nextDueAt: { lte: to, gte: from } },
    include: {
      pet: { select: { id: true, name: true, species: true, owner: { select: { firstName: true, lastName: true, phone: true } } } },
    },
    orderBy: { nextDueAt: 'asc' },
  })
}
