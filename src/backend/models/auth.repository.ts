// Auth repository — Prisma access for tenant + user resolution during login.

import prisma from '../config/db'

export function findTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findUnique({ where: { subdomain } })
}

export function findUserByTenantEmail(tenantId: number, email: string) {
  return prisma.user.findFirst({ where: { tenantId, email } })
}

/**
 * Look up a clinic user by their username within a tenant.
 * Uses the unique index `tenantId_username` added in D-1.
 *
 * @param tenantId - Tenant scope (required for isolation).
 * @param username - The user's login handle (3-20 chars, alphanumeric + underscore).
 */
export function findUserByTenantUsername(tenantId: number, username: string) {
  return prisma.user.findUnique({
    where: { tenantId_username: { tenantId, username } },
    include: { roleRef: { select: { key: true } } },
  })
}

export function findUserById(tenantId: number, userId: number) {
  return prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: { roleRef: { select: { key: true } } },
  })
}

export function findBranchById(tenantId: number, branchId: number) {
  return prisma.branch.findFirst({ where: { id: branchId, tenantId, isActive: true } })
}

/** All active branches for a tenant — used to populate admin's branch list at login step 1. */
export function findActiveBranchesByTenant(tenantId: number) {
  return prisma.branch.findMany({
    where:   { tenantId, isActive: true },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

// HI-02: scoped `updateMany` instead of a bare `update({where:{id}})` — closes the
// check/use gap between the tenant-scoped user lookup and this write.
export function touchLastLogin(tenantId: number, userId: number) {
  return prisma.user.updateMany({ where: { id: userId, tenantId }, data: { lastLoginAt: new Date() } })
}

/** Find a tenant by primary key (used by the refresh token flow for active-tenant check). */
export function findTenantById(tenantId: number) {
  return prisma.tenant.findUnique({ where: { id: tenantId } })
}

/** Active-status-only user lookup — used by the OAuth callback re-entitlement check (Grill N-9). */
export function findUserActiveStatus(tenantId: number, userId: number) {
  return prisma.user.findFirst({ where: { id: userId, tenantId }, select: { isActive: true } })
}

/** Active-status-only tenant lookup — used by the OAuth callback re-entitlement check (Grill N-9). */
export function findTenantActiveStatus(tenantId: number) {
  return prisma.tenant.findUnique({ where: { id: tenantId }, select: { isActive: true } })
}
