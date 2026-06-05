// @db-agent reviewed — tenantId attached to req.context on every authenticated request
// CRITICAL: Downstream services must use req.context.tenantId; never call DB without it
import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../config/jwt'

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' })
    return
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = verifyToken(token)
    req.context = payload
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
}
