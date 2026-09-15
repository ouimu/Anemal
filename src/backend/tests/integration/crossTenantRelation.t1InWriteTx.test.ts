/**
 * XTI-13 shape 3 (arch §9) — T1 forward INSIDE A WRITE TRANSACTION:
 * `invoice.repository.claimInvoicePaid`, driven by `PUT /api/invoices/:id/payment`.
 *
 * This shape is its own test because the guard sits on the *second* statement of a
 * money transaction. The atomic claim (`updateMany`) runs first, deliberately without
 * the relation predicate (ADR-0025 constraint 2 forbids moving the existence check
 * before it — that would reopen the TOCTOU race HI-08 closes). Only the follow-up
 * `findFirst` carries the `pet -> owner` guard.
 *
 * So the interesting question is not "does the caller get a 404" — it is "does the
 * claim ROLL BACK". A 404 delivered alongside a silently-paid invoice would be worse
 * than a leak: the money state would diverge from what the API reported. The last two
 * assertions are the load-bearing ones.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, expectNoForeignTrace, expectNoOwnerPiiFields,
  fixtureStamp, seedCrossTenantPair, startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
let cleanInvoiceId = 0
let corruptInvoiceId = 0

async function makeInvoice(tenantId: number, branchId: number, petId: number, tag: string): Promise<number> {
  const created = await prisma.invoice.create({
    data: {
      tenantId, branchId, petId,
      invoiceNo: `INV-XTI13-${tag}-${Math.floor(Math.random() * 1e6)}`,
      subtotal: 500, discount: 0, taxRate: 0, taxAmount: 0, totalAmount: 500,
      paymentStatus: 'pending',
      items: { create: [{ tenantId, description: 'consult', itemType: 'service', quantity: 1, unitPrice: 500, totalPrice: 500 }] },
    },
  })
  return created.id
}

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  cleanInvoiceId = await makeInvoice(A.tenantId, A.branchId, A.petId, 'clean')
  // THE CORRUPT ROW: invoice owned by A, petId pointing at B's pet.
  corruptInvoiceId = await makeInvoice(A.tenantId, A.branchId, B.petId, 'corrupt')
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

const pay = (id: number) => request(server).put(`/api/invoices/${id}/payment`)
  .set('Authorization', `Bearer ${A.adminToken}`).send({ paymentMethod: 'cash' })

describe('XTI-13 shape 3 — T1 forward inside a write transaction (PUT /api/invoices/:id/payment)', () => {
  it('the fixture really is corrupt — precondition', async () => {
    const row = await prisma.invoice.findUniqueOrThrow({
      where: { id: corruptInvoiceId }, select: { tenantId: true, pet: { select: { tenantId: true } } },
    })
    expect(row.tenantId).toBe(A.tenantId)
    expect(row.pet?.tenantId).toBe(B.tenantId)
  })

  it('positive control — a clean invoice is paid and returns its own owner summary', async () => {
    const res = await pay(cleanInvoiceId)
    expect(res.status).toBe(200)
    expect(res.body.data.paymentStatus).toBe('paid')
    expect(res.body.data.pet.owner.id).toBe(A.ownerId)
    expectNoOwnerPiiFields(res.body)
  })

  it('AC-1/AC-2: paying a corrupt invoice is refused with 404 and leaks nothing', async () => {
    const res = await pay(corruptInvoiceId)
    expect(res.status).toBe(404)
    expectNoForeignTrace(res.body, B)
  })

  it('the refused claim ROLLED BACK — the corrupt invoice is still unpaid in the database', async () => {
    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: corruptInvoiceId }, select: { paymentStatus: true, paidAt: true, paymentMethod: true },
    })
    expect(after.paymentStatus).toBe('pending')
    expect(after.paidAt).toBeNull()
    expect(after.paymentMethod).toBeNull()
  })

  it('no side-effect row escaped the rolled-back transaction (payment history / loyalty)', async () => {
    const payments = await prisma.paymentHistory.count({ where: { tenantId: A.tenantId, invoiceId: corruptInvoiceId } })
    expect(payments).toBe(0)
    const loyalty = await prisma.loyaltyTransaction.count({ where: { tenantId: A.tenantId, invoiceId: corruptInvoiceId } })
    expect(loyalty).toBe(0)
  })

  it('a repeated attempt still fails the same way — the 404 is not a one-shot artefact of first call', async () => {
    const res = await pay(corruptInvoiceId)
    expect(res.status).toBe(404)
    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: corruptInvoiceId }, select: { paymentStatus: true },
    })
    expect(after.paymentStatus).toBe('pending')
  })
})
