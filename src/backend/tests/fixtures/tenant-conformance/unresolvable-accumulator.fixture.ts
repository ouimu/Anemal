// Fixture (arch §6.3): a to-one relation ("owner") whose root-`where` guard is unresolvable
// because it comes from a mutable accumulator (shape (f) — `where['k'] = v` after a `const`
// declaration is NOT a single terminal `return <object literal>`), combined with a to-many
// relation ("vaccinations") whose conditional include (shape (e)) is guarded on one branch and
// unguarded (`: true`) on the other — the same shape as the real, live defect at
// `product.repository.ts:57,69` (`branchInventory: branchId != null ? { where: { branchId } } :
// true` — BOTH branches fail R-1 because neither carries `tenantId`; here only the `true` branch
// is left unguarded, to prove branches are checked independently rather than only reporting once
// per relation key).
//
// This fixture proves the resolver FAILS CLOSED on both fronts, rather than silently passing what
// it cannot read: an unresolvable `where` must not be treated as "guarded", and an unguarded
// conditional branch must not be hidden by its guarded sibling.
//
// Expected: exactly 2 violations — R-2 on "owner" (root `where` unresolvable), R-1 on
// "vaccinations" (the `true` branch has no nested `where` at all).

function buildWhere(tenantId: number, id: number) {
  const where: Record<string, unknown> = { id, tenantId }
  where['isActive'] = true
  return where
}

import prisma from '../../../config/db'

export function findPetWithHistory(tenantId: number, id: number, includeAll: boolean) {
  return prisma.pet.findFirst({
    where: buildWhere(tenantId, id),
    include: {
      owner: true,
      vaccinations: includeAll ? { where: { tenantId } } : true,
    },
  })
}
