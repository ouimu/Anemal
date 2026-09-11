// Owner repository — all Prisma access for the owners table (CODING_RULES §2, §11).
// Every function takes tenantId as its first parameter; services never touch Prisma.

import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import type { CreateOwnerInput, UpdateOwnerInput } from '../services/owner.service'

const listInclude = { pets: { where: { isActive: true }, select: { id: true, name: true, species: true } } }

// XTI-3 (arch §4.2, FROZEN CONSTRAINT): the response shape for `owner: { select: ownerSummarySelect }`
// at every to-one traversal into Owner from another model (appointment/invoice/pet/prescription).
// Scalar-only, on purpose — no relation key may ever be added here. Declared inside models/ so it
// stays inside the tenantRelationConformance analyzer's own resolvable set (arch §6.2.1 shape (c));
// moving it to utils/, types/ or a shared _select.ts would make it unresolvable and fail every
// site that imports it closed. Do not add idCardNumber/idCardType/address/lineId/email/isActive/
// loyaltyPoints/membershipTier — those are exactly the fields §4.2 removes from cross-tenant-visible
// endpoints.
export const ownerSummarySelect = { id: true, firstName: true, lastName: true, phone: true } as const

function buildWhere(tenantId: number, search?: string, includeInactive?: boolean) {
  return {
    tenantId,
    ...(includeInactive ? {} : { isActive: true }),
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName:  { contains: search, mode: 'insensitive' as const } },
        { phone:     { contains: search } },
      ],
    } : {}),
  }
}

export function findOwners(tenantId: number, opts: { skip: number; take: number; search?: string; includeInactive?: boolean }) {
  return prisma.owner.findMany({
    where: buildWhere(tenantId, opts.search, opts.includeInactive),
    skip: opts.skip,
    take: opts.take,
    orderBy: { createdAt: 'desc' },
    include: listInclude,
  })
}

export function countOwners(tenantId: number, search?: string, includeInactive?: boolean) {
  return prisma.owner.count({ where: buildWhere(tenantId, search, includeInactive) })
}

export function findOwnerById(tenantId: number, id: number) {
  return prisma.owner.findFirst({ where: { id, tenantId }, include: { pets: { where: { isActive: true } } } })
}

export function findOwnerByPhone(tenantId: number, phone: string, excludeId?: number) {
  return prisma.owner.findFirst({ where: { tenantId, phone, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })
}

export function findOwnerByIdCard(tenantId: number, idCardNumber: string, excludeId?: number) {
  return prisma.owner.findFirst({ where: { tenantId, idCardNumber, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })
}

export function deactivateOwner(tenantId: number, id: number) {
  return prisma.owner.updateMany({ where: { id, tenantId }, data: { isActive: false } })
}

export function countActivePetsForOwner(tenantId: number, ownerId: number) {
  return prisma.pet.count({ where: { tenantId, ownerId, isActive: true } })
}

// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient`
// so R3-HI-04's quota-lock transaction can create the owner inside the same lock scope.
export function createOwner(tenantId: number, data: CreateOwnerInput, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.owner.create({ data: { ...data, tenantId } })
}

export function updateOwner(tenantId: number, id: number, data: UpdateOwnerInput) {
  return prisma.owner.update({ where: { id, tenantId }, data })
}
