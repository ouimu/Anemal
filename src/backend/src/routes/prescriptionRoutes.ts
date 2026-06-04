import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import { handleCreatePrescription, handleDeletePrescription } from '../controllers/prescriptionController'
import { createPrescriptionSchema } from '../services/prescriptionService'

const router = Router()
router.use(authMiddleware)

router.post('/',    validate(createPrescriptionSchema), handleCreatePrescription)
router.delete('/:id', handleDeletePrescription)

export default router
