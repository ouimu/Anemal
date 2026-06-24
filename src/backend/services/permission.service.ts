/**
 * Permission resolution service with in-memory cache.
 *
 * Resolves the full permission set for a user within a tenant by querying
 * the user_roles → roles → role_permissions chain, then caching the result
 * for CACHE_TTL_MS milliseconds. Call invalidatePermCache() whenever a
 * user's role assignment or a role's permission set changes.
 *
 * Platform-plane permission resolution uses a static role→permission map
 * (no DB join tables exist for the platform plane; access is governed by
 * the PlatformRole enum: platform_super_admin | platform_support).
 *
 * @module permission.service
 */

import prisma from '../config/db'

// ─── Platform permission catalogue ───────────────────────────────────────────

/** All platform permission codes, grouped by capability area. */
const ALL_PLATFORM_PERMISSIONS: ReadonlyArray<string> = [
  'platform.customers.view',
  'platform.customers.manage',
  'platform.plans.view',
  'platform.plans.manage',
  'platform.quotas.manage',
  'platform.provisioning.manage',
  'platform.settings.view',
  'platform.settings.edit',
  'platform.users.manage',
  'platform.usage.view',
  'platform.audit.view',
  // D-2-05: company type management
  'platform.company_types.view',
  'platform.company_types.manage',
]

/** Read-only subset granted to platform_support. */
const PLATFORM_SUPPORT_PERMISSIONS: ReadonlyArray<string> = [
  'platform.customers.view',
  'platform.plans.view',
  'platform.settings.view',
  'platform.usage.view',
  'platform.audit.view',
  // D-2-05: support can view but not manage company types
  'platform.company_types.view',
]

/** Static map from PlatformRole enum value to its permission set. */
const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  platform_super_admin: ALL_PLATFORM_PERMISSIONS,
  platform_support:     PLATFORM_SUPPORT_PERMISSIONS,
}

/**
 * Resolve the full set of platform permission codes for a given platform role.
 *
 * This is a pure static lookup — the platform plane uses a role enum rather
 * than join tables, so no DB query is required.
 *
 * @param role - The PlatformRole enum value from the JWT (`platform_super_admin` | `platform_support`).
 * @returns A Set of permission code strings, or an empty Set for unknown roles.
 */
export function resolvePlatformPermissions(role: string): Set<string> {
  const codes = PLATFORM_ROLE_PERMISSIONS[role] ?? []
  return new Set(codes)
}

// ─── Clinic permission resolution ────────────────────────────────────────────

/** A single cache entry: resolved permission codes + expiry timestamp. */
interface CacheEntry {
  perms:     Set<string>
  expiresAt: number
}

/** In-memory permission cache keyed by `"tenantId:userId"`. */
const permCache = new Map<string, CacheEntry>()

/** Cache time-to-live: 5 minutes. */
const CACHE_TTL_MS = 5 * 60 * 1_000

/**
 * Build the cache key for a tenant + user pair.
 *
 * @param tenantId - The tenant's numeric ID.
 * @param userId   - The user's numeric ID.
 */
function cacheKey(tenantId: number, userId: number): string {
  return `${tenantId}:${userId}`
}

/**
 * Resolve the full set of permission codes for a user within a tenant.
 *
 * Results are cached for CACHE_TTL_MS. Subsequent calls within the TTL
 * return the cached Set directly without hitting the database.
 *
 * @param userId   - The user whose permissions to resolve.
 * @param tenantId - The tenant scope; all DB queries are filtered by this.
 * @returns A Set of permission code strings (e.g. `"appointments.view"`).
 */
export async function resolvePermissions(
  userId:   number,
  tenantId: number,
): Promise<Set<string>> {
  const key = cacheKey(tenantId, userId)
  const now = Date.now()
  const cached = permCache.get(key)
  if (cached && cached.expiresAt > now) return cached.perms

  const userRoles = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: {
      role: {
        include: {
          permissions: { select: { permissionCode: true } },
        },
      },
    },
  })

  const perms = new Set<string>()
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      perms.add(rp.permissionCode)
    }
  }

  permCache.set(key, { perms, expiresAt: now + CACHE_TTL_MS })
  return perms
}

/**
 * Invalidate the cached permission set for a single user + tenant pair.
 *
 * Call this whenever a user's role assignment changes or a role's permission
 * set is updated to force re-resolution on the next request.
 *
 * @param userId   - The user whose cache entry to remove.
 * @param tenantId - The tenant scope of the cache entry.
 */
export function invalidatePermCache(userId: number, tenantId: number): void {
  permCache.delete(cacheKey(tenantId, userId))
}

/**
 * Evict all entries from the in-memory permission cache.
 *
 * Intended for use in tests or after a bulk role/permission migration.
 */
export function clearPermCache(): void {
  permCache.clear()
}

/**
 * Compute the maximum `permVersion` across all roles assigned to a user.
 *
 * `permVersion` is bumped on the `ClinicRole` row whenever its permission
 * set changes. Callers (e.g. JWT middleware) can compare this value against
 * the version embedded in the token to detect stale tokens without a full
 * permission re-fetch.
 *
 * @param userId   - The user to inspect.
 * @param tenantId - The tenant scope; all DB queries are filtered by this.
 * @returns The highest `permVersion` found, or `1` if the user has no roles.
 */
export async function computePermSetVersion(
  userId:   number,
  tenantId: number,
): Promise<number> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: { role: { select: { permVersion: true } } },
  })
  if (userRoles.length === 0) return 1
  return Math.max(...userRoles.map(ur => ur.role.permVersion))
}
