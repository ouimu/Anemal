import { PrismaClient } from '@prisma/client'
import { classifyMultiRoleUsers } from '../../prisma/scripts/collapse-multi-role'

const prisma = new PrismaClient()

describe('classifyMultiRoleUsers', () => {
  let tenantId: number
  let systemDoctorRoleId: number
  let systemStaffRoleId: number
  let customRoleAId: number
  let customRoleBId: number

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Collapse Test', subdomain: 'collapse-test-1' } })
    tenantId = tenant.id
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    systemDoctorRoleId = doctorRole.id
    systemStaffRoleId = staffRole.id
    const customA = await prisma.clinicRole.create({
      data: { tenantId, key: `tenant_${tenantId}_accountant`, name: 'Accountant', isSystem: false, permVersion: 1 },
    })
    const customB = await prisma.clinicRole.create({
      data: { tenantId, key: `tenant_${tenantId}_billing`, name: 'Billing', isSystem: false, permVersion: 1 },
    })
    customRoleAId = customA.id
    customRoleBId = customB.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
    await prisma.$disconnect()
  })

  it('classifies a system+custom user as auto-collapsible, keeping the system role', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Doctor A', username: 'doctor_a_collapse', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: customRoleAId, tenantId },
      ],
    })

    const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

    const found = autoCollapsible.find(c => c.userId === user.id)
    expect(found).toBeDefined()
    expect(found!.systemRoleId).toBe(systemDoctorRoleId)
    expect(found!.removedRoleIds).toEqual([customRoleAId])
    expect(ambiguous.find(a => a.userId === user.id)).toBeUndefined()
  })

  it('classifies a 2-system-role user as ambiguous', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Two System', username: 'two_system_collapse', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: systemStaffRoleId, tenantId },
      ],
    })

    const { ambiguous, autoCollapsible } = await classifyMultiRoleUsers(prisma)

    const found = ambiguous.find(a => a.userId === user.id)
    expect(found).toBeDefined()
    expect(found!.reason).toBe('multiple-system-roles')
    expect(autoCollapsible.find(c => c.userId === user.id)).toBeUndefined()
  })

  it('classifies a 2-custom-role user with no system role as ambiguous', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Two Custom', username: 'two_custom_collapse', passwordHash: 'x', role: 'staff', roleId: customRoleAId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: customRoleAId, tenantId },
        { userId: user.id, roleId: customRoleBId, tenantId },
      ],
    })

    const { ambiguous } = await classifyMultiRoleUsers(prisma)

    const found = ambiguous.find(a => a.userId === user.id)
    expect(found).toBeDefined()
    expect(found!.reason).toBe('multiple-custom-roles-no-system')
  })

  it('does not classify a single-role user at all', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Single Role', username: 'single_role_collapse', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.create({ data: { userId: user.id, roleId: systemDoctorRoleId, tenantId } })

    const { autoCollapsible, ambiguous } = await classifyMultiRoleUsers(prisma)

    expect(autoCollapsible.find(c => c.userId === user.id)).toBeUndefined()
    expect(ambiguous.find(a => a.userId === user.id)).toBeUndefined()
  })
})
