import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/grooming.controller'
import { bookingSchema, statusSchema } from '../services/grooming.service'

const router = Router()
router.use(authMiddleware)

router.get('/bookings', ctrl.listBookings)
router.post('/bookings', validate(bookingSchema), ctrl.createBooking)
router.put('/bookings/:id/status', validate(statusSchema), ctrl.updateStatus)

export default router
