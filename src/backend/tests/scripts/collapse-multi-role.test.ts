import { PrismaClient } from '@prisma/client'
import { classifyMultiRoleUsers, collapseMultiRoleUsers } from '../../prisma/scripts/collapse-multi-role'

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

describe('collapseMultiRoleUsers', () => {
  let tenantId: number
  let systemDoctorRoleId: number
  let systemStaffRoleId: number
  let customRoleId: number

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Collapse Exec Test', subdomain: 'collapse-test-2' } })
    tenantId = tenant.id
    const doctorRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'doctor', tenantId: null } })
    const staffRole = await prisma.clinicRole.findFirstOrThrow({ where: { key: 'clinic_staff', tenantId: null } })
    systemDoctorRoleId = doctorRole.id
    systemStaffRoleId = staffRole.id
    const custom = await prisma.clinicRole.create({
      data: { tenantId, key: `tenant_${tenantId}_accountant2`, name: 'Accountant', isSystem: false, permVersion: 1 },
    })
    customRoleId = custom.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
  })

  it('collapses an auto-collapsible user to the system role and logs it', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Collapse Me', username: 'collapse_me', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: customRoleId, tenantId },
      ],
    })

    const report = await collapseMultiRoleUsers(prisma)

    const entry = report.collapsed.find(c => c.userId === user.id)
    expect(entry).toBeDefined()
    expect(entry!.keptRoleId).toBe(systemDoctorRoleId)
    expect(entry!.removedRoleIds).toEqual([customRoleId])

    const remainingRoles = await prisma.userRole.findMany({ where: { userId: user.id } })
    expect(remainingRoles).toHaveLength(1)
    expect(remainingRoles[0].roleId).toBe(systemDoctorRoleId)

    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(refreshedUser.roleId).toBe(systemDoctorRoleId)
  })

  it('leaves an ambiguous user untouched and reports it', async () => {
    const user = await prisma.user.create({
      data: { tenantId, name: 'Ambiguous', username: 'ambiguous_user', passwordHash: 'x', role: 'doctor', roleId: systemDoctorRoleId },
    })
    await prisma.userRole.createMany({
      data: [
        { userId: user.id, roleId: systemDoctorRoleId, tenantId },
        { userId: user.id, roleId: systemStaffRoleId, tenantId },
      ],
    })

    const report = await collapseMultiRoleUsers(prisma)

    expect(report.manualResolutionNeeded.find(a => a.userId === user.id)).toBeDefined()
    const remainingRoles = await prisma.userRole.findMany({ where: { userId: user.id } })
    expect(remainingRoles).toHaveLength(2)
  })
})
