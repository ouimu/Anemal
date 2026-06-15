/**
 * Plane and permission guard middleware factories.
 *
 * Use these two factories together to protect clinic and platform routes:
 *   router.get('/', authMiddleware, requirePlane('clinic'), requirePermission('billing.view'), handler)
 *
 * `requirePlane` validates that the JWT was issued for the expected plane
 * (clinic vs platform). `requirePermission` resolves the caller's full
 * permission set (with caching) and checks for the required code.
 *
 * Both factories assume `authMiddleware` has already run and attached
 * `req.context`. They return 401 if the context is absent, 403 on
 * plane mismatch or missing permission.
 *
 * @module permission.middleware
 */

import { Request, Response, NextFunction, RequestHandler } from 'express'
import { resolvePermissions } from '../services/permission.service'

/**
 * Guard that enforces the JWT plane claim.
 *
 * Rejects requests whose token was issued for a different plane.
 * Must run after `authMiddleware` (which sets `req.context`).
 *
 * The `plane` claim is set by the JWT factory at login time:
 *   - `'clinic'`   — tenant users (clinic_admin, doctor, clinic_staff)
 *   - `'platform'` — SuperAdmin/SaaS-operator users (platform_users table)
 *
 * @param plane - The plane this route belongs to: `'clinic'` or `'platform'`.
 * @returns Express middleware that passes or responds with 401/403.
 */
export function requirePlane(plane: 'clinic' | 'platform'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      res.status(401).json({ success: false, error: 'Authentication required' })
      return
    }
    if (req.context.plane !== plane) {
      res.status(403).json({
        success: false,
        error: `Access denied: route requires '${plane}' plane`,
      })
      return
    }
    next()
  }
}

/**
 * Guard that enforces a specific permission code.
 *
 * Resolves the caller's full permission set via `resolvePermissions`
 * (which uses a 5-minute in-memory cache) and rejects if the required
 * permission code is absent.
 *
 * Must run after `authMiddleware` (which sets `req.context`).
 * For clinic routes, chain after `requirePlane('clinic')` so that
 * `tenantId` is always meaningful when the permission lookup runs.
 *
 * @param permissionCode - The permission code to check, e.g. `'billing.view'`.
 * @returns Async Express RequestHandler that enforces the permission check.
 */
export function requirePermission(permissionCode: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.context) {
      res.status(401).json({ success: false, error: 'Authentication required' })
      return
    }
    try {
      const perms = await resolvePermissions(req.context.userId, req.context.tenantId)
      if (!perms.has(permissionCode)) {
        res.status(403).json({
          success: false,
          error: `Access denied: missing permission '${permissionCode}'`,
        })
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
