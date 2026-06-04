import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login } from '../services/authService'

export const loginSchema = z.object({
  subdomain: z.string().min(1),
  email:     z.string().email(),
  password:  z.string().min(1),
}).strict()

export async function handleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await login(req.body)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}
