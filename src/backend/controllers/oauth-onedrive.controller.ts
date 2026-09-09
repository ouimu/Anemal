// src/backend/controllers/oauth-onedrive.controller.ts
// Public callback for the OneDrive OAuth connect flow (ADR-0023, sub-project
// 3). No JWT/permission middleware — the signed, single-use `state` param IS
// the trust boundary, reused verbatim from the Google flow (I-8..I-12) with
// one M-7 hardening (provider-matched nonce consume) and one genuine
// Microsoft-specific divergence: Microsoft INCLUDES `state` on its
// error=access_denied/consent_required redirects (round-2 grill finding 8),
// where Google omits it on denial — a naive mirror of the Google callback
// would fall back to the fixed default origin on these branches instead of
// the correct tenant origin, which this controller explicitly avoids.
import { Request, Response } from 'express'
import { verifyOAuthState } from '../utils/oauth-state'
import { consumeNonce } from '../models/oauth-connect-nonce.repository'
import { isStillEntitled } from '../services/auth.service'
import * as tenantStorageConfigRepo from '../models/tenant-storage-config.repository'
import * as auditRepo from '../models/settings-audit.repository'
import { encryptField } from '../utils/encryption'
import { hashAccountId } from '../utils/account-id-hash'
import { exchangeCodeForTokens, createOneDriveClient } from '../config/onedrive-client'
import { logger } from '../utils/logger'

const DEFAULT_ERROR_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173'

function onedriveOAuthRedirectUri(): string {
  return process.env.ONEDRIVE_OAUTH_REDIRECT_URI || `${process.env.BACKEND_URL || 'http://localhost:4000'}/oauth/onedrive/callback`
}

export async function handleOneDriveOAuthCallback(req: Request, res: Response): Promise<void> {
  const query = req.query as { code?: string; state?: string; error?: string }

  // Round-2 grill finding 8: unlike Google, Microsoft INCLUDES `state` on
  // error=access_denied/consent_required. Verify it first when present so
  // the redirect lands on the correct TENANT origin, not the fixed default
  // — a naive Google-mirror (redirect to DEFAULT_ERROR_ORIGIN whenever
  // query.error is set) would be wrong here.
  if (query.error) {
    if (query.state) {
      const verifiedOnError = verifyOAuthState(query.state)
      if (verifiedOnError) {
        const errorCode = query.error === 'consent_required' ? 'onedrive_consent_required' : 'onedrive_consent_denied'
        res.redirect(`${verifiedOnError.origin}/settings/storage?error=${errorCode}`)
        return
      }
    }
    // No state, or state didn't verify — nothing trustworthy to redirect to but the fixed default (I-11).
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=onedrive_consent_denied`)
    return
  }
  if (!query.state) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=onedrive_state_invalid`)
    return
  }

  // I-11/grill N-7: on an invalid/expired signature, NEVER read the origin
  // out of `state` — fixed default only.
  const verified = verifyOAuthState(query.state)
  if (!verified) {
    res.redirect(`${DEFAULT_ERROR_ORIGIN}/settings/storage?error=onedrive_state_invalid`)
    return
  }

  // M-7: atomic, PROVIDER-MATCHED consume — a 'google'-minted nonce must
  // fail here even with a structurally valid signature.
  const nonceOk = await consumeNonce(verified.nonce, 'onedrive')
  if (!nonceOk) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_state_replayed`)
    return
  }

  if (!query.code) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_consent_denied`)
    return
  }

  // N-9/I-12: re-verify user/tenant active + permission still held, right before persisting.
  const stillEntitled = await isStillEntitled(verified.tenantId, verified.userId, 'clinic.integrations.edit')
  if (!stillEntitled) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_not_authorized`)
    return
  }

  const clientId = process.env.ONEDRIVE_OAUTH_CLIENT_ID
  const clientSecret = process.env.ONEDRIVE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_not_configured`)
    return
  }

  try {
    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, redirectUri: onedriveOAuthRedirectUri(), code: query.code })

    const client = createOneDriveClient({ clientId, clientSecret, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })

    // Probes the app folder once — creates it server-side on first access
    // and proves the grant actually works before committing to it. Also the
    // OD-13-verified source of the account-id hash (M-11).
    const { accountId } = await client.ping()
    const oneDriveAccountIdHash = hashAccountId(accountId)

    await client.ensureFolder('', `tenant-${verified.tenantId}`)
    await client.ensureFolder(`tenant-${verified.tenantId}`, 'emr')
    await client.ensureFolder(`tenant-${verified.tenantId}`, 'photo')

    const previous = await tenantStorageConfigRepo.getStorageConfig(verified.tenantId)

    // M-10 FORWARD DIRECTION: connecting OneDrive nulls smb*, google*, AND
    // googleAccountIdHash in the same write — no stale foreign-provider
    // secret/hash survives at rest on a row whose provider is now onedrive.
    await tenantStorageConfigRepo.upsertStorageConfig(verified.tenantId, {
      provider: 'onedrive',
      smbHost: null, smbShare: null, smbUsername: null, smbPasswordEncrypted: null,
      googleAccessTokenEncrypted: null, googleRefreshTokenEncrypted: null,
      googleRootFolderId: null, googleEmrFolderId: null, googlePhotoFolderId: null, googleAccountIdHash: null,
      oneDriveAccessTokenEncrypted:  encryptField(tokens.accessToken),
      oneDriveRefreshTokenEncrypted: encryptField(tokens.refreshToken),
      oneDriveTokenExpiresAt:        tokens.expiresAt,
      oneDriveAccountIdHash,
    })

    await auditRepo.createMany([{
      tenantId: verified.tenantId, changedBy: verified.userId, tableName: 'tenant_storage_config',
      fieldName: 'provider', oldValue: previous?.provider ?? 'local', newValue: 'onedrive',
    }])

    res.redirect(`${verified.origin}/settings/storage/connecting`)
  } catch (err) {
    logger.warn({ tenantId: verified.tenantId, err: String(err) }, 'OneDrive OAuth callback failed')
    res.redirect(`${verified.origin}/settings/storage?error=onedrive_connect_failed`)
  }
}
