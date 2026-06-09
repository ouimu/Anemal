import { Request, Response, NextFunction } from 'express'
import * as svc from '../services/hospitalization.service'
import { requireBranchId } from '../utils/context'

export async function admit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.admit(req.context!.tenantId, req.context?.branchId ?? null, req.body) }) }
  catch (err) { next(err) }
}

export async function listActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : req.context?.branchId
    res.json({ success: true, data: await svc.listActive(req.context!.tenantId, branchId) })
  } catch (err) { next(err) }
}

export async function getHospitalization(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.getHospitalization(req.context!.tenantId, Number(req.params.id)) }) }
  catch (err) { next(err) }
}

export async function logCare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.logCare(req.context!.tenantId, Number(req.params.id), req.body, req.context!.userId) }) }
  catch (err) { next(err) }
}

export async function discharge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.discharge(req.context!.tenantId, requireBranchId(req), Number(req.params.id), req.context!.userId) }) }
  catch (err) { next(err) }
}
