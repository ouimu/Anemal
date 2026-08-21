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
import { signToken, signPlatformToken } from '../config/jwt'
import bcrypt from 'bcrypt'
import { seedUserRoles, cleanupUserRoles } from '../tests/helpers/seedUserRoles'

let server: Server
let tidA: number, tidB: number
let tokenA: string, tokenB: string, tokenA2: string, tokenDocA: string, tokenPlatform: string
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
  const adminRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } })
  // Doctor holds no `billing.payment` (permission-matrix: E | - | E across
  // admin | doctor | staff), so it is the deny case for the payment route.
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const uA = await prisma.user.create({ data: { tenantId: tidA, name: 'Doc A', username: `bill_adm_a_${ts % 100000}`, email: `bill-a-${ts}@t.local`, passwordHash: hash, roleId: adminRole.id } })
  const uDocA = await prisma.user.create({ data: { tenantId: tidA, name: 'Vet A', username: `bill_doc_a_${ts % 100000}`, email: `bill-doc-a-${ts}@t.local`, passwordHash: hash, roleId: doctorRole.id } })
  const uB = await prisma.user.create({ data: { tenantId: tidB, name: 'Doc B', username: `bill_adm_b_${ts % 100000}`, email: `bill-b-${ts}@t.local`, passwordHash: hash, roleId: adminRole.id } })
  const bA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main' } })
  const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'Main' } })
  // Second branch in tenant A (not tenant B's bB) — used to distinguish the
  // "wrong branch, same tenant" case (bill-17) from the cross-tenant case
  // (bill-09). bB belongs to tenant B and must never stand in for this.
  const bA2 = await prisma.branch.create({ data: { tenantId: tidA, name: 'Annex' } })
  branchAId = bA.id
  tokenA = signToken({ userId: uA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenB = signToken({ userId: uB.id, tenantId: tidB, branchId: bB.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenA2 = signToken({ userId: uA.id, tenantId: tidA, branchId: bA2.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenDocA = signToken({ userId: uDocA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'doctor' })
  // Platform-plane token for the requirePlane deny case. authMiddleware skips
  // the tenant lookup for platform tokens (tenantId 0), so no platform_users
  // row is needed — the request is rejected before any DB access.
  tokenPlatform = signPlatformToken({ platformUserId: 999999, plane: 'platform', role: 'platform_super_admin' })
  doctorId = uA.id

  await seedUserRoles(prisma, [
    { userId: uA.id,    tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uDocA.id, tenantId: tidA, roleKey: 'doctor' },
    { userId: uB.id,    tenantId: tidB, roleKey: 'clinic_admin' },
  ])

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
  await cleanupUserRoles(prisma, [tidA, tidB])
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

  // ADR-0025 four-case table: 409 may only ever describe an invoice inside the
  // caller's own tenant+branch scope. bill-17/bill-18 cover the remaining two
  // 404 rows (wrong branch same tenant, nonexistent id); bill-06 above already
  // covers the fourth row (already paid, own scope → 409).
  test('bill-17: same-tenant, wrong-branch pay attempt → 404', async () => {
    await request(server).put(`/api/invoices/${invoiceId}/payment`).set(auth(tokenA2)).send({ paymentMethod: 'cash' }).expect(404)
  })

  test('bill-18: same-tenant, nonexistent invoice id → 404', async () => {
    await request(server).put('/api/invoices/999999999/payment').set(auth(tokenA)).send({ paymentMethod: 'cash' }).expect(404)
  })

  // QA finding: bill-17 reuses `invoiceId`, which bill-05/bill-06 already left
  // paid — so it can't tell a correctly-scoped claim from one where the branch
  // clause was silently dropped (an unscoped `updateMany` still matches zero
  // rows via `paymentStatus: { not: 'paid' }` alone). bill-19 uses a fresh,
  // still-UNPAID invoice so a dropped branch clause would flip this to a 200
  // and mutate the row — the regression this branch's fix is meant to close.
  test('bill-19: wrong-branch pay attempt on an UNPAID invoice → 404, and the invoice stays unpaid', async () => {
    const created = await request(server).post('/api/invoices').set(auth(tokenA))
      .send({ items: [{ description: 'Nail trim', itemType: 'service', qty: 1, unitPrice: 100 }] }).expect(201)
    const freshInvoiceId = created.body.data.id as number

    await request(server).put(`/api/invoices/${freshInvoiceId}/payment`).set(auth(tokenA2)).send({ paymentMethod: 'cash' }).expect(404)

    const stillUnpaid = await prisma.invoice.findUnique({ where: { id: freshInvoiceId } })
    expect(stillUnpaid?.paymentStatus).not.toBe('paid')
  })

  // ── Authorization deny-path (route guards, not business logic) ─────────────
  // PUT /:id/payment is guarded by requirePlane('clinic') + requirePermission
  // ('billing.payment'). Nothing asserted these guards, so removing either one
  // went undetected — on the endpoint that moves money. Each test below uses a
  // FRESH UNPAID invoice and re-reads the row, so dropping a guard flips the
  // result to 200 with a mutated row rather than merely changing a status code.
  const freshUnpaidInvoice = async (): Promise<number> => {
    const created = await request(server).post('/api/invoices').set(auth(tokenA))
      .send({ items: [{ description: 'Guard probe', itemType: 'service', qty: 1, unitPrice: 50 }] }).expect(201)
    return created.body.data.id as number
  }

  test('bill-20: doctor lacks billing.payment → 403, invoice untouched', async () => {
    const id = await freshUnpaidInvoice()
    await request(server).put(`/api/invoices/${id}/payment`).set(auth(tokenDocA)).send({ paymentMethod: 'cash' }).expect(403)
    const row = await prisma.invoice.findUnique({ where: { id } })
    expect(row?.paymentStatus).not.toBe('paid')
  })

  test('bill-21: platform-plane token cannot pay a clinic invoice → 403, invoice untouched', async () => {
    const id = await freshUnpaidInvoice()
    await request(server).put(`/api/invoices/${id}/payment`).set(auth(tokenPlatform)).send({ paymentMethod: 'cash' }).expect(403)
    const row = await prisma.invoice.findUnique({ where: { id } })
    expect(row?.paymentStatus).not.toBe('paid')
  })

  test('bill-22: unauthenticated payment attempt → 401, invoice untouched', async () => {
    const id = await freshUnpaidInvoice()
    await request(server).put(`/api/invoices/${id}/payment`).send({ paymentMethod: 'cash' }).expect(401)
    const row = await prisma.invoice.findUnique({ where: { id } })
    expect(row?.paymentStatus).not.toBe('paid')
  })
})

describe('bill-3.3 — Payment History: invoice.id, filters, receiver options (T-3b.1, T-3c.1, T-3c.2)', () => {
  // Deviation from plan (documented): the plan's Task 3 draft declared
  // branchAId/adminUserId/staffUserId/staffBUserId/otherAdminUserId here even
  // though they are only *read* starting in Tasks 7-8 (branchAId is never
  // read at all). tsconfig.json has noUnusedLocals: true, so ts-jest fails to
  // even load the suite with those declared-but-unread. Declaring each id
  // variable in the task that first reads it (Task 7 adds the four it needs;
  // branchAId is dropped — it was dead in the plan) keeps every task's commit
  // green without changing any test's behavior or assertions.
  let tidPH: number
  let tidOther: number
  let adminUserId: number
  let staffUserId: number
  let staffBUserId: number
  let otherAdminUserId: number
  let tokenAdminPH: string
  let tokenStaffPH: string
  let invoicePaidByAdmin: number

  async function payInvoiceAs(token: string, method: string): Promise<number> {
    const invRes = await request(server).post('/api/invoices').set(auth(token))
      .send({ items: [{ description: 'Line', itemType: 'service', qty: 1, unitPrice: 100 }] }).expect(201)
    await request(server).put(`/api/invoices/${invRes.body.data.id}/payment`).set(auth(token))
      .send({ paymentMethod: method }).expect(200)
    return invRes.body.data.id
  }

  beforeAll(async () => {
    const ts = Date.now()
    const hash = await bcrypt.hash('TestPass1!', 10)

    const tenant = await prisma.tenant.create({ data: { name: 'PayHist Tenant', subdomain: `payhist-${ts}` } })
    tidPH = tenant.id
    const branchA = await prisma.branch.create({ data: { tenantId: tidPH, name: 'Main' } })
    const branchB = await prisma.branch.create({ data: { tenantId: tidPH, name: 'Branch B' } })

    const [phAdminRole, phStaffRole] = await Promise.all([
      prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_admin', tenantId: null } }),
      prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } }),
    ])
    const admin  = await prisma.user.create({ data: { tenantId: tidPH, branchId: branchA.id, name: 'PH Admin',  username: `ph_admin_${ts % 100000}`,  email: `ph-admin-${ts}@t.local`,  passwordHash: hash, roleId: phAdminRole.id } })
    const staff  = await prisma.user.create({ data: { tenantId: tidPH, branchId: branchA.id, name: 'PH Staff',  username: `ph_staff_${ts % 100000}`,  email: `ph-staff-${ts}@t.local`,  passwordHash: hash, roleId: phStaffRole.id } })
    const staffB = await prisma.user.create({ data: { tenantId: tidPH, branchId: branchB.id, name: 'PH Staff B', username: `ph_staffb_${ts % 100000}`, email: `ph-staffb-${ts}@t.local`, passwordHash: hash, roleId: phStaffRole.id } })
    adminUserId = admin.id
    staffUserId = staff.id
    staffBUserId = staffB.id

    await seedUserRoles(prisma, [
      { userId: admin.id,  tenantId: tidPH, roleKey: 'clinic_admin' },
      { userId: staff.id,  tenantId: tidPH, roleKey: 'clinic_staff' },
      { userId: staffB.id, tenantId: tidPH, roleKey: 'clinic_staff' },
    ])

    tokenAdminPH = signToken({ userId: admin.id, tenantId: tidPH, branchId: branchA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
    tokenStaffPH = signToken({ userId: staff.id, tenantId: tidPH, branchId: branchA.id, plane: 'clinic', permSetVersion: 1, role: 'staff' })
    const tokenStaffB = signToken({ userId: staffB.id, tenantId: tidPH, branchId: branchB.id, plane: 'clinic', permSetVersion: 1, role: 'staff' })

    // Cross-tenant probe — a second tenant's admin, used to prove receivedById
    // filtering and receivedByOptions never leak another tenant's user (T-3c.1
    // test 4, T-3c.2 test).
    const otherTenant = await prisma.tenant.create({ data: { name: 'PayHist Other', subdomain: `payhist-other-${ts}` } })
    tidOther = otherTenant.id
    const otherAdmin = await prisma.user.create({ data: { tenantId: tidOther, name: 'Other Admin', username: `ph_other_${ts % 100000}`, email: `ph-other-${ts}@t.local`, passwordHash: hash, roleId: phAdminRole.id } })
    otherAdminUserId = otherAdmin.id
    await seedUserRoles(prisma, [{ userId: otherAdmin.id, tenantId: tidOther, roleKey: 'clinic_admin' }])

    invoicePaidByAdmin = await payInvoiceAs(tokenAdminPH, 'cash')
    await payInvoiceAs(tokenStaffPH, 'qr_promptpay')
    await payInvoiceAs(tokenStaffB, 'transfer')
  })

  afterAll(async () => {
    await prisma.paymentHistory.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await prisma.invoiceItem.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await prisma.invoice.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await cleanupUserRoles(prisma, [tidPH, tidOther])
    await prisma.user.deleteMany({ where: { tenantId: { in: [tidPH, tidOther] } } })
    await prisma.branch.deleteMany({ where: { tenantId: tidPH } })
    await prisma.tenant.deleteMany({ where: { id: { in: [tidPH, tidOther] } } })
  })

  test('bill-10: payment-history rows carry invoice.id and invoice.invoiceNo (T-3b.1)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').set(auth(tokenAdminPH)).expect(200)
    const row = res.body.data.rows.find((r: { invoice: { id: number } }) => r.invoice.id === invoicePaidByAdmin)
    expect(row).toBeTruthy()
    expect(typeof row.invoice.id).toBe('number')
    expect(typeof row.invoice.invoiceNo).toBe('string')
  })

  test('bill-11: method=cash returns only cash rows (T-3c.1)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ method: 'cash' }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBeGreaterThan(0)
    for (const r of res.body.data.rows) expect(r.method).toBe('cash')
  })

  test('bill-12: receivedById=<staff> returns only that staff\'s rows (T-3c.1)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ receivedById: staffUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBeGreaterThan(0)
    for (const r of res.body.data.rows) expect(r.receivedBy.id).toBe(staffUserId)
  })

  test('bill-13: method + receivedById AND together (T-3c.1)', async () => {
    const match = await request(server).get('/api/invoices/payment-history')
      .query({ method: 'cash', receivedById: adminUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(match.body.data.rows.some((r: { invoice: { id: number } }) => r.invoice.id === invoicePaidByAdmin)).toBe(true)

    const mismatch = await request(server).get('/api/invoices/payment-history')
      .query({ method: 'cash', receivedById: staffUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(mismatch.body.data.rows.length).toBe(0) // staff paid via qr_promptpay, not cash
  })

  test('bill-14: cross-tenant receivedById probe returns 0 rows, never leaks data (T-3c.1 test 4)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ receivedById: otherAdminUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBe(0)
  })

  test('bill-15: branch-scoped user filtering by another branch\'s receivedById gets 0 rows (T-3c.1 test 5)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').query({ receivedById: staffBUserId }).set(auth(tokenAdminPH)).expect(200)
    expect(res.body.data.rows.length).toBe(0) // tokenAdminPH is scoped to branchA; staffB is branchB
  })

  test('bill-16: receivedByOptions lists exactly the distinct receivers in caller scope, never cross-tenant/cross-branch (T-3c.2)', async () => {
    const res = await request(server).get('/api/invoices/payment-history').set(auth(tokenAdminPH)).expect(200)
    const ids = (res.body.data.receivedByOptions as Array<{ id: number; name: string }>).map((o) => o.id)
    expect(ids).toContain(adminUserId)
    expect(ids).toContain(staffUserId)
    expect(ids).not.toContain(staffBUserId)     // different branch — tokenAdminPH is branch-scoped to branchA
    expect(ids).not.toContain(otherAdminUserId) // different tenant
  })
})
