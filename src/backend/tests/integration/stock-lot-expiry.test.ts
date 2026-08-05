/**
 * stock-lot-expiry.test.ts — R3-HI-05 regression coverage.
 *
 * Verifies:
 *  1. stockIn is earliest-wins on the aggregate BranchInventory.expiryDate
 *     (a later-dated receipt never hides a nearer-expiry lot from alerts).
 *  2. stockIn clears the aggregate lotNo to NULL when a receipt's lotNo
 *     differs from the currently stored one (can't claim a single lot
 *     identity across two different lots).
 *  3. Each StockMovement row created by stockIn carries its own
 *     lotNo/expiryDate — the permanent per-receipt traceability record.
 *  4. findExpiringSoon excludes rows with stockQty <= 0 (depleted stock
 *     must not generate expiry alerts).
 *  5. createTransfer carries the source lot's expiryDate (earliest-wins)
 *     onto the destination branch's aggregate row.
 *
 * Requires a live, reachable PostgreSQL (same convention as
 * tests/unit/user.repository.test.ts) — creates and tears down its own
 * isolated tenant/branch/product fixtures.
 */

import prisma from '../../config/db'
import * as productRepo from '../../models/product.repository'
import * as transferRepo from '../../models/transfer.repository'

let tenantId = 0
let branchAId = 0
let branchBId = 0

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: 'StockLotExpiry Unit Test', subdomain: `stock-lot-expiry-${Date.now()}` },
  })
  tenantId = tenant.id

  const [branchA, branchB] = await Promise.all([
    prisma.branch.create({ data: { tenantId, name: '__lot_test_branch_a__', isActive: true } }),
    prisma.branch.create({ data: { tenantId, name: '__lot_test_branch_b__', isActive: true } }),
  ])
  branchAId = branchA.id
  branchBId = branchB.id
})

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { tenantId } })
  await prisma.branchInventory.deleteMany({ where: { tenantId } })
  await prisma.inventoryItem.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await prisma.$disconnect()
})

async function createProduct(name: string) {
  const item = await prisma.inventoryItem.create({
    data: { tenantId, name, unitPrice: 10 },
  })
  await prisma.branchInventory.create({
    data: { tenantId, branchId: branchAId, productId: item.id, stockQty: 0, minStockQty: 0 },
  })
  return item.id
}

describe('stockIn — earliest-wins expiry + lot mismatch clears aggregate lotNo', () => {
  it('keeps the earlier expiry when a later-dated receipt arrives second', async () => {
    const productId = await createProduct('Earliest-Wins Product')
    const nearExpiry = new Date('2027-01-01T00:00:00.000Z')
    const farExpiry = new Date('2027-06-01T00:00:00.000Z')

    // Receive the near-expiry lot first, then a later-dated lot.
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-NEAR', expiryDate: nearExpiry.toISOString(),
    })
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-FAR', expiryDate: farExpiry.toISOString(),
    })

    const bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.expiryDate?.toISOString()).toBe(nearExpiry.toISOString())
    expect(Number(bi.stockQty)).toBe(10)
  })

  it('keeps the earlier expiry when the later-dated receipt arrives first', async () => {
    const productId = await createProduct('Earliest-Wins Reverse Order Product')
    const nearExpiry = new Date('2027-01-01T00:00:00.000Z')
    const farExpiry = new Date('2027-06-01T00:00:00.000Z')

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-FAR', expiryDate: farExpiry.toISOString(),
    })
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-NEAR', expiryDate: nearExpiry.toISOString(),
    })

    const bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.expiryDate?.toISOString()).toBe(nearExpiry.toISOString())
  })

  it('clears the aggregate lotNo to NULL when a receipt reports a different lot', async () => {
    const productId = await createProduct('Lot Mismatch Product')
    await productRepo.stockIn(tenantId, branchAId, productId, { qty: 5, lotNo: 'LOT-A' })

    let bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.lotNo).toBe('LOT-A')

    await productRepo.stockIn(tenantId, branchAId, productId, { qty: 5, lotNo: 'LOT-B' })

    bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.lotNo).toBeNull()
  })

  it('writes the received lotNo/expiryDate onto the StockMovement row for permanent traceability', async () => {
    const productId = await createProduct('Movement Traceability Product')
    const expiry = new Date('2027-03-15T00:00:00.000Z')
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 3, lotNo: 'LOT-TRACE', expiryDate: expiry.toISOString(),
    })

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { tenantId, itemId: productId, movementType: 'in' },
      orderBy: { createdAt: 'desc' },
    })
    expect(movement.lotNo).toBe('LOT-TRACE')
    expect(movement.expiryDate?.toISOString().slice(0, 10)).toBe('2027-03-15')
  })
})

describe('findExpiringSoon — excludes depleted stock', () => {
  it('does not alert on a row whose stockQty is 0', async () => {
    const productId = await createProduct('Depleted Expiring Product')
    const soonExpiry = new Date()
    soonExpiry.setDate(soonExpiry.getDate() + 5)

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 2, expiryDate: soonExpiry.toISOString(),
    })
    // Deplete the stock entirely.
    await prisma.branchInventory.update({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
      data: { stockQty: 0 },
    })

    const results = await productRepo.findExpiringSoon(tenantId, branchAId, 30)
    expect(results.some((r) => r.id === productId)).toBe(false)
  })

  it('still alerts on a row with the same expiry when stockQty > 0', async () => {
    const productId = await createProduct('In-Stock Expiring Product')
    const soonExpiry = new Date()
    soonExpiry.setDate(soonExpiry.getDate() + 5)

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 2, expiryDate: soonExpiry.toISOString(),
    })

    const results = await productRepo.findExpiringSoon(tenantId, branchAId, 30)
    expect(results.some((r) => r.id === productId)).toBe(true)
  })
})

describe('createTransfer — carries source lot expiry to destination (earliest-wins)', () => {
  it('sets the destination aggregate expiryDate from the source lot on first transfer', async () => {
    const productId = await createProduct('Transfer Expiry Product')
    const expiry = new Date('2027-02-01T00:00:00.000Z')
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 10, lotNo: 'LOT-XFER', expiryDate: expiry.toISOString(),
    })

    await transferRepo.createTransfer(tenantId, {
      fromBranchId: branchAId, toBranchId: branchBId, productId, qty: 4,
    })

    const destBi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchBId, productId } },
    })
    expect(destBi.expiryDate?.toISOString()).toBe(expiry.toISOString())
    expect(Number(destBi.stockQty)).toBe(4)
  })

  it('keeps the earliest expiry when a later-dated transfer lands on an existing destination row', async () => {
    const productId = await createProduct('Transfer Earliest-Wins Product')
    const nearExpiry = new Date('2027-01-10T00:00:00.000Z')
    const farExpiry = new Date('2027-05-10T00:00:00.000Z')

    // Source lot 1 (near expiry) transferred first.
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-N', expiryDate: nearExpiry.toISOString(),
    })
    await transferRepo.createTransfer(tenantId, {
      fromBranchId: branchAId, toBranchId: branchBId, productId, qty: 5,
    })

    // Source lot 2 (far expiry) arrives at source, then transferred too.
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-F', expiryDate: farExpiry.toISOString(),
    })
    await transferRepo.createTransfer(tenantId, {
      fromBranchId: branchAId, toBranchId: branchBId, productId, qty: 5,
    })

    const destBi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchBId, productId } },
    })
    expect(destBi.expiryDate?.toISOString()).toBe(nearExpiry.toISOString())
  })

  it('records the source lot/expiry on both paired StockMovement rows', async () => {
    const productId = await createProduct('Transfer Movement Traceability Product')
    const expiry = new Date('2027-04-01T00:00:00.000Z')
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 6, lotNo: 'LOT-MOVE', expiryDate: expiry.toISOString(),
    })

    await transferRepo.createTransfer(tenantId, {
      fromBranchId: branchAId, toBranchId: branchBId, productId, qty: 6,
    })

    const [outMovement, inMovement] = await Promise.all([
      prisma.stockMovement.findFirstOrThrow({
        where: { tenantId, itemId: productId, movementType: 'transfer_out' },
      }),
      prisma.stockMovement.findFirstOrThrow({
        where: { tenantId, itemId: productId, movementType: 'transfer_in' },
      }),
    ])
    expect(outMovement.lotNo).toBe('LOT-MOVE')
    expect(inMovement.lotNo).toBe('LOT-MOVE')
    expect(outMovement.expiryDate?.toISOString()).toBe(expiry.toISOString())
    expect(inMovement.expiryDate?.toISOString()).toBe(expiry.toISOString())
  })
})
