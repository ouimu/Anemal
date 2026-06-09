// Reports controller — thin HTTP handlers.
import { Request, Response, NextFunction } from 'express'
import * as reportService from '../services/report.service'
import { requireBranchId } from '../utils/context'

export async function getRevenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const period = req.query.period === 'monthly' ? 'monthly' : 'daily'
    const data = await reportService.getRevenue(req.context!.tenantId, period)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getTopServices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getTopServices(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getInventoryUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getInventoryUsage(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getBranchRevenue(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : undefined
    const to   = req.query.to   ? new Date(req.query.to   as string) : undefined
    const data = await reportService.getBranchRevenue(req.context!.tenantId, from, to)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getSnapshot(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await reportService.getSnapshot(req.context!.tenantId, requireBranchId(req))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
