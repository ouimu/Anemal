/**
 * collapse-multi-role.ts — D-7 multi-role retirement (ADR-0019).
 *
 * Classifies every user holding >1 `user_roles` row into:
 *   - auto-collapsible: exactly one system role + 1+ custom roles → system role wins.
 *   - ambiguous: 2+ system roles, OR 2+ custom roles with no system role → halts,
 *     goes to a manual-resolution report, never auto-picked.
 *
 * Must run (via collapseMultiRoleUsers, Task 3) BEFORE the roleId NOT NULL +
 * column-drop migration (Task 4) — it is what guarantees "exactly one
 * user_roles row per user" going into that step.
 */
import { PrismaClient } from '@prisma/client'

export interface AutoCollapsibleCase {
  userId: number
  tenantId: number
  systemRoleId: number
  removedRoleIds: number[]
}

export interface AmbiguousCase {
  userId: number
  tenantId: number
  roleIds: number[]
  reason: 'multiple-system-roles' | 'multiple-custom-roles-no-system'
}

export interface ClassificationResult {
  autoCollapsible: AutoCollapsibleCase[]
  ambiguous: AmbiguousCase[]
}

/**
 * Find every user with more than one `user_roles` row (across all tenants)
 * and classify each into auto-collapsible or ambiguous.
 *
 * @param prisma - Prisma client (test suites pass a shared instance).
 */
export async function classifyMultiRoleUsers(prisma: PrismaClient): Promise<ClassificationResult> {
  const grouped = await prisma.userRole.groupBy({
    by: ['userId'],
    _count: { roleId: true },
    having: { roleId: { _count: { gt: 1 } } },
  })

  const autoCollapsible: AutoCollapsibleCase[] = []
  const ambiguous: AmbiguousCase[] = []

  for (const g of grouped) {
    const rows = await prisma.userRole.findMany({
      where: { userId: g.userId },
      include: { role: { select: { id: true, isSystem: true } } },
    })
    if (rows.length === 0) continue

    const tenantId = rows[0].tenantId
    const systemRoles = rows.filter(r => r.role.isSystem)
    const customRoles = rows.filter(r => !r.role.isSystem)

    if (systemRoles.length === 1) {
      autoCollapsible.push({
        userId: g.userId,
        tenantId,
        systemRoleId: systemRoles[0].roleId,
        removedRoleIds: customRoles.map(r => r.roleId),
      })
    } else if (systemRoles.length >= 2) {
      ambiguous.push({ userId: g.userId, tenantId, roleIds: rows.map(r => r.roleId), reason: 'multiple-system-roles' })
    } else {
      ambiguous.push({ userId: g.userId, tenantId, roleIds: rows.map(r => r.roleId), reason: 'multiple-custom-roles-no-system' })
    }
  }

  return { autoCollapsible, ambiguous }
}

export interface CollapseLogEntry {
  userId: number
  tenantId: number
  keptRoleId: number
  removedRoleIds: number[]
  timestamp: string
}

export interface CollapseReport {
  collapsed: CollapseLogEntry[]
  manualResolutionNeeded: AmbiguousCase[]
}

/**
 * Execute the D-7 survivor rule: collapse every auto-collapsible multi-role
 * user to their system role, leave ambiguous cases untouched, and return an
 * auditable report (attach to the migration PR — CORR-1.4).
 *
 * @param prisma - Prisma client.
 */
export async function collapseMultiRoleUsers(prisma: PrismaClient): Promise<CollapseReport> {
  const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

  const collapsed: CollapseLogEntry[] = []

  for (const c of autoCollapsible) {
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: c.userId, tenantId: c.tenantId, roleId: { in: c.removedRoleIds } },
      })
      await tx.user.update({ where: { id: c.userId }, data: { roleId: c.systemRoleId } })
    })

    collapsed.push({
      userId: c.userId,
      tenantId: c.tenantId,
      keptRoleId: c.systemRoleId,
      removedRoleIds: c.removedRoleIds,
      timestamp: new Date().toISOString(),
    })
  }

  return { collapsed, manualResolutionNeeded: ambiguous }
}

// Run directly when invoked as a script (mirrors backfill-user-roles.ts's own entrypoint).
if (require.main === module) {
  const prisma = new PrismaClient()
  collapseMultiRoleUsers(prisma)
    .then((report) => {
      console.log(`[collapse-multi-role] Collapsed ${report.collapsed.length} user(s):`)
      for (const entry of report.collapsed) {
        console.log(
          `  userId=${entry.userId} tenantId=${entry.tenantId} kept=${entry.keptRoleId} ` +
          `removed=[${entry.removedRoleIds.join(', ')}] at ${entry.timestamp}`
        )
      }
      if (report.manualResolutionNeeded.length > 0) {
        console.warn(`[collapse-multi-role] ${report.manualResolutionNeeded.length} user(s) NEED MANUAL RESOLUTION:`)
        for (const a of report.manualResolutionNeeded) {
          console.warn(`  userId=${a.userId} tenantId=${a.tenantId} roleIds=[${a.roleIds.join(', ')}] reason=${a.reason}`)
        }
        console.warn('[collapse-multi-role] These tenants must NOT proceed to the column-drop migration until resolved.')
      } else {
        console.log('[collapse-multi-role] No ambiguous cases. Safe to proceed to the column-drop migration.')
      }
    })
    .catch((err) => {
      console.error('[collapse-multi-role] Fatal error:', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
