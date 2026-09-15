/**
 * XTI-6 — tenant-integrity-scan.ts (arch §7, plan XTI-6, BA sign-off §18 AC-4).
 *
 * Proves the operator script actually finds a deliberately-planted cross-tenant FK corruption
 * (the same recipe `vaccinationDueSoonTenantLeak.test.ts` uses: a vaccination row owned by tenant
 * `tid` whose `petId` FK points at a pet belonging to tenant `otherTid`), reports it by
 * table/id/tenant pair, and never surfaces a PII field value — structurally, because the scan
 * query only ever selects id/tenantId columns.
 */
import prisma from '../../config/db'
import { Prisma } from '@prisma/client'
import {
  scanTenantIntegrity,
  buildTenantScopedForwardRelations,
  type IntegrityViolation,
} from '../../scripts/tenant-integrity-scan'

const SUB = `xti6-scan-test-${Date.now()}`

let tid = 0
let otherTid = 0
let otherPetId = 0
let leakyVaccinationId = 0

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { name: 'XTI-6 Scan Test', subdomain: SUB } })
  tid = tenant.id
  const otherTenant = await prisma.tenant.create({ data: { name: 'XTI-6 Scan Test — Other', subdomain: `${SUB}-other` } })
  otherTid = otherTenant.id

  // The other tenant's owner + pet — this PII must never appear in the scan's output.
  const otherOwner = await prisma.owner.create({
    data: { tenantId: otherTid, firstName: 'ScanSecret', lastName: 'Owner', phone: '0888888888' },
  })
  const otherPet = await prisma.pet.create({
    data: { tenantId: otherTid, ownerId: otherOwner.id, name: 'ScanSecret Pet', species: 'Dog' },
  })
  otherPetId = otherPet.id
})

afterAll(async () => {
  await prisma.vaccination.deleteMany({ where: { id: leakyVaccinationId } })
  await prisma.pet.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.owner.deleteMany({ where: { tenantId: { in: [tid, otherTid] } } })
  await prisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } })
})

describe('buildTenantScopedForwardRelations — DMMF derivation (AC: not hand-maintained)', () => {
  it('derives relations from Prisma.dmmf, including the vaccination -> pet relation', () => {
    const relations = buildTenantScopedForwardRelations(Prisma.dmmf as unknown as Parameters<typeof buildTenantScopedForwardRelations>[0])
    expect(relations.length).toBeGreaterThan(10) // this schema has dozens of tenant-scoped FKs

    const vaccinationToPet = relations.find((r) => r.childModel === 'Vaccination' && r.relationName === 'pet')
    expect(vaccinationToPet).toMatchObject({
      childTable: 'vaccinations',
      parentModel: 'Pet',
      parentTable: 'pets',
      fkColumn: 'petId',
      parentPkColumn: 'id',
    })

    // A relation to a model with no tenantId of its own (e.g. Pet -> Tenant) must not appear —
    // there is nothing to compare against.
    expect(relations.find((r) => r.parentModel === 'Tenant')).toBeUndefined()
  })
})

describe('scanTenantIntegrity — corrupt-row detection (plan XTI-6 AC-4)', () => {
  it('reports a planted cross-tenant vaccination row by table/id/tenant only, with no PII', async () => {
    // Before planting: the scan must be clean for these two fresh tenants.
    const before = await scanTenantIntegrity(prisma)
    expect(before.find((v) => v.table === 'vaccinations' && v.childTenantId === tid)).toBeUndefined()

    const nextDueAt = new Date()
    nextDueAt.setDate(nextDueAt.getDate() + 5)
    const leaky = await prisma.vaccination.create({
      data: { tenantId: tid, petId: otherPetId, vaccineName: 'Rabies', administeredAt: new Date(), nextDueAt },
    })
    leakyVaccinationId = leaky.id

    const violations = await scanTenantIntegrity(prisma)
    const found = violations.find((v) => v.table === 'vaccinations' && v.rowId === String(leaky.id))

    expect(found).toBeDefined()
    expect(found).toEqual<IntegrityViolation>({
      table: 'vaccinations',
      relation: 'pet',
      rowId: String(leaky.id),
      childTenantId: tid,
      parentTable: 'pets',
      parentTenantId: otherTid,
    })

    // Structural no-PII guarantee: every reported field is one of the six above — never a name,
    // phone, address, or any other PII column.
    expect(Object.keys(found!).sort()).toEqual(
      ['childTenantId', 'parentTable', 'parentTenantId', 'relation', 'rowId', 'table'].sort(),
    )
    const serialized = JSON.stringify(violations)
    expect(serialized).not.toContain('ScanSecret')
    expect(serialized).not.toContain('0888888888')

    // Remove the corrupt row and confirm the scan goes quiet again for this tenant pair.
    await prisma.vaccination.delete({ where: { id: leaky.id } })
    const after = await scanTenantIntegrity(prisma)
    expect(after.find((v) => v.table === 'vaccinations' && v.rowId === String(leaky.id))).toBeUndefined()
  }, 30_000)

  it('never remediates — the planted row survives the scan (script is read-only)', async () => {
    const nextDueAt = new Date()
    nextDueAt.setDate(nextDueAt.getDate() + 5)
    const leaky = await prisma.vaccination.create({
      data: { tenantId: tid, petId: otherPetId, vaccineName: 'Rabies (read-only check)', administeredAt: new Date(), nextDueAt },
    })
    leakyVaccinationId = leaky.id

    await scanTenantIntegrity(prisma)

    const stillThere = await prisma.vaccination.findUnique({ where: { id: leaky.id } })
    expect(stillThere).not.toBeNull()
    expect(stillThere?.petId).toBe(otherPetId) // untouched — no auto-reassignment either
  })
})
