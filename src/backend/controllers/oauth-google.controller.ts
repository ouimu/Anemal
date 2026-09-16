// src/backend/controllers/oauth-google.controller.ts
// Public callback for the Google Drive OAuth connect flow (ADR-0023,
// sub-project 2). No JWT/permission middleware — the signed, single-use
// `state` param IS the trust boundary. Every failure path redirects; this
// route never throws to the global error handler.
import { Request, Response } from 'express'
import { runOAuthCallbackGuard } from '../services/oauth-callback-guard.service'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
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
  // Grill N-3/N-7/N-9, M-7: state signature, single-use provider-matched
  // nonce, `code` present, and re-verified user/tenant entitlement — shared
  // with the OneDrive callback via runOAuthCallbackGuard.
  const guard = await runOAuthCallbackGuard(query, 'google', 'clinic.integrations.edit', DEFAULT_ERROR_ORIGIN)
  if (!guard.ok) {
    res.redirect(guard.redirectUrl)
    return
  }
  const { verified, code } = guard

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.redirect(`${verified.origin}/settings/storage?error=google_not_configured`)
    return
  }

  try {
    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, redirectUri: googleOAuthRedirectUri(), code })

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
