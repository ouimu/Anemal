/**
 * Role controller — thin HTTP layer; delegates all logic to role.service.
 *
 * All handlers follow the standard pattern:
 *   async (req, res, next) => { try { ... } catch(err) { next(err) } }
 *
 * The caller's permission set is resolved by the service layer (passed from
 * req.context via resolvePermissions in the route middleware chain).
 *
 * @module role.controller
 */

import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { resolvePermissions } from '../services/permission.service'
import * as roleService from '../services/role.service'
import prisma from '../config/db'

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

export const cloneRoleSchema = z.object({
  sourceRoleName: z.string().min(1).max(255),
  newName:        z.string().min(1).max(255),
}).strict()

export const updateRolePermsSchema = z.object({
  add:    z.array(z.string().min(1)).default([]),
  remove: z.array(z.string().min(1)).default([]),
}).strict()

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /clinic/roles
 * Returns system roles + caller's tenant custom roles, each with permissions[]
 * and assignedUserCount (number of users currently holding the role).
 */
export async function listRoles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await roleService.listRoles(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

/**
 * POST /clinic/roles/clone
 * Clone a system role into a tenant custom role using only the caller's own perms.
 */
export async function cloneRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sourceRoleName, newName } = cloneRoleSchema.parse(req.body)
    const callerPerms = await resolvePermissions(
      req.context!.userId,
      req.context!.tenantId,
    )
    const data = await roleService.cloneRole(
      req.context!.tenantId,
      sourceRoleName,
      newName,
      callerPerms,
    )
    res.status(201).json({ success: true, data })
  } catch (err) { next(err) }
}

/**
 * PUT /clinic/roles/:roleId/permissions
 * Add or remove permissions on a custom role; 403 if system role.
 */
export async function updateRolePermissions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { add, remove } = updateRolePermsSchema.parse(req.body)
    const roleId      = Number(req.params.roleId)
    const callerPerms = await resolvePermissions(
      req.context!.userId,
      req.context!.tenantId,
    )
    const data = await roleService.updateRolePermissions(
      req.context!.tenantId,
      roleId,
      add,
      remove,
      callerPerms,
    )
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

/**
 * DELETE /clinic/roles/:roleId
 * Delete a custom role; 403 if system; 409 if in use.
 */
export async function deleteRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const roleId = Number(req.params.roleId)
    await roleService.deleteRole(req.context!.tenantId, roleId)
    res.json({ success: true, data: { message: 'Role deleted' } })
  } catch (err) { next(err) }
}

/**
 * GET /clinic/permissions
 * Returns all permission codes grouped by module. Used by the role editor UI
 * to populate the permission toggle list.
 */
export async function listPermissions(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const perms = await prisma.permission.findMany({ orderBy: { code: 'asc' } })
    const grouped: Record<string, string[]> = {}
    for (const p of perms) {
      if (!grouped[p.module]) grouped[p.module] = []
      grouped[p.module].push(p.code)
    }
    res.json({ success: true, data: grouped })
  } catch (err) { next(err) }
}

