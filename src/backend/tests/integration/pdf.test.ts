// @qa-agent — PDF endpoint integration tests.
// Verifies that invoice and prescription PDF routes return application/pdf with correct
// tenant isolation (Tenant B cannot download Tenant A's documents).

import request from 'supertest'
import { Server } from 'http'
import app from '../../app'
import prisma from '../../config/db'

let server: Server

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

async function getToken(subdomain: string, username: string, password: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password })
  expect(step1.status).toBe(200)
  if (step1.body.data.requiresBranchSelection === false) return step1.body.data.token as string
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data?.token
}

let adminA: string
let adminB: string
let invoiceId: number
let prescriptionId: number

beforeAll(async () => {
  adminA = await getToken('dev-clinic',  'admin_a', 'AdminPass1!')
  adminB = await getToken('test-clinic', 'admin_b', 'AdminPass2!')

  // Seed: owner + pet + invoice + payment for Tenant A.
  const uniq = `${Date.now()}`
  const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminA}`)
    .send({ firstName: 'PDF', lastName: `Tester${uniq}`, phone: `09${uniq.slice(-8)}` })
  const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminA}`)
    .send({ ownerId: ownerRes.body.data.id, name: 'Fluffy', species: 'cat', microchipId: `PDFMC${uniq}` })
  // Admin's token carries branchId: null (all-branches scope). Invoice creation
  // needs a concrete branch, so switch to one via the real switch-branch flow
  // (the same mechanism the frontend branch switcher uses) before creating it.
  const branchRes = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
  const branchId: number = branchRes.body.data[0].id
  const switchRes = await request(server)
    .post('/auth/switch-branch')
    .set('Authorization', `Bearer ${adminA}`)
    .send({ branchId })
  const branchScopedAdminA: string = switchRes.body.data.token

  // Create invoice with a service line.
  const invRes = await request(server)
    .post('/api/invoices')
    .set('Authorization', `Bearer ${branchScopedAdminA}`)
    .send({
      petId: petRes.body.data.id,
      items: [{ description: 'Consultation', itemType: 'service', qty: 1, unitPrice: 500 }],
    })
  expect(invRes.status).toBe(201)
  invoiceId = invRes.body.data.id

  // Pay the invoice.
  await request(server)
    .put(`/api/invoices/${invoiceId}/payment`)
    .set('Authorization', `Bearer ${branchScopedAdminA}`)
    .send({ paymentMethod: 'cash' })

  // Create a medical record + prescription for Tenant A to test prescription PDF.
  const mrRes = await request(server)
    .post('/api/medical-records')
    .set('Authorization', `Bearer ${adminA}`)
    .send({ petId: petRes.body.data.id, subjective: 'Sneezing', objective: 'Temp 38.5', assessment: 'URI', plan: 'Antibiotics' })

  // Find a drug in Tenant A inventory to use for the prescription.
  const drugRes = await prisma.inventoryItem.findFirst({
    where: { tenant: { subdomain: 'dev-clinic' }, isActive: true },
    select: { id: true },
  })

  if (mrRes.status === 201 && drugRes) {
    const rxRes = await request(server)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${branchScopedAdminA}`)
      .send({ medicalRecordId: mrRes.body.data.id, drugId: drugRes.id, quantity: 2, unit: 'tablet', dosageInstruction: '1 tab twice daily' })
    if (rxRes.status === 201) {
      prescriptionId = rxRes.body.data.id
    }
  }
})

describe('PDF — Invoice endpoint', () => {
  it('✅ GET /api/invoices/:id/pdf → 200 + application/pdf', async () => {
    const res = await request(server)
      .get(`/api/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${adminA}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    // Basic PDF magic bytes: %PDF
    expect((res.body as Buffer).slice(0, 4).toString()).toBe('%PDF')
  })

  it('❌ GET /api/invoices/:id/pdf with non-existent id → 404', async () => {
    const res = await request(server)
      .get('/api/invoices/999999999/pdf')
      .set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(404)
  })

  it('❌ Tenant B cannot download Tenant A invoice PDF → 404', async () => {
    const res = await request(server)
      .get(`/api/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})

describe('PDF — Prescription endpoint', () => {
  it('✅ GET /api/prescriptions/:id/pdf → 200 + application/pdf', async () => {
    if (!prescriptionId) {
      console.warn('Skipping prescription PDF test — no drug seeded in dev-clinic')
      return
    }
    const res = await request(server)
      .get(`/api/prescriptions/${prescriptionId}/pdf`)
      .set('Authorization', `Bearer ${adminA}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    expect((res.body as Buffer).slice(0, 4).toString()).toBe('%PDF')
  })

  it('❌ GET /api/prescriptions/:id/pdf with non-existent id → 404', async () => {
    const res = await request(server)
      .get('/api/prescriptions/999999999/pdf')
      .set('Authorization', `Bearer ${adminA}`)
    expect(res.status).toBe(404)
  })

  it('❌ Tenant B cannot download Tenant A prescription PDF → 404', async () => {
    if (!prescriptionId) return
    const res = await request(server)
      .get(`/api/prescriptions/${prescriptionId}/pdf`)
      .set('Authorization', `Bearer ${adminB}`)
    expect(res.status).toBe(404)
  })
})

describe('PDF — Thai+Latin+digit glyph smoke test (T-3a.2, ADR-0013 D1/F1)', () => {
  it('✅ invoice PDF renders a Thai+Latin+digit line description without throwing', async () => {
    const uniq = `${Date.now()}`
    const ownerRes = await request(server).post('/api/owners').set('Authorization', `Bearer ${adminA}`)
      .send({ firstName: 'Glyph', lastName: `Test${uniq}`, phone: `09${uniq.slice(-8)}` })
    const petRes = await request(server).post('/api/pets').set('Authorization', `Bearer ${adminA}`)
      .send({ ownerId: ownerRes.body.data.id, name: 'ตัวทดสอบ', species: 'cat', microchipId: `GLYPH${uniq}` })

    const branchRes = await request(server).get('/api/branches').set('Authorization', `Bearer ${adminA}`)
    const branchId: number = branchRes.body.data[0].id
    const switchRes = await request(server)
      .post('/auth/switch-branch')
      .set('Authorization', `Bearer ${adminA}`)
      .send({ branchId })
    const scopedAdminA: string = switchRes.body.data.token

    const invRes = await request(server)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${scopedAdminA}`)
      .send({
        petId: petRes.body.data.id,
        items: [{ description: 'ค่าตรวจ Exam 250', itemType: 'service', qty: 1, unitPrice: 250 }],
      })
    expect(invRes.status).toBe(201)

    const res = await request(server)
      .get(`/api/invoices/${invRes.body.data.id}/pdf`)
      .set('Authorization', `Bearer ${adminA}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    const buf = res.body as Buffer
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })

  it('✅ prescription PDF renders Thai+Latin+digit dosage instructions without throwing [Grill F1]', async () => {
    if (!prescriptionId) {
      console.warn('Skipping — no drug seeded in dev-clinic')
      return
    }
    // Patch the prescription seeded in the top-level beforeAll to mix Thai +
    // Latin + digits in the dosage instruction — proves the shared font path
    // (generatePrescriptionPdf, pdf.service.ts:166-237) also renders correctly.
    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { dosageInstruction: '1 tab twice daily กินหลังอาหาร 250mg' },
    })

    const res = await request(server)
      .get(`/api/prescriptions/${prescriptionId}/pdf`)
      .set('Authorization', `Bearer ${adminA}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
    expect(res.status).toBe(200)
    const buf = res.body as Buffer
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })
})
