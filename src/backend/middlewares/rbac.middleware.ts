// @db-agent reviewed — RBAC check runs AFTER authMiddleware which sets req.context
import { Request, Response, NextFunction } from 'express'

type Role = 'admin' | 'doctor' | 'staff'

export function rbacMiddleware(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.context) {
      res.status(401).json({ success: false, error: 'Unauthenticated' })
      return
    }
    if (!allowedRoles.includes(req.context.role as Role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      })
      return
    }
    next()
  }
}
