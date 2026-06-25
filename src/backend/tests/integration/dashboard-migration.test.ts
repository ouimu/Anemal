/**
 * @file dashboard-migration.test.ts
 * @description Verifies that the dashboard_redesign migration applied correctly.
 * Checks: Pet.branchId column, Vaccination.administeredExternally column,
 * and the composite index on pets(tenantId, branchId).
 */

import prisma from '../../config/db'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('dashboard migration schema', () => {
  it('Pet model has branchId column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pets' AND column_name = 'branchId'
    `
    expect(result.length).toBe(1)
  })

  it('Vaccination model has administeredExternally column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'vaccinations' AND column_name = 'administeredExternally'
    `
    expect(result.length).toBe(1)
  })

  it('pets_tenantId_branchId_idx index exists', async () => {
    const result = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'pets' AND indexname = 'pets_tenantId_branchId_idx'
    `
    expect(result.length).toBe(1)
  })
})
