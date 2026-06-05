import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as userService from '../services/user.service'

export const createUserSchema = z.object({
  name:     z.string().min(1).max(255),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['doctor', 'staff']),
}).strict()

export const updateUserSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  role:     z.enum(['admin', 'doctor', 'staff']).optional(),
  isActive: z.boolean().optional(),
}).strict()

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.listUsers(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.getUserById(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.createUser(req.context!.tenantId, req.body)
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.updateUser(req.context!.tenantId, Number(req.params.id), req.body)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await userService.deactivateUser(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data: { message: 'User deactivated' } })
  } catch (err) { next(err) }
}
