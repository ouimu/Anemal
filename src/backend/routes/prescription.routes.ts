import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleCreatePrescription,
  handleDeletePrescription,
  handleDownloadPrescriptionPdf,
} from '../controllers/prescription.controller'
import { createPrescriptionSchema } from '../services/prescription.service'

const router = Router()
router.use(authMiddleware)

router.get('/:id/pdf', requirePlane('clinic'), requirePermission('prescriptions.view'),   handleDownloadPrescriptionPdf)
router.post('/',       requirePlane('clinic'), requirePermission('prescriptions.create'), validate(createPrescriptionSchema), handleCreatePrescription)
router.delete('/:id',  requirePlane('clinic'), requirePermission('prescriptions.create'), handleDeletePrescription)

export default router
