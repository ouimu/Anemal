// System-settings routes (Phase 1.5-B, minimal S2.2) — mounted at /admin/system-settings.
// superadmin role required on every endpoint; clinic admin gets 403 (TC-S004).
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { rbacMiddleware } from '../middlewares/rbac.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/system-settings.controller'

const router = Router()
router.use(authMiddleware)
router.use(rbacMiddleware(['superadmin']))

router.get('/', ctrl.getAllSettings)
router.post('/smtp/test', ctrl.testSmtp)
router.get('/:key', ctrl.getSettingByKey)
router.put('/:key', validate(ctrl.updateSystemSettingSchema), ctrl.updateSettingByKey)

export default router
