import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { getClinicSummary } from '../services/usageService'

const router = Router()
router.use(authMiddleware)

router.get('/usage', async (req, res) => {
  try {
    const data = await getClinicSummary(req.context!.tenantId)
    res.json({ success: true, data })
  } catch {
    res.status(500).json({ success: false, error: 'Failed to load usage' })
  }
})

export default router
