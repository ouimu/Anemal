import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/branch.controller'
import { createBranchSchema, updateBranchSchema, shiftSchema } from '../services/branch.service'

const router = Router()
router.use(authMiddleware)

router.get('/',  requirePlane('clinic'), requirePermission('clinic.branch.view'),   ctrl.listBranches)
router.post('/', requirePlane('clinic'), requirePermission('clinic.branch.manage'), validate(createBranchSchema), ctrl.createBranch)
router.get('/:id',  requirePlane('clinic'), requirePermission('clinic.branch.view'),   ctrl.getBranch)
router.put('/:id',  requirePlane('clinic'), requirePermission('clinic.branch.manage'), validate(updateBranchSchema), ctrl.updateBranch)

// Doctor shifts (per branch)
router.get('/:id/shifts',              requirePlane('clinic'), requirePermission('clinic.branch.view'),   ctrl.listShifts)
router.post('/:id/shifts',             requirePlane('clinic'), requirePermission('clinic.branch.manage'), validate(shiftSchema), ctrl.setShift)
router.delete('/:id/shifts/:shiftId',  requirePlane('clinic'), requirePermission('clinic.branch.manage'), ctrl.removeShift)

export default router
