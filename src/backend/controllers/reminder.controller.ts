import { Request, Response, NextFunction } from 'express'
import * as svc from '../services/reminder.service'

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.create(req.context!.tenantId, req.body) }) }
  catch (err) { next(err) }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const petId = req.query.petId ? Number(req.query.petId) : undefined
    res.json({ success: true, data: await svc.list(req.context!.tenantId, status, petId) })
  } catch (err) { next(err) }
}

export async function listDue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.listDue(req.context!.tenantId) }) }
  catch (err) { next(err) }
}

export async function setStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.setStatus(req.context!.tenantId, Number(req.params.id), req.body.status) }) }
  catch (err) { next(err) }
}
