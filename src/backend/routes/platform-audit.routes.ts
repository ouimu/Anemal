/**
 * Platform-audit routes — mounts under /platform/audit.
 *
 * Every route requires a valid platform-plane JWT (authMiddleware +
 * requirePlane('platform')). Clinic tokens are rejected. No permission
 * codes are checked in this phase — plane isolation is sufficient.
 *
 * @module platform-audit.routes
 */

import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePlatformPermission } from '../middlewares/permission.middleware'
import { handleListPlatformAudit } from '../controllers/platform-audit.controller'

const router = Router()

// All routes require a platform-plane JWT
router.use(authMiddleware, requirePlane('platform'))

router.get('/', requirePlatformPermission('platform.audit.view'), handleListPlatformAudit)

export default router
