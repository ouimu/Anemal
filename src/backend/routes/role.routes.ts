/**
 * Clinic role management routes.
 *
 * All routes require authMiddleware + requirePlane('clinic').
 * Read-only routes accept roles.view OR roles.manage; mutation routes
 * require roles.manage exclusively.
 *
 * @module role.routes
 */

import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission, requireAnyPermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as roleController from '../controllers/role.controller'
import {
  cloneRoleSchema,
  updateRolePermsSchema,
  assignUserRoleSchema,
} from '../controllers/role.controller'

const router = Router()

// Auth + plane guard applied to every role route
router.use(authMiddleware)
router.use(requirePlane('clinic'))

// List roles (system + caller's tenant custom roles) — readable by roles.view or roles.manage
router.get('/', requireAnyPermission(['roles.view', 'roles.manage']), roleController.listRoles)

// Clone a system role into a tenant custom role — requires roles.manage
router.post('/clone', requirePermission('roles.manage'), validate(cloneRoleSchema), roleController.cloneRole)

// Update permissions on a custom role — requires roles.manage
router.put('/:roleId/permissions', requirePermission('roles.manage'), validate(updateRolePermsSchema), roleController.updateRolePermissions)

// Delete a custom role — requires roles.manage
router.delete('/:roleId', requirePermission('roles.manage'), roleController.deleteRole)

// Assign a role to a user — requires roles.manage
router.post('/users/:userId/roles', requirePermission('roles.manage'), validate(assignUserRoleSchema), roleController.assignRoleToUser)

// Remove a role from a user — requires roles.manage
router.delete('/users/:userId/roles/:roleId', requirePermission('roles.manage'), roleController.removeRoleFromUser)

export default router
