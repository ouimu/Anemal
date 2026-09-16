// Settings controller (Phase 1.5-B, Tasks S2.1 + S2.3) — thin handlers only.
// tenantId/userId ALWAYS come from req.context (verified JWT), never the body;
// every schema is .strict() so a client-supplied tenantId is a 400 (TC-S002).

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as settingsSvc from '../services/tenant-settings.service'
import * as prefsSvc from '../services/user-preferences.service'
import * as connTest from '../services/connection-test.service'
import * as storageConfigSvc from '../services/storage-config.service'
import { signOAuthState } from '../utils/oauth-state'
import { createNonce } from '../models/oauth-connect-nonce.repository'
import { resolvePermissions } from '../services/permission.service'

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// ─── Zod schemas (one per settings section) ──────────────────────────────────

export const clinicProfileSchema = z.object({
  name:    z.string().trim().min(1).max(255).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  address: z.string().trim().max(1000).optional(),
  phone:   z.string().trim().max(50).optional(),
  email:   z.string().email().optional().or(z.literal('')),
  taxId:   z.string().trim().max(50).optional(),
  website: z.string().trim().max(255).optional(),
  vatMode: z.enum(['none', 'exclusive', 'inclusive']).optional(),
  vatRate: z.number().min(0).max(100).optional(),
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

export const storageConfigSchema = z.object({
  provider:          z.enum(['local', 'custom_path']),
  smbHost:           z.string().trim().min(1).max(255).optional(),
  smbShare:          z.string().trim().min(1).max(500).optional(),
  smbUsername:       z.string().trim().min(1).max(255).optional(),
  smbPassword:       z.string().min(1).max(500).optional(),
  confirmBaseChange: z.boolean().optional(),
}).strict().refine(
  (data) => data.provider !== 'custom_path' || (data.smbHost && data.smbShare && data.smbUsername),
  { message: 'smbHost, smbShare, and smbUsername are required when provider is custom_path' },
)

export const personalPrefsSchema = z.object({
  language:            z.enum(['th', 'en']).optional(),
  defaultCalendarView: z.enum(['day', 'week', 'month']).optional(),
  theme:               z.enum(['light', 'dark']).optional(),
}).strict()

// ─── S2.1 Clinic settings ────────────────────────────────────────────────────

export async function getClinicSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await settingsSvc.getSettings(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// Dedicated handler for the clinic profile — handles `name` separately because
// it lives on the tenants table (not tenant_settings) and needs its own audit entry.
export async function updateClinicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    const { name, ...rest } = req.body as z.infer<typeof clinicProfileSchema>
    if (name !== undefined) await settingsSvc.updateClinicName(tenantId, name, userId)
    const data = await settingsSvc.updateSettings(tenantId, rest as settingsSvc.TenantSettingsInput, userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// Shared handler for section PUT endpoints (notifications, payment, integrations, hours).
// Each section schema is .strict() and does not include `name`, so no special handling needed.
async function updateSection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    const data = await settingsSvc.updateSettings(tenantId, req.body as settingsSvc.TenantSettingsInput, userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

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
      const stored = body.smsProvider !== undefined && body.smsApiKey !== undefined
        ? null
        : await settingsSvc.getDecryptedSettings(tenantId)
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
    const stored = body.labApiUrl !== undefined && body.labApiKey !== undefined
      ? null
      : await settingsSvc.getDecryptedSettings(tenantId)
    const result = await connTest.testLab(
      body.labApiUrl ?? stored?.labApiUrl ?? '',
      body.labApiKey ?? stored?.labApiKey ?? '',
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// ─── Storage config (ADR-0023) ────────────────────────────────────────────────

export async function getStorageConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    const perms = await resolvePermissions(userId, tenantId)
    const data = await storageConfigSvc.getStorageConfigForDisplay(tenantId, perms.has('clinic.integrations.edit'))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateStorageConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId, userId } = req.context!
    await storageConfigSvc.updateStorageConfig(tenantId, userId, req.body as storageConfigSvc.UpdateStorageConfigInput)
    const perms = await resolvePermissions(userId, tenantId)
    const data = await storageConfigSvc.getStorageConfigForDisplay(tenantId, perms.has('clinic.integrations.edit'))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

/**
 * BA finding G-2a: the redirect origin embedded in `state` is derived
 * SERVER-SIDE from the tenant's own record — never from a client
 * header/param/Referer, even though the value ends up signed. This
 * deployment does not yet route the frontend by per-tenant subdomain, so
 * FRONTEND_URL_PATTERN is an opt-in hook for when it does; until then every
 * tenant resolves to the single configured frontend origin — still
 * server-derived, never client-supplied.
 */
function deriveTenantFrontendOrigin(subdomain: string): string {
  const pattern = process.env.FRONTEND_URL_PATTERN // e.g. 'https://{subdomain}.anemal.app'
  if (pattern) return pattern.replace('{subdomain}', subdomain)
  return process.env.FRONTEND_URL || 'http://localhost:5173'
}

function googleOAuthRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/google/callback`
}

export async function googleAuthorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    // Grill N-6: checked lazily at request time, not at boot (would brick
    // every deployment not using Drive) — a clean 503 instead of letting
    // the admin land on Google's own confusing invalid_client error page.
    if (!clientId || !clientSecret) {
      res.status(503).json({ success: false, code: 'GOOGLE_OAUTH_NOT_CONFIGURED', error: 'Google Drive connection is not configured on this server' })
      return
    }

    const { tenantId, userId } = req.context!
    const tenant = await settingsSvc.getTenantSubdomain(tenantId)
    if (!tenant) { res.status(404).json({ success: false, error: 'Tenant not found' }); return }

    const rawNonce = await createNonce({ tenantId, userId, provider: 'google', expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) })
    const origin = deriveTenantFrontendOrigin(tenant.subdomain)
    const state = signOAuthState({ tenantId, userId, origin, nonce: rawNonce })

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  googleOAuthRedirectUri(),
      response_type: 'code',
      access_type:   'offline',
      // prompt=consent guarantees a fresh refresh token on EVERY connect,
      // not just the first ever — access_type=offline alone does not
      // reliably re-issue one on a second consent after a prior disconnect.
      prompt: 'consent',
      scope:  GOOGLE_DRIVE_SCOPE,
      state,
    })
    res.json({ success: true, data: { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` } })
  } catch (err) { next(err) }
}

const ONEDRIVE_SCOPE = 'offline_access Files.ReadWrite.AppFolder'

function onedriveOAuthRedirectUri(): string {
  return process.env.ONEDRIVE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/onedrive/callback`
}

export async function onedriveAuthorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clientId = process.env.ONEDRIVE_OAUTH_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
    // I-13/M-8: checked lazily at request time, never at boot.
    if (!clientId || !clientSecret) {
      res.status(503).json({ success: false, code: 'ONEDRIVE_OAUTH_NOT_CONFIGURED', error: 'OneDrive connection is not configured on this server' })
      return
    }

    const { tenantId, userId } = req.context!
    const tenant = await settingsSvc.getTenantSubdomain(tenantId)
    if (!tenant) { res.status(404).json({ success: false, error: 'Tenant not found' }); return }

    const rawNonce = await createNonce({ tenantId, userId, provider: 'onedrive', expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) })
    const origin = deriveTenantFrontendOrigin(tenant.subdomain)
    const state = signOAuthState({ tenantId, userId, origin, nonce: rawNonce })

    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  onedriveOAuthRedirectUri(),
      response_type: 'code',
      // M-1: no prompt=consent needed — Microsoft re-issues a refresh token
      // on every authorization with offline_access consented, unlike
      // Google. prompt=select_account instead, so a multi-account admin
      // explicitly picks (relevant given Q1 = both personal and work/school).
      prompt: 'select_account',
      scope:  ONEDRIVE_SCOPE,
      state,
    })
    // M-1: audience resolves to 'common' per Q1's decision (both account
    // types) — a single constant, not per-tenant configurable.
    res.json({ success: true, data: { url: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}` } })
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
