// @db-agent reviewed — tenantId enforced on every query; 1-to-1 with tenant
// Phase 1.5: secret fields are AES-256-GCM encrypted before storage and
// masked on read; every changed field is written to settings_audit_log.

import * as settingsRepo from '../models/tenant-settings.repository'
import * as auditRepo from '../models/settings-audit.repository'
import type { SettingsAuditEntry } from '../models/settings-audit.repository'
import { encryptField, decryptField, maskSecret } from '../utils/encryption'
import { logger } from '../utils/logger'

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
  // Phase 1.5
  operatingHours?:      Record<string, { open: string; close: string } | null>
  lineOaToken?:         string
  smsProvider?:         string
  smsApiKey?:           string
  smsSenderName?:       string
  promptpayId?:         string
  paymentQrUrl?:        string
  gbprimepayPublic?:    string
  gbprimepaySecret?:    string
  labApiUrl?:           string
  labApiKey?:           string
}

export const SECRET_FIELDS = ['lineOaToken', 'smsApiKey', 'gbprimepaySecret', 'labApiKey'] as const
type SecretField = (typeof SECRET_FIELDS)[number]

function isSecretField(field: string): field is SecretField {
  return (SECRET_FIELDS as readonly string[]).includes(field)
}

// Decrypt with fallback — corrupted ciphertext returns '' and logs a warning
// rather than throwing a 500 that locks the tenant out of their settings panel.
function safeDecrypt(stored: string, field: string, tenantId: number): string {
  try { return decryptField(stored) }
  catch {
    logger.warn({ tenantId, field }, 'Corrupted ciphertext — treating as empty')
    return ''
  }
}

// Secrets masked for display — safe to return to clients.
export async function getSettings(tenantId: number) {
  const settings = await settingsRepo.getOrCreateSettings(tenantId)
  for (const field of SECRET_FIELDS) {
    const stored = settings[field]
    if (stored) settings[field] = maskSecret(safeDecrypt(stored, field, tenantId))
  }
  return settings
}

// Plaintext secrets — internal use only (LINE/SMS/lab dispatch). Never expose via API.
export async function getDecryptedSettings(tenantId: number) {
  const settings = await settingsRepo.getOrCreateSettings(tenantId)
  for (const field of SECRET_FIELDS) {
    const stored = settings[field]
    if (stored) settings[field] = safeDecrypt(stored, field, tenantId)
  }
  return settings
}

export async function updateSettings(tenantId: number, data: TenantSettingsInput, userId?: number) {
  const current = await settingsRepo.getOrCreateSettings(tenantId)

  const toWrite: Record<string, unknown> = {}
  const auditEntries: SettingsAuditEntry[] = []

  for (const [field, newValue] of Object.entries(data)) {
    if (newValue === undefined) continue
    const secret = isSecretField(field)
    // Clients echo masked secrets ("••••••••ab12") back on save — ignore them,
    // otherwise the mask itself would be encrypted and destroy the stored secret.
    if (secret && typeof newValue === 'string' && newValue.startsWith('••••')) continue
    const currentRaw = (current as Record<string, unknown>)[field]
    const currentPlain = secret && typeof currentRaw === 'string'
      ? safeDecrypt(currentRaw, field, tenantId)
      : currentRaw

    const changed = secret
      ? currentPlain !== newValue
      : JSON.stringify(currentRaw ?? null) !== JSON.stringify(newValue ?? null)
    if (!changed) continue

    toWrite[field] = secret ? encryptField(newValue as string) : newValue
    auditEntries.push({
      tenantId,
      changedBy: userId ?? null,
      tableName: 'tenant_settings',
      fieldName: field,
      oldValue: currentPlain == null ? null
        : secret ? maskSecret(String(currentPlain)) : JSON.stringify(currentPlain),
      newValue: secret ? maskSecret(String(newValue)) : JSON.stringify(newValue),
    })
  }

  if (Object.keys(toWrite).length === 0) return current
  if (userId !== undefined) toWrite.updatedBy = userId

  const updated = await settingsRepo.upsertSettingsWithAudit(
    tenantId,
    toWrite as TenantSettingsInput & { updatedBy?: number },
    auditEntries,
  )
  // Return with secrets masked, consistent with getSettings
  for (const field of SECRET_FIELDS) {
    const stored = (updated as Record<string, unknown>)[field]
    if (typeof stored === 'string' && stored) {
      ;(updated as Record<string, unknown>)[field] = maskSecret(safeDecrypt(stored, field, tenantId))
    }
  }
  return updated
}

// Updates the clinic name on the tenants table and writes an audit entry.
export async function updateClinicName(tenantId: number, name: string, userId?: number): Promise<void> {
  const old = await settingsRepo.getTenantName(tenantId)
  if (old?.name === name) return
  await settingsRepo.updateTenantName(tenantId, name)
  await auditRepo.createMany([{
    tenantId,
    changedBy: userId ?? null,
    tableName: 'tenant_settings',
    fieldName: 'name',
    oldValue:  old?.name ?? null,
    newValue:  name,
  }])
}
