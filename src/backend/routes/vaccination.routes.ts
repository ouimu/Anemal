import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListVaccinations, handleCreateVaccination, handleGetDueSoon } from '../controllers/vaccination.controller'
import { createVaccinationSchema } from '../services/vaccination.service'

const router = Router()
router.use(authMiddleware)

router.get('/due-soon', handleGetDueSoon)
router.get('/',         handleListVaccinations)
router.post('/',        validate(createVaccinationSchema), handleCreateVaccination)

export default router
