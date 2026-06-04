import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import {
  handleListAppointments, handleGetAppointment,
  handleCreateAppointment, handleWalkIn, handleUpdateStatus,
} from '../controllers/appointmentController'
import { createAppointmentSchema, walkInSchema, statusSchema } from '../services/appointmentService'

const router = Router()
router.use(authMiddleware)

router.get('/',           handleListAppointments)
router.get('/:id',        handleGetAppointment)
router.post('/',          validate(createAppointmentSchema), handleCreateAppointment)
router.post('/walk-in',   validate(walkInSchema), handleWalkIn)
router.put('/:id/status', validate(statusSchema), handleUpdateStatus)

export default router
