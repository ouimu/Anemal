import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import {
  handleListAppointments, handleGetAppointment,
  handleCreateAppointment, handleWalkIn, handleUpdateStatus,
} from '../controllers/appointmentController'

const router = Router()
router.use(authMiddleware)

router.get('/',           handleListAppointments)
router.get('/:id',        handleGetAppointment)
router.post('/',          handleCreateAppointment)
router.post('/walk-in',   handleWalkIn)
router.put('/:id/status', handleUpdateStatus)

export default router
