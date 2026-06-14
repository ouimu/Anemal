// @qa-agent — Unit tests: auth service
// Tests run against a mocked Prisma client; no DB required
import bcrypt from 'bcrypt'
import { login } from '../../services/auth.service'

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    tenant: { findUnique: jest.fn() },
    user:   { findUnique: jest.fn(), update: jest.fn() }, // update: touchLastLogin (Phase 4)
  },
}))
jest.mock('../../config/jwt', () => ({
  signToken: jest.fn().mockReturnValue('mock.jwt.token'),
}))
jest.mock('../../services/permission.service', () => ({
  computePermSetVersion: jest.fn().mockResolvedValue(1),
}))

import prisma from '../../config/db'

const mockTenant = { id: 1, subdomain: 'dev-clinic', isActive: true }

async function makeUser(role = 'admin') {
  return {
    id: 10, tenantId: 1, name: 'Admin A', email: 'admin@dev-clinic.com',
    passwordHash: await bcrypt.hash('AdminPass1!', 10),
    role, isActive: true,
  }
}

describe('authService.login', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns token on valid credentials', async () => {
    const user = await makeUser()
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)

    const result = await login({ subdomain: 'dev-clinic', email: user.email, password: 'AdminPass1!' })

    expect(result.token).toBe('mock.jwt.token')
    expect(result.tenantId).toBe(1)
    expect(result.role).toBe('admin')
  })

  it('throws 401 on wrong password', async () => {
    const user = await makeUser()
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)

    await expect(login({ subdomain: 'dev-clinic', email: user.email, password: 'WrongPass!' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 when tenant not found', async () => {
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null)

    await expect(login({ subdomain: 'no-tenant', email: 'x@x.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 for inactive user', async () => {
    const user = { ...(await makeUser()), isActive: false }
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.user.findUnique   as jest.Mock).mockResolvedValue(user)

    await expect(login({ subdomain: 'dev-clinic', email: user.email, password: 'AdminPass1!' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 for inactive tenant', async () => {
    ;(prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ ...mockTenant, isActive: false })

    await expect(login({ subdomain: 'dev-clinic', email: 'x@x.com', password: 'pass' }))
      .rejects.toMatchObject({ statusCode: 401 })
  })
})
