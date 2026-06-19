import { Request, Response, NextFunction } from 'express'
import { createPrescription, deletePrescription } from '../services/prescription.service'
import * as pdfService from '../services/pdf.service'
import { requireBranchId } from '../utils/context'

export async function handleCreatePrescription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createPrescription(req.context!.tenantId, requireBranchId(req), req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleDeletePrescription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deletePrescription(req.context!.tenantId, requireBranchId(req), parseInt(req.params.id))
    res.json({ success: true })
  } catch (err) { next(err) }
}

export async function handleDownloadPrescriptionPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tenantId } = req.context!
    const id = Number(req.params.id)
    const buffer = await pdfService.generatePrescriptionPdf(tenantId, id)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="prescription-${id}.pdf"`)
    res.send(buffer)
  } catch (err) { next(err) }
}
