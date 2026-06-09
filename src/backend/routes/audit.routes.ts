import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { rbacMiddleware } from '../middlewares/rbac.middleware'
import * as ctrl from '../controllers/audit.controller'

const router = Router()
router.use(authMiddleware)
router.use(rbacMiddleware(['admin']))

// GET /api/audit — paginated, read-only (write-once trail; no mutation routes by design)
router.get('/', ctrl.listAudit)

export default router
