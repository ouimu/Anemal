import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { rbacMiddleware } from '../middlewares/rbac.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/branch.controller'
import { createBranchSchema, updateBranchSchema, shiftSchema } from '../services/branch.service'

const router = Router()
router.use(authMiddleware)
router.use(rbacMiddleware(['admin']))

router.get('/', ctrl.listBranches)
router.post('/', validate(createBranchSchema), ctrl.createBranch)
router.get('/:id', ctrl.getBranch)
router.put('/:id', validate(updateBranchSchema), ctrl.updateBranch)

// Doctor shifts (per branch)
router.get('/:id/shifts', ctrl.listShifts)
router.post('/:id/shifts', validate(shiftSchema), ctrl.setShift)
router.delete('/:id/shifts/:shiftId', ctrl.removeShift)

export default router
