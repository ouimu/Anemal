// src/frontend/src/__tests__/ClinicBilling.characterization.test.tsx
//
// Phase 7 / Lane D — Gate 0 characterization tests for ClinicBilling.tsx.
// ADDITIVE ONLY: this file locks down CURRENT behaviour of the default-export
// ClinicBilling component. docs/superpowers/plans/2026-09-16-phase7-god-components-arch-audit.md
// §1 rates its coverage verdict NONE — every existing test in ClinicBilling.test.tsx
// targets already-extracted named exports (calcVat, SuccessModal, ReceiptModal,
// PaymentHistoryTab), never the 415-line default export itself. ClinicBilling.test.tsx
// is untouched here. This is the safety net for §2.4's upcoming computeTotals
// extraction and loyalty-redeem call-site de-duplication — money-handling code
// (cart, discount, loyalty redemption, VAT, tender/change, PromptPay, invoice
// creation) with zero rendered coverage before this file.
//
// Same harness convention as the other three Gate 0 files (ClinicInpatient /
// ClinicPets / ClinicEMR .characterization.test.tsx): real component mount,
// real `api` mock (no wholesale react-query mock), QueryClientProvider wrapper.
//
// Cart rows have no accessible name/label on their qty/price <input>s, so tests
// scope queries to the row via `descriptionInput.parentElement` (the row's own
// flex div — see ClinicBilling.tsx's cart-row JSX) rather than relying on
// document-wide getByRole, which would collide with the discount and cash-
// tendered number inputs rendered in the same screen.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getMock = vi.fn()
const postMock = vi.fn()
const putMock = vi.fn()

vi.mock('../utils/api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...(args as [string, unknown?])),
    post: (...args: unknown[]) => postMock(...(args as [string, unknown])),
    put: (...args: unknown[]) => putMock(...(args as [string, unknown])),
  },
}))

import ClinicBilling from '../views/clinic/ClinicBilling'
import type { Invoice } from '../hooks/useInvoices'

// ─── Fixtures ───────────────────────────────────────────────────────────────
const petResult = { petId: 1, petName: 'Milo', ownerId: 10, ownerName: 'Ann Lee', phone: '0899999999' }

let clinicSettings: { vatMode: string; vatRate: string } = { vatMode: 'exclusive', vatRate: '7' }
let loyaltyBalance: { ownerId: number; points: number; membershipTier: string } | null =
  { ownerId: 10, points: 500, membershipTier: 'silver' }
let recordsForPet: Array<{ id: number; createdAt: string; assessment: string | null }> = []
let recordDetails: Record<number, { prescriptions: Array<{ quantity: string; drug: { name: string; unitPrice: string | null } }> }> = {}
let products: Array<{ id: number; name: string; unitPrice: string; stockQuantity: string; unit: string }> = []

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 900, invoiceNo: 'INV-2026-09-0001', petId: 1, medicalRecordId: null,
    issuedAt: '2026-09-17T09:00:00.000Z', subtotal: '1000.00', discount: '0.00',
    discountReason: null, taxRate: '7', taxAmount: '70.00', totalAmount: '1070.00',
    paymentStatus: 'pending', paymentMethod: null, paidAt: null, notes: null,
    items: [{ id: 1, description: 'Item', itemType: 'service', quantity: '1', unitPrice: '1000.00', totalPrice: '1000.00' }],
    pet: { id: 1, name: 'Milo', owner: { firstName: 'Ann', lastName: 'Lee', phone: '0899999999' } },
    ...overrides,
  }
}

function defaultGetImpl(url: string, config?: { params?: Record<string, unknown> }) {
  if (url === '/api/settings/clinic') return Promise.resolve({ data: { data: clinicSettings } })
  if (url === '/api/loyalty/owners/10') return Promise.resolve({ data: { data: loyaltyBalance } })
  if (url === '/api/search') {
    const q = (config?.params?.q as string | undefined)?.toLowerCase() ?? ''
    return Promise.resolve({ data: { data: q.includes('milo') ? [petResult] : [] } })
  }
  if (url === '/api/medical-records') return Promise.resolve({ data: { data: recordsForPet } })
  const recMatch = url.match(/^\/api\/medical-records\/(\d+)$/)
  if (recMatch) {
    const id = Number(recMatch[1])
    return Promise.resolve({ data: { data: recordDetails[id] ?? { prescriptions: [] } } })
  }
  if (url === '/api/products') return Promise.resolve({ data: { data: { products, total: products.length, page: 1, limit: 20 } } })
  // NOTE (pinned quirk): every other GET in this file unwraps via `r.data.data`,
  // but ClinicBilling.tsx:80 reads the QR payload as `r.data.dataUrl` — one level
  // shallower than the standard envelope. Reproduced exactly here.
  if (/^\/api\/invoices\/\d+\/promptpay-qr$/.test(url)) {
    return Promise.resolve({ data: { dataUrl: 'data:image/png;base64,QR' } })
  }
  return Promise.resolve({ data: { data: null } })
}

beforeEach(() => {
  getMock.mockReset(); postMock.mockReset(); putMock.mockReset()
  clinicSettings = { vatMode: 'exclusive', vatRate: '7' }
  loyaltyBalance = { ownerId: 10, points: 500, membershipTier: 'silver' }
  recordsForPet = []
  recordDetails = {}
  products = [{ id: 5, name: 'Flea Shampoo', unitPrice: '150.00', stockQuantity: '20', unit: 'bottle' }]
  getMock.mockImplementation(defaultGetImpl)
  postMock.mockImplementation((url: string) => {
    if (url === '/api/invoices') return Promise.resolve({ data: { data: makeInvoice() } })
    if (url === '/api/loyalty/redeem') return Promise.resolve({ data: { success: true } })
    return Promise.resolve({ data: { data: null } })
  })
  putMock.mockImplementation((url: string) => {
    const m = url.match(/^\/api\/invoices\/(\d+)\/payment$/)
    if (m) return Promise.resolve({ data: { data: makeInvoice({ id: Number(m[1]), paymentStatus: 'paid' }) } })
    return Promise.resolve({ data: { data: null } })
  })
})

function renderBilling() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><ClinicBilling /></QueryClientProvider>)
}

async function selectMilo() {
  await userEvent.type(screen.getByPlaceholderText(/search pet/i), 'Milo')
  await userEvent.click(await screen.findByText('Milo'))
}

/** Returns the cart row's own container div, scoping qty/price/remove queries
 *  away from the discount and cash-tendered inputs rendered elsewhere on screen. */
function cartRowOf(descriptionInput: HTMLElement) {
  return descriptionInput.parentElement as HTMLElement
}

function discountInput() {
  return screen.getByText('Discount (฿)').parentElement!.querySelector('input') as HTMLInputElement
}

/** The "Total due" row's own value — distinct from a single cart row's line
 *  total or the Subtotal row, which display the identical formatted amount
 *  whenever the cart holds exactly one line and/or VAT is zero. Scoping like
 *  this (rather than a page-wide getByText) avoids "multiple elements found"
 *  false failures that have nothing to do with the behaviour under test. */
function totalDueValue(): string {
  return screen.getByText('Total due').nextElementSibling?.textContent ?? ''
}

function subtotalValue(): string {
  const label = screen.getByText((content) => content.startsWith('Subtotal'))
  return label.nextElementSibling?.textContent ?? ''
}

// ─── 1. Cart assembly ───────────────────────────────────────────────────────
describe('ClinicBilling — cart assembly (Gate 0)', () => {
  it('adding a service line creates an editable row whose description/qty/price edits update its line total', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))

    const descInput = screen.getByPlaceholderText('Description')
    const row = cartRowOf(descInput)
    const [qtyInput, priceInput] = within(row).getAllByRole('spinbutton')

    await userEvent.type(descInput, 'Nail trim')
    await userEvent.clear(qtyInput); await userEvent.type(qtyInput, '2')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '150')

    // Scoped to the row: with a single cart line the row total and the
    // Subtotal row display the identical formatted amount, so a page-wide
    // getByText would (correctly) report two matches.
    expect(within(row).getByText('฿300.00')).toBeInTheDocument()
  })

  it('the subtotal sums multiple cart lines', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const firstRow = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, firstPrice] = within(firstRow).getAllByRole('spinbutton')
    await userEvent.clear(firstPrice); await userEvent.type(firstPrice, '100')

    await userEvent.click(screen.getByText('Service'))
    const rows = screen.getAllByPlaceholderText('Description')
    const secondRow = cartRowOf(rows[1])
    const [, secondPrice] = within(secondRow).getAllByRole('spinbutton')
    await userEvent.clear(secondPrice); await userEvent.type(secondPrice, '50')

    // subtotal 150, +7% VAT (exclusive default) = 160.50 total due
    expect(await screen.findByText('฿150.00')).toBeInTheDocument() // subtotal row
    expect(screen.getByText('฿160.50')).toBeInTheDocument() // total due
  })

  it('adding a retail product via the picker adds a pre-filled, priced cart row and closes the picker', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Product'))
    expect(await screen.findByText('Add retail product')).toBeInTheDocument()

    await userEvent.click(await screen.findByText('Flea Shampoo'))

    expect(screen.queryByText('Add retail product')).not.toBeInTheDocument()
    const descValueInput = screen.getByDisplayValue('Flea Shampoo')
    expect(within(cartRowOf(descValueInput)).getByText('฿150.00')).toBeInTheDocument()
  })

  it('the retail picker shows an empty state when no products match', async () => {
    products = []
    renderBilling()
    await userEvent.click(screen.getByText('Product'))
    expect(await screen.findByText('No products found.')).toBeInTheDocument()
  })

  it('removing a cart line drops it and restores the empty-cart hint', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '200')
    expect(within(row).getByText('฿200.00')).toBeInTheDocument()

    const removeBtn = within(row).getAllByRole('button').at(-1)!
    await userEvent.click(removeBtn)

    expect(screen.queryByPlaceholderText('Description')).not.toBeInTheDocument()
    expect(screen.getByText('Pick a visit or add line items to start an invoice.')).toBeInTheDocument()
  })
})

// ─── 1b. Subtotal must include prescription preview lines (Gate 0 gap B) ────
// QA proved via mutation testing that dropping `previewLines` from the
// subtotal computation (ClinicBilling.tsx:118, `subtotal = previewTotal +
// cartTotal`) still passed every test in this file — every existing test
// with a prescription preview only asserts the POST payload and that the
// drug name renders (see "happy path payload" in section 7 below), never a
// money value. This test fails if previewTotal is dropped from the sum: the
// subtotal would render ฿300.00 (cart only) instead of ฿460.00.
describe('ClinicBilling — subtotal includes prescription preview lines (Gate 0 gap B)', () => {
  it('the displayed subtotal and total due include BOTH the prescription preview total and the cart total', async () => {
    recordsForPet = [{ id: 77, assessment: 'Annual checkup', createdAt: '2026-08-01T00:00:00.000Z' }]
    recordDetails[77] = { prescriptions: [{ quantity: '2', drug: { name: 'Amoxicillin', unitPrice: '80.00' } }] }
    renderBilling()
    await selectMilo()

    await userEvent.selectOptions(await screen.findByRole('combobox'), '77')
    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument() // preview total = 2 × 80 = 160

    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '300') // cart total = 300

    // subtotal = previewTotal (160) + cartTotal (300) = 460
    await waitFor(() => expect(subtotalValue()).toBe('฿460.00'))
    // total due = 460 × 1.07 (exclusive VAT, default settings) = 492.20
    expect(totalDueValue()).toBe('฿492.20')
  })
})

// ─── 2. Discount ────────────────────────────────────────────────────────────
describe('ClinicBilling — discount (Gate 0)', () => {
  async function addCartLine(price: string) {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, price)
  }

  it('a manual discount reduces the taxable amount and the total due', async () => {
    await addCartLine('1000')
    expect(await screen.findByText('฿1,070.00')).toBeInTheDocument() // no discount yet

    await userEvent.type(discountInput(), '200')
    // taxable = 1000 - 200 = 800; VAT 7% = 56; total = 856
    expect(await screen.findByText('฿856.00')).toBeInTheDocument()
  })

  it('a discount larger than the subtotal is capped, driving the taxable amount and total to zero', async () => {
    await addCartLine('1000')
    await userEvent.type(discountInput(), '5000')

    // discountNum = min(5000, subtotal) = 1000 -> taxable 0 -> tax 0 -> total 0
    await waitFor(() => expect(totalDueValue()).toBe('฿0.00'))
  })
})

// ─── 3. Loyalty redemption ──────────────────────────────────────────────────
describe('ClinicBilling — loyalty redemption (Gate 0)', () => {
  async function setupPetCartAndLoyalty() {
    renderBilling()
    await selectMilo()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '1000')
    await screen.findByText('500 pts')
  }

  it("shows the owner's balance and caps redeemable points at 20% of the subtotal", async () => {
    await setupPetCartAndLoyalty()
    // maxRedeemable = min(500, floor(1000 * 0.2)) = 200
    expect(screen.getByText(/redeem \(max 200/)).toBeInTheDocument()
  })

  it('typing a points value above the cap clamps to the max and reduces the total', async () => {
    await setupPetCartAndLoyalty()
    const redeemInput = screen.getByPlaceholderText('0')
    await userEvent.type(redeemInput, '9999')
    expect(redeemInput).toHaveValue(200)
    // taxable = 1000 - 200 = 800; VAT 7% = 56; total = 856
    expect(await screen.findByText('฿856.00')).toBeInTheDocument()
  })

  it('the Max control redeems the full capped amount', async () => {
    await setupPetCartAndLoyalty()
    await userEvent.click(screen.getByText('Max'))
    expect(screen.getByPlaceholderText('0')).toHaveValue(200)
  })

  it('a pet with no loyalty balance response renders the invoice without a loyalty panel', async () => {
    loyaltyBalance = null
    renderBilling()
    await selectMilo()
    await userEvent.click(screen.getByText('Service'))
    expect(screen.queryByText('Loyalty')).not.toBeInTheDocument()
  })

  it('finalizing a cash sale calls the redeem endpoint exactly once with ownerId, redeemed points, and the pre-discount subtotal', async () => {
    await setupPetCartAndLoyalty()
    await userEvent.click(screen.getByText('Max')) // 200 pts
    await userEvent.type(screen.getByPlaceholderText('0.00'), '900') // total 856, sufficient

    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByText('Payment Successful!')

    const redeemCalls = postMock.mock.calls.filter((c) => c[0] === '/api/loyalty/redeem')
    expect(redeemCalls).toHaveLength(1)
    expect(redeemCalls[0][1]).toEqual({ ownerId: 10, points: 200, invoiceTotal: 1000 })
  })

  it('a failed redeem call does not block the payment from succeeding (best-effort, error swallowed)', async () => {
    postMock.mockImplementation((url: string) => {
      if (url === '/api/invoices') return Promise.resolve({ data: { data: makeInvoice() } })
      if (url === '/api/loyalty/redeem') return Promise.reject(new Error('redeem failed'))
      return Promise.resolve({ data: { data: null } })
    })
    await setupPetCartAndLoyalty()
    await userEvent.click(screen.getByText('Max'))
    await userEvent.type(screen.getByPlaceholderText('0.00'), '900')

    await userEvent.click(screen.getByText(/Confirm Payment/))
    expect(await screen.findByText('Payment Successful!')).toBeInTheDocument()
  })

  it('for a PromptPay sale, redeem fires only after "Payment Received" — not at invoice creation (second call site, same shape)', async () => {
    await setupPetCartAndLoyalty()
    await userEvent.click(screen.getByText('Max')) // 200 pts
    await userEvent.click(screen.getByText('PromptPay'))
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByAltText('PromptPay QR')

    expect(postMock.mock.calls.filter((c) => c[0] === '/api/loyalty/redeem')).toHaveLength(0)

    await userEvent.click(screen.getByText('Payment Received'))
    await screen.findByText('Payment Successful!')

    const redeemCalls = postMock.mock.calls.filter((c) => c[0] === '/api/loyalty/redeem')
    expect(redeemCalls).toHaveLength(1)
    expect(redeemCalls[0][1]).toEqual({ ownerId: 10, points: 200, invoiceTotal: 1000 })
  })

  it('shows the loyalty-earned message using floor(totalAmount / 100) after a successful sale', async () => {
    putMock.mockImplementation((url: string) => {
      const m = url.match(/^\/api\/invoices\/(\d+)\/payment$/)
      if (m) return Promise.resolve({ data: { data: makeInvoice({ id: Number(m[1]), totalAmount: '535.00' }) } })
      return Promise.resolve({ data: { data: null } })
    })
    renderBilling()
    await selectMilo()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '500')
    await userEvent.type(screen.getByPlaceholderText('0.00'), '600')

    await userEvent.click(screen.getByText(/Confirm Payment/))
    expect(await screen.findByText('+5 loyalty points earned')).toBeInTheDocument() // floor(535/100)
  })
})

// ─── 3b. Loyalty redeem re-clamps when the cart shrinks after Max (Gate 0 gap A) ──
// QA proved via mutation testing that deleting the `Math.min(redeemPts,
// maxRedeemable)` clamp (ClinicBilling.tsx:121) still passed every existing
// test — none of them redeem via Max and then shrink the cart before
// finalizing. redeemPts is only written by the Max button or by typing; it is
// NOT reset when the cart (and therefore maxRedeemable) shrinks afterward, so
// the effective redeemed amount must be re-derived from the new
// maxRedeemable at read time, not trusted as stored. Without the clamp, the
// stale 200-point value from the larger cart is sent instead of the
// re-capped 100.
describe('ClinicBilling — loyalty redeem re-clamps when the cart shrinks after Max (Gate 0 gap A)', () => {
  it('sends the re-clamped point value to the redeem endpoint, not the stale Max value from the larger cart', async () => {
    renderBilling()
    await selectMilo()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '1000')
    await screen.findByText('500 pts')

    // maxRedeemable = min(500, floor(1000 * 0.2)) = 200
    await userEvent.click(screen.getByText('Max'))
    expect(screen.getByPlaceholderText('0')).toHaveValue(200)

    // Shrink the cart: 1000 -> 500. maxRedeemable now = min(500, floor(500 * 0.2)) = 100.
    // redeemPts state itself stays 200 here — only Max/typing writes it.
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '500')
    await waitFor(() => expect(screen.getByText(/redeem \(max 100/)).toBeInTheDocument())

    await userEvent.type(screen.getByPlaceholderText('0.00'), '999')
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByText('Payment Successful!')

    const redeemCalls = postMock.mock.calls.filter((c) => c[0] === '/api/loyalty/redeem')
    expect(redeemCalls).toHaveLength(1)
    expect(redeemCalls[0][1]).toEqual({ ownerId: 10, points: 100, invoiceTotal: 500 })
  })
})

// ─── 4. VAT computation integration ─────────────────────────────────────────
describe('ClinicBilling — VAT integration with calcVat (Gate 0)', () => {
  it('exclusive mode (default settings) adds tax on top and shows the Ex. VAT price header', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '1000')

    expect(await screen.findByText('Price (Ex. VAT)')).toBeInTheDocument()
    expect(screen.getByText('VAT (7%)')).toBeInTheDocument()
    expect(screen.getByText('฿70.00')).toBeInTheDocument() // tax row
    expect(screen.getByText('฿1,070.00')).toBeInTheDocument() // total due
  })

  it('inclusive mode extracts tax from the entered price rather than adding it', async () => {
    clinicSettings = { vatMode: 'inclusive', vatRate: '7' }
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '1070')

    expect(await screen.findByText('Price (Inc. VAT)')).toBeInTheDocument()
    expect(screen.getByText('฿70.00')).toBeInTheDocument() // tax extracted, not added
    expect(subtotalValue()).toBe('฿1,070.00')
    expect(totalDueValue()).toBe('฿1,070.00') // unchanged by VAT extraction
  })

  it('none mode charges zero tax and hides the VAT row entirely', async () => {
    clinicSettings = { vatMode: 'none', vatRate: '7' }
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '500')

    await waitFor(() => expect(screen.queryByText(/^VAT \(/)).not.toBeInTheDocument())
    expect(screen.getByText('Subtotal')).toBeInTheDocument() // no Ex./Inc. VAT suffix
    expect(subtotalValue()).toBe('฿500.00')
    expect(totalDueValue()).toBe('฿500.00') // no tax added
  })
})

// ─── 5. Payment method selection ────────────────────────────────────────────
describe('ClinicBilling — payment method selection (Gate 0)', () => {
  async function addCartLine(price: string) {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, price)
  }

  it('defaults to cash; change is tendered minus total and clamps to ฿0.00 when tender is short', async () => {
    await addCartLine('500') // total 535 (7% VAT)
    await userEvent.type(screen.getByPlaceholderText('0.00'), '400')
    expect(await screen.findByText('฿0.00')).toBeInTheDocument() // change clamped, not negative
  })

  it('change shows the true positive amount once tender covers the total', async () => {
    await addCartLine('500')
    await userEvent.type(screen.getByPlaceholderText('0.00'), '600')
    expect(await screen.findByText('฿65.00')).toBeInTheDocument() // 600 - 535
  })

  it('a cash tender below the total blocks finalize with a validation message; a sufficient tender clears it', async () => {
    await addCartLine('500')
    await userEvent.type(screen.getByPlaceholderText('0.00'), '100')
    await userEvent.click(screen.getByText(/Confirm Payment/))
    expect(await screen.findByText('Cash tendered is less than total due.')).toBeInTheDocument()

    await userEvent.clear(screen.getByPlaceholderText('0.00'))
    await userEvent.type(screen.getByPlaceholderText('0.00'), '999')
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByText('Payment Successful!')
  })

  it('switching to Card shows the manual-terminal prompt and hides the cash tender field', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Card'))
    expect(screen.getByText(/Insert \/ tap card/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument()
  })
})

// ─── 6. PromptPay QR flow ────────────────────────────────────────────────────
describe('ClinicBilling — PromptPay QR flow (Gate 0)', () => {
  async function addCartLine(price: string) {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, price)
  }

  it('selecting PromptPay before confirming shows a placeholder icon, no invoice yet', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('PromptPay'))
    expect(screen.getByText('Click Confirm to generate QR')).toBeInTheDocument()
  })

  it('confirming creates the invoice, then fetches and renders the QR, stopping short of recording payment', async () => {
    await addCartLine('500')
    await userEvent.click(screen.getByText('PromptPay'))
    await userEvent.click(screen.getByText(/Confirm Payment/))

    expect(await screen.findByAltText('PromptPay QR')).toBeInTheDocument()
    expect(putMock).not.toHaveBeenCalled() // payment not recorded by invoice creation alone
    expect(getMock).toHaveBeenCalledWith('/api/invoices/900/promptpay-qr')
  })

  it('a failed QR fetch shows the fallback icon and an unavailable message, without blocking "Payment Received"', async () => {
    getMock.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (/^\/api\/invoices\/\d+\/promptpay-qr$/.test(url)) return Promise.reject(new Error('no promptpay id configured'))
      return defaultGetImpl(url, config)
    })
    await addCartLine('500')
    await userEvent.click(screen.getByText('PromptPay'))
    await userEvent.click(screen.getByText(/Confirm Payment/))

    expect(await screen.findByText(/QR unavailable/)).toBeInTheDocument()
    expect(screen.getByText('Payment Received')).toBeInTheDocument()
  })

  it('clicking "Payment Received" records the payment and shows the success modal', async () => {
    await addCartLine('500')
    await userEvent.click(screen.getByText('PromptPay'))
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByAltText('PromptPay QR')

    await userEvent.click(screen.getByText('Payment Received'))

    expect(await screen.findByText('Payment Successful!')).toBeInTheDocument()
    expect(putMock).toHaveBeenCalledWith('/api/invoices/900/payment', { paymentMethod: 'qr_promptpay' })
  })

  // Pinned finding: the QR query is `staleTime: Infinity` with no `refetchInterval`
  // (ClinicBilling.tsx:78-84) — it is fetched exactly once per invoice, not polled.
  // "Payment Received" is a manual staff action; there is no automatic
  // payment-confirmation polling anywhere in this component today.
  it('does not poll for the QR — it is fetched exactly once even as time passes', async () => {
    await addCartLine('500')
    await userEvent.click(screen.getByText('PromptPay'))
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByAltText('PromptPay QR')

    const callsBefore = getMock.mock.calls.filter((c) => /promptpay-qr$/.test(String(c[0]))).length
    await new Promise((r) => setTimeout(r, 50))
    const callsAfter = getMock.mock.calls.filter((c) => /promptpay-qr$/.test(String(c[0]))).length
    expect(callsAfter).toBe(callsBefore)
  })

  // Pinned finding (risk for the upcoming refactor): the bottom "Confirm Payment"
  // button's disabled condition (ClinicBilling.tsx:444) never checks
  // pendingInvoiceId. Clicking it again after a QR is already showing re-runs
  // finalize() and creates a SECOND invoice, silently orphaning the first.
  it('clicking Confirm Payment again after a QR is already pending creates a second invoice (no double-submit guard)', async () => {
    let nextId = 900
    postMock.mockImplementation((url: string) => {
      if (url === '/api/invoices') return Promise.resolve({ data: { data: makeInvoice({ id: nextId++ }) } })
      return Promise.resolve({ data: { data: null } })
    })
    await addCartLine('500')
    await userEvent.click(screen.getByText('PromptPay'))

    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByAltText('PromptPay QR')
    expect(postMock.mock.calls.filter((c) => c[0] === '/api/invoices')).toHaveLength(1)

    await userEvent.click(screen.getByText(/Confirm Payment/))
    await waitFor(() => expect(postMock.mock.calls.filter((c) => c[0] === '/api/invoices')).toHaveLength(2))
    expect(getMock).toHaveBeenCalledWith('/api/invoices/901/promptpay-qr')
  })
})

// ─── 7. Invoice creation ────────────────────────────────────────────────────
describe('ClinicBilling — invoice creation (Gate 0)', () => {
  it('happy path payload: items reflects only manual cart lines, not the auto-pulled prescription preview', async () => {
    recordsForPet = [{ id: 77, assessment: 'Annual checkup', createdAt: '2026-08-01T00:00:00.000Z' }]
    recordDetails[77] = { prescriptions: [{ quantity: '2', drug: { name: 'Amoxicillin', unitPrice: '80.00' } }] }
    renderBilling()
    await selectMilo()

    await userEvent.selectOptions(await screen.findByRole('combobox'), '77')
    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument() // preview line shown, priced from the drug

    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    await userEvent.type(screen.getByPlaceholderText('Description'), 'Consult fee')
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '300')

    await userEvent.type(screen.getByPlaceholderText('0.00'), '999')
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByText('Payment Successful!')

    expect(postMock).toHaveBeenCalledWith('/api/invoices', {
      medicalRecordId: 77,
      petId: 1,
      items: [{ description: 'Consult fee', itemType: 'service', qty: 1, unitPrice: 300, productId: null }],
      discount: 0,
    })
  })

  it('an invoice-creation failure shows the server error message and never records a payment', async () => {
    postMock.mockImplementation((url: string) => {
      if (url === '/api/invoices') return Promise.reject({ response: { data: { error: 'Duplicate invoice number' } } })
      return Promise.resolve({ data: { data: null } })
    })
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '100')
    await userEvent.type(screen.getByPlaceholderText('0.00'), '200')

    await userEvent.click(screen.getByText(/Confirm Payment/))

    expect(await screen.findByText('Duplicate invoice number')).toBeInTheDocument()
    expect(putMock).not.toHaveBeenCalled()
  })

  it('a payment-recording failure (after invoice creation succeeds) shows the server error', async () => {
    putMock.mockImplementation((url: string) => {
      const m = url.match(/^\/api\/invoices\/(\d+)\/payment$/)
      if (m) return Promise.reject({ response: { data: { error: 'Card terminal timeout' } } })
      return Promise.resolve({ data: { data: null } })
    })
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '100')
    await userEvent.type(screen.getByPlaceholderText('0.00'), '200')

    await userEvent.click(screen.getByText(/Confirm Payment/))

    expect(await screen.findByText('Card terminal timeout')).toBeInTheDocument()
    expect(screen.queryByText('Payment Successful!')).not.toBeInTheDocument()
  })

  it('after a successful sale, "Done" on the success modal resets the form to the empty state', async () => {
    renderBilling()
    await userEvent.click(screen.getByText('Service'))
    const row = cartRowOf(screen.getByPlaceholderText('Description'))
    const [, priceInput] = within(row).getAllByRole('spinbutton')
    await userEvent.clear(priceInput); await userEvent.type(priceInput, '100')
    await userEvent.type(screen.getByPlaceholderText('0.00'), '200')
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByText('Payment Successful!')

    await userEvent.click(screen.getByText('Done'))

    expect(screen.queryByTestId('success-modal')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Description')).not.toBeInTheDocument() // cart cleared
    expect(screen.getByPlaceholderText(/search pet/i)).toBeInTheDocument() // pet search restored
  })

  it('the "New sale" control appears once a pet or cart line exists, and resets the form when clicked', async () => {
    renderBilling()
    expect(screen.queryByText('New sale')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Service'))
    expect(await screen.findByText('New sale')).toBeInTheDocument()

    await userEvent.click(screen.getByText('New sale'))
    expect(screen.queryByPlaceholderText('Description')).not.toBeInTheDocument()
  })
})

// ─── 8. Loading / error / empty states ──────────────────────────────────────
describe('ClinicBilling — loading, error and empty states (Gate 0)', () => {
  it('shows the empty-cart hint and a disabled Confirm Payment button when there are no lines', async () => {
    renderBilling()
    expect(screen.getByText('Pick a visit or add line items to start an invoice.')).toBeInTheDocument()
    expect(screen.getByText(/Confirm Payment/).closest('button')).toBeDisabled()
  })

  it('a pet search with no matches shows no dropdown results', async () => {
    renderBilling()
    await userEvent.type(screen.getByPlaceholderText(/search pet/i), 'Zzz')
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/search', { params: { q: 'Zzz' } }))
    expect(screen.queryByText('Milo')).not.toBeInTheDocument()
  })

  it('selecting a pet with no visit records hides the "bill a visit" control', async () => {
    renderBilling()
    await selectMilo()
    expect(screen.queryByText(/Bill a visit/i)).not.toBeInTheDocument()
  })

  it('selecting a pet with visit records shows the "bill a visit" dropdown populated with them', async () => {
    recordsForPet = [{ id: 77, assessment: 'Annual checkup', createdAt: '2026-08-01T00:00:00.000Z' }]
    renderBilling()
    await selectMilo()
    expect(await screen.findByText(/Bill a visit/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})

// ─── 9. Loyalty-redeem guard: non-finite redeemDiscount (Gate 0 gap C) ───────
// QA mutation testing on cf1f8e2 proved this behaviour was UNCOVERED: reverting
// redeemLoyaltyIfNeeded's guard from `if (!pet?.ownerId || redeemDiscount <= 0)`
// back to its pre-refactor form `if (!(pet?.ownerId && redeemDiscount > 0))`
// left all 89 tests green, so nothing pinned the one input combination where the
// two forms disagree.
//
// They are NOT De Morgan equivalents for NaN:
//   pre-refactor:  NaN > 0   === false -> guard blocks  -> NO redeem POST
//   post-refactor: NaN <= 0  === false -> guard passes  -> redeem POST fires
// `redeemDiscount` is NaN whenever `subtotal` is NaN, because
// maxRedeemable = Math.min(points, Math.floor(NaN * 0.2)) = NaN and
// redeemDiscount = Math.min(redeemPts, NaN) = NaN — even when redeemPts is 0.
// `subtotal` goes NaN from the untyped API boundary at ClinicBilling.tsx:152,
// `qty: Number(rx.quantity)`, where a missing or non-numeric `quantity` yields
// NaN (the `{ quantity: string }` annotation is a compile-time assertion over an
// unvalidated `r.data.data` payload, not a runtime guarantee).
//
// Net effect of the regression: a prescription with a bad quantity makes every
// cash and PromptPay sale fire an unrequested POST to the money-handling
// /api/loyalty/redeem endpoint carrying `{points: null, invoiceTotal: null}`
// (NaN serialises to null through JSON), for a customer who redeemed nothing —
// and with maxRedeemable NaN the loyalty panel is not even rendered, so staff
// never see a redemption they are nonetheless charged for.
describe('ClinicBilling — loyalty-redeem guard rejects a non-finite redeemDiscount (Gate 0 gap C)', () => {
  async function finalizeCashSaleWithNaNSubtotal() {
    recordsForPet = [{ id: 77, assessment: 'Annual checkup', createdAt: '2026-08-01T00:00:00.000Z' }]
    // Non-numeric quantity from the API -> Number('2 tabs') === NaN -> subtotal NaN.
    recordDetails[77] = { prescriptions: [{ quantity: '2 tabs', drug: { name: 'Amoxicillin', unitPrice: '80.00' } }] }
    renderBilling()
    await selectMilo()
    await userEvent.selectOptions(await screen.findByRole('combobox'), '77')
    await screen.findByText('Amoxicillin')
    await screen.findByText('500 pts') // owner has a balance, so ownerId is truthy
    await userEvent.click(screen.getByText(/Confirm Payment/))
    await screen.findByText('Payment Successful!')
  }

  it('does not call /api/loyalty/redeem when the subtotal (and therefore redeemDiscount) is NaN', async () => {
    await finalizeCashSaleWithNaNSubtotal()
    expect(postMock.mock.calls.filter((c) => c[0] === '/api/loyalty/redeem')).toHaveLength(0)
  })

  it('never sends a redeem payload whose points or invoiceTotal is non-finite', async () => {
    await finalizeCashSaleWithNaNSubtotal()
    for (const [, body] of postMock.mock.calls.filter((c) => c[0] === '/api/loyalty/redeem')) {
      const { points, invoiceTotal } = body as { points: number; invoiceTotal: number }
      expect(Number.isFinite(points)).toBe(true)
      expect(Number.isFinite(invoiceTotal)).toBe(true)
    }
  })
})
