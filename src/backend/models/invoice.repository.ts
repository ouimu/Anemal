// Invoice / billing repository — all Prisma access for invoices + invoice_items.
// Retail stock deduction + movement logging happen inside the create transaction (TOCTOU-safe).
import prisma from '../config/db'
import { ConflictError } from '../utils/errors'

export interface BuiltItem {
  description: string
  itemType:   string
  qty:        number
  unitPrice:  number
  totalPrice: number
  productId?: number | null // present => retail line that deducts stock
}

export interface CreateInvoiceData {
  branchId?:       number | null
  petId?:          number | null
  medicalRecordId?: number | null
  items:           BuiltItem[]
  subtotal:        number
  discount:        number
  discountReason?: string | null
  taxRate:         number
  taxAmount:       number
  totalAmount:     number
  notes?:          string | null
  createdBy?:      number | null
}

export function findMedicalRecord(tenantId: number, medicalRecordId: number) {
  return prisma.medicalRecord.findFirst({
    where: { id: medicalRecordId, tenantId },
    include: {
      prescriptions: { include: { drug: { select: { id: true, name: true, unit: true, unitPrice: true } } } },
    },
  })
}

const monthBounds = () => {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const ym    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return { start, end, ym }
}

export function createInvoice(tenantId: number, data: CreateInvoiceData) {
  return prisma.$transaction(async (tx) => {
    // 1. Deduct branch stock for retail lines (conditional update prevents overselling).
    for (const item of data.items) {
      if (!item.productId) continue
      const affected = await tx.$executeRaw`
        UPDATE branch_inventory
        SET "stockQty" = "stockQty" - ${item.qty}
        WHERE "tenantId" = ${tenantId} AND "branchId" = ${data.branchId}
          AND "productId" = ${item.productId} AND "stockQty" >= ${item.qty}
      `
      if (affected === 0) throw new ConflictError(`Insufficient stock for ${item.description}`, 'INSUFFICIENT_STOCK')
    }

    // 2. Per-tenant, per-month sequence → INV-YYYY-MM-NNNN.
    const { start, end, ym } = monthBounds()
    const count = await tx.invoice.count({ where: { tenantId, issuedAt: { gte: start, lt: end } } })
    const invoiceNo = `INV-${ym}-${String(count + 1).padStart(4, '0')}`

    // 3. Create invoice + nested items.
    const invoice = await tx.invoice.create({
      data: {
        tenantId,
        branchId:        data.branchId ?? null,
        petId:           data.petId ?? null,
        medicalRecordId: data.medicalRecordId ?? null,
        invoiceNo,
        subtotal:        data.subtotal,
        discount:        data.discount,
        discountReason:  data.discountReason ?? null,
        taxRate:         data.taxRate,
        taxAmount:       data.taxAmount,
        totalAmount:     data.totalAmount,
        notes:           data.notes ?? null,
        createdBy:       data.createdBy ?? null,
        items: {
          create: data.items.map((i) => ({
            tenantId,
            description: i.description,
            itemType:   i.itemType,
            quantity:   i.qty,
            unitPrice:  i.unitPrice,
            totalPrice: i.totalPrice,
          })),
        },
      },
      include: { items: true },
    })

    // 4. Log 'out' movements for retail lines.
    for (const item of data.items) {
      if (!item.productId) continue
      await tx.stockMovement.create({
        data: {
          tenantId,
          branchId:      data.branchId ?? null,
          itemId:        item.productId,
          movementType:  'out',
          qty:           item.qty,
          referenceType: 'retail',
          referenceId:   invoice.id,
          performedBy:   data.createdBy ?? null,
        },
      })
    }

    return invoice
  })
}

export function findInvoiceById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.invoice.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
    },
    include: {
      items: true,
      pet:   { include: { owner: true } },
    },
  })
}

interface ListParams { skip: number; take: number; status?: string; date?: string }

function listWhere(tenantId: number, branchId: number | null | undefined, status?: string, date?: string) {
  let issuedAt: { gte: Date; lt: Date } | undefined
  if (date) {
    const start = new Date(date); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    issuedAt = { gte: start, lt: end }
  }
  return {
    tenantId,
    ...(branchId != null ? { branchId } : {}),
    ...(status ? { paymentStatus: status as never } : {}),
    ...(issuedAt ? { issuedAt } : {}),
  }
}

export function findInvoices(tenantId: number, branchId: number | null | undefined, { skip, take, status, date }: ListParams) {
  return prisma.invoice.findMany({
    where: listWhere(tenantId, branchId, status, date),
    include: { pet: { select: { id: true, name: true } } },
    orderBy: { issuedAt: 'desc' },
    skip,
    take,
  })
}

export function countInvoices(tenantId: number, branchId: number | null | undefined, status?: string, date?: string) {
  return prisma.invoice.count({ where: listWhere(tenantId, branchId, status, date) })
}

export function recordPayment(tenantId: number, branchId: number | null | undefined, id: number, paymentMethod: string) {
  return prisma.invoice
    .updateMany({
      where: {
        id,
        tenantId,
        ...(branchId != null ? { branchId } : {}),
      },
      data: { paymentStatus: 'paid', paymentMethod, paidAt: new Date() },
    })
    .then(() => findInvoiceById(tenantId, branchId, id))
}

export function createPaymentHistory(data: {
  tenantId:     number
  branchId:     number
  invoiceId:    number
  amount:       number
  method:       string
  receivedById: number
  note?:        string
}) {
  return prisma.paymentHistory.create({ data })
}

interface PaymentHistoryParams {
  startDate?: string; endDate?: string; filterBranchId?: number
  method?: string; receivedById?: number
  skip: number; take: number
}

function paymentHistoryWhere(tenantId: number, userBranchId: number | null | undefined, p: PaymentHistoryParams) {
  const where: Record<string, unknown> = { tenantId }
  // Staff/Doctor see own branch only; Admin may optionally filter by branchId query param
  if (userBranchId != null)        where['branchId'] = userBranchId
  else if (p.filterBranchId != null) where['branchId'] = p.filterBranchId
  if (p.startDate || p.endDate) {
    const paidAt: Record<string, Date> = {}
    if (p.startDate) paidAt['gte'] = new Date(p.startDate)
    if (p.endDate)   paidAt['lte'] = new Date(p.endDate)
    where['paidAt'] = paidAt
  }
  if (p.method)               where['method'] = p.method
  if (p.receivedById != null) where['receivedById'] = p.receivedById
  return where
}

export function findPaymentHistory(tenantId: number, userBranchId: number | null | undefined, params: PaymentHistoryParams) {
  const where = paymentHistoryWhere(tenantId, userBranchId, params)
  return Promise.all([
    prisma.paymentHistory.findMany({
      where: where as never,
      include: {
        invoice:    { select: { id: true, invoiceNo: true } },
        receivedBy: { select: { id: true, name: true } },
        branch:     { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.paymentHistory.count({ where: where as never }),
  ])
}
