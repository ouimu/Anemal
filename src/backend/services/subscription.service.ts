// Subscription service — MVP plan enforcement (CLAUDE.md Phase 3, Task 3.4).
// No payment gateway; plan tier lives on TenantSettings.planTier. Omise/Stripe = Phase 4.
import { PaymentRequiredError } from '../utils/errors'
import * as subRepo from '../models/subscription.repository'

export interface PlanLimits {
  maxUsers: number | null // null = unlimited
}

// Keep in sync with the frontend SubscriptionTab plan cards.
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter:      { maxUsers: 3 },
  professional: { maxUsers: null },
  enterprise:   { maxUsers: null },
}

function limitsFor(tier: string): PlanLimits {
  return PLAN_LIMITS[tier] ?? PLAN_LIMITS.starter
}

export async function getStatus(tenantId: number) {
  const [planTier, users] = await Promise.all([
    subRepo.getPlanTier(tenantId),
    subRepo.countActiveUsers(tenantId),
  ])
  const limits = limitsFor(planTier)
  return {
    planTier,
    limits,
    usage: { users },
    withinLimits: limits.maxUsers === null || users <= limits.maxUsers,
  }
}

// Throws 402 if creating another active user would exceed the plan's user limit.
export async function assertCanAddUser(tenantId: number): Promise<void> {
  const planTier = await subRepo.getPlanTier(tenantId)
  const limit = limitsFor(planTier).maxUsers
  if (limit === null) return
  const users = await subRepo.countActiveUsers(tenantId)
  if (users >= limit) {
    throw new PaymentRequiredError(
      `Your ${planTier} plan allows up to ${limit} users. Upgrade your plan to add more.`,
    )
  }
}
