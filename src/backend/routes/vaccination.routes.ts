import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListVaccinations, handleCreateVaccination, handleGetDueSoon } from '../controllers/vaccination.controller'
import { createVaccinationSchema } from '../services/vaccination.service'

const router = Router()
router.use(authMiddleware)

router.get('/due-soon', requirePlane('clinic'), requirePermission('emr.view'),   handleGetDueSoon)
router.get('/',         requirePlane('clinic'), requirePermission('emr.view'),   handleListVaccinations)
router.post('/',        requirePlane('clinic'), requirePermission('vaccination.create'), validate(createVaccinationSchema), handleCreateVaccination)

export default router
