// src/backend/controllers/oauth-google.controller.ts
// Public callback for the Google Drive OAuth connect flow (ADR-0023,
// sub-project 2). No JWT/permission middleware — the signed, single-use
// `state` param IS the trust boundary. Every failure path redirects; this
// route never throws to the global error handler.
import { Request, Response } from 'express'
import prisma from '../config/db'
import { verifyOAuthState } from '../utils/oauth-state'
import { consumeNonce } from '../models/oauth-connect-nonce.repository'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { resolvePermissions } from '../services/permission.service'
import { encryptField, decryptField } from '../utils/encryption'
import { exchangeCodeForTokens, revokeGoogleToken, createGoogleDriveClient } from '../config/google-drive-client'
import { bootstrapTenantFolders } from '../config/google-drive-driver'
import { logger } from '../utils/logger'

const DEFAULT_ERROR_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173'

function googleOAuthRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/google/callback`
}

export async function handleGoogleOAuthCallback(req: Request, res: Response): Promise<void> {
  const query = req.query as { code?: string; state?: string; error?: string }

  // Consent-denied is the only branch reachable before state verification —
  // Google omits `code` and `state` alike on a denial, so there is nothing
  // signed to check yet, and nothing has been read or persisted either way.
  if (query.error) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=google_consent_denied`)
    return
  }
  if (!query.state) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=google_state_invalid`)
    return
  }

  // Grill N-7: on an invalid/expired signature the embedded origin cannot be
  // trusted either (same reasoning as BA G-2a) — this branch NEVER reads out
  // of `state`, always the fixed server-configured default.
  const verified = verifyOAuthState(query.state)
  if (!verified) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=google_state_invalid`)
    return
  }

  // Grill N-3: atomic single-statement consume, BEFORE the code exchange.
  // M-7: provider-matched — a 'onedrive'-minted nonce must not verify here.
  const nonceOk = await consumeNonce(verified.nonce, 'google')
  if (!nonceOk) {
    res.redirect(`${verified.origin}/settings/storage?error=google_state_replayed`)
    return
  }

  if (!query.code) {
    res.redirect(`${verified.origin}/settings/storage?error=google_consent_denied`)
    return
  }

  // Grill N-9: re-verify the initiating user/tenant are still active and the
  // permission still held, immediately before persisting — the callback
  // never passes through authMiddleware's normal checks (it has no JWT).
  const [user, tenant] = await Promise.all([
    prisma.user.findFirst({ where: { id: verified.userId, tenantId: verified.tenantId }, select: { isActive: true } }),
    prisma.tenant.findUnique({ where: { id: verified.tenantId }, select: { isActive: true } }),
  ])
  const perms = user?.isActive !== false && tenant?.isActive !== false
    ? await resolvePermissions(verified.userId, verified.tenantId)
    : new Set<string>()
  const stillEntitled = !!user && user.isActive !== false && !!tenant && tenant.isActive !== false && perms.has('clinic.integrations.edit')
  if (!stillEntitled) {
    res.redirect(`${verified.origin}/settings/storage?error=google_not_authorized`)
    return
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.redirect(`${verified.origin}/settings/storage?error=google_not_configured`)
    return
  }

  try {
    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, redirectUri: googleOAuthRedirectUri(), code: query.code })

    // Grill N-10: best-effort revoke of a PREVIOUS token before overwrite —
    // reconnecting without disconnecting first would otherwise leave a
    // stale-but-still-valid grant alive at Google indefinitely.
    const previous = await tenantStorageConfigRepo.getStorageConfig(verified.tenantId)
    if (previous?.googleRefreshTokenEncrypted) {
      await revokeGoogleToken(decryptField(previous.googleRefreshTokenEncrypted)).catch((revokeErr) => {
        logger.warn({ tenantId: verified.tenantId, revokeErr: String(revokeErr) }, 'Google Drive reconnect: best-effort revoke of previous token failed')
      })
    }

    const client = createGoogleDriveClient({ clientId, clientSecret, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
    const folders = await bootstrapTenantFolders(verified.tenantId, client)

    // A stale SMB credential must not survive a switch to google_drive, same
    // invariant as BA G-4b for the reverse direction (disconnect nulls
    // google* columns) — connecting Drive nulls any smb* columns instead.
    //
    // M-10 REVERSE DIRECTION (round-2 grill finding 1, risk OD-11 — High):
    // also null oneDrive* here. Nulling these columns is OneDrive's ONLY
    // kill mechanism (M-3 — Microsoft provides no token-revocation endpoint),
    // so if a clinic connects Google Drive over an existing provider='onedrive'
    // row, the previously-connected OneDrive refresh token must not survive
    // silently on the new google_drive row. Unconditional (nulls even when
    // the row wasn't onedrive) — harmless no-op in that case, keeps this
    // branch simple and matches the existing smb* nulling style.
    await tenantStorageConfigRepo.upsertStorageConfig(verified.tenantId, {
      provider: 'google_drive',
      smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null,
      oneDriveAccessTokenEncrypted: null, oneDriveRefreshTokenEncrypted: null,
      oneDriveTokenExpiresAt: null, oneDriveAccountIdHash: null,
      googleAccessTokenEncrypted:  encryptField(tokens.accessToken),
      googleRefreshTokenEncrypted: encryptField(tokens.refreshToken),
      googleRootFolderId:  folders.rootFolderId,
      googleEmrFolderId:   folders.emrFolderId,
      googlePhotoFolderId: folders.photoFolderId,
    })

    await auditRepo.createMany([{
      tenantId: verified.tenantId, changedBy: verified.userId, tableName: 'tenant_storage_config',
      fieldName: 'provider', oldValue: previous?.provider ?? 'local', newValue: 'google_drive',
    }])

    res.redirect(`${verified.origin}/settings/storage/connecting`)
  } catch (err) {
    logger.warn({ tenantId: verified.tenantId, err: String(err) }, 'Google Drive OAuth callback failed')
    res.redirect(`${verified.origin}/settings/storage?error=google_connect_failed`)
  }
}
