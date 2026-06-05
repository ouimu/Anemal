// @db-agent reviewed — tenantId enforced on every query; 1-to-1 with tenant
import * as settingsRepo from '../models/tenant-settings.repository'

export interface TenantSettingsInput {
  logoUrl?:             string
  phone?:               string
  email?:               string
  website?:             string
  address?:             string
  taxId?:               string
  defaultSlotMinutes?:  number
  workStartTime?:       string
  workEndTime?:         string
  smsRemindersEnabled?: boolean
  lineRemindersEnabled?:boolean
}

export async function getSettings(tenantId: number) {
  return settingsRepo.getOrCreateSettings(tenantId)
}

export async function updateSettings(tenantId: number, data: TenantSettingsInput) {
  return settingsRepo.upsertSettings(tenantId, data)
}

export async function updateClinicName(tenantId: number, name: string) {
  return settingsRepo.updateTenantName(tenantId, name)
}
