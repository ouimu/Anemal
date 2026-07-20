/**
 * Subscription service — quota enforcement backed by Plan + TenantQuota tables.
 *
 * Effective quota resolution order:
 *   1. tenant_quotas override (if field is non-null)
 *   2. plan default
 *   3. fallback constant (branches: 1, users: 5, owners: null = unlimited)
 *
 * Enforcement is applied at create-time only for quota-consuming actions.
 * Existing over-limit tenants are grandfathered: enforcement fires on new
 * creates only.
 *
 * @module subscription.service
 */

import { AppError } from '../utils/errors'
import prisma from '../config/db'
import { listPlans } from './platform-plans.service'

/** Quota exceeded error — maps to HTTP 409 in controllers. */
export class QuotaExceededError extends AppError {
  /** The resource type that hit its limit. */
  public readonly resource: string
  /** The configured limit. */
  public readonly limit: number
  /** The current usage count. */
  public readonly current: number

  constructor(resource: string, limit: number, current: number) {
    super(
      409,
      `Quota exceeded for ${resource}: limit is ${limit}, current is ${current}`,
      'QUOTA_EXCEEDED',
      { resource, limit, current },
    )
    this.resource = resource
    this.limit = limit
    this.current = current
  }
}

/** Effective quota shape resolved for a single tenant. */
export interface EffectiveTenantQuota {
  maxBranches: number | null
  maxUsers: number | null
  maxOwners: number | null
  maxPets: number | null
}

/**
 * Fallback: null means unlimited — applies to tenants that have no plan assigned yet.
 * Quota only becomes binding once a platform operator assigns a plan (or explicit override).
 */
const FALLBACK_BRANCHES = null
const FALLBACK_USERS    = null

/**
 * Resolve the effective quota for a tenant.
 *
 * Loads the tenant's plan and quota override in a single query.
 * Returns null for unlimited fields.
 *
 * @param tenantId - Tenant whose quota is being checked.
 */
export async function getEffectiveQuota(tenantId: number): Promise<EffectiveTenantQuota> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      plan:  true,
      quota: true,
    },
  })

  return {
    maxBranches: tenant?.quota?.maxBranches ?? tenant?.plan?.maxBranches ?? FALLBACK_BRANCHES,
    maxUsers:    tenant?.quota?.maxUsers    ?? tenant?.plan?.maxUsers    ?? FALLBACK_USERS,
    maxOwners:   tenant?.quota?.maxOwners   ?? tenant?.plan?.maxOwners   ?? null, // null = unlimited
    maxPets:     tenant?.quota?.maxPets     ?? tenant?.plan?.maxPets     ?? null, // null = unlimited
  }
}

/**
 * Assert that a new active user can be created for this tenant.
 * Throws QuotaExceededError (409) when the user limit is reached.
 *
 * @param tenantId - Tenant to check.
 */
export async function assertCanAddUser(tenantId: number): Promise<void> {
  const quota = await getEffectiveQuota(tenantId)
  if (quota.maxUsers === null) return

  const current = await prisma.user.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxUsers) {
    throw new QuotaExceededError('users', quota.maxUsers, current)
  }
}

/**
 * Assert that a new active branch can be created for this tenant.
 * Throws QuotaExceededError (409) when the branch limit is reached.
 *
 * @param tenantId - Tenant to check.
 */
export async function assertCanAddBranch(tenantId: number): Promise<void> {
  const quota = await getEffectiveQuota(tenantId)
  if (quota.maxBranches === null) return

  const current = await prisma.branch.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxBranches) {
    throw new QuotaExceededError('branches', quota.maxBranches, current)
  }
}

/**
 * Assert that a new owner (pet owner / customer) can be created for this tenant.
 * Throws QuotaExceededError (409) when the owner limit is reached.
 * A null limit (unlimited) always passes.
 *
 * @param tenantId - Tenant to check.
 */
export async function assertCanAddOwner(tenantId: number): Promise<void> {
  const quota = await getEffectiveQuota(tenantId)
  if (quota.maxOwners === null) return

  const current = await prisma.owner.count({ where: { tenantId } })
  if (current >= quota.maxOwners) {
    throw new QuotaExceededError('owners', quota.maxOwners, current)
  }
}

/**
 * Assert that a new active pet can be created for this tenant.
 * Throws QuotaExceededError (409) when the pet limit is reached.
 * A null limit (unlimited) always passes.
 *
 * @param tenantId - Tenant to check.
 */
export async function assertCanAddPet(tenantId: number): Promise<void> {
  const quota = await getEffectiveQuota(tenantId)
  if (quota.maxPets === null) return

  const current = await prisma.pet.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxPets) {
    throw new QuotaExceededError('pets', quota.maxPets, current)
  }
}

/**
 * Return a summary of the tenant's current usage vs quota.
 * Used by the subscription status endpoint.
 *
 * @param tenantId - Tenant whose status is being queried.
 */
export async function getStatus(tenantId: number) {
  const [quota, users, branches, owners, allPlans, tenant] = await Promise.all([
    getEffectiveQuota(tenantId),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.branch.count({ where: { tenantId, isActive: true } }),
    prisma.owner.count({ where: { tenantId } }),
    listPlans(),
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } }),
  ])

  return {
    quota,
    usage: { users, branches, owners },
    withinLimits: {
      users:    quota.maxUsers    === null || users    <= quota.maxUsers,
      branches: quota.maxBranches === null || branches <= quota.maxBranches,
      owners:   quota.maxOwners   === null || owners   <= quota.maxOwners,
    },
    plans: allPlans.filter(p => !p.isRetired),
    // Real plan assignment (Platform Console), not the legacy TenantSettings.planTier string.
    currentPlanKey: tenant?.plan?.key ?? null,
  }
}
