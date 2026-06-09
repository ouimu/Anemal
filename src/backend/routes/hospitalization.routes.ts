import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/hospitalization.controller'
import { admitSchema, careSchema } from '../services/hospitalization.service'

const router = Router()
router.use(authMiddleware)

router.get('/active', ctrl.listActive)
router.post('/', validate(admitSchema), ctrl.admit)
router.get('/:id', ctrl.getHospitalization)
router.post('/:id/care', validate(careSchema), ctrl.logCare)
router.put('/:id/discharge', ctrl.discharge)

export default router
