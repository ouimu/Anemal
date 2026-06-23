/**
 * Platform-plans routes — mounts under /platform/plans.
 *
 * Every route requires a valid platform-plane JWT (authMiddleware +
 * requirePlane('platform')). No clinic token is accepted here.
 *
 * @module platform-plans.routes
 */

import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePlatformPermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  createPlanSchema,
  updatePlanSchema,
  handleListPlans,
  handleCreatePlan,
  handleGetPlan,
  handleUpdatePlan,
  handleRetirePlan,
} from '../controllers/platform-plans.controller'

const router = Router()

// All platform-plans routes require platform-plane authentication
router.use(authMiddleware, requirePlane('platform'))

router.get('/',       requirePlatformPermission('platform.plans.view'),   handleListPlans)
router.post('/',      requirePlatformPermission('platform.plans.manage'), validate(createPlanSchema), handleCreatePlan)
router.get('/:id',    requirePlatformPermission('platform.plans.view'),   handleGetPlan)
router.put('/:id',    requirePlatformPermission('platform.plans.manage'), validate(updatePlanSchema), handleUpdatePlan)
router.delete('/:id', requirePlatformPermission('platform.plans.manage'), handleRetirePlan)

export default router
