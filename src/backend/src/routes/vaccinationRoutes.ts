import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import { handleListVaccinations, handleCreateVaccination, handleGetDueSoon } from '../controllers/vaccinationController'
import { createVaccinationSchema } from '../services/vaccinationService'

const router = Router()
router.use(authMiddleware)

router.get('/due-soon', handleGetDueSoon)
router.get('/',         handleListVaccinations)
router.post('/',        validate(createVaccinationSchema), handleCreateVaccination)

export default router
