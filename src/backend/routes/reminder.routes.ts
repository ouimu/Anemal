import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/reminder.controller'
import { reminderSchema, statusSchema } from '../services/reminder.service'

const router = Router()
router.use(authMiddleware)

router.get('/due', ctrl.listDue)
router.get('/', ctrl.list)
router.post('/', validate(reminderSchema), ctrl.create)
router.put('/:id/status', validate(statusSchema), ctrl.setStatus)

export default router
