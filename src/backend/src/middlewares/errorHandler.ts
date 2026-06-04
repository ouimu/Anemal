// Global error handler + 404 fallback (CODING_RULES §6.2).
// Internal detail is logged; only a sanitized message + code reach the client.

import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' })
}

// Express identifies error handlers by arity — the unused `next` must stay.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const tenantId = req.context?.tenantId

  if (err instanceof ZodError) {
    res.status(400).json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: err.flatten() })
    return
  }

  if (err instanceof AppError) {
    logger.warn({ tenantId, code: err.code, path: req.path }, err.message)
    res.status(err.statusCode).json({ success: false, error: err.message, code: err.code, details: err.details })
    return
  }

  logger.error({ tenantId, err, path: req.path }, 'Unhandled error')
  res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' })
}
