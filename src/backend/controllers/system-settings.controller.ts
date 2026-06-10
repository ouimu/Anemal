// System-settings controller (Phase 1.5-B, minimal Task S2.2) — superadmin only.
// Platform-global key/value config; secrets are masked by the service layer.

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as systemSvc from '../services/system-settings.service'
import * as connTest from '../services/connection-test.service'

export const updateSystemSettingSchema = z.object({
  value: z.string().max(2000),
}).strict()

export async function getAllSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await systemSvc.getAll()
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getSettingByKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await systemSvc.getByKey(req.params.key)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateSettingByKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { value } = req.body as z.infer<typeof updateSystemSettingSchema>
    const data = await systemSvc.updateByKey(req.params.key, value, req.context!.userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// Stateless TCP reachability check against the stored SMTP host/port.
export async function testSmtp(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const host = await systemSvc.getDecryptedValue('smtp_host')
    const port = parseInt(await systemSvc.getDecryptedValue('smtp_port'), 10)
    const data = await connTest.testSmtp(host, Number.isNaN(port) ? 587 : port)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
