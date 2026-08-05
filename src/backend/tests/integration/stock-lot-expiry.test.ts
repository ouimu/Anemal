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

let tenantBId = 0
let branchTenantBId = 0

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

  const tenantB = await prisma.tenant.create({
    data: { name: 'StockLotExpiry Tenant B', subdomain: `stock-lot-expiry-b-${Date.now()}` },
  })
  tenantBId = tenantB.id
  const branchTenantB = await prisma.branch.create({
    data: { tenantId: tenantBId, name: '__lot_test_branch_tenantB__', isActive: true },
  })
  branchTenantBId = branchTenantB.id
})

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { tenantId: { in: [tenantId, tenantBId] } } })
  await prisma.branchInventory.deleteMany({ where: { tenantId: { in: [tenantId, tenantBId] } } })
  await prisma.inventoryItem.deleteMany({ where: { tenantId: { in: [tenantId, tenantBId] } } })
  await prisma.branch.deleteMany({ where: { tenantId: { in: [tenantId, tenantBId] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, tenantBId] } } })
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

  it('BA-required: resets (does not LEAST) the aggregate expiry/lot when a receipt lands after the bin was fully depleted', async () => {
    const productId = await createProduct('Reset-On-Empty Product')
    const staleNearExpiry = new Date('2027-01-05T00:00:00.000Z')
    // Deliberately LATER than staleNearExpiry: under the old monotone
    // earliest-wins rule (no reset path), LEAST(stale near, new far) would
    // stay pinned at the stale near date forever, even though that lot is
    // long gone. The fix must report the NEW date instead.
    const newFarExpiry = new Date('2027-09-05T00:00:00.000Z')

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 3, lotNo: 'LOT-DEPLETED', expiryDate: staleNearExpiry.toISOString(),
    })
    // Dispense the lot to zero (simulates a sale/consumption draining the bin).
    await prisma.branchInventory.update({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
      data: { stockQty: 0 },
    })

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 8, lotNo: 'LOT-FRESH', expiryDate: newFarExpiry.toISOString(),
    })

    const bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.expiryDate?.toISOString()).toBe(newFarExpiry.toISOString())
    expect(bi.lotNo).toBe('LOT-FRESH')
    expect(Number(bi.stockQty)).toBe(8)
  })

  it('BA-required: clears the aggregate expiryDate to NULL when a no-expiry receipt lands after the bin was fully depleted', async () => {
    const productId = await createProduct('Reset-On-Empty No-Expiry Product')
    const staleExpiry = new Date('2027-02-10T00:00:00.000Z')

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 2, lotNo: 'LOT-STALE', expiryDate: staleExpiry.toISOString(),
    })
    await prisma.branchInventory.update({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
      data: { stockQty: 0 },
    })

    // Receiving into the now-empty bin with NO expiry/lot data must clear
    // the stale date rather than leaving it in place.
    await productRepo.stockIn(tenantId, branchAId, productId, { qty: 5 })

    const bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.expiryDate).toBeNull()
    expect(Number(bi.stockQty)).toBe(5)
  })
})

describe('stockIn — tenant isolation on the branch_inventory aggregate row', () => {
  it("does not read or modify tenant A's aggregate row when called with tenant B's id", async () => {
    const productId = await createProduct('Cross-Tenant Isolation Product')
    const expiry = new Date('2027-07-01T00:00:00.000Z')
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-TENANT-A', expiryDate: expiry.toISOString(),
    })

    const beforeBi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })

    // Tenant B calls stockIn against the SAME productId/branch-shape but
    // scoped to tenant B's own tenantId+branchId. The repository-layer
    // tenantId scoping (composite unique key + WHERE predicate on every
    // statement) must confine this to a tenant-B-scoped row and must never
    // read or mutate tenant A's aggregate.
    await productRepo.stockIn(tenantBId, branchTenantBId, productId, {
      qty: 99, lotNo: 'LOT-TENANT-B-ATTACK', expiryDate: new Date('2020-01-01T00:00:00.000Z').toISOString(),
    })

    const afterBi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })

    expect(Number(afterBi.stockQty)).toBe(Number(beforeBi.stockQty))
    expect(afterBi.lotNo).toBe(beforeBi.lotNo)
    expect(afterBi.expiryDate?.toISOString()).toBe(beforeBi.expiryDate?.toISOString())

    // Clean up the tenant-B-scoped row the cross-tenant call created.
    await prisma.branchInventory.deleteMany({ where: { tenantId: tenantBId, productId } })
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

  it('keeps the earliest expiry when a nearer-dated transfer lands on a destination row that already holds a far expiry', async () => {
    const productId = await createProduct('Transfer Earliest-Wins Product')
    const nearExpiry = new Date('2027-01-10T00:00:00.000Z')
    const farExpiry = new Date('2027-05-10T00:00:00.000Z')

    // Seed the destination directly with a FAR expiry via its own prior
    // receipt, so the destination aggregate is non-empty (stockQty > 0)
    // before the transfer under test lands — this is what actually
    // exercises the LEAST comparison instead of the reset-on-empty path.
    await productRepo.stockIn(tenantId, branchBId, productId, {
      qty: 3, lotNo: 'LOT-DEST-FAR', expiryDate: farExpiry.toISOString(),
    })

    // Source lot (near expiry) transferred from branch A into the
    // already-far-dated destination.
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 5, lotNo: 'LOT-N', expiryDate: nearExpiry.toISOString(),
    })
    await transferRepo.createTransfer(tenantId, {
      fromBranchId: branchAId, toBranchId: branchBId, productId, qty: 5,
    })

    const destBi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchBId, productId } },
    })
    expect(destBi.expiryDate?.toISOString()).toBe(nearExpiry.toISOString())
    // Assert lotNo too: under the reset-on-empty path (destination was
    // empty) lotNo would become 'LOT-N' outright; under a plain unconditional
    // overwrite it would also become 'LOT-N'. Only true LEAST-with-mismatch
    // clears it to NULL (destination had stock > 0 with a DIFFERENT lot) —
    // this is what actually distinguishes LEAST from either alternative.
    expect(destBi.lotNo).toBeNull()
    expect(Number(destBi.stockQty)).toBe(8)
  })

  it('mirror of the above: keeps the earliest expiry when a FAR-dated transfer lands on a destination row that already holds a NEARER expiry', async () => {
    // This is the case that an unconditional overwrite (or an accidentally
    // reversed LEAST/GREATEST) would fail: destination already holds the
    // near date; a far-dated transfer must NOT push it forward.
    const productId = await createProduct('Transfer Earliest-Wins Mirror Product')
    const nearExpiry = new Date('2027-01-15T00:00:00.000Z')
    const farExpiry = new Date('2027-06-15T00:00:00.000Z')

    await productRepo.stockIn(tenantId, branchBId, productId, {
      qty: 3, lotNo: 'LOT-DEST-NEAR', expiryDate: nearExpiry.toISOString(),
    })

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
    expect(destBi.lotNo).toBeNull()
    expect(Number(destBi.stockQty)).toBe(8)
  })

  it('replaces (does not LEAST) the destination expiry/lot when the transfer lands on an emptied-out destination bin', async () => {
    const productId = await createProduct('Transfer Reset-On-Empty Product')
    const staleFarExpiry = new Date('2027-05-20T00:00:00.000Z')
    // Deliberately LATER than staleFarExpiry: if the destination were still
    // LEAST'd against the stale value instead of reset outright, the result
    // would stay pinned at staleFarExpiry (the earlier of the two) — so
    // observing this later date proves replacement, not LEAST.
    const laterThanStaleExpiry = new Date('2027-08-01T00:00:00.000Z')

    // Destination receives a far-dated lot first, then is fully depleted.
    await productRepo.stockIn(tenantId, branchBId, productId, {
      qty: 4, lotNo: 'LOT-OLD', expiryDate: staleFarExpiry.toISOString(),
    })
    await prisma.branchInventory.update({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchBId, productId } },
      data: { stockQty: 0 },
    })

    // A fresh lot with a later-than-stale expiry is transferred into the
    // now-empty destination bin.
    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 6, lotNo: 'LOT-NEW', expiryDate: laterThanStaleExpiry.toISOString(),
    })
    await transferRepo.createTransfer(tenantId, {
      fromBranchId: branchAId, toBranchId: branchBId, productId, qty: 6,
    })

    const destBi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchBId, productId } },
    })
    expect(destBi.expiryDate?.toISOString()).toBe(laterThanStaleExpiry.toISOString())
    expect(destBi.lotNo).toBe('LOT-NEW')
    expect(Number(destBi.stockQty)).toBe(6)
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

describe('stockIn — sequential receipts onto an empty bin compose reset-on-empty with earliest-wins', () => {
  it('the second receipt still applies earliest-wins against the first (not an arbitrary overwrite)', async () => {
    // True concurrency (two simultaneous transactions racing the same row)
    // requires a live DB with real transaction interleaving, which this
    // Jest process cannot simulate deterministically. This sequential test
    // proves the reset-on-empty branch composes correctly with the
    // earliest-wins branch: receipt #1 resets the empty bin outright,
    // receipt #2 (bin now non-empty) LEASTs against receipt #1 as normal —
    // together these are the two code paths true concurrent receipts would
    // hit depending on commit order.
    const productId = await createProduct('Sequential-Onto-Empty Product')
    const firstExpiry = new Date('2027-03-01T00:00:00.000Z')
    const secondEarlierExpiry = new Date('2027-02-01T00:00:00.000Z')

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 2, lotNo: 'LOT-FIRST', expiryDate: firstExpiry.toISOString(),
    })
    let bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.expiryDate?.toISOString()).toBe(firstExpiry.toISOString())

    await productRepo.stockIn(tenantId, branchAId, productId, {
      qty: 2, lotNo: 'LOT-SECOND', expiryDate: secondEarlierExpiry.toISOString(),
    })
    bi = await prisma.branchInventory.findUniqueOrThrow({
      where: { tenantId_branchId_productId: { tenantId, branchId: branchAId, productId } },
    })
    expect(bi.expiryDate?.toISOString()).toBe(secondEarlierExpiry.toISOString())
    expect(Number(bi.stockQty)).toBe(4)
  })
})
