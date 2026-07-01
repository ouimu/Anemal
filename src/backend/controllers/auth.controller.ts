import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { login, switchBranch, selectBranch, getMe, refreshClinicToken, revokeClinicToken } from '../services/auth.service'

export const loginSchema = z.object({
  subdomain: z.string().min(1),
  username:  z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, digits, and underscores'),
  password:  z.string().min(1),
}).strict()

export const switchBranchSchema = z.object({
  branchId: z.number().int().positive().nullable(),
}).strict()

export async function handleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await login(req.body)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}

export const selectBranchSchema = z.object({
  pendingToken: z.string().min(1),
  branchId:     z.number().int().positive(),
}).strict()

export async function handleSelectBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { pendingToken, branchId } = req.body as z.infer<typeof selectBranchSchema>
    const result = await selectBranch(pendingToken, branchId)
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

export async function handleMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId, tenantId, branchId } = req.context!
    const result = await getMe(tenantId, userId, branchId)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}

/** Zod schema for POST /auth/refresh and POST /auth/logout. */
export const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict()
export const logoutSchema  = z.object({ refreshToken: z.string().min(1) }).strict()

/**
 * Handle POST /auth/refresh.
 * Exchanges a valid clinic-plane refresh token for a new access + refresh token pair.
 */
export async function handleRefresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as z.infer<typeof refreshSchema>
    const result = await refreshClinicToken(refreshToken)
    res.status(200).json({ success: true, data: result })
  } catch (err) { next(err) }
}

/**
 * Handle POST /auth/logout.
 * Revokes the entire refresh token family for the given token. Returns 204.
 */
export async function handleLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as z.infer<typeof logoutSchema>
    await revokeClinicToken(refreshToken)
    res.status(204).send()
  } catch (err) { next(err) }
}
