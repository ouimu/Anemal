/**
 * XTI-13 shape 8 (arch §9) — NULLABLE FK PRESERVED (AC-7, risk E-4).
 *
 * `Invoice.petId` is nullable: a retail sale (flea treatment over the counter, no
 * patient) is a legitimate invoice with no pet. The naive way to write the guard —
 * `pet: { is: { tenantId } }` — silently EXCLUDES every such invoice, because a NULL
 * relation does not satisfy an `is` predicate. The tenant leak would be closed and the
 * retail till would stop working.
 *
 * ADR-0027's shape for this is the OR-fallback:
 *   `OR: [{ pet: { is: null } }, { pet: { is: { tenantId, owner: { is: { tenantId } } } } }]`
 *
 * This suite is the regression that keeps the fallback in place: a NULL relation must
 * return 200 with `pet: null`, never be treated as a failed tenant check. It covers all
 * three places the fallback was written — the single read, the list/count pair, and the
 * claim inside the payment transaction.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
let retailInvoiceId = 0      // petId = NULL
let retailToPayInvoiceId = 0 // petId = NULL, used by the payment path
let petInvoiceId = 0         // petId = A's pet
let corruptInvoiceId = 0     // petId = B's pet

async function mkInvoice(tenantId: number, branchId: number, petId: number | null, tag: string): Promise<number> {
  return (await prisma.invoice.create({
    data: {
      tenantId, branchId, petId,
      invoiceNo: `INV-XTI13N-${tag}-${Math.floor(Math.random() * 1e6)}`,
      subtotal: 200, discount: 0, taxRate: 0, taxAmount: 0, totalAmount: 200,
      items: { create: [{ tenantId, description: 'retail item', itemType: 'retail', quantity: 1, unitPrice: 200, totalPrice: 200 }] },
    },
  })).id
}

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  retailInvoiceId      = await mkInvoice(A.tenantId, A.branchId, null, 'retail')
  retailToPayInvoiceId = await mkInvoice(A.tenantId, A.branchId, null, 'retailpay')
  petInvoiceId         = await mkInvoice(A.tenantId, A.branchId, A.petId, 'pet')
  corruptInvoiceId     = await mkInvoice(A.tenantId, A.branchId, B.petId, 'corrupt')
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

const getInvoice = (id: number) => request(server).get(`/api/invoices/${id}`)
  .set('Authorization', `Bearer ${A.adminToken}`)

describe('XTI-13 shape 8 — a NULL relation is not a failed tenant check (AC-7 / E-4)', () => {
  it('the retail invoice really has petId = NULL — precondition', async () => {
    const row = await prisma.invoice.findUniqueOrThrow({ where: { id: retailInvoiceId }, select: { petId: true } })
    expect(row.petId).toBeNull()
  })

  it('AC-7: the single read returns 200 with pet: null', async () => {
    const res = await getInvoice(retailInvoiceId)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(retailInvoiceId)
    expect(res.body.data.pet).toBeNull()
    expect(res.body.data.items).toHaveLength(1)
  })

  it('AC-7: the list read includes the NULL-pet invoice, and its total counts it', async () => {
    const res = await request(server).get('/api/invoices?limit=50')
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const rows = res.body.data.rows ?? res.body.data.invoices ?? res.body.data
    const ids = (rows as { id: number }[]).map((r) => r.id)
    expect(ids).toContain(retailInvoiceId)
    expect(ids).toContain(petInvoiceId)
    expect(ids).not.toContain(corruptInvoiceId)
  })

  it('AC-7: the list total stays consistent with the rows returned (the OR-fallback is in BOTH queries)', async () => {
    const res = await request(server).get('/api/invoices?limit=50')
      .set('Authorization', `Bearer ${A.adminToken}`)
    expect(res.status).toBe(200)
    const rows = (res.body.data.rows ?? res.body.data.invoices ?? res.body.data) as { id: number }[]
    const total = res.body.data.total as number
    expect(typeof total).toBe('number')
    expect(rows).toHaveLength(total) // limit 50 > row count, so one page holds them all
    // The corrupt row must be excluded from BOTH: a fallback written into findInvoices
    // but not countInvoices would show up as total === rows.length + 1 here.
    expect(total).toBe(3) // retail, retailToPay, pet — corrupt excluded
  })

  it('AC-7: the payment transaction also honours the NULL fallback — a retail sale can be paid', async () => {
    const res = await request(server).put(`/api/invoices/${retailToPayInvoiceId}/payment`)
      .set('Authorization', `Bearer ${A.adminToken}`).send({ paymentMethod: 'cash' })
    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('paid')
    expect(res.body.data.pet).toBeNull()
    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: retailToPayInvoiceId }, select: { paymentStatus: true },
    })
    expect(after.paymentStatus).toBe('paid')
  })

  it('the fallback did not widen the guard — the corrupt (non-NULL, foreign) row is still 404', async () => {
    const res = await getInvoice(corruptInvoiceId)
    expect(res.status).toBe(404)
    expectNoForeignTrace(res.body, B)
  })

  it('a pet-bearing invoice of the caller\'s own tenant still reads normally', async () => {
    const res = await getInvoice(petInvoiceId)
    expect(res.status).toBe(200)
    expect(res.body.data.pet.id).toBe(A.petId)
  })
})
