// Fixture (arch §6.3): same shape as unguarded-reverse, but the nested `where` carries the
// tenant predicate (dialect 2, arch §3.1).
// Expected: 0 violations.

import prisma from '../../../config/db'

export function findPetById(tenantId: number, id: number) {
  return prisma.pet.findFirst({
    where: { id, tenantId },
    include: { vaccinations: { where: { tenantId } } },
  })
}
