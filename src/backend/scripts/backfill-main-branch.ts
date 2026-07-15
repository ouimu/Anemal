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
 * @returns The number of tenants that received a new branch row.
 */
export async function backfillMainBranch(): Promise<{ inserted: number }> {
  const tenantsWithoutBranches = await prisma.tenant.findMany({
    where: { branches: { none: {} } },
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
