// @qa-agent — Unit tests: auth service (two-step login + switchBranch)
import bcrypt from 'bcrypt'
import { login, switchBranch } from '../../services/auth.service'

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    tenant:       { findUnique: jest.fn() },
    user:         { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn() },
    refreshToken: { create: jest.fn().mockResolvedValue({ id: 'rt-1', tokenHash: 'h', familyId: 'f', plane: 'clinic', expiresAt: new Date(), createdAt: new Date(), branchId: null }) },
    branch:       { findFirst: jest.fn(), findMany: jest.fn() },
    userBranch:   { findMany: jest.fn() },
  },
}))
jest.mock('../../config/jwt', () => ({
  signToken:          jest.fn().mockReturnValue('mock.jwt.token'),
  signPendingToken:   jest.fn().mockReturnValue('mock.pending.token'),
  verifyPendingToken: jest.fn(),
}))
jest.mock('../../services/permission.service', () => ({
  computePermSetVersion: jest.fn().mockResolvedValue(1),
}))

import prisma from '../../config/db'

const mockTenant = { id: 1, subdomain: 'dev-clinic', isActive: true }

function roleRefFor(role: string) {
  const key = role === 'admin' ? 'clinic_admin' : role === 'doctor' ? 'doctor' : 'clinic_staff'
  return { id: 1, name: role, key, isSystem: true }
}

async function makeUser(role = 'admin') {
  return {
    id: 10, tenantId: 1, name: 'Admin A', username: 'admin_a',
    email: 'admin@dev-clinic.com',
    passwordHash: await bcrypt.hash('AdminPass1!', 10),
    roleId: 1, roleRef: roleRefFor(role),
    isActive: true, branchId: null, allowedStartTime: null, allowedEndTime: null,
  }
}

describe('authService.login — step 1 (credentials → pendingToken + branches)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin: bypasses branch selection — issues a full token with branchId: null (all-branches scope)', async () => {
    const user = await makeUser('admin')
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)

    const result = await login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })

    expect(result.requiresBranchSelection).toBe(false)
    if (result.requiresBranchSelection) throw new Error('Expected requiresBranchSelection=false (admin bypass)')
    expect(result.token).toBe('mock.jwt.token')
    expect(result.branchId).toBeNull()
    expect(result.role).toBe('admin')
    // Admin bypass never looks up branches — it skips the selection step entirely.
    expect((prisma.branch.findMany as jest.Mock)).not.toHaveBeenCalled()
    expect((prisma.userBranch.findMany as jest.Mock)).not.toHaveBeenCalled()
  })

  it('staff: returns pendingToken + assigned branches only', async () => {
    const user = await makeUser('staff')
    ;(prisma.tenant.findUnique   as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique     as jest.Mock).mockResolvedValue(user)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([{ branch: { id: 5, name: 'Main' } }])

    const result = await login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' })

    expect(result.requiresBranchSelection).toBe(true)
    if (result.requiresBranchSelection) {
      expect(result.branches).toHaveLength(1)
      expect(result.branches[0].id).toBe(5)
    }
    // branch.findMany NOT called for non-admin
    expect((prisma.branch.findMany as jest.Mock)).not.toHaveBeenCalled()
  })

  it('staff with zero assigned branches → throws 403', async () => {
    const user = await makeUser('staff')
    ;(prisma.tenant.findUnique   as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique     as jest.Mock).mockResolvedValue(user)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([])

    await expect(login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws 401 on wrong password', async () => {
    const user = await makeUser()
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)

    await expect(login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'WrongPass!' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 when tenant not found', async () => {
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null)
    await expect(login({ subdomain: 'no-tenant', username: 'nobody', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 for inactive user', async () => {
    const user = { ...(await makeUser()), isActive: false }
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)
    await expect(login({ subdomain: 'dev-clinic', username: 'admin_a', password: 'AdminPass1!' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 for inactive tenant', async () => {
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ ...mockTenant, isActive: false })
    await expect(login({ subdomain: 'dev-clinic', username: 'nobody', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('authService.switchBranch', () => {
  const tenantId  = 1;  const userId = 10
  const branch1   = { id: 1, tenantId, name: 'Main', isActive: true }
  const branch2   = { id: 2, tenantId, name: 'Branch 2', isActive: true }
  const staffUser = { id: userId, tenantId, name: 'Staff', roleId: 1, roleRef: roleRefFor('staff'), isActive: true, branchId: null }
  const adminUser = { id: userId, tenantId, name: 'Admin', roleId: 1, roleRef: roleRefFor('admin'), isActive: true, branchId: null }

  beforeEach(() => jest.clearAllMocks())

  it('staff can switch to an assigned branch', async () => {
    ;(prisma.user.findFirst      as jest.Mock).mockResolvedValue(staffUser)
    ;(prisma.branch.findFirst    as jest.Mock).mockResolvedValue(branch1)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([{ branch: { id: 1, name: 'Main' } }])
    const result = await switchBranch(tenantId, userId, 'staff', 1)
    expect(result.branchId).toBe(1)
  })

  it('staff cannot switch to unassigned branch — throws 403', async () => {
    ;(prisma.user.findFirst      as jest.Mock).mockResolvedValue(staffUser)
    ;(prisma.branch.findFirst    as jest.Mock).mockResolvedValue(branch2)
    ;(prisma.userBranch.findMany as jest.Mock).mockResolvedValue([{ branch: { id: 1, name: 'Main' } }])
    await expect(switchBranch(tenantId, userId, 'staff', 2))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('admin can switch to any branch regardless of user_branches', async () => {
    ;(prisma.user.findFirst   as jest.Mock).mockResolvedValue(adminUser)
    ;(prisma.branch.findFirst as jest.Mock).mockResolvedValue(branch2)
    const result = await switchBranch(tenantId, userId, 'admin', 2)
    expect(result.branchId).toBe(2)
    expect((prisma.userBranch.findMany as jest.Mock)).not.toHaveBeenCalled()
  })
})
