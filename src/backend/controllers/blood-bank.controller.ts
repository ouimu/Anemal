import { Request, Response, NextFunction } from 'express'
import * as svc from '../services/blood-bank.service'

export async function registerDonor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.registerDonor(req.context!.tenantId, req.body) }) }
  catch (err) { next(err) }
}

export async function listDonors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.listDonors(req.context!.tenantId, req.context?.branchId) }) }
  catch (err) { next(err) }
}

export async function recordCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.recordCollection(req.context!.tenantId, req.body, req.context!.userId) }) }
  catch (err) { next(err) }
}

export async function listBags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    res.json({ success: true, data: await svc.listBags(req.context!.tenantId, status, req.context?.branchId) })
  } catch (err) { next(err) }
}

export async function recordTransfusion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.status(201).json({ success: true, data: await svc.recordTransfusion(req.context!.tenantId, req.body, req.context!.userId) }) }
  catch (err) { next(err) }
}

export async function listTransfusions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.listTransfusions(req.context!.tenantId, req.context?.branchId) }) }
  catch (err) { next(err) }
}
