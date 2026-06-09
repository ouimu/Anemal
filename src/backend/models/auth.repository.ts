// Auth repository — Prisma access for tenant + user resolution during login.

import prisma from '../config/db'

export function findTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findUnique({ where: { subdomain } })
}

export function findUserByTenantEmail(tenantId: number, email: string) {
  return prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } })
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
