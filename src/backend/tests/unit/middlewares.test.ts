// @qa-agent — Unit tests: authMiddleware + rbacMiddleware (RBAC matrix)
import { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../src/middlewares/auth.middleware'
import { rbacMiddleware } from '../../src/middlewares/rbac.middleware'
import * as jwtConfig from '../../src/config/jwt'

jest.mock('../../src/config/jwt')

function mockRes() {
  const res: Partial<Response> = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res as Response
}
function mockNext(): NextFunction { return jest.fn() }

const validPayload = { userId: 1, tenantId: 1, role: 'admin' as const }

describe('authMiddleware', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when no Authorization header', () => {
    const req = { headers: {} } as Request
    const res = mockRes(); const next = mockNext()
    authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when token is invalid', () => {
    ;(jwtConfig.verifyToken as jest.Mock).mockImplementation(() => { throw new Error('invalid') })
    const req = { headers: { authorization: 'Bearer bad.token' } } as Request
    const res = mockRes(); const next = mockNext()
    authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches context and calls next on valid token', () => {
    ;(jwtConfig.verifyToken as jest.Mock).mockReturnValue(validPayload)
    const req = { headers: { authorization: 'Bearer valid.token' } } as unknown as Request
    const res = mockRes(); const next = mockNext()
    authMiddleware(req, res, next)
    expect((req as any).context).toEqual(validPayload)
    expect(next).toHaveBeenCalled()
  })
})

describe('rbacMiddleware — RBAC matrix', () => {
  function reqWithRole(role: string) {
    return { context: { userId: 1, tenantId: 1, role } } as unknown as Request
  }

  it('allows admin to admin-only route', () => {
    const next = mockNext()
    rbacMiddleware(['admin'])(reqWithRole('admin'), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('blocks doctor from admin-only route → 403', () => {
    const res = mockRes(); const next = mockNext()
    rbacMiddleware(['admin'])(reqWithRole('doctor'), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('blocks staff from admin-only route → 403', () => {
    const res = mockRes(); const next = mockNext()
    rbacMiddleware(['admin'])(reqWithRole('staff'), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows doctor to doctor+admin route', () => {
    const next = mockNext()
    rbacMiddleware(['admin', 'doctor'])(reqWithRole('doctor'), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('returns 401 when no context on request', () => {
    const req = {} as Request
    const res = mockRes(); const next = mockNext()
    rbacMiddleware(['admin'])(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
