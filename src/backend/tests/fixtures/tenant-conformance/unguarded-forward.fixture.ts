// Fixture (arch §6.3): a to-one relation traversal with no tenant predicate mirrored in the
// root `where`. Never imported by the app — read as text by the analyzer only.
// Expected: exactly 1 violation, rule R-2, relation path "pet".

import prisma from '../../../config/db'

export function findVaccinations(tenantId: number) {
  return prisma.vaccination.findMany({
    where: { tenantId },
    include: { pet: true },
  })
}
