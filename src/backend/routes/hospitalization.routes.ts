import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/hospitalization.controller'
import { admitSchema, editSchema, careSchema } from '../services/hospitalization.service'

const router = Router()
router.use(authMiddleware)

router.get('/active',        requirePlane('clinic'), requirePermission('inpatient.view'),   ctrl.listActive)
router.post('/',             requirePlane('clinic'), requirePermission('inpatient.manage'), validate(admitSchema), ctrl.admit)
router.get('/:id',           requirePlane('clinic'), requirePermission('inpatient.view'),   ctrl.getHospitalization)
router.put('/:id',           requirePlane('clinic'), requirePermission('inpatient.manage'), validate(editSchema), ctrl.edit)
router.delete('/:id',        requirePlane('clinic'), requirePermission('inpatient.manage'), ctrl.remove)
router.post('/:id/care',     requirePlane('clinic'), requirePermission('inpatient.manage'), validate(careSchema), ctrl.logCare)
router.put('/:id/discharge', requirePlane('clinic'), requirePermission('inpatient.manage'), ctrl.discharge)

export default router
