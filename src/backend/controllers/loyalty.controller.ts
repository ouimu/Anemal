import { Request, Response, NextFunction } from 'express'
import * as svc from '../services/loyalty.service'

export async function getOwnerLoyalty(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.getOwnerLoyalty(req.context!.tenantId, Number(req.params.ownerId)) }) }
  catch (err) { next(err) }
}

export async function redeem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { res.json({ success: true, data: await svc.redeem(req.context!.tenantId, req.body) }) }
  catch (err) { next(err) }
}
