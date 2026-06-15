import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/loyalty.controller'
import { redeemSchema } from '../services/loyalty.service'

const router = Router()
router.use(authMiddleware)

router.get('/owners/:ownerId', requirePlane('clinic'), requirePermission('loyalty.view'),   ctrl.getOwnerLoyalty)
router.post('/redeem',         requirePlane('clinic'), requirePermission('loyalty.manage'), validate(redeemSchema), ctrl.redeem)

export default router
