/**
 * One-time backfill (PROV-2, brainstorm §3.3 / Q-G4): insert a 'Main Branch'
 * for every tenant that currently has zero Branch rows. Covers real
 * Platform-Console-provisioned tenants created between PR #23 (first-admin
 * auto-provisioning) and PROV-1 (this branch) landing — those tenants exist
 * with an admin user but no branch, blocking all staff/doctor login.
 *
 * Idempotent by construction: only tenants with COUNT(branches) = 0 are
 * touched, regardless of isActive. Safe to re-run against the same
 * environment (Q-G4 — run manually once per environment, e.g. Neon prod,
 * not wired into CI/deploy).
 *
 * Run via: npx ts-node src/backend/scripts/backfill-main-branch.ts
 */
import prisma from '../config/db'

/**
 * Insert a "Main Branch" row for every tenant that has zero branches.
 *
 * @param opts.tenantIds - Optional allow-list. When omitted the sweep is
 *   global, which is the intended production behaviour. When supplied, only
 *   those tenants are considered.
 *
 *   This exists for the test suite (TEST-BL-1). An unscoped sweep is a
 *   whole-database WRITE, and under parallel jest workers it lands in the
 *   window another suite leaves open between `tenant.create()` and its
 *   `branch.create()`. That suite's tenant then ends up with two branches
 *   instead of one, which flips its login into requiring branch selection and
 *   makes a user with no branch assignment fail with 403 — a failure with no
 *   visible connection to the backfill. Passing the ids under test keeps the
 *   suite hermetic; production still calls this with no argument.
 *
 * @returns The number of tenants that received a new branch row.
 */
export async function backfillMainBranch(
  opts: { tenantIds?: number[] } = {},
): Promise<{ inserted: number }> {
  const tenantsWithoutBranches = await prisma.tenant.findMany({
    where: {
      branches: { none: {} },
      ...(opts.tenantIds ? { id: { in: opts.tenantIds } } : {}),
    },
    select: { id: true, name: true },
  })

  for (const tenant of tenantsWithoutBranches) {
    await prisma.branch.create({ data: { tenantId: tenant.id, name: 'Main Branch' } })
  }

  return { inserted: tenantsWithoutBranches.length }
}

if (require.main === module) {
  backfillMainBranch()
    .then((result) => { console.log(`Backfilled Main Branch for ${result.inserted} tenant(s).`) })
    .catch((err) => { console.error(err); process.exitCode = 1 })
    .finally(async () => { await prisma.$disconnect() })
}
