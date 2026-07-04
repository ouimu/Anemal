/**
 * Test Suite: owner-idcard — ID card validation (Owner ID Card sub-project)
 * @qa-agent | Protocol: qa-protocols.md §3 (edge cases)
 */
import { createOwnerSchema, isValidThaiId } from '../services/owner.service'

describe('isValidThaiId — Thai national ID mod-11 checksum', () => {
  test('accepts a valid 13-digit Thai ID', () => {
    // 1-1234-56789-40-1 style: digit-by-digit weighted sum, mod 11, checksum on 13th digit.
    // 1101700230503 satisfies the mod-11 checksum: weighted sum of first 12 digits mod 11, per the algorithm below.
    expect(isValidThaiId('1101700230503')).toBe(true)
  })

  test('rejects a 13-digit number with a bad checksum digit', () => {
    expect(isValidThaiId('1101700230504')).toBe(false)
  })

  test('rejects a string that is not 13 digits', () => {
    expect(isValidThaiId('123456789')).toBe(false)
    expect(isValidThaiId('11017002305031')).toBe(false) // 14 digits
  })

  test('rejects non-digit characters', () => {
    expect(isValidThaiId('110170023050A')).toBe(false)
  })
})

describe('createOwnerSchema — idCardType/idCardNumber', () => {
  const base = { firstName: 'Jane', lastName: 'Doe', phone: '0812345678' }

  test('accepts a valid thai_id', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'thai_id', idCardNumber: '1101700230503' })
    expect(result.success).toBe(true)
  })

  test('rejects thai_id with invalid checksum', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'thai_id', idCardNumber: '1101700230504' })
    expect(result.success).toBe(false)
  })

  test('accepts a valid passport (6-20 alphanumeric)', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'passport', idCardNumber: 'AB123456' })
    expect(result.success).toBe(true)
  })

  test('rejects passport shorter than 6 chars', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'passport', idCardNumber: 'AB12' })
    expect(result.success).toBe(false)
  })

  test('rejects passport longer than 20 chars', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'passport', idCardNumber: 'A'.repeat(21) })
    expect(result.success).toBe(false)
  })

  test('rejects idCardType without idCardNumber (both-or-neither)', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardType: 'thai_id' })
    expect(result.success).toBe(false)
  })

  test('rejects idCardNumber without idCardType (both-or-neither)', () => {
    const result = createOwnerSchema.safeParse({ ...base, idCardNumber: '1101700230503' })
    expect(result.success).toBe(false)
  })

  test('accepts omitting both idCardType and idCardNumber', () => {
    const result = createOwnerSchema.safeParse(base)
    expect(result.success).toBe(true)
  })
})
