// Invoice / billing controller — thin HTTP handlers.
import { Request, Response, NextFunction } from 'express'
import * as invoiceService from '../services/invoice.service'
import * as pdfService from '../services/pdf.service'
import * as promptpayQrService from '../services/promptpay-qr.service'
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

export async function generatePromptpayQr(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dataUrl = await promptpayQrService.generatePromptpayQr(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, dataUrl })
  } catch (err) { next(err) }
}

export async function downloadInvoicePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId } = req.context!
    const id = Number(req.params.id)
    const buffer = await pdfService.generateInvoicePdf(tenantId, id)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`)
    res.send(buffer)
  } catch (err) { next(err) }
}
