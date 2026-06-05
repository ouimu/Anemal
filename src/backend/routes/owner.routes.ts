import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListOwners, handleGetOwner, handleCreateOwner, handleUpdateOwner } from '../controllers/owner.controller'
import { createOwnerSchema, updateOwnerSchema } from '../services/owner.service'

const router = Router()
router.use(authMiddleware)

router.get('/',    handleListOwners)
router.get('/:id', handleGetOwner)
router.post('/',   validate(createOwnerSchema), handleCreateOwner)
router.put('/:id', validate(updateOwnerSchema), handleUpdateOwner)

export default router
