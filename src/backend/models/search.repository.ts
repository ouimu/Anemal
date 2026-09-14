// Search repository — read-only Prisma access for quick cross-entity search.

import prisma from '../config/db'
import { ownerSummarySelect } from './owner.repository'

// XTI-9 (arch §3.1 dialect 1, T2 site): Pet.ownerId is a required FK — the tenant
// predicate mirrors the include path in the root `where` so a cross-tenant owner row
// can never be joined in, per ADR-0027.
export function searchPets(tenantId: number, q: string) {
  return prisma.pet.findMany({
    where: {
      tenantId,
      isActive: true,
      owner: { is: { tenantId } },
      OR: [
        { name:        { contains: q, mode: 'insensitive' } },
        { microchipId: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 5,
    include: { owner: { select: ownerSummarySelect } },
  })
}

// XTI-9 (arch §3.1 dialect 2, T2 site): Owner.pets is a to-many reverse relation — the
// tenant predicate goes in the nested `where` alongside the existing isActive filter.
export function searchOwners(tenantId: number, q: string) {
  return prisma.owner.findMany({
    where: {
      tenantId,
      OR: [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName:  { contains: q, mode: 'insensitive' } },
        { phone:     { contains: q } },
      ],
    },
    take: 5,
    include: { pets: { where: { tenantId, isActive: true }, select: { id: true, name: true, species: true } } },
  })
}
