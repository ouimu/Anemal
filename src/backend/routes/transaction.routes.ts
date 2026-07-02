import { Router } from 'express'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { handleListTransactions, handleRevenueSeries } from '../controllers/transaction.controller'

const router = Router()
router.get('/',               requirePlane('clinic'), requirePermission('billing.view'), handleListTransactions)
router.get('/revenue-series', requirePlane('clinic'), requirePermission('billing.view'), handleRevenueSeries)
export default router
