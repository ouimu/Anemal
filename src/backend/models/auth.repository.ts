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
  return prisma.user.findUnique({ where: { tenantId_username: { tenantId, username } } })
}

export function findUserById(tenantId: number, userId: number) {
  return prisma.user.findFirst({ where: { id: userId, tenantId } })
}

export function findBranchById(tenantId: number, branchId: number) {
  return prisma.branch.findFirst({ where: { id: branchId, tenantId, isActive: true } })
}

export function touchLastLogin(userId: number) {
  return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
}

/** Find a tenant by primary key (used by the refresh token flow for active-tenant check). */
export function findTenantById(tenantId: number) {
  return prisma.tenant.findUnique({ where: { id: tenantId } })
}
