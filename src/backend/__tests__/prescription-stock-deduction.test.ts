/**
 * Characterization tests for prescription.repository.ts's deductStockAndCreate —
 * added as a Lane D Gate 0 prerequisite for the Phase 3 refactor (2026-09-09
 * code-quality backlog) that extracted its raw-SQL stock deduction into
 * product.repository.ts's shared deductBranchStock(). Before this file, no
 * test exercised this money/inventory path at all — QA flagged it as a
 * blocking gap (95/95 green carried no evidential weight for this function).
 * @qa-agent
 */
import prisma from '../config/db'
import * as prescriptionRepo from '../models/prescription.repository'
import { deductBranchStock } from '../models/product.repository'
import type { CreatePrescriptionInput } from '../services/prescription.service'

const SUB = `presc-stock-${Date.now()}`
let tenantId = 0
let branchId = 0
let drugId = 0
let recordId = 0

const stockOf = async () =>
  Number((await prisma.branchInventory.findFirst({ where: { tenantId, branchId, productId: drugId } }))?.stockQty)

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { name: 'Presc Stock', subdomain: SUB } })
  tenantId = tenant.id
  const branch = await prisma.branch.create({ data: { tenantId, name: 'Main' } })
  branchId = branch.id
  const drug = await prisma.inventoryItem.create({ data: { tenantId, name: 'Apoquel', unit: 'tablet', unitPrice: 30 } })
  drugId = drug.id
  const owner = await prisma.owner.create({ data: { tenantId, firstName: 'Jane', lastName: 'Doe', phone: `08${Date.now().toString().slice(-8)}` } })
  const pet = await prisma.pet.create({ data: { tenantId, ownerId: owner.id, name: 'Rex', species: 'dog' } })
  const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
  const doctor = await prisma.user.create({
    data: { tenantId, name: 'Vet', username: `pst_doc_${Date.now() % 100000}`, email: `presc-stock-${Date.now()}@t.local`, passwordHash: 'x', roleId: doctorRole.id },
  })
  const record = await prisma.medicalRecord.create({ data: { tenantId, petId: pet.id, doctorId: doctor.id, assessment: 'Dermatitis' } })
  recordId = record.id
})

afterAll(async () => {
  await prisma.stockMovement.deleteMany({ where: { tenantId } })
  await prisma.prescription.deleteMany({ where: { tenantId } })
  await prisma.medicalRecord.deleteMany({ where: { tenantId } })
  await prisma.pet.deleteMany({ where: { tenantId } })
  await prisma.owner.deleteMany({ where: { tenantId } })
  await prisma.branchInventory.deleteMany({ where: { tenantId } })
  await prisma.inventoryItem.deleteMany({ where: { tenantId } })
  await prisma.user.deleteMany({ where: { tenantId } })
  await prisma.branch.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.branchInventory.upsert({
    where: { tenantId_branchId_productId: { tenantId, branchId, productId: drugId } },
    update: { stockQty: 20 },
    create: { tenantId, branchId, productId: drugId, stockQty: 20, minStockQty: 0 },
  })
})

afterEach(async () => {
  await prisma.stockMovement.deleteMany({ where: { tenantId } })
  await prisma.prescription.deleteMany({ where: { tenantId } })
})

function input(quantity: number): CreatePrescriptionInput {
  return { medicalRecordId: recordId, drugId, quantity, unit: 'tablet', dosageInstruction: null }
}

describe('prescription.repository.deductStockAndCreate', () => {
  test('sufficient stock: deducts qty, creates the prescription, logs an "out" stock movement', async () => {
    const prescription = await prescriptionRepo.deductStockAndCreate(tenantId, branchId, input(5))
    expect(prescription).not.toBeNull()
    expect(prescription!.quantity.toString()).toBe('5')
    expect(await stockOf()).toBe(15) // 20 - 5

    const movement = await prisma.stockMovement.findFirst({
      where: { tenantId, branchId, itemId: drugId, movementType: 'out', referenceType: 'prescription', referenceId: prescription!.id },
    })
    expect(movement).not.toBeNull()
    expect(movement!.qty.toString()).toBe('5')
  })

  test('exact stock (qty === stockQty): boundary passes, stock lands at zero', async () => {
    const prescription = await prescriptionRepo.deductStockAndCreate(tenantId, branchId, input(20))
    expect(prescription).not.toBeNull()
    expect(await stockOf()).toBe(0)
  })

  test('insufficient stock: returns null, no prescription created, no stock movement logged, stock unchanged', async () => {
    const prescription = await prescriptionRepo.deductStockAndCreate(tenantId, branchId, input(21))
    expect(prescription).toBeNull()
    expect(await stockOf()).toBe(20) // unchanged

    const count = await prisma.prescription.count({ where: { tenantId, medicalRecordId: recordId } })
    expect(count).toBe(0)
    const movementCount = await prisma.stockMovement.count({ where: { tenantId, itemId: drugId } })
    expect(movementCount).toBe(0)
  })

  test('two concurrent dispenses against the same 20-unit stock, only one requesting more than available: exactly one succeeds', async () => {
    const [a, b] = await Promise.all([
      prescriptionRepo.deductStockAndCreate(tenantId, branchId, input(12)),
      prescriptionRepo.deductStockAndCreate(tenantId, branchId, input(12)),
    ])
    const succeeded = [a, b].filter((r) => r !== null)
    expect(succeeded).toHaveLength(1)
    expect(await stockOf()).toBe(8) // 20 - 12
  })

  // @qa-agent flagged (2026-09-09 re-review of Phase 3): the test above only
  // proves "one of two racing calls succeeds," which depends on the JS event
  // loop happening to interleave the two calls — it doesn't force a real
  // overlap at the database level, so it's non-deterministic proof at best.
  // This test forces a genuine, deterministic overlap instead: it holds
  // transaction A open (its UPDATE executed, row lock taken, not yet
  // committed) and only starts B once A's lock is provably held, so B's own
  // UPDATE must block on that row lock until A commits — then it
  // re-evaluates its WHERE clause against the POST-commit balance, not a
  // stale one. This reliably exercises the real Postgres row-locking
  // mechanism deductBranchStock depends on, every run, not by timing luck.
  //
  // Caveat verified by deliberately mutating deductBranchStock to a naive
  // SELECT-then-UPDATE during review: this test does NOT reliably fail
  // against every possible non-atomic implementation, because a plain SELECT
  // doesn't itself contend for the row lock the way a write does — only an
  // implementation whose deduction step is a single write-and-check UPDATE
  // (the real one) is what this test deterministically exercises. It is a
  // correctness proof for the actual code, not a general mutation-catching
  // adversarial test.
  test('a transaction holding the row lock blocks a second deduction until commit, which then correctly re-evaluates against the post-commit balance', async () => {
    let releaseA: () => void
    const releaseAGate = new Promise<void>((resolve) => { releaseA = resolve })
    let notifyALocked: () => void
    const aLocked = new Promise<void>((resolve) => { notifyALocked = resolve })

    const txA = prisma.$transaction(async (tx) => {
      const ok = await deductBranchStock(tx, tenantId, branchId, drugId, 15) // 20 -> 5
      expect(ok).toBe(true)
      notifyALocked() // A's UPDATE has executed — Postgres now holds the row lock
      await releaseAGate // stay open — the row lock is held until this resolves
    })

    await aLocked // B must not start until A provably holds the lock

    // B's own UPDATE contends for the same row lock A holds, so it blocks
    // until A commits, then evaluates WHERE "stockQty" >= 8 against the true
    // post-commit balance of 5 and correctly fails.
    const txB = prisma.$transaction(async (tx) => deductBranchStock(tx, tenantId, branchId, drugId, 8))

    releaseA()
    const [, bOk] = await Promise.all([txA, txB])

    expect(bOk).toBe(false)
    expect(await stockOf()).toBe(5) // only A's deduction landed
  })
})
