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
import type { PrismaClient } from '@prisma/client'

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
