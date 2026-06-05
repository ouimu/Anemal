import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListAppointments, handleGetAppointment,
  handleCreateAppointment, handleWalkIn, handleUpdateStatus,
} from '../controllers/appointment.controller'
import { createAppointmentSchema, walkInSchema, statusSchema } from '../services/appointment.service'

const router = Router()
router.use(authMiddleware)

router.get('/',           handleListAppointments)
router.get('/:id',        handleGetAppointment)
router.post('/',          validate(createAppointmentSchema), handleCreateAppointment)
router.post('/walk-in',   validate(walkInSchema), handleWalkIn)
router.put('/:id/status', validate(statusSchema), handleUpdateStatus)

export default router
