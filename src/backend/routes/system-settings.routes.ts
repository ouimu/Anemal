// System-settings routes — mounted at /platform/settings.
// T-5C-03 / T3: guarded by platform plane + permission codes.
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePlatformPermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/system-settings.controller'

const router = Router()
router.use(authMiddleware)
router.use(requirePlane('platform'))

router.get('/',           requirePlatformPermission('platform.settings.view'), ctrl.getAllSettings)
router.put('/',           requirePlatformPermission('platform.settings.edit'), validate(ctrl.updateAllSettingsSchema), ctrl.updateAllSettings)
router.post('/smtp/test', requirePlatformPermission('platform.settings.edit'), ctrl.testSmtp)
router.get('/:key',       requirePlatformPermission('platform.settings.view'), ctrl.getSettingByKey)
router.put('/:key',       requirePlatformPermission('platform.settings.edit'), validate(ctrl.updateSystemSettingSchema), ctrl.updateSettingByKey)

export default router
