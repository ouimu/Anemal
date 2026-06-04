import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { validate } from '../middlewares/validate.middleware'
import { handleListPets, handleGetPet, handleCreatePet, handleUpdatePet } from '../controllers/pet.controller'
import { createPetSchema, updatePetSchema } from '../services/pet.service'

const router = Router()
router.use(authMiddleware)

router.get('/',    handleListPets)
router.get('/:id', handleGetPet)
router.post('/',   validate(createPetSchema), handleCreatePet)
router.put('/:id', validate(updatePetSchema), handleUpdatePet)

export default router
