import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import {
  handleListMedicalRecords, handleGetMedicalRecord,
  handleCreateMedicalRecord, handleUpdateMedicalRecord, handleAddAttachment,
} from '../controllers/medicalRecordController'

const router = Router()
router.use(authMiddleware)

router.get('/',            handleListMedicalRecords)
router.get('/:id',         handleGetMedicalRecord)
router.post('/',           handleCreateMedicalRecord)
router.put('/:id',         handleUpdateMedicalRecord)
router.post('/:id/attachments', handleAddAttachment)

export default router
