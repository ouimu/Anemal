import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import * as ctrl from '../controllers/subscription.controller'

const router = Router()
router.use(authMiddleware)

// Subscription status is an admin-facing view (shown in the Admin → Subscription tab).
router.get('/status', requirePlane('clinic'), requirePermission('clinic.profile.view'), ctrl.getStatus)

export default router
