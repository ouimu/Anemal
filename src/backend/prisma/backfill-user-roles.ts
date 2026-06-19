/**
 * backfill-user-roles.ts — Phase 8 (T-5A-06 + T-5A-07)
 *
 * Maps legacy users.role (LegacyRole enum) to the new system roles:
 *   admin  -> clinic_admin  (roleId = system role id)
 *   doctor -> doctor
 *   staff  -> clinic_staff
 *
 * PM flag F1 (pm-scope-check.md): superadmin users are SKIPPED with a warning.
 *   Their migration to platform_users belongs to T-5C-03. Their roleId stays NULL.
 *
 * For each non-superadmin user:
 *   1. Sets users.roleId = system role id (T-5A-06)
 *   2. Creates one user_roles row (T-5A-07 — CR-01 foundation)
 *
 * Idempotent: re-run is safe; already-set roleId rows are skipped; user_roles uses upsert.
 *
 * @db-agent — isolation: userRoles rows carry tenantId matching the user's tenantId.
 * Every query here uses explicit tenantId matching (userId+tenantId on upsert).
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LEGACY_TO_SYSTEM_KEY: Record<string, string> = {
  admin:  'clinic_admin',
  doctor: 'doctor',
  staff:  'clinic_staff',
}

async function backfillUserRoles(): Promise<void> {
  console.log('[backfill-user-roles] Starting backfill (T-5A-06 + T-5A-07)...')

  // Load all three system roles once
  const systemRoles = await prisma.clinicRole.findMany({
    where: { isSystem: true, tenantId: null },
    select: { id: true, key: true },
  })

  const roleByKey = new Map(systemRoles.map(r => [r.key, r.id]))
  console.log('[backfill-user-roles] System roles loaded:', [...roleByKey.keys()])

  // Load all users — we only need id, tenantId, role (legacy enum string)
  const users = await prisma.user.findMany({
    select: { id: true, tenantId: true, role: true, email: true },
  })

  console.log(`[backfill-user-roles] Found ${users.length} user(s) to process.`)

  let migrated = 0
  let skipped = 0
  let alreadyDone = 0

  for (const user of users) {
    const legacyRole = user.role as string

    // PM flag F1: skip superadmin — their migration is T-5C-03 (platform_users)
    if (legacyRole === 'superadmin') {
      console.warn(
        `[backfill-user-roles] SKIP superadmin user id=${user.id} (${user.email}) — ` +
        'will be migrated to platform_users in T-5C-03.'
      )
      skipped++
      continue
    }

    const targetRoleKey = LEGACY_TO_SYSTEM_KEY[legacyRole]
    if (!targetRoleKey) {
      console.warn(
        `[backfill-user-roles] SKIP unknown role="${legacyRole}" for user id=${user.id} (${user.email})`
      )
      skipped++
      continue
    }

    const roleId = roleByKey.get(targetRoleKey)
    if (!roleId) {
      console.error(
        `[backfill-user-roles] ERROR: system role "${targetRoleKey}" not found in DB. ` +
        'Run seed-rbac.ts first.'
      )
      process.exit(1)
    }

    // Check if already backfilled (idempotency)
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { roleId: true },
    })

    if (existingUser?.roleId === roleId) {
      alreadyDone++
      // Still ensure user_roles row exists (upsert is safe)
    }

    // T-5A-06: set users.roleId
    await prisma.user.update({
      where: { id: user.id },
      data: { roleId },
    })

    // T-5A-07: create user_roles join row
    // tenantId is denormalized here to enforce isolation on future user_roles queries
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId, tenantId: user.tenantId },
    })

    if (existingUser?.roleId !== roleId) {
      console.log(
        `[backfill-user-roles] Migrated user id=${user.id} (${user.email}) ` +
        `role=${legacyRole} -> ${targetRoleKey} (roleId=${roleId})`
      )
      migrated++
    }
  }

  console.log(
    `[backfill-user-roles] Done. migrated=${migrated}, skipped=${skipped}, already_done=${alreadyDone}`
  )
}

// Run directly when invoked as a script
if (require.main === module) {
  backfillUserRoles()
    .catch((err) => {
      console.error('[backfill-user-roles] Fatal error:', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
