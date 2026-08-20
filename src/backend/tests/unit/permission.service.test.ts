// @qa-agent — Unit tests: permission.service (T-5A-03/04/05)
// Covers resolvePermissions (single-role Set, tenant scoping, cache, invalidation,
// per-key isolation) and computePermSetVersion (single-role permVersion, empty default).
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
      findUnique: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

// Mirrors the actual service include shape:
//   userRole.findUnique → role.permissions[].permissionCode  (resolvePermissions)
//   userRole.findUnique → role.permVersion                   (computePermSetVersion)
// ADR-0019 (D-7): a user holds exactly one role — the composite unique key
// (tenantId, userId) on user_roles means this is a single object, never an array.
const MOCK_USER_ROLE = {
  role: {
    permVersion: 3,
    permissions: [
      { permissionCode: 'billing.view' },
      { permissionCode: 'billing.create' },
      { permissionCode: 'pet.view' },
    ],
  },
}

beforeEach(() => {
  clearPermCache()
  jest.clearAllMocks()
})

describe('resolvePermissions', () => {
  it('returns the assigned role\'s permission codes as a Set', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(MOCK_USER_ROLE)
    const perms = await resolvePermissions(42, 1)
    expect(perms.has('billing.view')).toBe(true)
    expect(perms.has('billing.create')).toBe(true)
    expect(perms.has('pet.view')).toBe(true)
    expect(perms.size).toBe(3)
  })

  it('queries with correct tenantId and userId', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(null)
    await resolvePermissions(7, 99)
    expect(mockPrisma.userRole.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId_userId: { tenantId: 99, userId: 7 } } })
    )
  })

  it('returns cached result on second call without querying DB', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(MOCK_USER_ROLE)
    await resolvePermissions(1, 1)
    await resolvePermissions(1, 1)
    expect(mockPrisma.userRole.findUnique).toHaveBeenCalledTimes(1)
  })

  it('re-queries DB after invalidatePermCache', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(MOCK_USER_ROLE)
    await resolvePermissions(1, 1)
    invalidatePermCache(1, 1)
    await resolvePermissions(1, 1)
    expect(mockPrisma.userRole.findUnique).toHaveBeenCalledTimes(2)
  })

  it('returns empty Set when user has no roles', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(null)
    const perms = await resolvePermissions(99, 1)
    expect(perms.size).toBe(0)
  })

  it('caches per tenantId:userId — two users get separate caches', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(MOCK_USER_ROLE)
    await resolvePermissions(1, 1)
    await resolvePermissions(2, 1)
    expect(mockPrisma.userRole.findUnique).toHaveBeenCalledTimes(2)
  })
})

describe('computePermSetVersion', () => {
  it('returns the assigned role\'s permVersion', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(MOCK_USER_ROLE)
    const version = await computePermSetVersion(1, 1)
    expect(version).toBe(3)
  })

  it('returns 1 when user has no roles', async () => {
    ;(mockPrisma.userRole.findUnique as jest.Mock).mockResolvedValue(null)
    const version = await computePermSetVersion(99, 1)
    expect(version).toBe(1)
  })
})
