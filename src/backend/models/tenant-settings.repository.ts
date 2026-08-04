// Tenant-settings repository — Prisma access for tenant_settings (1-to-1 with tenant).

import type { Prisma } from '@prisma/client'
import prisma from '../config/db'
import type { TenantSettingsInput } from '../services/tenant-settings.service'
import type { SettingsAuditEntry } from './settings-audit.repository'

// Upsert guarantees a settings row always exists for the tenant. `client` defaults to
// the shared `prisma` instance but accepts a `Prisma.TransactionClient` so callers that
// need this read inside their own transaction (e.g. R3-HI-02 discharge+invoice) can
// pass `tx` — both satisfy the same delegate shape.
export function getOrCreateSettings(tenantId: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.tenantSettings.upsert({
    where:  { tenantId },
    update: {},
    create: { tenantId },
    include: { tenant: { select: { name: true, subdomain: true } } },
  })
}

export function getTenantName(tenantId: number) {
  return prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
}

export function updateTenantName(tenantId: number, name: string) {
  return prisma.tenant.update({ where: { id: tenantId }, data: { name } })
}

// Upsert + field-level audit rows in one transaction (Phase 1.5).
export async function upsertSettingsWithAudit(
  tenantId: number,
  data: TenantSettingsInput & { updatedBy?: number },
  auditEntries: SettingsAuditEntry[],
) {
  const [settings] = await prisma.$transaction([
    prisma.tenantSettings.upsert({
      where:  { tenantId },
      update: data,
      create: { tenantId, ...data },
    }),
    prisma.settingsAuditLog.createMany({ data: auditEntries }),
  ])
  return settings
}
