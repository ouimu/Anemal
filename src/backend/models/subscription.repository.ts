// Subscription repository — plan tier + usage counts (tenant-scoped).
import prisma from '../config/db'

export async function getPlanTier(tenantId: number): Promise<string> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { planTier: true },
  })
  return settings?.planTier ?? 'starter'
}

export function countActiveUsers(tenantId: number): Promise<number> {
  return prisma.user.count({ where: { tenantId, isActive: true } })
}
