import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListOwners, handleGetOwner, handleCreateOwner, handleUpdateOwner } from '../controllers/owner.controller'
import { createOwnerSchema, updateOwnerSchema } from '../services/owner.service'

const router = Router()
router.use(authMiddleware)

router.get('/',    requirePlane('clinic'), requirePermission('crm.view'),   handleListOwners)
router.get('/:id', requirePlane('clinic'), requirePermission('crm.view'),   handleGetOwner)
router.post('/',   requirePlane('clinic'), requirePermission('crm.create'), validate(createOwnerSchema), handleCreateOwner)
router.put('/:id', requirePlane('clinic'), requirePermission('crm.edit'),   validate(updateOwnerSchema), handleUpdateOwner)

export default router
