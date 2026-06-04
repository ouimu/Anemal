import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import { handleListOwners, handleGetOwner, handleCreateOwner, handleUpdateOwner } from '../controllers/ownerController'
import { createOwnerSchema, updateOwnerSchema } from '../services/ownerService'

const router = Router()
router.use(authMiddleware)

router.get('/',    handleListOwners)
router.get('/:id', handleGetOwner)
router.post('/',   validate(createOwnerSchema), handleCreateOwner)
router.put('/:id', validate(updateOwnerSchema), handleUpdateOwner)

export default router
