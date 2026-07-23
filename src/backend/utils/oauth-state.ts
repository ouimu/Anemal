// src/backend/utils/oauth-state.ts
// Signed, single-use-nonce `state` param for the Google Drive OAuth connect
// flow (ADR-0023, sub-project 2). Signed with an HKDF-derived key, NOT the
// raw SETTINGS_ENCRYPTION_KEY directly (grill N-5) — keeps OAuth-state
// signing cryptographically separate from the AES-256-GCM data-at-rest key;
// a bug in one path can't touch the other, and the two rotate independently.
import crypto from 'crypto'
import { config } from '../config/env'

export interface OAuthState {
  tenantId: number
  userId:   number
  origin:   string
  nonce:    string
  iat:      number // unix seconds
}

const STATE_TTL_SECONDS = 10 * 60
const HKDF_INFO = 'oauth-state-hmac-v1'

function deriveSigningKey(): Buffer {
  const masterKey = Buffer.from(config.settingsEncryptionKey, 'hex')
  return Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(HKDF_INFO), 32))
}

export function signOAuthState(payload: Omit<OAuthState, 'iat'>): string {
  const state: OAuthState = { ...payload, iat: Math.floor(Date.now() / 1000) }
  const body = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', deriveSigningKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyOAuthState(token: string): OAuthState | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (!body || !sig) return null

  const expectedSig = crypto.createHmac('sha256', deriveSigningKey()).update(body).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

  let state: OAuthState
  try {
    state = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (typeof state.iat !== 'number') return null

  const ageSeconds = Math.floor(Date.now() / 1000) - state.iat
  if (ageSeconds < 0 || ageSeconds > STATE_TTL_SECONDS) return null

  return state
}
