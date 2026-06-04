import { Request, Response } from 'express'
import { createVaccinationSchema, listVaccinations, createVaccination, getDueSoon, VaccinationError } from '../services/vaccinationService'

function handleError(res: Response, err: unknown) {
  if (err instanceof VaccinationError) return res.status(err.statusCode).json({ success: false, error: err.message })
  res.status(500).json({ success: false, error: 'Internal server error' })
}

export async function handleListVaccinations(req: Request, res: Response) {
  try {
    const petId = parseInt(String(req.query.petId ?? '0'))
    if (!petId) return res.status(400).json({ success: false, error: 'petId is required' })
    const data = await listVaccinations(req.context!.tenantId, petId)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleCreateVaccination(req: Request, res: Response) {
  const parsed = createVaccinationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const data = await createVaccination(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(res, err) }
}

export async function handleGetDueSoon(req: Request, res: Response) {
  try {
    const days = parseInt(String(req.query.days ?? '30'))
    const data = await getDueSoon(req.context!.tenantId, days)
    res.json({ success: true, data })
  } catch (err) { handleError(res, err) }
}
