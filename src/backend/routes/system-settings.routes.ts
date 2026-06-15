// System-settings routes — mounted at /admin/system-settings.
// T-5C-03: guarded by platform plane only (superadmin migrated to platform_users).
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/system-settings.controller'

const router = Router()
router.use(authMiddleware)
router.use(requirePlane('platform'))

router.get('/', ctrl.getAllSettings)
router.post('/smtp/test', ctrl.testSmtp)
router.get('/:key', ctrl.getSettingByKey)
router.put('/:key', validate(ctrl.updateSystemSettingSchema), ctrl.updateSettingByKey)

export default router
