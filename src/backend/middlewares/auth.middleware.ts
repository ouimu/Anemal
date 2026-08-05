// @db-agent reviewed — context attached to req on every authenticated request
// CRITICAL: Clinic services must use req.context.tenantId; never call DB without it.
// Platform-plane tokens set plane === 'platform' and platformUserId; they have no tenantId.
import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../config/jwt'
import prisma from '../config/db'

/**
 * Verify the Bearer token and attach the decoded payload to `req.context`.
 *
 * Both clinic and platform tokens are accepted here; the `requirePlane`
 * middleware (permission.middleware.ts) enforces which plane a route belongs to.
 *
 * - Clinic token:   plane === 'clinic', userId and tenantId are meaningful.
 *   After JWT verification, the tenant's isActive flag is checked; suspended
 *   tenants receive 401 TENANT_SUSPENDED — never 403, to avoid leaking existence.
 * - Platform token: plane === 'platform', platformUserId is set; userId/tenantId are 0.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' })
    return
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = verifyToken(token)

    // HI-03: a pending branch-selection token (signPendingToken, 5-minute TTL) is a
    // partial identity — it must never be usable as a full API access token. Reject
    // it here, before requirePlane/requirePermission ever see it.
    if (payload.scope === 'branch_select') {
      res.status(401).json({ success: false, error: 'Invalid or expired token' })
      return
    }

    // Clinic-plane: verify the tenant is still active before admitting the request.
    // Platform tokens carry tenantId === 0; skip the DB check for that plane.
    if (payload.plane === 'clinic' && payload.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: payload.tenantId },
        select: { isActive: true },
      })
      if (tenant?.isActive === false) {
        res.status(401).json({ success: false, code: 'TENANT_SUSPENDED', error: 'Tenant account is suspended' })
        return
      }
    }

    req.context = payload
    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
  }
}
