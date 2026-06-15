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
import { requirePlane } from '../middlewares/permission.middleware'
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

router.get('/',     handleListPlans)
router.post('/',    validate(createPlanSchema), handleCreatePlan)
router.get('/:id',  handleGetPlan)
router.put('/:id',  validate(updatePlanSchema), handleUpdatePlan)
router.delete('/:id', handleRetirePlan)

export default router
