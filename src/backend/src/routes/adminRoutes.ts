// Admin-only routes — authMiddleware + rbacMiddleware(['admin']) applied
import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { rbacMiddleware } from '../middlewares/rbacMiddleware'
import { validate } from '../middlewares/validate'
import { getSettings, updateSettings, updateSettingsSchema } from '../controllers/tenantSettingsController'
import { getClinicUsage } from '../services/usageService'

const router = Router()
router.use(authMiddleware)
router.use(rbacMiddleware(['admin']))

router.get('/settings', getSettings)
router.put('/settings', validate(updateSettingsSchema), updateSettings)

router.get('/usage', async (req, res, next) => {
  try {
    const data = await getClinicUsage(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
