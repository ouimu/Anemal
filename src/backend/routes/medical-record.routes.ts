import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord,
} from '../controllers/medical-record.controller'
import { handleAttachmentSubmit, handleDownloadAttachment, handleDeleteAttachment } from '../controllers/emr-attachment.controller'
import { createMedicalRecordSchema, updateMedicalRecordSchema } from '../services/medical-record.service'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()
router.use(authMiddleware)

router.get('/',                          requirePlane('clinic'), requirePermission('emr.view'),   handleListMedicalRecords)
router.get('/:id',                       requirePlane('clinic'), requirePermission('emr.view'),   handleGetMedicalRecord)
router.post('/',                         requirePlane('clinic'), requirePermission('emr.create'), validate(createMedicalRecordSchema), handleCreateMedicalRecord)
router.put('/:id',                       requirePlane('clinic'), requirePermission('emr.edit'),   validate(updateMedicalRecordSchema), handleUpdateMedicalRecord)
router.post('/:id/attachments',          requirePlane('clinic'), requirePermission('emr.attach'), upload.single('file'), handleAttachmentSubmit)
router.get('/:id/attachments/:attId/download', requirePlane('clinic'), requirePermission('emr.view'), handleDownloadAttachment)
router.delete('/:id/attachments/:attId', requirePlane('clinic'), requirePermission('emr.attach'), handleDeleteAttachment)

export default router
