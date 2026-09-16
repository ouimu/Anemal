// Shared guard for the storage-provider OAuth connect callbacks
// (oauth-google.controller.ts, oauth-onedrive.controller.ts — ADR-0023).
//
// Both callbacks run the same five checks in the same order, differing only
// in the provider name embedded in the nonce/error-code, and each redirect
// origin choice (DEFAULT_ERROR_ORIGIN for the two "state" failures below,
// verified.origin for everything after) matches the original inline code in
// both controllers exactly. What is deliberately NOT shared: the
// `query.error` branch (Google and Microsoft diverge — see
// oauth-onedrive.controller.ts's own comment on why), and the OAuth
// client-credential check + token exchange that follows a successful guard
// (fully provider-specific).
import { verifyOAuthState, OAuthState } from '../utils/oauth-state'
import { consumeNonce } from '../models/oauth-connect-nonce.repository'
import { isStillEntitled } from './auth.service'

export type OAuthCallbackGuardResult =
  | { ok: true; verified: OAuthState; code: string }
  | { ok: false; redirectUrl: string }

/**
 * Grill N-3/N-7/N-9, M-7: verify the signed `state`, atomically consume its
 * single-use nonce (provider-matched), require `code` to be present, and
 * re-verify the initiating user/tenant are still active and still hold
 * `permissionCode` — immediately before the caller persists tokens. These
 * callbacks never pass through authMiddleware (they have no JWT), so this
 * is their only entitlement check.
 */
export async function runOAuthCallbackGuard(
  query: { code?: string; state?: string },
  provider: string,
  permissionCode: string,
  defaultErrorOrigin: string,
): Promise<OAuthCallbackGuardResult> {
  if (!query.state) {
    return { ok: false, redirectUrl: `${defaultErrorOrigin}/settings/storage?error=${provider}_state_invalid` }
  }

  const verified = verifyOAuthState(query.state)
  if (!verified) {
    return { ok: false, redirectUrl: `${defaultErrorOrigin}/settings/storage?error=${provider}_state_invalid` }
  }

  const nonceOk = await consumeNonce(verified.nonce, provider)
  if (!nonceOk) {
    return { ok: false, redirectUrl: `${verified.origin}/settings/storage?error=${provider}_state_replayed` }
  }

  if (!query.code) {
    return { ok: false, redirectUrl: `${verified.origin}/settings/storage?error=${provider}_consent_denied` }
  }

  const stillEntitled = await isStillEntitled(verified.tenantId, verified.userId, permissionCode)
  if (!stillEntitled) {
    return { ok: false, redirectUrl: `${verified.origin}/settings/storage?error=${provider}_not_authorized` }
  }

  return { ok: true, verified, code: query.code }
}
