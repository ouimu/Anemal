import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { rbacMiddleware } from '../middlewares/rbac.middleware'
import * as ctrl from '../controllers/subscription.controller'

const router = Router()
router.use(authMiddleware)

// Subscription status is an admin-facing view (shown in the Admin → Subscription tab).
router.get('/status', rbacMiddleware(['admin']), ctrl.getStatus)

export default router
