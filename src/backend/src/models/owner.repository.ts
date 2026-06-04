// Owner repository — all Prisma access for the owners table (CODING_RULES §2, §11).
// Every function takes tenantId as its first parameter; services never touch Prisma.

import prisma from '../config/db'
import type { CreateOwnerInput, UpdateOwnerInput } from '../services/ownerService'

const listInclude = { pets: { where: { isActive: true }, select: { id: true, name: true, species: true } } }

function buildWhere(tenantId: number, search?: string) {
  return {
    tenantId,
    ...(search ? {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName:  { contains: search, mode: 'insensitive' as const } },
        { phone:     { contains: search } },
      ],
    } : {}),
  }
}

export function findOwners(tenantId: number, opts: { skip: number; take: number; search?: string }) {
  return prisma.owner.findMany({
    where: buildWhere(tenantId, opts.search),
    skip: opts.skip,
    take: opts.take,
    orderBy: { createdAt: 'desc' },
    include: listInclude,
  })
}

export function countOwners(tenantId: number, search?: string) {
  return prisma.owner.count({ where: buildWhere(tenantId, search) })
}

export function findOwnerById(tenantId: number, id: number) {
  return prisma.owner.findFirst({ where: { id, tenantId }, include: { pets: { where: { isActive: true } } } })
}

export function findOwnerByPhone(tenantId: number, phone: string, excludeId?: number) {
  return prisma.owner.findFirst({ where: { tenantId, phone, ...(excludeId ? { NOT: { id: excludeId } } : {}) } })
}

export function createOwner(tenantId: number, data: CreateOwnerInput) {
  return prisma.owner.create({ data: { ...data, tenantId } })
}

export function updateOwner(tenantId: number, id: number, data: UpdateOwnerInput) {
  return prisma.owner.update({ where: { id, tenantId }, data })
}
