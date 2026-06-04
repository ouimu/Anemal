// Tenant-settings repository — Prisma access for tenant_settings (1-to-1 with tenant).

import prisma from '../config/db'
import type { TenantSettingsInput } from '../services/tenantSettingsService'

// Upsert guarantees a settings row always exists for the tenant.
export function getOrCreateSettings(tenantId: number) {
  return prisma.tenantSettings.upsert({
    where:  { tenantId },
    update: {},
    create: { tenantId },
    include: { tenant: { select: { name: true, subdomain: true } } },
  })
}

export function upsertSettings(tenantId: number, data: TenantSettingsInput) {
  return prisma.tenantSettings.upsert({
    where:  { tenantId },
    update: data,
    create: { tenantId, ...data },
  })
}

export function updateTenantName(tenantId: number, name: string) {
  return prisma.tenant.update({ where: { id: tenantId }, data: { name } })
}
