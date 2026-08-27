// @qa-agent — Unit tests: authMiddleware
import { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middlewares/auth.middleware'
import * as jwtConfig from '../../config/jwt'

jest.mock('../../config/jwt')

function mockRes() {
  const res: Partial<Response> = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json   = jest.fn().mockReturnValue(res)
  return res as Response
}
function mockNext(): NextFunction { return jest.fn() }

const validPayload = { userId: 1, tenantId: 1, plane: 'clinic' as const, permSetVersion: 1, role: 'admin' as const }

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
    (jwtConfig.verifyToken as jest.Mock).mockImplementation(() => { throw new Error('invalid') })
    const req = { headers: { authorization: 'Bearer bad.token' } } as Request
    const res = mockRes(); const next = mockNext()
    authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches context and calls next on valid token (platform plane — no DB check)', async () => {
    const platformPayload = { ...validPayload, plane: 'platform' as const, tenantId: 0, platformUserId: 42 }
    ;(jwtConfig.verifyToken as jest.Mock).mockReturnValue(platformPayload)
    const req = { headers: { authorization: 'Bearer valid.token' } } as unknown as Request
    const res = mockRes(); const next = mockNext()
    await authMiddleware(req, res, next)
    expect((req as any).context).toEqual(platformPayload)
    expect(next).toHaveBeenCalled()
  })
})
