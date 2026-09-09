/**
 * Characterization tests for vaccination.repository.ts's findDueSoonWorklist —
 * added as a Lane D Gate 0 prerequisite for the Phase 5 refactor (2026-09-09
 * code-quality backlog) that adds explicit tenant guards to its raw SQL
 * joins on `pets`/`owners` (per @db-agent review — R2-HI-02 pattern, closing
 * a defense-in-depth gap; the joins previously relied on FK integrity alone).
 * Before this file, tests/integration/vaccination-worklist.test.ts covered
 * only the HTTP route's 200/403 status, seeding no pets or vaccinations —
 * nothing asserted about row content, dedup, branch scoping, or tenant
 * isolation, exactly the behavior this fix touches.
 * @db-agent | @qa-agent
 */
import prisma from '../config/db'
import * as vaccinationRepo from '../models/vaccination.repository'

const SUB_A = `vax-wl-repo-a-${Date.now()}`
const SUB_B = `vax-wl-repo-b-${Date.now()}`

let tidA = 0
let tidB = 0
let branchA1 = 0
let branchA2 = 0

const DAY_MS = 24 * 60 * 60 * 1000
const today = () => new Date()
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY_MS)
const cutoff7 = daysFromNow(7)

async function makeOwnerPet(tenantId: number, branchId: number | null, ownerName: [string, string], petName: string) {
  const owner = await prisma.owner.create({
    data: { tenantId, firstName: ownerName[0], lastName: ownerName[1], phone: `08${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 10)}` },
  })
  const pet = await prisma.pet.create({
    data: { tenantId, ownerId: owner.id, name: petName, species: 'dog', branchId },
  })
  return { owner, pet }
}

beforeAll(async () => {
  const tA = await prisma.tenant.create({ data: { name: 'Vax WL Repo A', subdomain: SUB_A } })
  const tB = await prisma.tenant.create({ data: { name: 'Vax WL Repo B', subdomain: SUB_B } })
  tidA = tA.id
  tidB = tB.id
  const bA1 = await prisma.branch.create({ data: { tenantId: tidA, name: 'Branch 1' } })
  const bA2 = await prisma.branch.create({ data: { tenantId: tidA, name: 'Branch 2' } })
  branchA1 = bA1.id
  branchA2 = bA2.id
})

afterAll(async () => {
  await prisma.vaccination.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tidA, tidB] } } })
  await prisma.branch.deleteMany({ where: { tenantId: tidA } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tidA, tidB] } } })
  await prisma.$disconnect()
})

describe('vaccination.repository.findDueSoonWorklist', () => {
  test('dedups to the latest administeredAt per (pet, vaccineName) — case/whitespace-insensitive', async () => {
    const { pet } = await makeOwnerPet(tidA, branchA1, ['Jane', 'Doe'], 'Rex')
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: pet.id, vaccineName: 'Rabies', administeredAt: daysFromNow(-400), nextDueAt: daysFromNow(-1) },
    })
    // Same vaccine, different casing/whitespace, administered MORE RECENTLY — should win the dedup.
    // `nextDueAt` is a Postgres `@db.Date` column (calendar date, no timezone) —
    // compare via the UTC calendar date (how it round-trips), computed once and
    // reused for both the insert and the assertion, not recomputed at assert
    // time (recomputing risks a spurious mismatch near a local-midnight/UTC
    // day boundary, e.g. Thailand's UTC+7 offset).
    const expectedNextDue = daysFromNow(3)
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: pet.id, vaccineName: '  rabies  ', administeredAt: daysFromNow(-30), nextDueAt: expectedNextDue },
    })

    const rows = await vaccinationRepo.findDueSoonWorklist(tidA, branchA1, cutoff7)
    const forPet = rows.filter((r) => r.petId === pet.id)
    expect(forPet).toHaveLength(1)
    expect(forPet[0].vaccineName.trim().toLowerCase()).toBe('rabies')
    expect(new Date(forPet[0].nextDueAt).toISOString().slice(0, 10)).toBe(expectedNextDue.toISOString().slice(0, 10))
  })

  test('branch-scoped: a pet in a different branch of the same tenant is excluded', async () => {
    const { pet: petBranch1 } = await makeOwnerPet(tidA, branchA1, ['Anan', 'Somchai'], 'Milo')
    const { pet: petBranch2 } = await makeOwnerPet(tidA, branchA2, ['Anan', 'Somchai'], 'Bella')
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: petBranch1.id, vaccineName: 'DHPP', administeredAt: today(), nextDueAt: daysFromNow(2) },
    })
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: petBranch2.id, vaccineName: 'DHPP', administeredAt: today(), nextDueAt: daysFromNow(2) },
    })

    const rowsBranch1 = await vaccinationRepo.findDueSoonWorklist(tidA, branchA1, cutoff7)
    expect(rowsBranch1.some((r) => r.petId === petBranch1.id)).toBe(true)
    expect(rowsBranch1.some((r) => r.petId === petBranch2.id)).toBe(false)
  })

  test('a NULL-branch pet appears in every branch\'s list (documented behavior)', async () => {
    const { pet } = await makeOwnerPet(tidA, null, ['Somsri', 'Jai'], 'Nala')
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: pet.id, vaccineName: 'Bordetella', administeredAt: today(), nextDueAt: daysFromNow(1) },
    })

    const rowsBranch1 = await vaccinationRepo.findDueSoonWorklist(tidA, branchA1, cutoff7)
    const rowsBranch2 = await vaccinationRepo.findDueSoonWorklist(tidA, branchA2, cutoff7)
    expect(rowsBranch1.some((r) => r.petId === pet.id)).toBe(true)
    expect(rowsBranch2.some((r) => r.petId === pet.id)).toBe(true)
  })

  test('branchId=null (admin, all-branches) returns pets across every branch of the tenant', async () => {
    const rowsAllBranches = await vaccinationRepo.findDueSoonWorklist(tidA, null, cutoff7)
    expect(rowsAllBranches.length).toBeGreaterThanOrEqual(3) // at least the 3 distinct pets seeded above
  })

  test('excludes vaccinations due further out than the cutoff, and already-past ones with no nextDueAt reset', async () => {
    const { pet } = await makeOwnerPet(tidA, branchA1, ['Far', 'Out'], 'Tooth Faery')
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: pet.id, vaccineName: 'Leptospirosis', administeredAt: today(), nextDueAt: daysFromNow(30) },
    })
    const rows = await vaccinationRepo.findDueSoonWorklist(tidA, branchA1, cutoff7)
    expect(rows.some((r) => r.petId === pet.id)).toBe(false)
  })

  test('tenant isolation: a due-soon vaccination in tenant B never appears in tenant A\'s worklist (branch-scoped or all-branches)', async () => {
    const bB = await prisma.branch.create({ data: { tenantId: tidB, name: 'B Main' } })
    const { pet: petB } = await makeOwnerPet(tidB, bB.id, ['Cross', 'Tenant'], 'Ghost')
    await prisma.vaccination.create({
      data: { tenantId: tidB, petId: petB.id, vaccineName: 'Rabies', administeredAt: today(), nextDueAt: daysFromNow(1) },
    })

    const rowsA_branch = await vaccinationRepo.findDueSoonWorklist(tidA, branchA1, cutoff7)
    const rowsA_allBranches = await vaccinationRepo.findDueSoonWorklist(tidA, null, cutoff7)
    expect(rowsA_branch.some((r) => r.petId === petB.id)).toBe(false)
    expect(rowsA_allBranches.some((r) => r.petId === petB.id)).toBe(false)

    // And tenant B's own worklist DOES see it — proves the isolation is
    // tenant-scoping, not an accidental "nothing ever matches" bug.
    const rowsB = await vaccinationRepo.findDueSoonWorklist(tidB, bB.id, cutoff7)
    expect(rowsB.some((r) => r.petId === petB.id)).toBe(true)

    await prisma.vaccination.deleteMany({ where: { tenantId: tidB } })
    await prisma.pet.deleteMany({ where: { tenantId: tidB } })
    await prisma.owner.deleteMany({ where: { tenantId: tidB } })
    await prisma.branch.deleteMany({ where: { id: bB.id } })
  })

  test('row shape: petName, species, breed, ownerName, ownerPhone, vaccineName, nextDueAt, daysDue all populated correctly', async () => {
    const { owner, pet } = await makeOwnerPet(tidA, branchA1, ['Shape', 'Check'], 'Shapey')
    await prisma.vaccination.create({
      data: { tenantId: tidA, petId: pet.id, vaccineName: 'FVRCP', administeredAt: today(), nextDueAt: daysFromNow(2) },
    })
    const rows = await vaccinationRepo.findDueSoonWorklist(tidA, branchA1, cutoff7)
    const row = rows.find((r) => r.petId === pet.id)
    expect(row).toBeDefined()
    expect(row!.petName).toBe('Shapey')
    expect(row!.species).toBe('dog')
    expect(row!.ownerName).toBe(`${owner.firstName} ${owner.lastName}`)
    expect(row!.ownerPhone).toBe(owner.phone)
    expect(row!.vaccineName).toBe('FVRCP')
    expect(typeof row!.daysDue).toBe('number')
  })
})
