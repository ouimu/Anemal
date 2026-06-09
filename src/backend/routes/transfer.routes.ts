import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/transfer.controller'
import { createTransferSchema } from '../services/transfer.service'

const router = Router()
router.use(authMiddleware)

router.get('/', ctrl.listTransfers)
router.post('/', validate(createTransferSchema), ctrl.createTransfer)

export default router
