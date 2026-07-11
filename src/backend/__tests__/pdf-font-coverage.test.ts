// Guards against ever re-shipping a Thai-only subset font (T-3a.1, ADR-0013 D1).
// Loads the shipped TTF directly with fontkit (already a transitive dep of
// pdfkit — resolved from node_modules, never add it to package.json) and
// asserts glyph coverage for every character class the invoice/prescription
// PDF templates render: Latin letters, digits, the Baht sign, Thai script,
// and the punctuation used in the templates (pdf.service.ts).
import path from 'path'

// No @types/fontkit is installed; type the two calls we use rather than
// pulling in `any` everywhere.
const fontkit = require('fontkit') as {
  openSync: (filePath: string) => { hasGlyphForCodePoint: (codePoint: number) => boolean }
}

const FONT_PATH = path.join(__dirname, '../assets/fonts/NotoSansThai-Regular.ttf')

describe('NotoSansThai-Regular.ttf — full Thai+Latin coverage (ADR-0013 D1)', () => {
  const font = fontkit.openSync(FONT_PATH)

  const required: Array<[string, string]> = [
    ['Latin A', 'A'],
    ['Latin z', 'z'],
    ['Digit 0', '0'],
    ['Digit 9', '9'],
    ['Baht sign', '฿'],
    ['Thai KO KAI (ก)', 'ก'],
    ['Thai THANTHAKHAT (์)', '์'],
    ['Space', ' '],
    ['Period', '.'],
    ['Slash', '/'],
  ]

  it.each(required)('has a glyph for %s', (_label, ch) => {
    const codePoint = ch.codePointAt(0)!
    expect(font.hasGlyphForCodePoint(codePoint)).toBe(true)
  })
})
