// Pet repository — all Prisma access for the pets table (CODING_RULES §2, §11).

import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import type { CreatePetInput, UpdatePetInput } from '../services/pet.service'
import { ownerSummarySelect } from './owner.repository'

const listInclude = { owner: { select: ownerSummarySelect } }

// XTI-3 (arch §4.2, FROZEN CONSTRAINT): the response shape for `pet: { select: petSummarySelect } }`
// at every to-one traversal into Pet from another model. Scalar-only, on purpose — no relation key
// may ever be added here; see ownerSummarySelect (owner.repository.ts) for the analyzer-resolvability
// reason this stays inside models/.
export const petSummarySelect = { id: true, name: true, species: true, photoUrl: true } as const

function buildWhere(tenantId: number, ownerId?: number, species?: string) {
  return {
    tenantId,
    isActive: true,
    owner: { is: { tenantId } },
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

// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient`
// so a caller (e.g. appointment.service's booking-atomicity fix, arch §8.2/§4.1 rev 3) can
// run this check inside its own write transaction. `includeEmr` keeps its existing default —
// this is a trailing 4th param, not a replacement for it.
export function findPetById(
  tenantId: number,
  id: number,
  includeEmr = true,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return client.pet.findFirst({
    where: { id, tenantId, isActive: true, owner: { is: { tenantId } } },
    include: {
      owner: { select: ownerSummarySelect },
      ...(includeEmr ? {
        vaccinations: { where: { tenantId }, orderBy: { administeredAt: 'desc' } },
        medicalRecords: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, createdAt: true, assessment: true, doctorId: true },
        },
      } : {}),
    },
  })
}

// FK validation for createPet — owners table, scoped to tenant. `client` defaults to the
// shared `prisma` instance but accepts a `Prisma.TransactionClient` so `createPet` (pet.service.ts)
// can run this check inside `createWithQuotaLock`'s existing transaction (arch §8.2 atomicity fix).
export function findOwner(tenantId: number, ownerId: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.owner.findFirst({ where: { id: ownerId, tenantId } })
}

// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient`
// so R3-HI-04's quota-lock transaction can create the pet inside the same lock scope.
export function createPet(tenantId: number, data: CreatePetInput, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const { birthDate, weightKg, ...rest } = data
  return client.pet.create({
    data: {
      ...rest,
      tenantId,
      birthDate: birthDate ? new Date(birthDate) : null,
      weightKg:  weightKg  ? weightKg            : null,
    },
  })
}

export function updatePetPhotoUrl(tenantId: number, id: number, photoUrl: string) {
  return prisma.pet.update({ where: { id, tenantId }, data: { photoUrl } })
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
