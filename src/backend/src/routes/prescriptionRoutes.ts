import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { handleCreatePrescription, handleDeletePrescription } from '../controllers/prescriptionController'

const router = Router()
router.use(authMiddleware)

router.post('/',    handleCreatePrescription)
router.delete('/:id', handleDeletePrescription)

export default router
