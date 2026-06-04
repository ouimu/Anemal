import { Request, Response } from 'express'
import { z } from 'zod'
import * as svc from '../services/tenantSettingsService'

const updateSchema = z.object({
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
})

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    const data = await svc.getSettings(req.context!.tenantId)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to load settings' })
  }
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
    return
  }
  try {
    const { name, ...rest } = parsed.data
    if (name) await svc.updateClinicName(req.context!.tenantId, name)
    const data = await svc.updateSettings(req.context!.tenantId, rest)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update settings' })
  }
}
