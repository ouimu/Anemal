import { generateSecurePassword } from '../../utils/password'

describe('generateSecurePassword', () => {
  it('returns a 16-character string', () => {
    expect(generateSecurePassword()).toHaveLength(16)
  })

  it('excludes visually ambiguous characters (0, O, 1, l, I)', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateSecurePassword()
      expect(pw).not.toMatch(/[0O1lI]/)
    }
  })

  it('generates 1000 passwords with no duplicates (RNG wiring sanity check)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      seen.add(generateSecurePassword())
    }
    expect(seen.size).toBe(1000)
  })

  it('uses crypto.randomBytes, not Math.random (spy check)', () => {
    const crypto = require('crypto')
    const spy = jest.spyOn(crypto, 'randomBytes')
    generateSecurePassword()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
