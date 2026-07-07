/**
 * One-time cleanup (BUG-005 / ADR-0003 D5): deactivate tenant-2 duplicate historical
 * users and known test artifacts left over from prior manual DB probing.
 *
 * No hard delete — FK safety (these users may be referenced by AuditLog, Appointment,
 * etc.). Sets isActive=false only. Idempotent: re-running on already-deactivated users
 * is a no-op.
 *
 * Usernames targeted: user4, user5, user6 (tenant-2 duplicates), user2072, intruder_b
 * (test artifacts). Matched by username, NOT id — ids are DB-instance-specific and
 * unsafe to hardcode across environments.
 *
 * Run once via: npx ts-node src/backend/scripts/deactivate-duplicate-test-users.ts
 */
import prisma from '../config/db'

const TARGET_USERNAMES = ['user4', 'user5', 'user6', 'user2072', 'intruder_b']

async function main() {
  const result = await prisma.user.updateMany({
    where: { username: { in: TARGET_USERNAMES }, isActive: true },
    data: { isActive: false },
  })
  console.log(`Deactivated ${result.count} of ${TARGET_USERNAMES.length} targeted users (already-inactive rows are skipped).`)
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
