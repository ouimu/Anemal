import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { handleListOwners, handleGetOwner, handleCreateOwner, handleUpdateOwner } from '../controllers/ownerController'

const router = Router()
router.use(authMiddleware)

router.get('/',    handleListOwners)
router.get('/:id', handleGetOwner)
router.post('/',   handleCreateOwner)
router.put('/:id', handleUpdateOwner)

export default router
