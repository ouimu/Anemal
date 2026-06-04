import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleCreatePrescription, handleDeletePrescription } from '../controllers/prescription.controller'
import { createPrescriptionSchema } from '../services/prescription.service'

const router = Router()
router.use(authMiddleware)

router.post('/',    validate(createPrescriptionSchema), handleCreatePrescription)
router.delete('/:id', handleDeletePrescription)

export default router
