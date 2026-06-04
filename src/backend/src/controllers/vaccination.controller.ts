import { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../utils/errors'
import { listVaccinations, createVaccination, getDueSoon } from '../services/vaccination.service'

export async function handleListVaccinations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const petId = parseInt(String(req.query.petId ?? '0'))
    if (!petId) throw new ValidationError({ petId: ['petId is required'] })
    const data = await listVaccinations(req.context!.tenantId, petId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleCreateVaccination(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await createVaccination(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function handleGetDueSoon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = parseInt(String(req.query.days ?? '30'))
    const data = await getDueSoon(req.context!.tenantId, days)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
