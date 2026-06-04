import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as svc from '../services/tenant-settings.service'

export const updateSettingsSchema = z.object({
  name:                 z.string().min(1).max(255).optional(),
  logoUrl:              z.string().url().optional().or(z.literal('')),
  phone:                z.string().max(50).optional(),
  email:                z.string().email().optional().or(z.literal('')),
  website:              z.string().max(255).optional(),
  address:              z.string().optional(),
  taxId:                z.string().max(50).optional(),
  defaultSlotMinutes:   z.number().int().min(5).max(240).optional(),
  workStartTime:        z.string().regex(/^\d{2}:\d{2}$/).optional(),
  workEndTime:          z.string().regex(/^\d{2}:\d{2}$/).optional(),
  smsRemindersEnabled:  z.boolean().optional(),
  lineRemindersEnabled: z.boolean().optional(),
}).strict()

export async function getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await svc.getSettings(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, ...rest } = req.body
    if (name) await svc.updateClinicName(req.context!.tenantId, name)
    const data = await svc.updateSettings(req.context!.tenantId, rest)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
