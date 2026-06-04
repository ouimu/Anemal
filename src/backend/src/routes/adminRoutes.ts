// Admin-only routes — authMiddleware + rbacMiddleware(['admin']) applied
import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { rbacMiddleware } from '../middlewares/rbacMiddleware'
import { getSettings, updateSettings } from '../controllers/tenantSettingsController'
import { getClinicUsage } from '../services/usageService'

const router = Router()
router.use(authMiddleware)
router.use(rbacMiddleware(['admin']))

router.get('/settings', getSettings)
router.put('/settings', updateSettings)

router.get('/usage', async (req, res) => {
  try {
    const data = await getClinicUsage(req.context!.tenantId)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to load usage' })
  }
})

export default router
