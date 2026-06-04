import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import { handleListPets, handleGetPet, handleCreatePet, handleUpdatePet } from '../controllers/petController'
import { createPetSchema, updatePetSchema } from '../services/petService'

const router = Router()
router.use(authMiddleware)

router.get('/',    handleListPets)
router.get('/:id', handleGetPet)
router.post('/',   validate(createPetSchema), handleCreatePet)
router.put('/:id', validate(updatePetSchema), handleUpdatePet)

export default router
