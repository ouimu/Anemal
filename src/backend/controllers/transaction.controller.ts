import type { Request, Response, NextFunction } from 'express'
import { findPaymentHistory } from '../models/invoice.repository'
import { revenueSeriesBranch } from '../models/report.repository'

export async function handleListTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, branchId } = req.context!
    const period   = (req.query.period as string) === 'month' ? 'month' : 'today'
    const page     = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, parseInt(req.query.pageSize as string) || 20)

    const now  = new Date()
    const from = period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : new Date(now.getFullYear(), now.getMonth(), 1)
    const to   = period === 'today'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [rows, total] = await findPaymentHistory(tenantId, branchId ?? null, {
      startDate: from.toISOString(),
      endDate:   to.toISOString(),
      skip:      (page - 1) * pageSize,
      take:      pageSize,
    })

    res.json({ success: true, data: { rows, total } })
  } catch (err) { next(err) }
}

export async function handleRevenueSeries(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId, branchId } = req.context!
    const period = (req.query.period as string) === 'monthly' ? 'monthly' : 'daily'
    const n      = period === 'daily' ? 14 : 6
    const series = await revenueSeriesBranch(tenantId, branchId ?? null, period, n)
    const total  = series.reduce((sum, p) => sum + p.revenue, 0)
    res.json({ success: true, data: { series, total } })
  } catch (err) { next(err) }
}
