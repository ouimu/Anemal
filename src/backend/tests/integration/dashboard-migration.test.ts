import prisma from '../../config/db'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('dashboard migration schema', () => {
  it('Pet model has branchId as nullable integer column', async () => {
    const result = await prisma.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pets' AND column_name = 'branchId'
    `
    expect(result.length).toBe(1)
    expect(result[0].is_nullable).toBe('YES')
    expect(result[0].data_type).toBe('integer')
  })

  it('Vaccination model has administeredExternally as boolean with default false', async () => {
    const result = await prisma.$queryRaw<{ column_name: string; column_default: string | null }[]>`
      SELECT column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vaccinations' AND column_name = 'administeredExternally'
    `
    expect(result.length).toBe(1)
    expect(result[0].column_default).toMatch(/false/)
  })

  it('pets_tenantId_branchId_idx composite index exists', async () => {
    const result = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'pets' AND indexname LIKE '%branchId%'
    `
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})
