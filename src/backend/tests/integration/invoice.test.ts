// Integration tests for GET /api/invoices/:id/promptpay-qr (QR-05 through QR-08)
// @qa-agent — HTTP-level tenant isolation, 200/404/422 flows
import request from 'supertest'
import { Server } from 'http'
import bcrypt from 'bcrypt'
import app from '../../app'
import prisma from '../../config/db'
import { seedUserRoles, cleanupUserRoles } from '../helpers/seedUserRoles'

const SUB_A = 'invoice-qr-a'
const SUB_B = 'invoice-qr-b'
const PASSWORD = 'TestPass1!'

let server: Server
let tidA = 0
let tidB = 0
let adminA = ''
let adminB = ''
let invoiceIdA = 0

async function login(subdomain: string, username: string): Promise<string> {
  const step1 = await request(server).post('/auth/login').send({ subdomain, username, password: PASSWORD })
  expect(step1.status).toBe(200)
  const { pendingToken, branches } = step1.body.data
  const step2 = await request(server).post('/auth/select-branch').send({ pendingToken, branchId: branches[0].id })
  expect(step2.status).toBe(200)
  return step2.body.data.token as string
}

async function createMinimalInvoice(tenantId: number, branchId: number): Promise<number> {
  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      branchId,
      invoiceNo: `INV-QR-TEST-${Date.now()}`,
      subtotal: 200,
      discount: 0,
      taxRate: 7,
      taxAmount: 14,
      totalAmount: 214,
      paymentStatus: 'pending',
      issuedAt: new Date(),
    },
  })
  return invoice.id
}

beforeAll(async () => {
  await new Promise<void>(resolve => { server = app.listen(0, resolve) })
  server.keepAliveTimeout = 0

  const tA = await prisma.tenant.create({ data: { name: 'Invoice QR A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Invoice QR B', subdomain: SUB_B } })
  tidA = tA.id
  tidB = tB.id

  // Create branches for each tenant
  const branchA = await prisma.branch.create({
    data: { tenantId: tidA, name: 'Main Branch A', address: 'Test Addr A' },
  })
  const branchB = await prisma.branch.create({
    data: { tenantId: tidB, name: 'Main Branch B', address: 'Test Addr B' },
  })

  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  await prisma.user.createMany({
    data: [
      { tenantId: tidA, name: 'Admin A', username: 'admin_qra', email: 'admin@qr-a.test', passwordHash, role: 'admin' },
      { tenantId: tidB, name: 'Admin B', username: 'admin_qrb', email: 'admin@qr-b.test', passwordHash, role: 'admin' },
    ],
  })

  // Seed UserRole rows before login so requirePermission() resolves permissions
  const [uAdminA, uAdminB] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { tenantId: tidA, username: 'admin_qra' } }),
    prisma.user.findFirstOrThrow({ where: { tenantId: tidB, username: 'admin_qrb' } }),
  ])
  await seedUserRoles(prisma, [
    { userId: uAdminA.id, tenantId: tidA, roleKey: 'clinic_admin' },
    { userId: uAdminB.id, tenantId: tidB, roleKey: 'clinic_admin' },
  ])

  adminA = await login(SUB_A, 'admin_qra')
  adminB = await login(SUB_B, 'admin_qrb')

  // Create an invoice for tenant A
  invoiceIdA = await createMinimalInvoice(tidA, branchA.id)

  // Set promptpayId for tenant A
  await prisma.tenantSettings.upsert({
    where: { tenantId: tidA },
    update: { promptpayId: '0812345678' },
    create: { tenantId: tidA, promptpayId: '0812345678' },
  })

  // Ensure tenant B has no promptpayId (upsert with null)
  await prisma.tenantSettings.upsert({
    where: { tenantId: tidB },
    update: { promptpayId: null },
    create: { tenantId: tidB, promptpayId: null },
  })

  // Create an invoice for tenant B (for QR-07 test)
  await createMinimalInvoice(tidB, branchB.id)
})

afterAll(async () => {
  await cleanupUserRoles(prisma, [tidA, tidB])
  await prisma.invoiceItem.deleteMany({ where: { invoice: { tenantId: { in: [tidA, tidB] } } } })
  await prisma.invoice.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenantSettings.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
  await prisma.$disconnect()
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
})

describe('QR-05 — valid tenant + invoice with promptpayId → 200 with data URI', () => {
  it('returns 200 with a base64 PNG data URI', async () => {
    const res = await request(server)
      .get(`/api/invoices/${invoiceIdA}/promptpay-qr`)
      .set('Authorization', `Bearer ${adminA}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.dataUrl).toBe('string')
    expect(res.body.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })
})

describe('QR-06 — cross-tenant isolation: Tenant B JWT + Tenant A invoice → 404', () => {
  it('returns 404 when JWT tenant does not own the invoice', async () => {
    const res = await request(server)
      .get(`/api/invoices/${invoiceIdA}/promptpay-qr`)
      .set('Authorization', `Bearer ${adminB}`)

    expect(res.status).toBe(404)
  })
})

describe('QR-07 — invoice exists but no promptpayId configured → 422', () => {
  it('returns 422 when tenant B has no promptpayId', async () => {
    // Create an invoice for tenant B to test
    const branchB = await prisma.branch.findFirst({ where: { tenantId: tidB } })
    const invB = await createMinimalInvoice(tidB, branchB!.id)

    const res = await request(server)
      .get(`/api/invoices/${invB}/promptpay-qr`)
      .set('Authorization', `Bearer ${adminB}`)

    expect(res.status).toBe(422)

    // Cleanup
    await prisma.invoice.delete({ where: { id: invB } })
  })
})

describe('QR-08 — non-existent invoice ID → 404', () => {
  it('returns 404 for an invoice ID that does not exist', async () => {
    const res = await request(server)
      .get('/api/invoices/99999999/promptpay-qr')
      .set('Authorization', `Bearer ${adminA}`)

    expect(res.status).toBe(404)
  })
})
