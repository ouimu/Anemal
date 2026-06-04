import { Request, Response } from 'express'
import { z } from 'zod'
import * as userService from '../services/userService'
import { UserError } from '../services/userService'

const createSchema = z.object({
  name:     z.string().min(1).max(255),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['doctor', 'staff']),
})

const updateSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  role:     z.enum(['admin', 'doctor', 'staff']).optional(),
  isActive: z.boolean().optional(),
})

function handleError(err: unknown, res: Response): void {
  if (err instanceof UserError) {
    res.status(err.statusCode).json({ success: false, error: err.message })
  } else {
    res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const data = await userService.listUsers(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { handleError(err, res) }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  try {
    const data = await userService.getUserById(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data })
  } catch (err) { handleError(err, res) }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
    return
  }
  try {
    const data = await userService.createUser(req.context!.tenantId, parsed.data)
    res.status(201).json({ success: true, data })
  } catch (err) { handleError(err, res) }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
    return
  }
  try {
    const data = await userService.updateUser(req.context!.tenantId, Number(req.params.id), parsed.data)
    res.json({ success: true, data })
  } catch (err) { handleError(err, res) }
}

export async function deactivateUser(req: Request, res: Response): Promise<void> {
  try {
    await userService.deactivateUser(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data: { message: 'User deactivated' } })
  } catch (err) { handleError(err, res) }
}
