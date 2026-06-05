// Subscription controller — thin HTTP handler.
import { Request, Response, NextFunction } from 'express'
import * as subscriptionService from '../services/subscription.service'

export async function getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await subscriptionService.getStatus(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}
