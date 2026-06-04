import { Request, Response } from 'express'
import { z } from 'zod'
import { login, AuthError } from '../services/authService'

const loginSchema = z.object({
  subdomain: z.string().min(1),
  email:     z.string().email(),
  password:  z.string().min(1),
})

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.flatten() })
    return
  }

  try {
    const result = await login(parsed.data)
    res.status(200).json({ success: true, data: result })
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ success: false, error: err.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
}
