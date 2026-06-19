// System-settings service — platform-global config (super-admin only).
// Values with isSecret=true are encrypted at rest and masked on read;
// every change is written to settings_audit_log with tenantId NULL.

import * as systemRepo from '../models/system-settings.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { encryptField, decryptField, maskSecret } from '../utils/encryption'
import { NotFoundError } from '../utils/errors'
import { logger } from '../utils/logger'

// Corrupted ciphertext returns '' and logs a warning instead of throwing a 500.
function safeDecrypt(stored: string, key: string): string {
  try { return decryptField(stored) }
  catch {
    logger.warn({ key }, 'Corrupted system-setting ciphertext — treating as empty')
    return ''
  }
}

function maskRow<T extends { key: string; value: string; isSecret: boolean }>(row: T): T {
  if (row.isSecret && row.value) {
    return { ...row, value: maskSecret(safeDecrypt(row.value, row.key)) }
  }
  return row
}

export async function getAll() {
  const rows = await systemRepo.getAll()
  return rows.map(maskRow)
}

export async function getByKey(key: string) {
  const row = await systemRepo.getByKey(key)
  if (!row) throw new NotFoundError('System setting')
  return maskRow(row)
}

// Plaintext value — internal use only (e.g. SMTP dispatch). Never expose via API.
export async function getDecryptedValue(key: string): Promise<string> {
  const row = await systemRepo.getByKey(key)
  if (!row) throw new NotFoundError('System setting')
  return row.isSecret ? safeDecrypt(row.value, key) : row.value
}

export async function updateByKey(key: string, value: string, userId?: number) {
  const current = await systemRepo.getByKey(key)
  if (!current) throw new NotFoundError('System setting')

  // Clients echo masked secrets back on save — skip to avoid encrypting the mask.
  if (current.isSecret && value.startsWith('••••')) return maskRow(current)

  const currentPlain = current.isSecret && current.value ? safeDecrypt(current.value, key) : current.value
  if (currentPlain === value) return maskRow(current)

  const stored = current.isSecret ? encryptField(value) : value
  const updated = await systemRepo.updateByKey(key, stored, userId ?? null)

  await auditRepo.createMany([{
    tenantId:  null,
    changedBy: userId ?? null,
    tableName: 'system_settings',
    fieldName: key,
    oldValue:  current.isSecret ? (currentPlain ? maskSecret(currentPlain) : null) : currentPlain,
    newValue:  current.isSecret ? maskSecret(value) : value,
  }])

  return maskRow(updated)
}
