/**
 * Permission resolution service with in-memory cache.
 *
 * Resolves the full permission set for a user within a tenant by querying
 * the user_roles → roles → role_permissions chain, then caching the result
 * for CACHE_TTL_MS milliseconds. Call invalidatePermCache() whenever a
 * user's role assignment or a role's permission set changes.
 *
 * @module permission.service
 */

import prisma from '../config/db'

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
