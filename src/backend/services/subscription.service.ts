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

import { Prisma } from '@prisma/client'
import { AppError } from '../utils/errors'
import prisma from '../config/db'
import { listPlans } from './platform-plans.service'

/**
 * R3-HI-04: the recommended DB-level fix in the Codex review (`SELECT ... FOR UPDATE` on
 * `tenant_quotas WHERE resource = ...`) does not work against this schema — `TenantQuota`
 * has one row per tenant with resources as columns (`maxBranches`, `maxUsers`, ...), not a
 * `resource` column, and the row is optional (many tenants have none, falling back to
 * `plan`/constants) — `FOR UPDATE` on zero rows locks nothing. `pg_advisory_xact_lock` is
 * used instead: it's a pure serialization point keyed on tenant+resource, so it binds
 * whether or not a `tenant_quotas` row exists. See BA finding R3-HI-04 / disagreement D1.
 */
type TxClient = Prisma.TransactionClient
type Client = TxClient | typeof prisma
type QuotaResource = 'branches' | 'users' | 'owners' | 'pets'

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
async function getEffectiveQuotaWith(client: Client, tenantId: number): Promise<EffectiveTenantQuota> {
  const tenant = await client.tenant.findUnique({
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

export function getEffectiveQuota(tenantId: number): Promise<EffectiveTenantQuota> {
  return getEffectiveQuotaWith(prisma, tenantId)
}

/**
 * Assert that a new active user can be created for this tenant.
 * Throws QuotaExceededError (409) when the user limit is reached.
 *
 * @param tenantId - Tenant to check.
 */
async function assertCanAddUserWith(client: Client, tenantId: number): Promise<void> {
  const quota = await getEffectiveQuotaWith(client, tenantId)
  if (quota.maxUsers === null) return

  const current = await client.user.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxUsers) {
    throw new QuotaExceededError('users', quota.maxUsers, current)
  }
}

export function assertCanAddUser(tenantId: number): Promise<void> {
  return assertCanAddUserWith(prisma, tenantId)
}

/**
 * Assert that a new active branch can be created for this tenant.
 * Throws QuotaExceededError (409) when the branch limit is reached.
 *
 * @param tenantId - Tenant to check.
 */
async function assertCanAddBranchWith(client: Client, tenantId: number): Promise<void> {
  const quota = await getEffectiveQuotaWith(client, tenantId)
  if (quota.maxBranches === null) return

  const current = await client.branch.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxBranches) {
    throw new QuotaExceededError('branches', quota.maxBranches, current)
  }
}

export function assertCanAddBranch(tenantId: number): Promise<void> {
  return assertCanAddBranchWith(prisma, tenantId)
}

/**
 * Assert that a new owner (pet owner / customer) can be created for this tenant.
 * Throws QuotaExceededError (409) when the owner limit is reached.
 * A null limit (unlimited) always passes.
 *
 * @param tenantId - Tenant to check.
 */
async function assertCanAddOwnerWith(client: Client, tenantId: number): Promise<void> {
  const quota = await getEffectiveQuotaWith(client, tenantId)
  if (quota.maxOwners === null) return

  const current = await client.owner.count({ where: { tenantId } })
  if (current >= quota.maxOwners) {
    throw new QuotaExceededError('owners', quota.maxOwners, current)
  }
}

export function assertCanAddOwner(tenantId: number): Promise<void> {
  return assertCanAddOwnerWith(prisma, tenantId)
}

/**
 * Assert that a new active pet can be created for this tenant.
 * Throws QuotaExceededError (409) when the pet limit is reached.
 * A null limit (unlimited) always passes.
 *
 * @param tenantId - Tenant to check.
 */
async function assertCanAddPetWith(client: Client, tenantId: number): Promise<void> {
  const quota = await getEffectiveQuotaWith(client, tenantId)
  if (quota.maxPets === null) return

  const current = await client.pet.count({ where: { tenantId, isActive: true } })
  if (current >= quota.maxPets) {
    throw new QuotaExceededError('pets', quota.maxPets, current)
  }
}

export function assertCanAddPet(tenantId: number): Promise<void> {
  return assertCanAddPetWith(prisma, tenantId)
}

const QUOTA_ASSERTS: Record<QuotaResource, (client: Client, tenantId: number) => Promise<void>> = {
  branches: assertCanAddBranchWith,
  users:    assertCanAddUserWith,
  owners:   assertCanAddOwnerWith,
  pets:     assertCanAddPetWith,
}

/**
 * R3-HI-04: run `create` inside a transaction serialized by a `pg_advisory_xact_lock`
 * keyed on tenant+resource, with the quota re-checked INSIDE that lock. Two concurrent
 * creates that both read "1 under the limit" outside the lock can no longer both pass —
 * the second transaction blocks on the lock until the first commits, then re-checks the
 * (now-updated) count and correctly loses the race with `QuotaExceededError` (409).
 */
export async function createWithQuotaLock<T>(
  tenantId: number, resource: QuotaResource, create: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const lockKey = `quota:${tenantId}:${resource}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
    await QUOTA_ASSERTS[resource](tx, tenantId)
    return create(tx)
  })
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
