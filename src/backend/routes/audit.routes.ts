import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import * as ctrl from '../controllers/audit.controller'

const router = Router()
router.use(authMiddleware)

// GET /api/audit — paginated, read-only (write-once trail; no mutation routes by design)
router.get('/', requirePlane('clinic'), requirePermission('audit.view'), ctrl.listAudit)

export default router
