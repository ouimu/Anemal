import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { handleListVaccinations, handleCreateVaccination, handleGetDueSoon } from '../controllers/vaccinationController'

const router = Router()
router.use(authMiddleware)

router.get('/due-soon', handleGetDueSoon)
router.get('/',         handleListVaccinations)
router.post('/',        handleCreateVaccination)

export default router
