// Fixture (arch §6.3): a guarded to-many traversal whose `include` is a same-module identifier
// (shape (b)) and whose `where` is a same-module call expression ending in a single terminal
// `return <object literal>` (shape (a)) — exactly the shape `pet.repository.ts`'s `buildWhere`/
// `listInclude` use in the real codebase. Proves the resolver actually RESOLVES these shapes
// instead of failing them closed, which is what a literals-only analyzer would have done (arch
// §6.2.1, path (i), rejected).
// Expected: 0 violations.

function buildWhere(tenantId: number, id: number) {
  return { id, tenantId }
}

const petInclude = { vaccinations: { where: { tenantId: 1 } } }

import prisma from '../../../config/db'

export function findPetById(tenantId: number, id: number) {
  return prisma.pet.findFirst({
    where: buildWhere(tenantId, id),
    include: petInclude,
  })
}
