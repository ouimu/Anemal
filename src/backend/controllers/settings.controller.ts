// Settings controller (Phase 1.5-B, Tasks S2.1 + S2.3) — thin handlers only.
// tenantId/userId ALWAYS come from req.context (verified JWT), never the body;
// every schema is .strict() so a client-supplied tenantId is a 400 (TC-S002).

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as settingsSvc from '../services/tenant-settings.service'
import * as prefsSvc from '../services/user-preferences.service'
import * as connTest from '../services/connection-test.service'

const TIME_HHMM = /^\d{2}:\d{2}$/

// ─── Zod schemas (one per settings section) ──────────────────────────────────

export const clinicProfileSchema = z.object({
  name:    z.string().trim().min(1).max(255).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  address: z.string().trim().max(1000).optional(),
  phone:   z.string().trim().max(50).optional(),
  email:   z.string().email().optional().or(z.literal('')),
  taxId:   z.string().trim().max(50).optional(),
  website: z.string().trim().max(255).optional(),
}).strict()

export const notificationsSchema = z.object({
  lineOaToken:          z.string().trim().max(500).optional(),
  lineRemindersEnabled: z.boolean().optional(),
  smsProvider:          z.enum(['thaibulksms', 'thsms']).or(z.literal('')).optional(),
  smsApiKey:            z.string().trim().max(500).optional(),
  smsSenderName:        z.string().trim().max(50).optional(),
  smsRemindersEnabled:  z.boolean().optional(),
}).strict()

export const notificationsTestSchema = z.object({
  channel:     z.enum(['line', 'sms']),
  lineOaToken: z.string().trim().max(500).optional(),
  smsProvider: z.enum(['thaibulksms', 'thsms']).optional(),
  smsApiKey:   z.string().trim().max(500).optional(),
}).strict()

export const paymentSchema = z.object({
  promptpayId:      z.string().trim().max(50).optional(),
  paymentQrUrl:     z.string().url().optional().or(z.literal('')),
  gbprimepayPublic: z.string().trim().max(500).optional(),
  gbprimepaySecret: z.string().trim().max(500).optional(),
}).strict()

export const integrationsSchema = z.object({
  labApiUrl: z.string().url().optional().or(z.literal('')),
  labApiKey: z.string().trim().max(500).optional(),
}).strict()

export const integrationsTestSchema = z.object({
  labApiUrl: z.string().url().optional(),
  labApiKey: z.string().trim().max(500).optional(),
}).strict()

const dayHoursSchema = z.object({
  open:  z.string().regex(TIME_HHMM),
  close: z.string().regex(TIME_HHMM),
}).strict().nullable()

export const hoursSchema = z.object({
  operatingHours: z.object({
    mon: dayHoursSchema, tue: dayHoursSchema, wed: dayHoursSchema,
    thu: dayHoursSchema, fri: dayHoursSchema, sat: dayHoursSchema,
    sun: dayHoursSchema,
  }).strict(),
}).strict()

export const personalPrefsSchema = z.object({
  language:            z.enum(['th', 'en']).optional(),
  defaultCalendarView: z.enum(['day', 'week', 'month']).optional(),
}).strict()

// ─── S2.1 Clinic settings ────────────────────────────────────────────────────

export async function getClinicSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await settingsSvc.getSettings(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// Shared by all PUT section endpoints — the zod schema upstream decides which
// fields are allowed, the service encrypts secrets and writes the audit trail.
function updateSection(req: Request, res: Response, next: NextFunction): void {
  const { tenantId, userId } = req.context!
  const { name, ...rest } = req.body as { name?: string } & settingsSvc.TenantSettingsInput
  const run = async (): Promise<void> => {
    if (name) await settingsSvc.updateClinicName(tenantId, name)
    const data = await settingsSvc.updateSettings(tenantId, rest, userId)
    res.json({ success: true, data })
  }
  run().catch(next)
}

export const updateClinicProfile = updateSection
export const updateNotifications = updateSection
export const updatePayment       = updateSection
export const updateIntegrations  = updateSection
export const updateHours         = updateSection

// ─── S2.1 Stateless test endpoints (never persist anything) ──────────────────

export async function testNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId } = req.context!
    const body = req.body as z.infer<typeof notificationsTestSchema>
    let result: connTest.ConnectionTestResult
    if (body.channel === 'line') {
      const token = body.lineOaToken ?? (await settingsSvc.getDecryptedSettings(tenantId)).lineOaToken ?? ''
      result = await connTest.testLine(token)
    } else {
      const stored = body.smsProvider && body.smsApiKey ? null : await settingsSvc.getDecryptedSettings(tenantId)
      result = await connTest.testSms(
        body.smsProvider ?? stored?.smsProvider ?? '',
        body.smsApiKey ?? stored?.smsApiKey ?? '',
      )
    }
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

export async function testIntegrations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId } = req.context!
    const body = req.body as z.infer<typeof integrationsTestSchema>
    const stored = body.labApiUrl && body.labApiKey ? null : await settingsSvc.getDecryptedSettings(tenantId)
    const result = await connTest.testLab(
      body.labApiUrl ?? stored?.labApiUrl ?? '',
      body.labApiKey ?? stored?.labApiKey ?? '',
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// ─── S2.3 Personal preferences (all roles) ───────────────────────────────────

export async function getPersonalPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    const data = await prefsSvc.getPreferences(tenantId, userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updatePersonalPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    const data = await prefsSvc.updatePreferences(tenantId, userId, req.body as prefsSvc.PersonalPreferencesInput)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
