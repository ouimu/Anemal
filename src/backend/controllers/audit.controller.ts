// Audit log controller — thin HTTP handler (read-only).
import { Request, Response, NextFunction } from 'express'
import * as auditService from '../services/audit.service'

export async function listAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const num = (v: unknown) => (v != null && v !== '' ? Number(v) : undefined)
    const data = await auditService.listAudit(req.context!.tenantId, {
      page:   num(req.query.page),
      limit:  num(req.query.limit),
      userId: num(req.query.userId),
      action: req.query.action ? String(req.query.action) : undefined,
      from:   req.query.from ? String(req.query.from) : undefined,
      to:     req.query.to ? String(req.query.to) : undefined,
      branchId: req.context?.branchId,
    })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
