// Admin routes — authMiddleware + permission enforcement
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { getSettings, updateSettings, updateSettingsSchema } from '../controllers/tenant-settings.controller'
import { getClinicUsage } from '../services/usage.service'

const router = Router()
router.use(authMiddleware)

router.get('/settings', requirePlane('clinic'), requirePermission('clinic.profile.view'), getSettings)
router.put('/settings', requirePlane('clinic'), requirePermission('clinic.profile.edit'), validate(updateSettingsSchema), updateSettings)

router.get('/usage', requirePlane('clinic'), requirePermission('clinic.profile.view'), async (req, res, next) => {
  try {
    const data = await getClinicUsage(req.context!.tenantId, req.context?.branchId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
