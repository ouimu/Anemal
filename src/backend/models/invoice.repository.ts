// Invoice / billing repository — all Prisma access for invoices + invoice_items.
// Retail stock deduction + movement logging happen inside the create transaction (TOCTOU-safe).
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { ConflictError, NotFoundError } from '../utils/errors'
import { ownerSummarySelect } from './owner.repository'

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

// `client` defaults to the shared `prisma` instance but accepts a `Prisma.TransactionClient`
// so callers building an invoice inside a larger transaction (R3-HI-02 discharge+invoice)
// can pass `tx` — both satisfy the same delegate shape.
export function findMedicalRecord(tenantId: number, medicalRecordId: number, client: Prisma.TransactionClient | typeof prisma = prisma) {
  return client.medicalRecord.findFirst({
    where: { id: medicalRecordId, tenantId },
    include: {
      // XTI-14 (@db-agent veto) finding: drug (required FK -> InventoryItem, tenant-scoped)
      // was unguarded — a corrupt prescription.drugId leaked another tenant's item name AND
      // unitPrice into this invoice's line items (financial-integrity corruption, not just a
      // read leak, since this function feeds invoice creation). Same dialect-1 pattern as
      // medical-record.repository.ts's identical prescriptions.drug fix.
      prescriptions: {
        where: { tenantId, drug: { is: { tenantId } } },
        include: { drug: { select: { id: true, name: true, unit: true, unitPrice: true } } },
      },
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

/**
 * Body of invoice creation, assuming `tx` is already an open transaction. Extracted so
 * R3-HI-02 (hospitalization discharge) can run this inside its OWN outer transaction —
 * alongside the discharge-claim `updateMany` — instead of nesting a second, independent
 * `prisma.$transaction` (Prisma has no nested-transaction support; the caller's tx client
 * must be reused directly).
 */
export async function createInvoiceTx(tx: Prisma.TransactionClient, tenantId: number, data: CreateInvoiceData) {
  // 0. Cross-tenant FK guard (CR-01): a client-supplied petId must belong to this
  // tenant, validated inside the write transaction — not as a preceding read.
  if (data.petId != null) {
    const pet = await tx.pet.findFirst({ where: { id: data.petId, tenantId }, select: { id: true } })
    if (!pet) throw new NotFoundError('Pet')
  }

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
    include: { items: { where: { tenantId } } },
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
}

export function createInvoice(tenantId: number, data: CreateInvoiceData) {
  return prisma.$transaction((tx) => createInvoiceTx(tx, tenantId, data))
}

export function findInvoiceById(tenantId: number, branchId: number | null | undefined, id: number) {
  return prisma.invoice.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      OR: [{ pet: { is: null } }, { pet: { is: { tenantId, owner: { is: { tenantId } } } } }],
    },
    include: {
      items: { where: { tenantId } },
      pet:   { include: { owner: { select: ownerSummarySelect } } },
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
    OR: [{ pet: { is: null } }, { pet: { is: { tenantId } } }],
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

/**
 * HI-08: atomically claim an unpaid invoice inside a caller-supplied transaction.
 * The `paymentStatus: { not: 'paid' }` predicate + `count !== 1` check make this the
 * single authoritative write — a second concurrent request (or a replayed request)
 * loses the race and gets a ConflictError instead of double-recording a payment.
 *
 * ADR-0025: `count !== 1` alone conflates four distinct causes (wrong tenant,
 * wrong branch, nonexistent id, already-paid-in-scope) into one 409. On that
 * path only, an existence check re-runs in the IDENTICAL tenant+branch scope
 * as the claim above — never wider — to distinguish "not visible to caller"
 * (404) from "already paid in caller's own scope" (409). Widening this scope
 * (e.g. dropping the branch clause, or reusing findInvoiceById) would create a
 * cross-tenant existence oracle on a money endpoint; see ADR-0025 constraint 1.
 * This check runs only after the atomic claim fails, never before it — moving
 * it earlier would reopen the TOCTOU race HI-08 closes (ADR-0025 constraint 2).
 */
export async function claimInvoicePaid(
  tx: Prisma.TransactionClient, tenantId: number, branchId: number | null | undefined, id: number, paymentMethod: string,
) {
  const claimed = await tx.invoice.updateMany({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      paymentStatus: { not: 'paid' },
    },
    data: { paymentStatus: 'paid', paymentMethod, paidAt: new Date() },
  })
  if (claimed.count !== 1) {
    const existsInScope = await tx.invoice.findFirst({
      where: { id, tenantId, ...(branchId != null ? { branchId } : {}) },
      select: { id: true },
    })
    if (!existsInScope) throw new NotFoundError('Invoice')
    throw new ConflictError('Invoice is already paid', 'INVOICE_ALREADY_PAID')
  }
  const invoice = await tx.invoice.findFirst({
    where: {
      id,
      tenantId,
      ...(branchId != null ? { branchId } : {}),
      OR: [{ pet: { is: null } }, { pet: { is: { tenantId, owner: { is: { tenantId } } } } }],
    },
    include: {
      items: { where: { tenantId } },
      pet:   { include: { owner: { select: ownerSummarySelect } } },
    },
  })
  if (!invoice) throw new NotFoundError('Invoice')
  return invoice
}

export function createPaymentHistory(
  tx: Prisma.TransactionClient,
  data: {
    tenantId:     number
    branchId:     number
    invoiceId:    number
    amount:       number
    method:       string
    receivedById: number
    note?:        string
  },
) {
  return tx.paymentHistory.create({ data })
}

interface PaymentHistoryParams {
  startDate?: string; endDate?: string; filterBranchId?: number
  method?: string; receivedById?: number
  skip: number; take: number
}

// Staff/Doctor see own branch only; Admin may optionally filter by branchId query param.
function paymentHistoryWhere(tenantId: number, userBranchId: number | null | undefined, p: PaymentHistoryParams) {
  const branchId = userBranchId ?? p.filterBranchId
  return {
    tenantId,
    invoice:    { is: { tenantId } },
    receivedBy: { is: { tenantId } },
    branch:     { is: { tenantId } },
    ...(branchId != null ? { branchId } : {}),
    ...(p.startDate || p.endDate ? {
      paidAt: {
        ...(p.startDate ? { gte: new Date(p.startDate) } : {}),
        ...(p.endDate   ? { lte: new Date(p.endDate) }   : {}),
      },
    } : {}),
    ...(p.method ? { method: p.method } : {}),
    ...(p.receivedById != null ? { receivedById: p.receivedById } : {}),
  }
}

export function findPaymentHistory(tenantId: number, userBranchId: number | null | undefined, params: PaymentHistoryParams) {
  // Receiver picker options use the same tenant/branch/date scope but WITHOUT
  // the method/receivedById predicates, so narrowing those two never hides a
  // valid receiver from the picker (T-3c.2). Narrowing the date/branch scope
  // MAY shrink the list — that's intended faceted-filter behavior, not a bug
  // (ADR-0013 D3, grill finding F3).
  const { method: _method, receivedById: _receivedById, ...facetParams } = params

  // Each call below builds its own `where` inline (rather than through a shared local
  // variable) so the tenantRelationConformance analyzer (arch §6.2.1 shape (a)) can
  // resolve it as a same-module call expression ending in a single `return <object
  // literal>` — a local `const where = paymentHistoryWhere(...)` referenced by identifier
  // is NOT a module-level const and is therefore unresolvable to the analyzer.
  return Promise.all([
    prisma.paymentHistory.findMany({
      where: paymentHistoryWhere(tenantId, userBranchId, params),
      include: {
        invoice:    { select: { id: true, invoiceNo: true } },
        receivedBy: { select: { id: true, name: true } },
        branch:     { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),
    prisma.paymentHistory.count({ where: paymentHistoryWhere(tenantId, userBranchId, params) }),
    prisma.paymentHistory.findMany({
      where: paymentHistoryWhere(tenantId, userBranchId, facetParams as PaymentHistoryParams),
      distinct: ['receivedById'],
      select: { receivedBy: { select: { id: true, name: true } } },
    }),
  ])
}
