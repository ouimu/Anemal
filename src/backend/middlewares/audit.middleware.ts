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

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Deny-by-default: any key matching this pattern is redacted, at any nesting depth. */
const SENSITIVE_KEY_PATTERN = /(password|secret|apikey|api_key|token|credential)/i

/**
 * Recursively redacts any object key matching SENSITIVE_KEY_PATTERN, at any depth,
 * including inside arrays and nested objects. Replaces matched values with '***'.
 * Non-plain-object/array leaves pass through unchanged.
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? '***' : redact(v)
    }
    return out
  }
  return value
}

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined
  return redact(body) as Record<string, unknown>
}

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
