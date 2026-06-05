import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import * as ctrl from '../controllers/report.controller'

const router = Router()
router.use(authMiddleware)

router.get('/revenue', ctrl.getRevenue)
router.get('/top-services', ctrl.getTopServices)
router.get('/inventory-usage', ctrl.getInventoryUsage)
router.get('/snapshot', ctrl.getSnapshot)

export default router
