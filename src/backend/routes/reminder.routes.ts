import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/reminder.controller'
import { reminderSchema, statusSchema } from '../services/reminder.service'

const router = Router()
router.use(authMiddleware)

router.get('/due',        requirePlane('clinic'), requirePermission('appointments.view'), ctrl.listDue)
router.get('/',           requirePlane('clinic'), requirePermission('appointments.view'), ctrl.list)
router.post('/',          requirePlane('clinic'), requirePermission('appointments.edit'), validate(reminderSchema), ctrl.create)
router.put('/:id/status', requirePlane('clinic'), requirePermission('appointments.edit'), validate(statusSchema),  ctrl.setStatus)

export default router
