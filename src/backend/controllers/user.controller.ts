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

/**
 * Zod schema for PATCH /users/:id/password (PWD-2).
 * Shape validation only — the 8-char minimum is enforced in the service
 * layer (UserError, 422), same reasoning as changePasswordSchema in
 * auth.controller.ts.
 */
export const resetPasswordSchema = z.object({
  newPassword: z.string().min(1),
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

/**
 * Zod schema for PATCH /users/:userId/branch.
 * Accepts an array of branch IDs; empty array is valid (admin-only cleared state).
 */
export const assignBranchSchema = z.object({
  branchIds: z.array(z.number().int().positive()).min(0),
}).strict()

/**
 * PATCH /users/:userId/branch
 * Assigns one or more branches for a staff, doctor, or admin user.
 * Guarded by staff.assign_branch — only clinic admins may call this.
 *
 * @param req - Express request; body validated by assignBranchSchema.
 * @param res - Express response; returns standard { success, data } envelope.
 * @param next - Express next for error propagation.
 */
export async function handleAssignBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId    = Number(req.params.userId)
    const branchIds = (req.body as { branchIds: number[] }).branchIds
    const data = await userService.assignUserBranches(req.context!.tenantId, userId, branchIds)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

/**
 * GET /users/:userId/branches
 * Returns the branches assigned to a user. Guarded by staff.assign_branch.
 */
export async function handleGetUserBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId   = Number(req.params.userId)
    const branches = await userService.getUserBranches(req.context!.tenantId, userId)
    res.json({ success: true, data: branches })
  } catch (err) { next(err) }
}

export async function deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await userService.deactivateUser(req.context!.tenantId, Number(req.params.id))
    res.json({ success: true, data: { message: 'User deactivated' } })
  } catch (err) { next(err) }
}

/**
 * PATCH /users/:id/password
 * Admin resets a clinic user's password within the caller's tenant.
 * Guarded by staff.manage. Q-G1: resetting a peer clinic_admin is allowed.
 * Q-G2: resetting one's own id via this route is allowed (no current-password check).
 */
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newPassword } = req.body as z.infer<typeof resetPasswordSchema>
    await userService.resetUserPassword(req.context!.tenantId, Number(req.params.id), newPassword)
    res.status(204).send()
  } catch (err) { next(err) }
}
