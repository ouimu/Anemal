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
      const ok = await deductBranchStock(tx, tenantId, branchId, drugId, 15) // 20 -> 5
      expect(ok).toBe(true)
      notifyALocked() // A's UPDATE has executed — Postgres now holds the row lock
      await releaseAGate // stay open — the row lock is held until this resolves
    })

    await aLocked // B must not start until A provably holds the lock

    let bPid = 0
    const txB = prisma.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`
      bPid = pid // captured before the blocking UPDATE below, on the same connection
      return deductBranchStock(tx, tenantId, branchId, drugId, 8)
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
    expect(await stockOf()).toBe(5) // only A's deduction landed
  })
})
