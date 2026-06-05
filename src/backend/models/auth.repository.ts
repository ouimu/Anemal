// Auth repository — Prisma access for tenant + user resolution during login.

import prisma from '../config/db'

export function findTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findUnique({ where: { subdomain } })
}

export function findUserByTenantEmail(tenantId: number, email: string) {
  return prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } })
}
