import { Request, Response, NextFunction } from 'express'
import * as transferService from '../services/transfer.service'

export async function createTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await transferService.createTransfer(req.context!.tenantId, req.body, req.context!.userId)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function listTransfers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined
    res.json({ success: true, data: await transferService.listTransfers(req.context!.tenantId, branchId) })
  } catch (err) { next(err) }
}
