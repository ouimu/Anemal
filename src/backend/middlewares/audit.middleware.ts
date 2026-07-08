// Audit middleware (Phase 4, FR-12) — records every successful state-changing request
// into the write-once audit log tables. Fire-and-forget on response finish.
//
// Routing:
//   ctx.plane === 'platform'  →  PlatformAuditLog  (no tenantId required)
//   ctx.plane === 'clinic'    →  AuditLog           (tenantId required)
import { Request, Response, NextFunction } from 'express'
import * as auditRepo from '../models/audit.repository'
import * as platformAuditRepo from '../models/platform-audit.repository'
import { logger } from '../utils/logger'
import { sanitize } from '../utils/audit-sanitize'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) { next(); return }

  res.on('finish', () => {
    const ctx = req.context
    if (!ctx || res.statusCode >= 400) return // only successful, authenticated mutations

    const action    = `${req.method} ${req.originalUrl.split('?')[0]}`
    const details   = sanitize(req.body)
    const ipAddress = req.ip ?? null

    if (ctx.plane === 'platform') {
      // Platform-plane: write to PlatformAuditLog — no tenantId needed
      const performedByPlatformUserId = ctx.platformUserId ?? ctx.userId
      platformAuditRepo.createPlatformAuditLog({
        performedByPlatformUserId,
        action,
        details,
        ipAddress,
      }).catch((err) => logger.error({ err }, 'platform audit log write failed'))
    } else {
      // Clinic-plane: write to AuditLog — tenantId is mandatory
      const idParam = req.params?.id ? Number(req.params.id) : NaN
      auditRepo.create({
        tenantId:  ctx.tenantId,
        userId:    ctx.userId ?? null,
        action,
        recordId:  Number.isFinite(idParam) ? idParam : null,
        details,
        ipAddress,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 500),
      }).catch((err) => logger.error({ err }, 'audit log write failed'))
    }
  })

  next()
}
