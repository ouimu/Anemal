/**
 * Test Suite: rep-3.3 — Reports & Analytics (Phase 3)
 * @qa-agent | Protocol: qa-protocols.md §1 (isolation)
 *
 * Run: npx jest --testPathPattern=reports.test
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
const SUB_A = `rep-a-${Date.now()}`
const SUB_B = `rep-b-${Date.now()}`

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tA = await prisma.tenant.create({ data: { name: 'Rep A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Rep B', subdomain: SUB_B } })
  tidA = tA.id; tidB = tB.id
  const uA = await prisma.user.create({ data: { tenantId: tidA, name: 'A', email: `rep-a-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const uB = await prisma.user.create({ data: { tenantId: tidB, name: 'B', email: `rep-b-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  tokenA = signToken({ userId: uA.id, tenantId: tidA, role: 'admin' })
  tokenB = signToken({ userId: uB.id, tenantId: tidB, role: 'admin' })

  // Tenant A: one PAID invoice of 500 today. Tenant B: nothing.
  await prisma.invoice.create({
    data: { tenantId: tidA, invoiceNo: `INV-TEST-${ts}`, subtotal: 500, taxAmount: 0, totalAmount: 500, paymentStatus: 'paid',
      items: { create: [{ tenantId: tidA, description: 'Consult', itemType: 'service', quantity: 1, unitPrice: 500, totalPrice: 500 }] } },
  })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.invoiceItem.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.invoice.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('rep-3.3 — Reports tenant isolation', () => {
  test('rep-01: snapshot reflects tenant A paid revenue', async () => {
    const res = await request(server).get('/api/reports/snapshot').set(auth(tokenA)).expect(200)
    expect(res.body.data.revenueToday).toBeGreaterThanOrEqual(500)
    expect(res.body.data).toHaveProperty('pendingInvoices')
  })

  test('rep-02: tenant B snapshot does not see tenant A revenue', async () => {
    const res = await request(server).get('/api/reports/snapshot').set(auth(tokenB)).expect(200)
    expect(res.body.data.revenueToday).toBe(0)
  })

  test('rep-03: revenue series is tenant-scoped', async () => {
    const res = await request(server).get('/api/reports/revenue?period=daily').set(auth(tokenA)).expect(200)
    expect(res.body.data.total).toBeGreaterThanOrEqual(500)
    const resB = await request(server).get('/api/reports/revenue?period=daily').set(auth(tokenB)).expect(200)
    expect(resB.body.data.total).toBe(0)
  })

  test('rep-04: top-services returns the service line for tenant A only', async () => {
    const res = await request(server).get('/api/reports/top-services').set(auth(tokenA)).expect(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    const resB = await request(server).get('/api/reports/top-services').set(auth(tokenB)).expect(200)
    expect(resB.body.data.length).toBe(0)
  })

  test('rep-05: no token → 401', async () => {
    await request(server).get('/api/reports/snapshot').expect(401)
  })
})
