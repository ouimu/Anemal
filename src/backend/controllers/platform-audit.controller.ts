/**
 * Controller for GET /platform/audit.
 *
 * Validates query parameters, delegates to the platform-audit repository,
 * and returns the standard `{ success, data }` envelope.
 *
 * The `to` date filter is extended to end-of-day (23:59:59.999) so that
 * callers can pass `YYYY-MM-DD` without losing the last 86 399 seconds.
 *
 * @module platform-audit.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { listPlatformAuditLogs } from '../models/platform-audit.repository'

/** Maximum allowed page size to prevent runaway queries. */
const MAX_LIMIT = 200

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
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

    const from = q.from ? new Date(q.from) : undefined
    const to = q.to
      ? new Date(new Date(q.to).setHours(23, 59, 59, 999))
      : undefined

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
