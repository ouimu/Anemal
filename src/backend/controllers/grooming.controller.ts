import { Request, Response, NextFunction } from 'express'
import * as svc from '../services/grooming.service'

export async function createBooking(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.createBooking(req.context!.tenantId, req.context?.branchId ?? null, req.body, req.context!.userId) }) }
  catch (err) { next(err) }
}

export async function listBookings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : req.context?.branchId
    const date = typeof req.query.date === 'string' ? req.query.date : undefined
    res.json({ success: true, data: await svc.listBookings(req.context!.tenantId, branchId, date) })
  } catch (err) { next(err) }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.updateStatus(req.context!.tenantId, Number(req.params.id), req.body.status) }) }
  catch (err) { next(err) }
}
