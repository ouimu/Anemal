// Fixture (arch §6.3): a to-many (reverse) relation traversal with no tenant predicate in its
// nested `where`. Never imported by the app — read as text by the analyzer only.
// Expected: exactly 1 violation, rule R-1, relation path "vaccinations".

import prisma from '../../../config/db'

export function findPetById(tenantId: number, id: number) {
  return prisma.pet.findFirst({
    where: { id, tenantId },
    include: { vaccinations: true },
  })
}
