// Invoice / billing service — invoice assembly, numbering, tax + co-located Zod schemas.
import { z } from 'zod'
import prisma from '../config/db'
import { AppError } from '../utils/errors'
import * as invoiceRepo from '../models/invoice.repository'
import type { BuiltItem } from '../models/invoice.repository'
import * as tenantSettingsRepo from '../models/tenant-settings.repository'
import { earnOnPayment } from './loyalty.service'

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

export type VatMode = 'none' | 'exclusive' | 'inclusive'

/**
 * Pure 3-mode VAT formula (ADR-0020). The server is the sole source of truth for VAT
 * (D2) — never trust a client-supplied rate. `taxable = subtotal - discount` in all
 * three modes. Rate is defensively clamped to [0,100] even though the settings PUT
 * already validates it (BA Finding F4 — this function is the security boundary, not
 * the UI).
 */
export function computeVat(
  mode: VatMode, rate: number, taxable: number,
): { taxRate: number; taxAmount: number; totalAmount: number } {
  const safeRate = Math.min(100, Math.max(0, Number(rate) || 0))
  if (mode === 'none') {
    return { taxRate: 0, taxAmount: 0, totalAmount: round2(taxable) }
  }
  if (mode === 'inclusive') {
    const taxAmount = round2(taxable - taxable / (1 + safeRate / 100))
    return { taxRate: safeRate, taxAmount, totalAmount: round2(taxable) }
  }
  // exclusive
  const taxAmount = round2((taxable * safeRate) / 100)
  return { taxRate: safeRate, taxAmount, totalAmount: round2(taxable + taxAmount) }
}

export async function createInvoice(tenantId: number, branchId: number, data: CreateInvoiceInput, createdBy?: number) {
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

  const subtotal = round2(builtItems.reduce((sum, i) => sum + i.totalPrice, 0))
  const discount = Math.min(round2(data.discount), subtotal)
  const taxable  = subtotal - discount

  // Resolve VAT server-side from tenant settings — never from the request body
  // (ADR-0020 D2, closes the cashier taxRate-tampering vector). getOrCreateSettings
  // upserts a row with schema defaults (vatMode='exclusive', vatRate=7) if none exists
  // yet for this tenant, so this never throws for a tenant with no settings row (BA F3).
  const settings = await tenantSettingsRepo.getOrCreateSettings(tenantId)
  const { taxRate, taxAmount, totalAmount } = computeVat(
    settings.vatMode as VatMode, Number(settings.vatRate), taxable,
  )

  return invoiceRepo.createInvoice(tenantId, {
    branchId,
    petId,
    medicalRecordId: data.medicalRecordId ?? null,
    items:           builtItems,
    subtotal,
    discount,
    discountReason:  data.discountReason ?? null,
    taxRate,
    taxAmount,
    totalAmount,
    notes:           data.notes ?? null,
    createdBy:       createdBy ?? null,
  })
}

export async function getInvoice(tenantId: number, branchId: number | null | undefined, id: number) {
  const invoice = await invoiceRepo.findInvoiceById(tenantId, branchId, id)
  if (!invoice) throw new InvoiceError('Invoice not found', 404)
  return invoice
}

export async function listInvoices(
  tenantId: number, branchId: number | null | undefined, page = 1, limit = 20, status?: string, date?: string,
) {
  const skip = (page - 1) * limit
  const [invoices, total] = await Promise.all([
    invoiceRepo.findInvoices(tenantId, branchId, { skip, take: limit, status, date }),
    invoiceRepo.countInvoices(tenantId, branchId, status, date),
  ])
  return { invoices, total, page, limit }
}

/**
 * HI-08: mark-paid, payment-history logging, and loyalty earn all happen inside one
 * `prisma.$transaction`. The invoice is claimed atomically first
 * (`paymentStatus: { not: 'paid' } → ConflictError` on a lost race), so two concurrent
 * checkouts of the same invoice — or a client retry/replay after a dropped response —
 * can never produce two payment rows or a double loyalty credit.
 */
export async function recordPayment(tenantId: number, branchId: number | null | undefined, id: number, paymentMethod: string, userId: number) {
  return prisma.$transaction(async (tx) => {
    const paid = await invoiceRepo.claimInvoicePaid(tx, tenantId, branchId, id, paymentMethod)
    // Write payment history row (best-effort: skip if invoice lacks a branchId).
    if (paid.branchId != null) {
      await invoiceRepo.createPaymentHistory(tx, {
        tenantId,
        branchId:     paid.branchId,
        invoiceId:    id,
        amount:       Number(paid.totalAmount),
        method:       paymentMethod,
        receivedById: userId,
      })
    }
    // Loyalty: earn points on payment (best-effort; skips retail invoices with no owner).
    await earnOnPayment(tx, tenantId, id, Number(paid.totalAmount))
    return paid
  })
}

export async function listPaymentHistory(
  tenantId: number, userBranchId: number | null | undefined,
  page = 1, limit = 20, startDate?: string, endDate?: string, filterBranchId?: number,
  method?: string, receivedById?: number,
) {
  const skip = (page - 1) * limit
  const [rows, total, receiverRows] = await invoiceRepo.findPaymentHistory(tenantId, userBranchId, { startDate, endDate, filterBranchId, method, receivedById, skip, take: limit })
  return { rows, total, page, limit, receivedByOptions: receiverRows.map((r) => r.receivedBy) }
}
