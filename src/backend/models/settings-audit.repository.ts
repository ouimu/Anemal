// Settings-audit repository — field-level change trail for tenant_settings
// and system_settings. tenantId NULL = platform-global (system) change.

import prisma from '../config/db'

export interface SettingsAuditEntry {
  tenantId:  number | null
  changedBy: number | null
  tableName: 'tenant_settings' | 'system_settings'
  fieldName: string
  oldValue:  string | null
  newValue:  string | null
}

export function createMany(entries: SettingsAuditEntry[]) {
  if (entries.length === 0) return Promise.resolve({ count: 0 })
  return prisma.settingsAuditLog.createMany({ data: entries })
}

export interface SettingsAuditListParams {
  tenantId?:  number
  tableName?: string
  skip?:      number
  take?:      number
}

export function list(params: SettingsAuditListParams) {
  const { tenantId, tableName, skip = 0, take = 50 } = params
  return prisma.settingsAuditLog.findMany({
    where: {
      ...(tenantId  !== undefined ? { tenantId } : {}),
      ...(tableName !== undefined ? { tableName } : {}),
    },
    orderBy: { changedAt: 'desc' },
    skip,
    take,
  })
}
