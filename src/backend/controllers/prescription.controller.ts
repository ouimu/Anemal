import { Request, Response, NextFunction } from 'express'
import { createPrescription, deletePrescription } from '../services/prescription.service'

export async function handleCreatePrescription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createPrescription(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleDeletePrescription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deletePrescription(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true })
  } catch (err) { next(err) }
}
