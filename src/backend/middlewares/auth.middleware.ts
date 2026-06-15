// @db-agent reviewed — context attached to req on every authenticated request
// CRITICAL: Clinic services must use req.context.tenantId; never call DB without it.
// Platform-plane tokens set plane === 'platform' and platformUserId; they have no tenantId.
import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../config/jwt'

/**
 * Verify the Bearer token and attach the decoded payload to `req.context`.
 *
 * Both clinic and platform tokens are accepted here; the `requirePlane`
 * middleware (permission.middleware.ts) enforces which plane a route belongs to.
 *
 * - Clinic token:   plane === 'clinic', userId and tenantId are meaningful.
 * - Platform token: plane === 'platform', platformUserId is set; userId/tenantId are 0.
 */
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
