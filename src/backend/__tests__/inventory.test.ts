/**
 * Test Suite: inv-3.1 — Inventory Management (Phase 3)
 * @qa-agent | Protocol: qa-protocols.md §1 (isolation) + §3 (edge cases)
 *
 * Run: npx jest --testPathPattern=inventory.test
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
let branchAId: number
const SUB_A = `inv-a-${Date.now()}`
const SUB_B = `inv-b-${Date.now()}`

// Phase 4: stock lives in branch_inventory, keyed by (tenant, branch, product).
const stockOf = async (productId: number) =>
  Number((await prisma.branchInventory.findFirst({ where: { tenantId: tidA, branchId: branchAId, productId } }))?.stockQty)

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, resolve) })
  const hash = await bcrypt.hash('TestPass1!', 10)
  const ts = Date.now()
  const tA = await prisma.tenant.create({ data: { name: 'Inv A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Inv B', subdomain: SUB_B } })
  tidA = tA.id; tidB = tB.id
  const uA = await prisma.user.create({ data: { tenantId: tidA, name: 'Admin A', email: `inv-a-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const uB = await prisma.user.create({ data: { tenantId: tidB, name: 'Admin B', email: `inv-b-${ts}@t.local`, passwordHash: hash, role: 'admin' } })
  const bA = await prisma.branch.create({ data: { tenantId: tidA, name: 'Main' } })
  const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'Main' } })
  branchAId = bA.id
  tokenA = signToken({ userId: uA.id, tenantId: tidA, branchId: bA.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
  tokenB = signToken({ userId: uB.id, tenantId: tidB, branchId: bB.id, plane: 'clinic', permSetVersion: 1, role: 'admin' })
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.stockMovement.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branchInventory.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.inventoryItem.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.user.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
})

const auth = (t: string) => ({ Authorization: `Bearer ${t}` })

describe('inv-3.1 — Inventory CRUD + stock + alerts', () => {
  let productId: number

  test('inv-01: create product', async () => {
    const res = await request(server).post('/api/products').set(auth(tokenA))
      .send({ name: 'Amoxicillin 250mg', category: 'Medicine', unit: 'tablet', unitPrice: 12.5, minStockLevel: 20 })
      .expect(201)
    expect(res.body.data.id).toBeTruthy()
    expect(Number(res.body.data.unitPrice)).toBe(12.5)
    productId = res.body.data.id
  })

  test('inv-02: list returns the product, filtered by tenant', async () => {
    const res = await request(server).get('/api/products').set(auth(tokenA)).expect(200)
    const ids = res.body.data.products.map((p: { id: number }) => p.id)
    expect(ids).toContain(productId)
  })

  test('inv-03: search by name', async () => {
    const res = await request(server).get('/api/products?search=Amoxi').set(auth(tokenA)).expect(200)
    expect(res.body.data.products.length).toBeGreaterThan(0)
  })

  test('inv-04: stock-in increments quantity and logs an "in" movement', async () => {
    await request(server).post(`/api/products/${productId}/stock-in`).set(auth(tokenA))
      .send({ qty: 50, lotNo: 'L-001' }).expect(201)
    expect(await stockOf(productId)).toBe(50)
    const moves = await prisma.stockMovement.findMany({ where: { itemId: productId, movementType: 'in' } })
    expect(moves.length).toBe(1)
  })

  test('inv-05: alerts flag low stock (stock <= minStockLevel)', async () => {
    // Add a clearly low-stock item.
    const low = await request(server).post('/api/products').set(auth(tokenA))
      .send({ name: 'Low Item', category: 'Supply', unitPrice: 5, minStockLevel: 10 }).expect(201)
    await request(server).post(`/api/products/${low.body.data.id}/stock-in`).set(auth(tokenA)).send({ qty: 2 }).expect(201)
    const res = await request(server).get('/api/products/alerts').set(auth(tokenA)).expect(200)
    const lowIds = res.body.data.lowStock.map((p: { id: number }) => p.id)
    expect(lowIds).toContain(low.body.data.id)
    expect(res.body.data.inventoryValue).toBeGreaterThan(0)
  })

  test('inv-06: movements endpoint returns the stock card', async () => {
    const res = await request(server).get(`/api/products/${productId}/movements`).set(auth(tokenA)).expect(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0].movementType).toBe('in')
  })

  // ── Isolation ──────────────────────────────────────────────────────────────
  test('inv-07: tenant B cannot read tenant A product → 404', async () => {
    await request(server).get(`/api/products/${productId}`).set(auth(tokenB)).expect(404)
  })

  test('inv-08: tenant B cannot stock-in tenant A product → 404', async () => {
    await request(server).post(`/api/products/${productId}/stock-in`).set(auth(tokenB)).send({ qty: 5 }).expect(404)
    expect(await stockOf(productId)).toBe(50) // unchanged
  })

  test('inv-09: validation rejects bad category', async () => {
    await request(server).post('/api/products').set(auth(tokenA))
      .send({ name: 'X', category: 'NotACategory', unitPrice: 1 }).expect(400)
  })

  test('inv-10: no token → 401', async () => {
    await request(server).get('/api/products').expect(401)
  })
})
