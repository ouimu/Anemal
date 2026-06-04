import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { handleListPets, handleGetPet, handleCreatePet, handleUpdatePet } from '../controllers/petController'

const router = Router()
router.use(authMiddleware)

router.get('/',    handleListPets)
router.get('/:id', handleGetPet)
router.post('/',   handleCreatePet)
router.put('/:id', handleUpdatePet)

export default router
