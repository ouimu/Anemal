/**
 * Unit tests for auth.service.isStillEntitled — the Grill N-9 re-entitlement
 * check shared by the Google Drive and OneDrive OAuth connect callbacks.
 * @qa-agent | Backlog F-3 (2026-09-09 code-quality refactor, Phase 1 follow-up)
 *
 * Only the "user inactive" branch was covered before this file (via
 * oauth-google-callback.test.ts / oauth-onedrive-callback.test.ts, which
 * exercise the function through a full HTTP request). This file isolates
 * the remaining branches with mocks, no DB or HTTP involved.
 */
import { isStillEntitled } from '../services/auth.service'
import * as authRepo from '../models/auth.repository'
import { resolvePermissions } from '../services/permission.service'

jest.mock('../models/auth.repository')
jest.mock('../services/permission.service')

const mockFindUserActiveStatus = authRepo.findUserActiveStatus as jest.Mock
const mockFindTenantActiveStatus = authRepo.findTenantActiveStatus as jest.Mock
const mockResolvePermissions = resolvePermissions as jest.Mock

const TENANT_ID = 1
const USER_ID = 2
const PERMISSION = 'clinic.integrations.edit'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('isStillEntitled', () => {
  test('active user + active tenant + permission held → true', async () => {
    mockFindUserActiveStatus.mockResolvedValue({ isActive: true })
    mockFindTenantActiveStatus.mockResolvedValue({ isActive: true })
    mockResolvePermissions.mockResolvedValue(new Set([PERMISSION]))

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(true)
    expect(mockResolvePermissions).toHaveBeenCalledWith(USER_ID, TENANT_ID)
  })

  test('user found and active, but does not hold the permission → false', async () => {
    mockFindUserActiveStatus.mockResolvedValue({ isActive: true })
    mockFindTenantActiveStatus.mockResolvedValue({ isActive: true })
    mockResolvePermissions.mockResolvedValue(new Set(['some.other.permission']))

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(false)
  })

  test('user not found (null) → false, permissions still resolved (matches original inline `user?.isActive !== false` short-circuit)', async () => {
    mockFindUserActiveStatus.mockResolvedValue(null)
    mockFindTenantActiveStatus.mockResolvedValue({ isActive: true })
    mockResolvePermissions.mockResolvedValue(new Set([PERMISSION]))

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(false)
    // `user?.isActive` on a null user is undefined, and undefined !== false,
    // so the original inline logic (preserved verbatim) still resolves
    // permissions here — an intentional quirk, not a bug, verified because
    // this refactor must not change it.
    expect(mockResolvePermissions).toHaveBeenCalled()
  })

  test('user explicitly inactive → false, permissions NOT resolved (short-circuit)', async () => {
    mockFindUserActiveStatus.mockResolvedValue({ isActive: false })
    mockFindTenantActiveStatus.mockResolvedValue({ isActive: true })

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(false)
    expect(mockResolvePermissions).not.toHaveBeenCalled()
  })

  test('tenant explicitly inactive → false, permissions NOT resolved (short-circuit)', async () => {
    mockFindUserActiveStatus.mockResolvedValue({ isActive: true })
    mockFindTenantActiveStatus.mockResolvedValue({ isActive: false })

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(false)
    expect(mockResolvePermissions).not.toHaveBeenCalled()
  })

  test('tenant not found (null) → false, permissions still resolved (same undefined !== false quirk as the user case)', async () => {
    mockFindUserActiveStatus.mockResolvedValue({ isActive: true })
    mockFindTenantActiveStatus.mockResolvedValue(null)
    mockResolvePermissions.mockResolvedValue(new Set([PERMISSION]))

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(false)
    expect(mockResolvePermissions).toHaveBeenCalled()
  })

  test('both user and tenant inactive → false, permissions NOT resolved', async () => {
    mockFindUserActiveStatus.mockResolvedValue({ isActive: false })
    mockFindTenantActiveStatus.mockResolvedValue({ isActive: false })

    const result = await isStillEntitled(TENANT_ID, USER_ID, PERMISSION)

    expect(result).toBe(false)
    expect(mockResolvePermissions).not.toHaveBeenCalled()
  })
})
