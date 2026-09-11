// Fixture (arch §6.3): same shape as unguarded-forward, but the root `where` mirrors the
// relation with an explicit tenant predicate (dialect 1, arch §3.1). Without this fixture (and
// guarded-reverse), a detector that always reports a violation would still pass AC-5.
// Expected: 0 violations.

import prisma from '../../../config/db'

export function findVaccinations(tenantId: number) {
  return prisma.vaccination.findMany({
    where: { tenantId, pet: { is: { tenantId } } },
    include: { pet: true },
  })
}
