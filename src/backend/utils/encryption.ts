// AES-256-GCM field encryption for settings secrets (Phase 1.5 S1.4)
// Stored format: enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
// The version prefix enables future key rotation; the enc: prefix lets
// decryptField pass legacy plaintext through unchanged.

import crypto from 'crypto'
import { config } from '../config/env'
import { AppError } from './errors'

const PREFIX = 'enc:v1:'
const IV_BYTES = 12
const KEY_REGEX = /^[0-9a-f]{64}$/i

function getKey(): Buffer {
  const hex = config.settingsEncryptionKey
  if (!KEY_REGEX.test(hex)) {
    throw new Error('Invalid SETTINGS_ENCRYPTION_KEY: expected 64 hex chars (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX)
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptField(stored: string): string {
  if (!isEncrypted(stored)) return stored // legacy plaintext passthrough
  const parts = stored.slice(PREFIX.length).split(':')
  if (parts.length !== 3) {
    throw new AppError(500, 'Malformed encrypted value', 'DECRYPTION_FAILED')
  }
  try {
    const [iv, tag, ciphertext] = parts.map(p => Buffer.from(p, 'base64'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key or tampered ciphertext — never leak crypto internals to callers
    throw new AppError(500, 'Failed to decrypt secret field', 'DECRYPTION_FAILED')
  }
}

// "••••••••ab12" — last 4 chars only; short values fully masked
export function maskSecret(value: string): string {
  if (value.length <= 4) return '••••••••'
  return `••••••••${value.slice(-4)}`
}
