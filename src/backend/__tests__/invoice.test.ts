/**
 * Test Suite: bill-3.2 — Invoice / Billing (Phase 3)
 * @qa-agent | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * Run: npx jest --testPathPattern=invoice.test
 */
import request from 'supertest'
import { Server } from 'http'
import app from '../app'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import bcrypt from 'bcrypt'

let server: Server
let tidA: number, tidB: number
let tokenA: string, tokenB: string
let petId: number, doctorId: number, recordId: number, drugId: number, retailId: number
let branchAId: number
const SUB_A = `bill-a-${Date.now()}`
const SUB_B = `bill-b-${Date.now()}`

// Phase 4: stock lives in branch_inventory, keyed by (tenant, branch, product).
const stockOf = async (productId: number) =>
  Number((await prisma.branchInventory.findFirst({ where: { tenantId: tidA, branchId: branchAId, productId } }))?.stockQty)

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tA = await prisma.tenant.create({ data: { name: 'Bill A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Bill B', subdomain: SUB_B } })
  tidA = tA.id; tidB = tB.id
  const uA = await prisma.user.create({ data: { tenantId: tidA, name: 'Doc A', email: `bill-a-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const uB = await prisma.user.create({ data: { tenantId: tidB, name: 'Doc B', email: `bill-b-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const bA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main' } })
  const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'Main' } })
  branchAId = bA.id
  tokenA = signToken({ userId: uA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenB = signToken({ userId: uB.id, tenantId: tidB, branchId: bB.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  doctorId = uA.id

  const owner = await prisma.owner.create({ data: { tenantId: tidA, firstName: 'Jane', lastName: 'Doe', phone: `08${ts.toString().slice(-8)}` } })
  const pet = await prisma.pet.create({ data: { tenantId: tidA, ownerId: owner.id, name: 'Rex', species: 'dog' } })
  petId = pet.id
  const drug = await prisma.inventoryItem.create({ data: { tenantId: tidA, name: 'Apoquel', unit: 'tablet', unitPrice: 30 } })
  drugId = drug.id
  const retail = await prisma.inventoryItem.create({ data: { tenantId: tidA, name: 'Dog Shampoo', unit: 'bottle', unitPrice: 200 } })
  retailId = retail.id
  // Per-branch stock for Tenant A's Main Branch.
  await prisma.branchInventory.createMany({ data: [
    { tenantId: tidA, branchId: bA.id, productId: drugId, stockQty: 100, minStockQty: 10 },
    { tenantId: tidA, branchId: bA.id, productId: retailId, stockQty: 10, minStockQty: 2 },
  ] })
  const rec = await prisma.medicalRecord.create({ data: { tenantId: tidA, petId, doctorId, assessment: 'Dermatitis' } })
  recordId = rec.id
  // Prescription priced from drug.unitPrice (created directly; stock already accounted for in seed value).
  await prisma.prescription.create({ data: { tenantId: tidA, medicalRecordId: recordId, drugId, quantity: 14, unit: 'tablet' } })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.invoiceItem.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.invoice.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.stockMovement.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.prescription.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.medicalRecord.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branchInventory.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.inventoryItem.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('bill-3.2 — Invoice generation & payment', () => {
  let invoiceId: number

  test('bill-01: create invoice from a visit auto-pulls medicine lines + 7% VAT', async () => {
    const res = await request(server).post('/api/invoices').set(auth(tokenA))
      .send({ medicalRecordId: recordId, items: [{ description: 'Consultation', itemType: 'service', qty: 1, unitPrice: 350 }] })
      .expect(201)
    const inv = res.body.data
    invoiceId = inv.id
    // medicine: 14 × 30 = 420 ; service 350 ; subtotal 770 ; tax 53.9 ; total 823.9
    expect(Number(inv.subtotal)).toBeCloseTo(770)
    expect(Number(inv.taxAmount)).toBeCloseTo(53.9)
    expect(Number(inv.totalAmount)).toBeCloseTo(823.9)
    expect(inv.items.length).toBe(2)
  })

  test('bill-02: invoiceNo matches INV-YYYY-MM-NNNN and is unique per tenant', async () => {
    const first = await prisma.invoice.findUnique({ where: { id: invoiceId } })
    expect(first?.invoiceNo).toMatch(/^INV-\d{4}-\d{2}-\d{4}$/)
    const res2 = await request(server).post('/api/invoices').set(auth(tokenA))
      .send({ items: [{ description: 'Nail trim', itemType: 'service', qty: 1, unitPrice: 100 }] }).expect(201)
    expect(res2.body.data.invoiceNo).not.toBe(first?.invoiceNo)
  })

  test('bill-03: retail line deducts stock and logs an "out" movement', async () => {
    const res = await request(server).post('/api/invoices').set(auth(tokenA))
      .send({ items: [{ description: 'Dog Shampoo', itemType: 'retail', qty: 3, unitPrice: 200, productId: retailId }] }).expect(201)
    expect(await stockOf(retailId)).toBe(7) // 10 - 3
    const moves = await prisma.stockMovement.findMany({ where: { itemId: retailId, movementType: 'out', referenceType: 'retail' } })
    expect(moves.length).toBe(1)
    expect(res.body.data.items[0].itemType).toBe('retail')
  })

  test('bill-04: retail line beyond stock is rejected (409) and rolls back', async () => {
    await request(server).post('/api/invoices').set(auth(tokenA))
      .send({ items: [{ description: 'Dog Shampoo', itemType: 'retail', qty: 999, unitPrice: 200, productId: retailId }] }).expect(409)
    expect(await stockOf(retailId)).toBe(7) // unchanged
  })

  test('bill-05: record payment marks invoice paid', async () => {
    const res = await request(server).put(`/api/invoices/${invoiceId}/payment`).set(auth(tokenA))
      .send({ paymentMethod: 'cash' }).expect(200)
    expect(res.body.data.paymentStatus).toBe('paid')
    expect(res.body.data.paidAt).toBeTruthy()
  })

  test('bill-06: double payment rejected (409)', async () => {
    await request(server).put(`/api/invoices/${invoiceId}/payment`).set(auth(tokenA)).send({ paymentMethod: 'cash' }).expect(409)
  })

  test('bill-07: empty invoice rejected (400)', async () => {
    await request(server).post('/api/invoices').set(auth(tokenA)).send({ items: [] }).expect(400)
  })

  // ── Isolation ──────────────────────────────────────────────────────────────
  test('bill-08: tenant B cannot read tenant A invoice → 404', async () => {
    await request(server).get(`/api/invoices/${invoiceId}`).set(auth(tokenB)).expect(404)
  })

  test('bill-09: tenant B cannot pay tenant A invoice → 404', async () => {
    await request(server).put(`/api/invoices/${invoiceId}/payment`).set(auth(tokenB)).send({ paymentMethod: 'cash' }).expect(404)
  })
})
