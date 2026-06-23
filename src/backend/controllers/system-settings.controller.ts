// System-settings controller (Phase 1.5-B, minimal Task S2.2) — superadmin only.
// Platform-global key/value config; secrets are masked by the service layer.

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as systemSvc from '../services/system-settings.service'
import * as connTest from '../services/connection-test.service'

export const updateSystemSettingSchema = z.object({
  value: z.string().max(2000),
}).strict()

/**
 * Maps each PlatformSettings field name to its DB key in system_settings.
 * Only fields that have a seeded DB row are included.
 */
const SETTINGS_KEY_MAP: Readonly<Record<string, string>> = {
  appName:         'app_name',
  baseUrl:         'app_base_url',
  maintenanceMode: 'maintenance_mode',
  trialDays:       'default_trial_days',
  smtpHost:        'smtp_host',
  smtpPort:        'smtp_port',
  smtpUser:        'smtp_user',
  smtpFrom:        'smtp_from_email',
} as const

/** Zod schema for PUT / aggregate body — all fields optional, partial update. */
export const updateAllSettingsSchema = z.object({
  appName:         z.string().max(200).optional(),
  baseUrl:         z.string().url().max(500).optional(),
  maintenanceMode: z.boolean().optional(),
  trialDays:       z.number().int().min(0).max(3650).optional(),
  smtpHost:        z.string().max(253).optional(),
  smtpPort:        z.number().int().min(1).max(65535).optional(),
  smtpUser:        z.string().max(200).optional(),
  smtpFrom:        z.string().email().max(200).optional(),
  featureFlags:    z.record(z.boolean()).optional(),
}).strict()

/** Coerces a raw string value from system_settings to the typed field. */
function coerceSettingValue(field: string, raw: string): string | number | boolean | null {
  if (raw === '' || raw === null) return null
  if (field === 'maintenanceMode') return raw === 'true'
  if (field === 'trialDays' || field === 'smtpPort') {
    const n = Number(raw)
    return Number.isNaN(n) ? null : n
  }
  return raw
}

/** Normalized PlatformSettings object shape returned to API callers. */
export interface PlatformSettingsResponse {
  appName:         string | null
  baseUrl:         string | null
  maintenanceMode: boolean | null
  trialDays:       number | null
  smtpHost:        string | null
  smtpPort:        number | null
  smtpUser:        string | null
  smtpFrom:        string | null
  featureFlags:    Record<string, boolean>
}

export async function getAllSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = await systemSvc.getAll()

    // Build reverse map: db_key → field name (e.g. 'app_name' → 'appName')
    const reverseMap: Record<string, string> = {}
    for (const [field, dbKey] of Object.entries(SETTINGS_KEY_MAP)) {
      reverseMap[dbKey] = field
    }

    // Reduce rows into named object
    const partial: Partial<PlatformSettingsResponse> = { featureFlags: {} }
    for (const row of rows) {
      const field = reverseMap[row.key]
      if (!field) continue
      const coerced = coerceSettingValue(field, row.value)
      ;(partial as Record<string, unknown>)[field] = coerced
    }

    // Fill any missing fields with null
    const data: PlatformSettingsResponse = {
      appName:         partial.appName         ?? null,
      baseUrl:         partial.baseUrl         ?? null,
      maintenanceMode: partial.maintenanceMode ?? null,
      trialDays:       partial.trialDays       ?? null,
      smtpHost:        partial.smtpHost        ?? null,
      smtpPort:        partial.smtpPort        ?? null,
      smtpUser:        partial.smtpUser        ?? null,
      smtpFrom:        partial.smtpFrom        ?? null,
      featureFlags:    partial.featureFlags    ?? {},
    }

    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getSettingByKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await systemSvc.getByKey(req.params.key)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateSettingByKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { value } = req.body as z.infer<typeof updateSystemSettingSchema>
    const data = await systemSvc.updateByKey(req.params.key, value, req.context!.userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

/**
 * PUT /platform/settings
 * Accepts a partial PlatformSettings object and updates each present field.
 * Fields not included in the payload are left unchanged.
 * Returns { success: true, data: { updated: number } }.
 */
/** Coerces a typed settings field value to the string stored in system_settings rows. */
function coerceToString(raw: string | boolean | number): string {
  if (typeof raw === 'boolean') return raw ? 'true' : 'false'
  if (typeof raw === 'number')  return String(raw)
  return raw
}

/**
 * PUT /platform/settings
 * Accepts a partial PlatformSettings object and updates each present field.
 * Fields not included in the payload are left unchanged.
 * Returns { success: true, data: { updated: number } }.
 */
export async function updateAllSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as z.infer<typeof updateAllSettingsSchema>
    const userId = req.context!.userId

    let updated = 0
    for (const [field, dbKey] of Object.entries(SETTINGS_KEY_MAP)) {
      // featureFlags is not in SETTINGS_KEY_MAP so raw is always string | boolean | number | undefined
      const raw = (body as Record<string, string | boolean | number | undefined>)[field]
      if (raw === undefined) continue

      await systemSvc.updateByKey(dbKey, coerceToString(raw), userId)
      updated++
    }

    res.json({ success: true, data: { updated } })
  } catch (err) { next(err) }
}

// Stateless TCP reachability check against the stored SMTP host/port.
export async function testSmtp(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const host = await systemSvc.getDecryptedValue('smtp_host')
    const port = parseInt(await systemSvc.getDecryptedValue('smtp_port'), 10)
    const data = await connTest.testSmtp(host, Number.isNaN(port) ? 587 : port)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
