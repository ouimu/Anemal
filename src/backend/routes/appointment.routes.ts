import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListAppointments, handleGetAppointment, handleListDoctors,
  handleCreateAppointment, handleWalkIn, handleUpdateStatus,
} from '../controllers/appointment.controller'
import { createAppointmentSchema, walkInSchema, statusSchema } from '../services/appointment.service'

const router = Router()
router.use(authMiddleware)

router.get('/',           requirePlane('clinic'), requirePermission('appointments.view'),   handleListAppointments)
router.get('/doctors',    requirePlane('clinic'), requirePermission('appointments.view'),   handleListDoctors)
router.get('/:id',        requirePlane('clinic'), requirePermission('appointments.view'),   handleGetAppointment)
router.post('/',          requirePlane('clinic'), requirePermission('appointments.create'), validate(createAppointmentSchema), handleCreateAppointment)
router.post('/walk-in',   requirePlane('clinic'), requirePermission('appointments.create'), validate(walkInSchema), handleWalkIn)
router.put('/:id/status', requirePlane('clinic'), requirePermission('appointments.edit'),   validate(statusSchema), handleUpdateStatus)

export default router
