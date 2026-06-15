import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/grooming.controller'
import { bookingSchema, statusSchema } from '../services/grooming.service'

const router = Router()
router.use(authMiddleware)

router.get('/bookings',            requirePlane('clinic'), requirePermission('grooming.view'),   ctrl.listBookings)
router.post('/bookings',           requirePlane('clinic'), requirePermission('grooming.manage'), validate(bookingSchema), ctrl.createBooking)
router.put('/bookings/:id/status', requirePlane('clinic'), requirePermission('grooming.manage'), validate(statusSchema),  ctrl.updateStatus)

export default router
