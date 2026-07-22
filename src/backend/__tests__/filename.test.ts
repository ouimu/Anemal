import { sanitizeFilename } from '../utils/filename'

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
