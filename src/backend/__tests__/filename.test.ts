import { sanitizeFilename, decodeMulterFilename } from '../utils/filename'

describe('sanitizeFilename', () => {
  test('keeps safe characters unchanged', () => {
    expect(sanitizeFilename('lab-result_2026.pdf')).toBe('lab-result_2026.pdf')
  })

  test('replaces path-unsafe characters with underscores', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd')
  })

  test('caps length at 100 characters', () => {
    const long = 'a'.repeat(150) + '.pdf'
    expect(sanitizeFilename(long).length).toBe(100)
  })
})

describe('decodeMulterFilename', () => {
  test('recovers a UTF-8 Thai filename that multer decoded as latin1', () => {
    const realName = 'คู่มือ.pdf'
    // Simulate what multer hands us: the UTF-8 bytes read back as latin1.
    const asMulterSeesIt = Buffer.from(realName, 'utf8').toString('latin1')
    expect(decodeMulterFilename(asMulterSeesIt)).toBe(realName)
  })

  test('leaves a pure-ASCII filename unchanged', () => {
    expect(decodeMulterFilename('lab-result_2026.pdf')).toBe('lab-result_2026.pdf')
  })
})
