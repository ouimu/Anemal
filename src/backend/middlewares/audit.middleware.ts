// Audit middleware (Phase 4, FR-12) — records every successful state-changing request
// into the write-once audit_logs table. Fire-and-forget on response finish.
import { Request, Response, NextFunction } from 'express'
import * as auditRepo from '../models/audit.repository'
import { logger } from '../utils/logger'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const SENSITIVE = ['password', 'passwordHash', 'newPassword', 'currentPassword']

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  for (const k of SENSITIVE) if (k in clone) clone[k] = '***'
  return clone
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) { next(); return }

  res.on('finish', () => {
    const ctx = req.context
    if (!ctx || res.statusCode >= 400) return // only successful, authenticated mutations
    const idParam = req.params?.id ? Number(req.params.id) : NaN
    auditRepo.create({
      tenantId:  ctx.tenantId,
      userId:    ctx.userId ?? null,
      action:    `${req.method} ${req.originalUrl.split('?')[0]}`,
      recordId:  Number.isFinite(idParam) ? idParam : null,
      details:   sanitize(req.body),
      ipAddress: req.ip ?? null,
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 500),
    }).catch((err) => logger.error({ err }, 'audit log write failed'))
  })

  next()
}
