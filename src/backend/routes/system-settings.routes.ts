// System-settings routes — mounted at /admin/system-settings.
// In Phase 5-C this will move to /platform/*; currently on clinic plane
// guarded by clinic.settings.manage (superadmin users migrate in T-5C-03).
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/system-settings.controller'

const router = Router()
router.use(authMiddleware)
router.use(requirePlane('clinic'))
router.use(requirePermission('clinic.settings.manage'))

router.get('/', ctrl.getAllSettings)
router.post('/smtp/test', ctrl.testSmtp)
router.get('/:key', ctrl.getSettingByKey)
router.put('/:key', validate(ctrl.updateSystemSettingSchema), ctrl.updateSettingByKey)

export default router
