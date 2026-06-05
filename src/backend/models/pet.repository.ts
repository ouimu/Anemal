// Pet repository — all Prisma access for the pets table (CODING_RULES §2, §11).

import prisma from '../config/db'
import type { CreatePetInput, UpdatePetInput } from '../services/pet.service'

const listInclude = { owner: { select: { id: true, firstName: true, lastName: true, phone: true } } }

function buildWhere(tenantId: number, ownerId?: number, species?: string) {
  return {
    tenantId,
    isActive: true,
    ...(ownerId ? { ownerId } : {}),
    ...(species ? { species } : {}),
  }
}

export function findPets(tenantId: number, opts: { skip: number; take: number; ownerId?: number; species?: string }) {
  return prisma.pet.findMany({
    where: buildWhere(tenantId, opts.ownerId, opts.species),
    skip: opts.skip,
    take: opts.take,
    orderBy: { name: 'asc' },
    include: listInclude,
  })
}

export function countPets(tenantId: number, ownerId?: number, species?: string) {
  return prisma.pet.count({ where: buildWhere(tenantId, ownerId, species) })
}

export function findPetById(tenantId: number, id: number) {
  return prisma.pet.findFirst({
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
}

// FK validation for createPet — owners table, scoped to tenant.
export function findOwner(tenantId: number, ownerId: number) {
  return prisma.owner.findFirst({ where: { id: ownerId, tenantId } })
}

export function createPet(tenantId: number, data: CreatePetInput) {
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

export function updatePet(tenantId: number, id: number, data: UpdatePetInput) {
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
