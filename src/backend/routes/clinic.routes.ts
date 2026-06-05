import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { getClinicSummary } from '../services/usage.service'

const router = Router()
router.use(authMiddleware)

router.get('/usage', async (req, res, next) => {
  try {
    const data = await getClinicSummary(req.context!.tenantId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
