/**
 * Characterization tests for transfer.repository.ts's createTransfer —
 * added as a Lane D Gate 0 prerequisite for the Phase 3 refactor (2026-09-09
 * code-quality backlog) that extracted its raw-SQL source-branch deduction
 * into product.repository.ts's shared deductBranchStock(). Before this file,
 * no test exercised this money/inventory path at all — QA flagged it as a
 * blocking gap (95/95 green carried no evidential weight for this function).
 * @qa-agent
 */
import prisma from '../config/db'
import { ConflictError } from '../utils/errors'
import * as transferRepo from '../models/transfer.repository'
import { deductBranchStock } from '../models/product.repository'
import type { CreateTransferInput } from '../services/transfer.service'

const SUB = `xfer-stock-${Date.now()}`
let tenantId = 0
let fromBranchId = 0
let toBranchId = 0
let productId = 0

const stockAt = async (branchId: number) =>
  Number((await prisma.branchInventory.findFirst({ where: { tenantId, branchId, productId } }))?.stockQty ?? 0)

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { name: 'Xfer Stock', subdomain: SUB } })
  tenantId = tenant.id
  const from = await prisma.branch.create({ data: { tenantId, name: 'Source' } })
  const to = await prisma.branch.create({ data: { tenantId, name: 'Dest' } })
  fromBranchId = from.id
  toBranchId = to.id
  const product = await prisma.inventoryItem.create({ data: { tenantId, name: 'Dog Shampoo', unit: 'bottle', unitPrice: 200 } })
  productId = product.id
})

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { tenantId } })
  await prisma.branchInventory.deleteMany({ where: { tenantId } })
  await prisma.inventoryItem.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.branchInventory.upsert({
    where: { tenantId_branchId_productId: { tenantId, branchId: fromBranchId, productId } },
    update: { stockQty: 20, lotNo: null, expiryDate: null },
    create: { tenantId, branchId: fromBranchId, productId, stockQty: 20, minStockQty: 0 },
  })
  await prisma.branchInventory.deleteMany({ where: { tenantId, branchId: toBranchId, productId } })
})

afterEach(async () => {
  await prisma.stockMovement.deleteMany({ where: { tenantId } })
})

function input(qty: number): CreateTransferInput {
  return { productId, fromBranchId, toBranchId, qty, notes: null }
}

describe('transfer.repository.createTransfer', () => {
  test('sufficient stock: deducts source, creates/increments destination, logs paired transfer_out/transfer_in movements', async () => {
    await transferRepo.createTransfer(tenantId, input(5))

    expect(await stockAt(fromBranchId)).toBe(15) // 20 - 5
    expect(await stockAt(toBranchId)).toBe(5)

    const out = await prisma.stockMovement.findFirst({ where: { tenantId, branchId: fromBranchId, movementType: 'transfer_out', itemId: productId } })
    const inMove = await prisma.stockMovement.findFirst({ where: { tenantId, branchId: toBranchId, movementType: 'transfer_in', itemId: productId } })
    expect(out).not.toBeNull()
    expect(inMove).not.toBeNull()
    expect(out!.qty.toString()).toBe('5')
    expect(inMove!.qty.toString()).toBe('5')
  })

  test('exact stock (qty === source stockQty): boundary passes, source lands at zero', async () => {
    await transferRepo.createTransfer(tenantId, input(20))
    expect(await stockAt(fromBranchId)).toBe(0)
    expect(await stockAt(toBranchId)).toBe(20)
  })

  test('insufficient stock at source: throws ConflictError, source and destination both unchanged, no movements logged', async () => {
    await expect(transferRepo.createTransfer(tenantId, input(21))).rejects.toThrow(ConflictError)
    await expect(transferRepo.createTransfer(tenantId, input(21))).rejects.toThrow('Insufficient stock at source branch')

    expect(await stockAt(fromBranchId)).toBe(20) // unchanged
    expect(await stockAt(toBranchId)).toBe(0) // destination row never created

    const movementCount = await prisma.stockMovement.count({ where: { tenantId, itemId: productId } })
    expect(movementCount).toBe(0)
  })

  test('two concurrent transfers against the same 20-unit source, only one requesting more than available: exactly one succeeds', async () => {
    const results = await Promise.allSettled([
      transferRepo.createTransfer(tenantId, input(12)),
      transferRepo.createTransfer(tenantId, input(12)),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled).toHaveLength(1)
    expect(await stockAt(fromBranchId)).toBe(8) // 20 - 12
    expect(await stockAt(toBranchId)).toBe(12)
  })

  // @qa-agent flagged (2026-09-09 re-review of Phase 3, twice): the test
  // above only proves "one of two racing calls succeeds," which depends on
  // JS event-loop timing, not a forced database-level overlap. A first
  // attempt at a deterministic version (hold A's lock, signal, start B,
  // release A) LOOKED right but QA measured it directly and found the
  // release fires before B's UPDATE even reaches Postgres in most runs
  // (B's own UPDATE took 1-5ms — uncontended — instead of ~400ms+ blocked)
  // — A's commit round-trip from a resolved promise is faster than B's
  // BEGIN round-trip, so B usually never actually contends for the lock.
  // The assertions still passed either way (A commits first regardless,
  // so B correctly sees the post-commit balance whether or not real
  // contention occurred) — false confidence, not a false failure.
  //
  // Fix (QA's own suggestion): don't release A until B is OBSERVED blocked
  // on the lock via pg_stat_activity, queried from a third connection. This
  // makes the overlap a measured fact, not an assumption from promise
  // ordering.
  test('a transaction holding the row lock blocks a second deduction until commit — proven by polling pg_stat_activity for B genuinely waiting on the lock, not assumed from promise timing', async () => {
    let releaseA: () => void
    const releaseAGate = new Promise<void>((resolve) => { releaseA = resolve })
    let notifyALocked: () => void
    const aLocked = new Promise<void>((resolve) => { notifyALocked = resolve })

    const txA = prisma.$transaction(async (tx) => {
      const ok = await deductBranchStock(tx, tenantId, fromBranchId, productId, 15) // 20 -> 5
      expect(ok).toBe(true)
      notifyALocked() // A's UPDATE has executed — Postgres now holds the row lock
      await releaseAGate // stay open — the row lock is held until this resolves
    })

    await aLocked // B must not start until A provably holds the lock

    let bPid = 0
    const txB = prisma.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
      bPid = pid // captured before the blocking UPDATE below, on the same connection
      return deductBranchStock(tx, tenantId, fromBranchId, productId, 8)
    })

    // Poll a THIRD connection (the module-level `prisma` pool, untouched by
    // either transaction) until B's own backend is observed genuinely
    // waiting on a lock — proof of real contention, not an assumption.
    const deadline = Date.now() + 5000
    let observedBlocked = false
    while (Date.now() < deadline && !observedBlocked) {
      if (bPid) {
        const rows = await prisma.$queryRaw<{ wait_event_type: string | null }[]>`
          SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${bPid}
        `
        if (rows[0]?.wait_event_type === 'Lock') observedBlocked = true
      }
      if (!observedBlocked) await new Promise((r) => setTimeout(r, 5))
    }
    expect(observedBlocked).toBe(true) // B is genuinely contending for A's row lock

    releaseA()
    const [, bOk] = await Promise.all([txA, txB])

    expect(bOk).toBe(false)
    expect(await stockAt(fromBranchId)).toBe(5) // only A's deduction landed
  })
})
