import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as userController from '../controllers/user.controller'
import { createUserSchema, updateUserSchema, assignBranchSchema, resetPasswordSchema } from '../controllers/user.controller'

const router = Router()
router.use(authMiddleware)

router.get('/',              requirePlane('clinic'), requirePermission('staff.view'),        userController.listUsers)
router.get('/:id',           requirePlane('clinic'), requirePermission('staff.view'),        userController.getUser)
router.post('/',      requirePlane('clinic'), requirePermission('staff.manage'), validate(createUserSchema), userController.createUser)
router.put('/:id',    requirePlane('clinic'), requirePermission('staff.manage'), validate(updateUserSchema), userController.updateUser)
router.patch('/:id/password', requirePlane('clinic'), requirePermission('staff.manage'), validate(resetPasswordSchema), userController.resetPassword)
router.delete('/:id',              requirePlane('clinic'), requirePermission('staff.manage'),        userController.deactivateUser)
router.get('/:userId/branches',    requirePlane('clinic'), requirePermission('staff.assign_branch'), userController.handleGetUserBranches)
router.patch('/:userId/branch',    requirePlane('clinic'), requirePermission('staff.assign_branch'), validate(assignBranchSchema), userController.handleAssignBranch)

export default router
