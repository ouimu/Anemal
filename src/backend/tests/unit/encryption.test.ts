// Phase 1.5 S1.4 — encryption utility unit tests (TC-S007)
import { encryptField, decryptField, maskSecret, isEncrypted } from '../../utils/encryption'

describe('encryption utility (AES-256-GCM)', () => {
  it('encrypt → decrypt roundtrip returns original value', () => {
    const plaintext = 'line-oa-channel-token-abc123'
    const stored = encryptField(plaintext)
    expect(stored).not.toBe(plaintext)
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(decryptField(stored)).toBe(plaintext)
  })

  it('produces different ciphertext for the same plaintext (unique IV)', () => {
    const a = encryptField('same-secret')
    const b = encryptField('same-secret')
    expect(a).not.toBe(b)
    expect(decryptField(a)).toBe('same-secret')
    expect(decryptField(b)).toBe('same-secret')
  })

  it('handles unicode and empty-ish values', () => {
    const thai = 'รหัสลับ-ก๙๑'
    expect(decryptField(encryptField(thai))).toBe(thai)
  })

  it('throws on tampered ciphertext (auth tag failure)', () => {
    const stored = encryptField('secret-value')
    const parts = stored.split(':')
    // flip a char in the ciphertext segment
    const last = parts[parts.length - 1]
    parts[parts.length - 1] = last.slice(0, -2) + (last.endsWith('A') ? 'B' : 'A') + last.slice(-1)
    expect(() => decryptField(parts.join(':'))).toThrow('Failed to decrypt')
  })

  it('throws on malformed encrypted value', () => {
    expect(() => decryptField('enc:v1:only-one-part')).toThrow('Malformed')
  })

  it('passes legacy plaintext through decryptField unchanged', () => {
    expect(decryptField('plain-old-value')).toBe('plain-old-value')
  })

  it('isEncrypted detects the enc:v1 prefix', () => {
    expect(isEncrypted(encryptField('x'))).toBe(true)
    expect(isEncrypted('plain')).toBe(false)
  })

  describe('maskSecret', () => {
    it('shows only the last 4 characters', () => {
      expect(maskSecret('sk-test-abcd1234')).toBe('••••••••1234')
    })
    it('fully masks short values', () => {
      expect(maskSecret('ab12')).toBe('••••••••')
      expect(maskSecret('x')).toBe('••••••••')
    })
  })
})
