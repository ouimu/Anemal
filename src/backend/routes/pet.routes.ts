import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListPets, handleGetPet, handleCreatePet, handleUpdatePet, handleUploadPetPhoto, handleGetPetPhoto } from '../controllers/pet.controller'
import { createPetSchema, updatePetSchema } from '../services/pet.service'

const upload = multer({ storage: multer.memoryStorage() })
const router = Router()
router.use(authMiddleware)

router.get('/',    requirePlane('clinic'), requirePermission('crm.view'),   handleListPets)
router.get('/:id', requirePlane('clinic'), requirePermission('crm.view'),   handleGetPet)
router.post('/',   requirePlane('clinic'), requirePermission('crm.create'), validate(createPetSchema), handleCreatePet)
router.put('/:id', requirePlane('clinic'), requirePermission('crm.edit'),   validate(updatePetSchema), handleUpdatePet)
router.post('/:id/photo', requirePlane('clinic'), requirePermission('crm.edit'), upload.single('file'), handleUploadPetPhoto)
router.get('/:id/photo',  requirePlane('clinic'), requirePermission('crm.view'), handleGetPetPhoto)

export default router
