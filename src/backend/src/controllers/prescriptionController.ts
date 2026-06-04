import { Request, Response } from 'express'
import { createPrescriptionSchema, createPrescription, deletePrescription, PrescriptionError } from '../services/prescriptionService'

function handleError(res: Response, err: unknown) {
  if (err instanceof PrescriptionError) return res.status(err.statusCode).json({ success: false, error: err.message })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

export async function handleCreatePrescription(req: Request, res: Response) {
  const parsed = createPrescriptionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createPrescription(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleDeletePrescription(req: Request, res: Response) {
  try {
    await deletePrescription(req.context!.tenantId, parseInt(req.params.id))
    res.json({ success: true })
  } catch (err) { handleError(res, err) }
}
