/**
 * Platform-auth controller — HTTP handlers for platform-plane authentication.
 *
 * Controllers are HTTP-only: parse/validate input, call the service, send the
 * response envelope. No business logic lives here.
 *
 * @module platform-auth.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { platformLogin, platformGetMe, refreshPlatformToken, revokePlatformToken } from '../services/platform-auth.service'

/** Zod schema for POST /platform/auth/login */
export const platformLoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
}).strict()

/**
 * Handle POST /platform/auth/login.
 *
 * Validates credentials and returns a platform-plane JWT on success.
 *
 * @param req  - Express request (body parsed by validate middleware).
 * @param res  - Express response.
 * @param next - Express next function for error forwarding.
 */
export async function handlePlatformLogin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as z.infer<typeof platformLoginSchema>
    const result = await platformLogin(email, password)
    res.status(200).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

export async function handlePlatformMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { platformUserId } = req.context!
    const result = await platformGetMe(platformUserId!)
    res.status(200).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

/** Zod schema for POST /platform/auth/refresh and POST /platform/auth/logout. */
export const platformRefreshSchema = z.object({ refreshToken: z.string().min(1) }).strict()
export const platformLogoutSchema   = z.object({ refreshToken: z.string().min(1) }).strict()

/**
 * Handle POST /platform/auth/refresh.
 * Exchanges a valid platform-plane refresh token for a new access + refresh token pair.
 */
export async function handlePlatformRefresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = req.body as z.infer<typeof platformRefreshSchema>
    const result = await refreshPlatformToken(refreshToken)
    res.status(200).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * Handle POST /platform/auth/logout.
 * Revokes the entire refresh token family for the given token. Returns 204.
 */
export async function handlePlatformLogout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refreshToken } = req.body as z.infer<typeof platformLogoutSchema>
    await revokePlatformToken(refreshToken)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
