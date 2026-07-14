/**
 * Secure password generation shared by the platform-plane clinic_admin
 * provisioning flows (CO-1 auto-create, CO-2 create, CO-5 reset).
 *
 * @module utils/password
 */
import crypto from 'crypto'

// Unambiguous alphabet: excludes 0/O, 1/l/I (brainstorm §3.4, Q-1).
const PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
const PASSWORD_LENGTH = 16

/**
 * Generate a 16-character cryptographically random password.
 *
 * Uses `crypto.randomBytes` (not `Math.random`) with an alphabet that
 * excludes visually ambiguous characters. Used by every password-provisioning
 * code path in the platform→clinic_admin identity flows (ADR-0015).
 */
export function generateSecurePassword(): string {
  const bytes = crypto.randomBytes(PASSWORD_LENGTH)
  let password = ''
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length]
  }
  return password
}
