import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login, switchBranch } from '../services/auth.service'

export const loginSchema = z.object({
  subdomain: z.string().min(1),
  email:     z.string().email(),
  password:  z.string().min(1),
}).strict()

export const switchBranchSchema = z.object({
  branchId: z.number().int().positive(),
}).strict()

export async function handleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await login(req.body)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}

export async function handleSwitchBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, tenantId, role } = req.context!
    const result = await switchBranch(tenantId, userId, role, req.body.branchId)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}
