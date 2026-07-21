import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../utils/api'

export interface InvoiceItem {
  id:          number
  description: string
  itemType:    string
  quantity:    string
  unitPrice:   string
  totalPrice:  string
}

export interface Invoice {
  id:             number
  invoiceNo:      string
  petId:          number | null
  medicalRecordId: number | null
  issuedAt:       string
  subtotal:       string
  discount:       string
  discountReason: string | null
  taxRate:        string
  taxAmount:      string
  totalAmount:    string
  paymentStatus:  string
  paymentMethod:  string | null
  paidAt:         string | null
  notes:          string | null
  items?:         InvoiceItem[]
  pet?:           { id: number; name: string; owner?: { firstName: string; lastName: string; phone: string } } | null
}

export interface InvoiceList {
  invoices: Invoice[]
  total:    number
  page:     number
  limit:    number
}

// Mirror of the backend invoice item DTO used when building an invoice.
export interface NewInvoiceItem {
  description: string
  itemType:    string
  qty:         number
  unitPrice:   number
  productId?:  number | null
}

export interface CreateInvoicePayload {
  medicalRecordId?: number | null
  petId?:           number | null
  items:            NewInvoiceItem[]
  discount?:        number
  discountReason?:  string | null
  notes?:           string | null
}

export const PAYMENT_METHODS = ['cash', 'qr_promptpay', 'credit_card', 'transfer', 'other'] as const

export function useInvoices(params: { status?: string; date?: string; page?: number }) {
  const { status, date, page = 1 } = params
  return useQuery<InvoiceList>({
    queryKey: ['billing', 'invoices', status ?? '', date ?? '', page],
    queryFn: () =>
      api
        .get('/api/invoices', { params: { status: status || undefined, date: date || undefined, page } })
        .then((r) => r.data.data),
  })
}

export function useInvoice(id: number | null) {
  return useQuery<Invoice>({
    queryKey: ['billing', 'invoice', id],
    enabled: !!id,
    queryFn: () => api.get(`/api/invoices/${id}`).then((r) => r.data.data),
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateInvoicePayload) => api.post('/api/invoices', payload).then((r) => r.data.data as Invoice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing'] })
      qc.invalidateQueries({ queryKey: ['inventory'] }) // retail lines change stock
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, paymentMethod }: { id: number; paymentMethod: string }) =>
      api.put(`/api/invoices/${id}/payment`, { paymentMethod }).then((r) => r.data.data as Invoice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
