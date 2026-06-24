import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as userService from '../services/user.service'

/** Regex for username: 3-20 chars, letters/digits/underscores only. */
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/

export const createUserSchema = z.object({
  name:     z.string().min(1).max(255),
  username: z.string().min(3).max(20).regex(USERNAME_REGEX, 'Username may only contain letters, digits, and underscores'),
  email:    z.string().email().optional(),
  phone:    z.string().max(20).optional(),
  password: z.string().min(8),
  role:     z.enum(['doctor', 'staff']),
}).strict()

export const updateUserSchema = z.object({
  name:     z.string().min(1).max(255).optional(),
  username: z.string().min(3).max(20).regex(USERNAME_REGEX, 'Username may only contain letters, digits, and underscores').optional(),
  email:    z.string().email().optional(),
  phone:    z.string().max(20).optional(),
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

/**
 * GET /users/:userId/roles
 * Returns the roles assigned to a specific user within the caller's tenant.
 * Guarded by staff.assign_role — only admins with that permission can view
 * another user's role assignments.
 */
export async function getUserRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await userService.getUserRoles(
      req.context!.tenantId,
      Number(req.params.userId),
    )
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

/** Zod schema for PATCH /users/:userId/branch */
export const assignBranchSchema = z.object({
  branchId: z.number().int().positive().nullable(),
}).strict()

/**
 * PATCH /users/:userId/branch
 * Assigns (or clears) the primary branch for a staff or doctor user.
 * Guarded by staff.assign_branch — only clinic admins may call this.
 */
export async function handleAssignBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId   = Number(req.params.userId)
    const branchId = (req.body as { branchId: number | null }).branchId
    const data = await userService.assignUserBranch(req.context!.tenantId, userId, branchId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await userService.deactivateUser(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data: { message: 'User deactivated' } })
  } catch (err) { next(err) }
}
