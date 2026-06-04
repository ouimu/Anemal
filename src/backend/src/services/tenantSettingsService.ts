// @db-agent reviewed — tenantId enforced on every query; 1-to-1 with tenant
import prisma from '../config/db'

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
  // Upsert ensures a row always exists
  const row = await prisma.tenantSettings.upsert({
    where:  { tenantId },
    update: {},
    create: { tenantId },
    include: { tenant: { select: { name: true, subdomain: true } } },
  })
  return row
}

export async function updateSettings(tenantId: number, data: TenantSettingsInput) {
  return prisma.tenantSettings.upsert({
    where:  { tenantId },
    update: data,
    create: { tenantId, ...data },
  })
}

export async function updateClinicName(tenantId: number, name: string) {
  return prisma.tenant.update({ where: { id: tenantId }, data: { name } })
}
