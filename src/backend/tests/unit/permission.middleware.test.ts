// @qa-agent — Unit tests: permission.middleware (T-5A-03/04/05)
// Covers requirePlane (match/mismatch/no-context) and requirePermission
// (present/absent/no-context/service-error/correct-args).
import { Request, NextFunction } from 'express'
import { requirePlane, requirePermission, requireAnyPermission } from '../../middlewares/permission.middleware'
import * as permService from '../../services/permission.service'

jest.mock('../../services/permission.service')
const mockResolve = permService.resolvePermissions as jest.MockedFunction<
  typeof permService.resolvePermissions
>

function mockReq(
  context?: Partial<{ userId: number; tenantId: number; plane: string }>
): Partial<Request> {
  return { context: context as any }
}

function mockRes(): { status: jest.Mock; json: jest.Mock } {
  const res = { status: jest.fn(), json: jest.fn() }
  res.status.mockReturnValue(res)
  return res
}

const next = jest.fn() as NextFunction

beforeEach(() => jest.clearAllMocks())

describe('requirePlane', () => {
  it('calls next() when plane matches', () => {
    const req = mockReq({ userId: 1, tenantId: 1, plane: 'clinic' })
    const res = mockRes()
    requirePlane('clinic')(req as Request, res as any, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when plane does not match', () => {
    const req = mockReq({ userId: 1, tenantId: 1, plane: 'platform' })
    const res = mockRes()
    requirePlane('clinic')(req as Request, res as any, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when req.context is absent', () => {
    const req = mockReq(undefined)
    const res = mockRes()
    requirePlane('clinic')(req as Request, res as any, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('requirePermission', () => {
  it('calls next() when permission is present', async () => {
    mockResolve.mockResolvedValue(new Set(['billing.view', 'billing.create']))
    const req = mockReq({ userId: 1, tenantId: 1, plane: 'clinic' })
    const res = mockRes()
    await requirePermission('billing.view')(req as Request, res as any, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when permission is absent', async () => {
    mockResolve.mockResolvedValue(new Set(['pet.view']))
    const req = mockReq({ userId: 1, tenantId: 1, plane: 'clinic' })
    const res = mockRes()
    await requirePermission('billing.create')(req as Request, res as any, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when req.context is absent', async () => {
    const req = mockReq(undefined)
    const res = mockRes()
    await requirePermission('billing.view')(req as Request, res as any, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it('passes service errors to next(err)', async () => {
    const err = new Error('DB down')
    mockResolve.mockRejectedValue(err)
    const req = mockReq({ userId: 1, tenantId: 1, plane: 'clinic' })
    const res = mockRes()
    await requirePermission('billing.view')(req as Request, res as any, next)
    expect(next).toHaveBeenCalledWith(err)
  })

  it('calls resolvePermissions with correct userId + tenantId', async () => {
    mockResolve.mockResolvedValue(new Set(['emr.view']))
    const req = mockReq({ userId: 7, tenantId: 42, plane: 'clinic' })
    const res = mockRes()
    await requirePermission('emr.view')(req as Request, res as any, next)
    expect(mockResolve).toHaveBeenCalledWith(7, 42)
  })
})

describe('guard annotations (ADR-0005 D2) — zero behavior change, metadata only', () => {
  it('requirePermission attaches permissionCodes + mode:"all" to the returned closure', () => {
    const handler = requirePermission('billing.view')
    expect((handler as any).permissionCodes).toEqual(['billing.view'])
    expect((handler as any).mode).toBe('all')
  })

  it('requireAnyPermission attaches permissionCodes + mode:"any" to the returned closure', () => {
    const handler = requireAnyPermission(['roles.view', 'roles.manage'])
    expect((handler as any).permissionCodes).toEqual(['roles.view', 'roles.manage'])
    expect((handler as any).mode).toBe('any')
  })
})
