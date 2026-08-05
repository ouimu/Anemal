// Unit tests for PromptPay QR code generation (QR-01 through QR-04 + error cases)
// @qa-agent — tests the real promptpay-qr payload logic without mocking the library

import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'

// Mock DB and settings repository for service-level tests
jest.mock('../../config/db', () => ({
  invoice: {
    findFirst: jest.fn(),
  },
}))
jest.mock('../../models/tenant-settings.repository', () => ({
  getOrCreateSettings: jest.fn(),
}))

import prisma from '../../config/db'
import { getOrCreateSettings } from '../../models/tenant-settings.repository'
import { generatePromptpayQr } from '../../services/promptpay-qr.service'

const mockFindFirst = prisma.invoice.findFirst as jest.Mock
const mockGetOrCreateSettings = getOrCreateSettings as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Library-level tests (no mocks needed) ──────────────────────────────────

describe('QR-01 — payload contains PromptPay AID (A000000677010111)', () => {
  it('generated payload includes the PromptPay GUID', () => {
    const payload = generatePayload('0812345678', { amount: 100 })
    expect(payload).toContain('A000000677010111')
  })
})

describe('QR-02 — payload contains correctly formatted phone number', () => {
  it('phone 0812345678 is formatted as 0066812345678 in payload', () => {
    const payload = generatePayload('0812345678', { amount: 100 })
    expect(payload).toContain('0066812345678')
  })
})

describe('QR-03 — payload contains amount formatted as toFixed(2)', () => {
  it('amount 100 is represented as "100.00" in payload', () => {
    const payload = generatePayload('0812345678', { amount: 100 })
    expect(payload).toContain('100.00')
  })
})

describe('QR-04 — payload ends with CRC-16 checksum tag', () => {
  it('payload ends with 6304 followed by exactly 4 uppercase hex chars', () => {
    const payload = generatePayload('0812345678', { amount: 100 })
    expect(payload).toMatch(/6304[0-9A-F]{4}$/)
  })
})

describe('QR-04b — QRCode.toDataURL produces a valid base64 PNG data URI', () => {
  it('resolves to a string starting with data:image/png;base64,', async () => {
    const payload = generatePayload('0812345678', { amount: 100 })
    const dataUrl = await QRCode.toDataURL(payload)
    expect(typeof dataUrl).toBe('string')
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(dataUrl.length).toBeGreaterThan(100)
  })
})

// ── Service-level tests (prisma + settings mocked) ─────────────────────────

describe('Error — generatePromptpayQr throws 422 when promptpayId is null', () => {
  it('throws AppError with statusCode 422 when settings.promptpayId is null', async () => {
    mockFindFirst.mockResolvedValue({
      totalAmount: 150,
      paymentStatus: 'pending',
    })
    mockGetOrCreateSettings.mockResolvedValue({
      promptpayId: null,
    })

    await expect(generatePromptpayQr(1, null, 42)).rejects.toMatchObject({ statusCode: 422 })
  })
})

describe('Error — generatePromptpayQr throws 404 when invoice not found', () => {
  it('throws AppError with statusCode 404 when prisma.invoice.findFirst returns null', async () => {
    mockFindFirst.mockResolvedValue(null)

    await expect(generatePromptpayQr(1, null, 999)).rejects.toMatchObject({ statusCode: 404 })
  })
})
