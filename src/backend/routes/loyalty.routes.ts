import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/loyalty.controller'
import { redeemSchema } from '../services/loyalty.service'

const router = Router()
router.use(authMiddleware)

router.get('/owners/:ownerId', ctrl.getOwnerLoyalty)
router.post('/redeem', validate(redeemSchema), ctrl.redeem)

export default router
