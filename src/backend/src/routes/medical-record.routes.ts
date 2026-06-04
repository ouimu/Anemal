import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord, handleAddAttachment,
} from '../controllers/medical-record.controller'
import { createMedicalRecordSchema, updateMedicalRecordSchema, addAttachmentSchema } from '../services/medical-record.service'

const router = Router()
router.use(authMiddleware)

router.get('/',            handleListMedicalRecords)
router.get('/:id',         handleGetMedicalRecord)
router.post('/',           validate(createMedicalRecordSchema), handleCreateMedicalRecord)
router.put('/:id',         validate(updateMedicalRecordSchema), handleUpdateMedicalRecord)
router.post('/:id/attachments', validate(addAttachmentSchema), handleAddAttachment)

export default router
