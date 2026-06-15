/**
 * Clinic role management routes.
 *
 * All routes require:
 *   1. authMiddleware    — verifies JWT, attaches req.context
 *   2. requirePlane      — enforces clinic plane (not platform)
 *   3. requirePermission — enforces roles.manage permission
 *
 * @module role.routes
 */

import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as roleController from '../controllers/role.controller'
import {
  cloneRoleSchema,
  updateRolePermsSchema,
  assignUserRoleSchema,
} from '../controllers/role.controller'

const router = Router()

// Apply auth + plane + permission guards to all role management routes
router.use(authMiddleware)
router.use(requirePlane('clinic'))
router.use(requirePermission('roles.manage'))

// List roles (system + caller's tenant custom roles)
router.get('/', roleController.listRoles)

// Clone a system role into a tenant custom role
router.post('/clone', validate(cloneRoleSchema), roleController.cloneRole)

// Update permissions on a custom role
router.put('/:roleId/permissions', validate(updateRolePermsSchema), roleController.updateRolePermissions)

// Delete a custom role
router.delete('/:roleId', roleController.deleteRole)

// Assign a role to a user
router.post('/users/:userId/roles', validate(assignUserRoleSchema), roleController.assignRoleToUser)

// Remove a role from a user
router.delete('/users/:userId/roles/:roleId', roleController.removeRoleFromUser)

export default router
