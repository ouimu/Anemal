/**
 * Controller for GET /platform/audit.
 *
 * Validates query parameters, delegates to the platform-audit repository,
 * and returns the standard `{ success, data }` envelope.
 *
 * `from`/`to` (`YYYY-MM-DD`) are interpreted as pure UTC calendar-day bounds,
 * inclusive: `from` -> `T00:00:00.000Z`, `to` -> `T23:59:59.999Z`. This is
 * independent of server wall-clock/local timezone (ADR-0003 D6).
 *
 * @module platform-audit.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { listPlatformAuditLogs } from '../models/platform-audit.repository'

/** Maximum allowed page size to prevent runaway queries. */
const MAX_LIMIT = 200

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const querySchema = z.object({
  from: z.string().regex(DATE_ONLY, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(DATE_ONLY, 'to must be YYYY-MM-DD').optional(),
  action: z.string().optional(),
  tenantId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
})

/**
 * GET /platform/audit
 *
 * Query params: from, to, action, tenantId, page, limit.
 * Responds with paginated platform audit log entries (no `details` field).
 *
 * @param req - Express request carrying validated query params.
 * @param res - Express response.
 * @param next - Express next function for error propagation.
 */
export async function handleListPlatformAudit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = querySchema.parse(req.query)

    // Pure UTC calendar-day bounds (ADR-0003 D6): from/to are YYYY-MM-DD interpreted
    // as UTC calendar days, inclusive. Avoids setHours() mutating in server-local time,
    // which silently dropped the last ~7h of the UTC day at UTC+7.
    const from = q.from ? new Date(`${q.from}T00:00:00.000Z`) : undefined
    const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : undefined

    const result = await listPlatformAuditLogs({
      from,
      to,
      action: q.action,
      tenantId: q.tenantId,
      page: q.page,
      limit: q.limit,
    })

    res.json({
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page: q.page,
        limit: q.limit,
      },
    })
  } catch (err) {
    next(err)
  }
}
