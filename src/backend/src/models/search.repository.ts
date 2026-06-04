// Search repository — read-only Prisma access for quick cross-entity search.

import prisma from '../config/db'

export function searchPets(tenantId: number, q: string) {
  return prisma.pet.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { name:        { contains: q, mode: 'insensitive' } },
        { microchipId: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 5,
    include: { owner: { select: { id: true, firstName: true, lastName: true, phone: true } } },
  })
}

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
    include: { pets: { where: { isActive: true }, select: { id: true, name: true, species: true } } },
  })
}
