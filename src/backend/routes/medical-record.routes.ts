import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord, handleAddAttachment,
} from '../controllers/medical-record.controller'
import { createMedicalRecordSchema, updateMedicalRecordSchema, addAttachmentSchema } from '../services/medical-record.service'

const router = Router()
router.use(authMiddleware)

router.get('/',                 requirePlane('clinic'), requirePermission('emr.view'),   handleListMedicalRecords)
router.get('/:id',              requirePlane('clinic'), requirePermission('emr.view'),   handleGetMedicalRecord)
router.post('/',                requirePlane('clinic'), requirePermission('emr.create'), validate(createMedicalRecordSchema), handleCreateMedicalRecord)
router.put('/:id',              requirePlane('clinic'), requirePermission('emr.edit'),   validate(updateMedicalRecordSchema), handleUpdateMedicalRecord)
router.post('/:id/attachments', requirePlane('clinic'), requirePermission('emr.attach'), validate(addAttachmentSchema),       handleAddAttachment)

export default router
