import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import * as ctrl from '../controllers/report.controller'

const router = Router()
router.use(authMiddleware)

router.get('/revenue',         requirePlane('clinic'), requirePermission('reports.revenue.view'),   ctrl.getRevenue)
router.get('/top-services',    requirePlane('clinic'), requirePermission('reports.revenue.view'),   ctrl.getTopServices)
router.get('/inventory-usage', requirePlane('clinic'), requirePermission('reports.inventory.view'), ctrl.getInventoryUsage)
router.get('/snapshot',        requirePlane('clinic'), requirePermission('reports.revenue.view'),   ctrl.getSnapshot)
router.get('/branch-revenue',  requirePlane('clinic'), requirePermission('reports.revenue.view'),   ctrl.getBranchRevenue)

export default router
