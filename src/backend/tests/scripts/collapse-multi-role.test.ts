import { PrismaClient } from '@prisma/client'
import { classifyMultiRoleUsers } from '../../prisma/scripts/collapse-multi-role'

const prisma = new PrismaClient()

describe('classifyMultiRoleUsers', () => {
  let tenantId: number
  let systemDoctorRoleId: number

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Collapse Test', subdomain: 'collapse-test-1' } })
    tenantId = tenant.id
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    systemDoctorRoleId = doctorRole.id
  })

  afterAll(async () => {
    // FK-safe order: userRole/user rows reference this tenant's custom
    // ClinicRole rows via roleId (default NO ACTION), so they must be cleared
    // before the tenant cascade-deletes the ClinicRole rows — otherwise the
    // delete silently fails (swallowed by .catch) and orphans the tenant,
    // breaking the next run's unique-subdomain create.
    await prisma.userRole.deleteMany({ where: { tenantId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it('does not classify a single-role user at all', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Single Role', username: 'single_role_collapse', passwordHash: 'x', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: systemDoctorRoleId, tenantId } })

    const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

    expect(autoCollapsible.find(c => c.userId === user.id)).toBeUndefined()
    expect(ambiguous.find(a => a.userId === user.id)).toBeUndefined()
  })
})
