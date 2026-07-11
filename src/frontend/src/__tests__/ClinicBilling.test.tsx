// src/frontend/src/__tests__/ClinicBilling.test.tsx
// Item 3 — Billing Pipeline. Covers: SuccessModal still renders its banner +
// itemized receipt after the ReceiptBody/ReceiptActions extraction (T-3b.2
// regression guard — no prior test existed for SuccessModal), a bare
// ReceiptModal never renders success-only chrome (T-3b.2, grill F2), and
// Payment History row click → GET /api/invoices/:id → ReceiptModal (T-3b.3).
// Method/Received-by filter assertions are appended in Task 8 (T-3c.3).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

const getMock = vi.fn()
vi.mock('../utils/api', () => ({
  default: { get: (...args: unknown[]) => getMock(...(args as [string, unknown])) },
}))

import { SuccessModal, ReceiptModal, PaymentHistoryTab } from '../views/clinic/ClinicBilling'
import type { Invoice } from '../hooks/useInvoices'

function withClient(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const invoice: Invoice = {
  id: 900, invoiceNo: 'INV-2026-07-0009', petId: 1, medicalRecordId: null,
  issuedAt: '2026-07-11T09:00:00.000Z', subtotal: '500.00', discount: '0.00',
  discountReason: null, taxRate: '7', taxAmount: '35.00', totalAmount: '535.00',
  paymentStatus: 'paid', paymentMethod: 'cash', paidAt: '2026-07-11T09:05:00.000Z',
  notes: null,
  items: [{ id: 1, description: 'Consultation', itemType: 'service', quantity: '1', unitPrice: '500.00', totalPrice: '500.00' }],
  pet: { id: 1, name: 'Rex', owner: { firstName: 'Jane', lastName: 'Doe', phone: '0800000000' } },
}

describe('SuccessModal — regression guard after ReceiptBody/ReceiptActions extraction (T-3b.2)', () => {
  it('still shows the success banner, invoice items, and totals', () => {
    withClient(
      <SuccessModal invoice={invoice} pet={{ petName: 'Rex', ownerName: 'Jane Doe' }} method="cash" earnedMsg="+5 loyalty points earned" onClose={vi.fn()} />
    )
    expect(screen.getByTestId('success-modal')).toBeInTheDocument()
    expect(screen.getByText('Payment Successful!')).toBeInTheDocument()
    expect(screen.getByText('+5 loyalty points earned')).toBeInTheDocument()
    expect(screen.getByText('Consultation')).toBeInTheDocument()
    expect(screen.getByText('฿535.00')).toBeInTheDocument()
  })
})

describe('ReceiptModal — history-row receipt view (T-3b.2, grill F2)', () => {
  it('shows receipt content only — no success banner or success-modal testid', () => {
    withClient(<ReceiptModal invoice={invoice} petLabel="Rex · Owner: Jane Doe" method="cash" onClose={vi.fn()} />)
    expect(screen.getByTestId('receipt-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('success-modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Payment Successful!')).not.toBeInTheDocument()
    expect(screen.getByText('Consultation')).toBeInTheDocument()
    expect(screen.getByText('฿535.00')).toBeInTheDocument()
  })
})

describe('PaymentHistoryTab — row click opens ReceiptModal (T-3b.3)', () => {
  const row = {
    id: 1, paidAt: '2026-07-11T09:05:00.000Z', amount: '535.00', method: 'cash', note: null,
    invoice: { id: 900, invoiceNo: 'INV-2026-07-0009' },
    receivedBy: { id: 5, name: 'Nok' },
    branch: { id: 1, name: 'Main' },
  }

  function stubGet(receivedByOptions: Array<{ id: number; name: string }> = []) {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/invoices/payment-history') {
        return Promise.resolve({ data: { data: { rows: [row], total: 1, page: 1, limit: 20, receivedByOptions } } })
      }
      if (url === `/api/invoices/${invoice.id}`) return Promise.resolve({ data: { data: invoice } })
      return Promise.resolve({ data: { data: null } })
    })
  }

  it('clicking a row fetches GET /api/invoices/:id and renders the receipt modal', async () => {
    stubGet([{ id: 5, name: 'Nok' }])
    withClient(<PaymentHistoryTab />)
    const cell = await screen.findByText('INV-2026-07-0009')
    await userEvent.click(cell.closest('tr')!)
    await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/api/invoices/${invoice.id}`))
    expect(await screen.findByTestId('receipt-modal')).toBeInTheDocument()
    expect(screen.getByText('Consultation')).toBeInTheDocument()
    expect(screen.queryByTestId('success-modal')).not.toBeInTheDocument()
  })

  it('404 on the fetched invoice shows an error state, no crash', async () => {
    getMock.mockImplementation((url: string) => {
      if (url === '/api/invoices/payment-history') return Promise.resolve({ data: { data: { rows: [row], total: 1, page: 1, limit: 20, receivedByOptions: [] } } })
      if (url === `/api/invoices/${invoice.id}`) return Promise.reject({ response: { status: 404 } })
      return Promise.resolve({ data: { data: null } })
    })
    withClient(<PaymentHistoryTab />)
    const cell = await screen.findByText('INV-2026-07-0009')
    await userEvent.click(cell.closest('tr')!)
    expect(await screen.findByText('Could not load this receipt.')).toBeInTheDocument()
    expect(screen.queryByTestId('receipt-modal')).not.toBeInTheDocument()
  })
})
