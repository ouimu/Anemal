// Invoice / billing controller — thin HTTP handlers.
import { Request, Response, NextFunction } from 'express'
import * as invoiceService from '../services/invoice.service'
import { requireBranchId } from '../utils/context'

export async function listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = req.query.page ? Number(req.query.page) : 1
    const limit  = req.query.limit ? Number(req.query.limit) : 20
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const date   = typeof req.query.date === 'string' ? req.query.date : undefined
    const data = await invoiceService.listInvoices(req.context!.tenantId, page, limit, status, date)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await invoiceService.getInvoice(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function createInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await invoiceService.createInvoice(req.context!.tenantId, requireBranchId(req), req.body, req.context!.userId)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function recordPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await invoiceService.recordPayment(req.context!.tenantId, Number(req.params.id), req.body.paymentMethod)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
