/**
 * XTI-14 (@db-agent veto, 2nd pass) — V2: `invoice.repository.ts`'s `findMedicalRecord` had
 * zero behavioral test coverage for its own fix. That function feeds `POST /api/invoices`
 * (invoice.service.ts's `createInvoice` auto-pulls medicine lines from a visit's
 * prescriptions) — a corrupt `Prescription.drugId` pointing at another tenant's
 * `InventoryItem` would have written that tenant's product NAME and UNIT PRICE into the
 * new invoice's line items. `crossTenantRelation.reverseIncludeAttachments.test.ts` (the
 * commit that introduced this fix) only exercises `GET /api/medical-records/:id`, never
 * invoice creation — this file closes that gap.
 *
 * Fixture pattern mirrors `crossTenantRelation.nonPiiT4.test.ts`'s `recordWithForeignDrugRxId`:
 * `POST /api/prescriptions` itself rejects a foreign `drugId` (per the write-path guards
 * proven in `crossTenantFkWritePathRepro.test.ts`), so the corrupt row has to be fabricated
 * directly, the same way a real data-integrity violation would arise without going through
 * the app's own write path.
 */
import { Server } from 'http'
import request from 'supertest'
import prisma from '../../config/db'
import {
  TenantFixture, cleanupTenants, fixtureStamp, seedCrossTenantPair,
  startFixtureServer, stopFixtureServer,
} from '../helpers/crossTenantRelationFixture'

let server: Server
let A: TenantFixture
let B: TenantFixture
let recordId = 0
let foreignDrugPrescriptionId = 0

beforeAll(async () => {
  server = await startFixtureServer()
  const pair = await seedCrossTenantPair(server, fixtureStamp())
  A = pair.A
  B = pair.B

  recordId = (await prisma.medicalRecord.create({
    data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'invoice-drug-leak-test' },
  })).id

  await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: recordId, drugId: A.productId, quantity: 3 },
  })

  // THE CORRUPT CHILD: a prescription owned by tenant A, hanging off tenant A's own
  // medical record, but pointing (via drugId) at tenant B's InventoryItem row.
  foreignDrugPrescriptionId = (await prisma.prescription.create({
    data: { tenantId: A.tenantId, medicalRecordId: recordId, drugId: B.productId, quantity: 5 },
  })).id
}, 180_000)

afterAll(async () => {
  await cleanupTenants([A?.tenantId, B?.tenantId].filter((v): v is number => typeof v === 'number'))
  await stopFixtureServer(server)
}, 180_000)

interface InvoiceCreated {
  id: number
  subtotal: number | string
  totalAmount: number | string
  items: { description: string; itemType: string; qty: number; unitPrice: number; totalPrice: number }[]
}

describe('XTI-14 V2 — POST /api/invoices auto-pulled prescription lines never leak a foreign drug', () => {
  it('precondition: the corrupt prescription really points at tenant B\'s product', async () => {
    const rx = await prisma.prescription.findUniqueOrThrow({
      where: { id: foreignDrugPrescriptionId }, select: { tenantId: true, medicalRecordId: true, drugId: true },
    })
    expect(rx.tenantId).toBe(A.tenantId)
    expect(rx.medicalRecordId).toBe(recordId)
    expect(rx.drugId).toBe(B.productId)
  })

  it('AC-1: the invoice is created from the record\'s prescriptions, with ONLY the own-tenant line — the foreign one is silently omitted (XTI-INV-a), not leaked', async () => {
    const res = await request(server)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${A.adminToken}`)
      .send({ medicalRecordId: recordId, items: [] })
    expect(res.status).toBe(201)

    const invoice = res.body.data as InvoiceCreated
    // 3 units of A's own drug @ unitPrice 10 = 30. If the foreign line (5 units @ 10) had
    // leaked in, subtotal would be 80, not 30 — this is the actual financial-corruption
    // check, not just a string-presence check.
    expect(invoice.items).toHaveLength(1)
    expect(Number(invoice.subtotal)).toBe(30)
    expect(Number(invoice.totalAmount)).toBeGreaterThanOrEqual(30)
  })

  it('AC-1/AC-8: the response never contains tenant B\'s product name or its unitPrice-derived total for 5 units', async () => {
    const res = await request(server)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${A.adminToken}`)
      .send({ medicalRecordId: recordId, items: [] })
    expect(res.status).toBe(201)

    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain(B.productName)
    // 5 units of B's drug @ unitPrice 10 = 50 — the value that would have appeared as a
    // second line's totalPrice if the guard had failed.
    // InvoiceItem.totalPrice is a Prisma Decimal, which JSON.stringify renders quoted
    // ("50", not 50) — db-agent's round-3 review caught this assertion checking for the
    // unquoted form, which can never match either way and was vacuous.
    expect(serialized).not.toContain('"totalPrice":"50"')
  })

  it('positive control — with ONLY the corrupt line on the record, invoice creation fails cleanly rather than silently succeeding with a leaked line', async () => {
    // A second record whose only prescription is the corrupt one — proves the guard drops
    // the row rather than falling back to including it when nothing else is left.
    const isolatedRecordId = (await prisma.medicalRecord.create({
      data: { tenantId: A.tenantId, branchId: A.branchId, petId: A.petId, doctorId: A.doctorUserId, assessment: 'only-foreign-drug' },
    })).id
    await prisma.prescription.create({
      data: { tenantId: A.tenantId, medicalRecordId: isolatedRecordId, drugId: B.productId, quantity: 1 },
    })

    const res = await request(server)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${A.adminToken}`)
      .send({ medicalRecordId: isolatedRecordId, items: [] })
    // No client-supplied items and the only prescription is dropped -> "must have at least
    // one item" (400), never a 201 with the foreign line included.
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).not.toContain(B.productName)

    await prisma.medicalRecord.delete({ where: { id: isolatedRecordId } })
  })
})
