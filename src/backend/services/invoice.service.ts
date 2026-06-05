// Invoice / billing service — invoice assembly, numbering, tax + co-located Zod schemas.
import { z } from 'zod'
import { AppError } from '../utils/errors'
import * as invoiceRepo from '../models/invoice.repository'
import type { BuiltItem } from '../models/invoice.repository'

const ITEM_TYPES = ['service', 'medicine', 'vaccine', 'lab', 'supply', 'grooming', 'retail', 'other'] as const
const PAYMENT_METHODS = ['cash', 'qr_promptpay', 'credit_card', 'transfer', 'other'] as const

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(255),
  itemType:   z.enum(ITEM_TYPES),
  qty:        z.number().positive(),
  unitPrice:  z.number().nonnegative(),
  productId:  z.number().int().positive().optional().nullable(), // present => retail line (deducts stock)
}).strict()

export const createInvoiceSchema = z.object({
  medicalRecordId: z.number().int().positive().optional().nullable(),
  petId:           z.number().int().positive().optional().nullable(),
  items:           z.array(invoiceItemSchema).default([]),
  discount:        z.number().nonnegative().default(0),
  discountReason:  z.string().max(255).optional().nullable(),
  taxRate:         z.number().nonnegative().max(100).default(7),
  notes:           z.string().optional().nullable(),
}).strict()

export const paymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
}).strict()

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export class InvoiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'INVOICE_ERROR')
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export async function createInvoice(tenantId: number, data: CreateInvoiceInput, createdBy?: number) {
  const builtItems: BuiltItem[] = []
  let petId: number | null = data.petId ?? null

  // Auto-pull medicine lines from a visit's prescriptions (stock already deducted at Rx time).
  if (data.medicalRecordId) {
    const record = await invoiceRepo.findMedicalRecord(tenantId, data.medicalRecordId)
    if (!record) throw new InvoiceError('Medical record not found', 404)
    petId = petId ?? record.petId
    for (const rx of record.prescriptions) {
      const qty = Number(rx.quantity)
      const unitPrice = Number(rx.drug.unitPrice ?? 0)
      builtItems.push({
        description: rx.dosageInstruction ? `${rx.drug.name} — ${rx.dosageInstruction}` : rx.drug.name,
        itemType:   'medicine',
        qty,
        unitPrice,
        totalPrice: round2(qty * unitPrice),
      })
    }
  }

  // Client-supplied lines (services + retail products). productId => deduct stock.
  for (const item of data.items) {
    builtItems.push({
      description: item.description,
      itemType:   item.itemType,
      qty:        item.qty,
      unitPrice:  item.unitPrice,
      totalPrice: round2(item.qty * item.unitPrice),
      productId:  item.productId ?? null,
    })
  }

  if (builtItems.length === 0) throw new InvoiceError('Invoice must have at least one item', 400)

  const subtotal    = round2(builtItems.reduce((sum, i) => sum + i.totalPrice, 0))
  const discount    = Math.min(round2(data.discount), subtotal)
  const taxable     = subtotal - discount
  const taxAmount   = round2((taxable * data.taxRate) / 100)
  const totalAmount = round2(taxable + taxAmount)

  return invoiceRepo.createInvoice(tenantId, {
    petId,
    medicalRecordId: data.medicalRecordId ?? null,
    items:           builtItems,
    subtotal,
    discount,
    discountReason:  data.discountReason ?? null,
    taxRate:         data.taxRate,
    taxAmount,
    totalAmount,
    notes:           data.notes ?? null,
    createdBy:       createdBy ?? null,
  })
}

export async function getInvoice(tenantId: number, id: number) {
  const invoice = await invoiceRepo.findInvoiceById(tenantId, id)
  if (!invoice) throw new InvoiceError('Invoice not found', 404)
  return invoice
}

export async function listInvoices(
  tenantId: number, page = 1, limit = 20, status?: string, date?: string,
) {
  const skip = (page - 1) * limit
  const [invoices, total] = await Promise.all([
    invoiceRepo.findInvoices(tenantId, { skip, take: limit, status, date }),
    invoiceRepo.countInvoices(tenantId, status, date),
  ])
  return { invoices, total, page, limit }
}

export async function recordPayment(tenantId: number, id: number, paymentMethod: string) {
  const invoice = await getInvoice(tenantId, id)
  if (invoice.paymentStatus === 'paid') throw new InvoiceError('Invoice is already paid', 409)
  return invoiceRepo.recordPayment(tenantId, id, paymentMethod)
}
