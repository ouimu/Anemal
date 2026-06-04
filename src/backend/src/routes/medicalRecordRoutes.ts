import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord, handleAddAttachment,
} from '../controllers/medicalRecordController'
import { createMedicalRecordSchema, updateMedicalRecordSchema, addAttachmentSchema } from '../services/medicalRecordService'

const router = Router()
router.use(authMiddleware)

router.get('/',            handleListMedicalRecords)
router.get('/:id',         handleGetMedicalRecord)
router.post('/',           validate(createMedicalRecordSchema), handleCreateMedicalRecord)
router.put('/:id',         validate(updateMedicalRecordSchema), handleUpdateMedicalRecord)
router.post('/:id/attachments', validate(addAttachmentSchema), handleAddAttachment)

export default router
