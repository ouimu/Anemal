import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/transfer.controller'
import { createTransferSchema } from '../services/transfer.service'

const router = Router()
router.use(authMiddleware)

router.get('/',  requirePlane('clinic'), requirePermission('inventory.view'),   ctrl.listTransfers)
router.post('/', requirePlane('clinic'), requirePermission('inventory.adjust'), validate(createTransferSchema), ctrl.createTransfer)

export default router
