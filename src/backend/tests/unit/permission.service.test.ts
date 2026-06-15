// @qa-agent — Unit tests: permission.service (T-5A-03/04/05)
// Covers resolvePermissions (union/Set, tenant scoping, cache, invalidation,
// per-key isolation) and computePermSetVersion (max permVersion, empty default).
import {
  resolvePermissions,
  invalidatePermCache,
  clearPermCache,
  computePermSetVersion,
} from '../../services/permission.service'
import prisma from '../../config/db'

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    userRole: {
      findMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

// Mirrors the actual service include shape:
//   userRole.findMany → role.permissions[].permissionCode  (resolvePermissions)
//   userRole.findMany → role.permVersion                   (computePermSetVersion)
const MOCK_USER_ROLES = [
  {
    role: {
      permVersion: 3,
      permissions: [
        { permissionCode: 'billing.view' },
        { permissionCode: 'billing.create' },
      ],
    },
  },
  {
    role: {
      permVersion: 1,
      permissions: [
        { permissionCode: 'pet.view' },
        { permissionCode: 'billing.view' }, // duplicate — should appear once in set
      ],
    },
  },
]

beforeEach(() => {
  clearPermCache()
  jest.clearAllMocks()
})

describe('resolvePermissions', () => {
  it('returns union of all role permissions as a Set', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue(MOCK_USER_ROLES)
    const perms = await resolvePermissions(42, 1)
    expect(perms.has('billing.view')).toBe(true)
    expect(perms.has('billing.create')).toBe(true)
    expect(perms.has('pet.view')).toBe(true)
    expect(perms.size).toBe(3)
  })

  it('queries with correct tenantId and userId', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue([])
    await resolvePermissions(7, 99)
    expect(mockPrisma.userRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7, tenantId: 99 } })
    )
  })

  it('returns cached result on second call without querying DB', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue(MOCK_USER_ROLES)
    await resolvePermissions(1, 1)
    await resolvePermissions(1, 1)
    expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(1)
  })

  it('re-queries DB after invalidatePermCache', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue(MOCK_USER_ROLES)
    await resolvePermissions(1, 1)
    invalidatePermCache(1, 1)
    await resolvePermissions(1, 1)
    expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(2)
  })

  it('returns empty Set when user has no roles', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue([])
    const perms = await resolvePermissions(99, 1)
    expect(perms.size).toBe(0)
  })

  it('caches per tenantId:userId — two users get separate caches', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue(MOCK_USER_ROLES)
    await resolvePermissions(1, 1)
    await resolvePermissions(2, 1)
    expect(mockPrisma.userRole.findMany).toHaveBeenCalledTimes(2)
  })
})

describe('computePermSetVersion', () => {
  it('returns max permVersion across all user roles', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue(MOCK_USER_ROLES)
    const version = await computePermSetVersion(1, 1)
    expect(version).toBe(3)
  })

  it('returns 1 when user has no roles', async () => {
    ;(mockPrisma.userRole.findMany as jest.Mock).mockResolvedValue([])
    const version = await computePermSetVersion(99, 1)
    expect(version).toBe(1)
  })
})
