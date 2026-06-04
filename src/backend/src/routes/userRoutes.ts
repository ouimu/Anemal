import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { rbacMiddleware } from '../middlewares/rbacMiddleware'
import { validate } from '../middlewares/validate'
import * as userController from '../controllers/userController'
import { createUserSchema, updateUserSchema } from '../controllers/userController'

const router = Router()

// All user routes: authenticated + admin only
router.use(authMiddleware)
router.use(rbacMiddleware(['admin']))

router.get('/',      userController.listUsers)
router.get('/:id',   userController.getUser)
router.post('/',     validate(createUserSchema), userController.createUser)
router.put('/:id',   validate(updateUserSchema), userController.updateUser)
router.delete('/:id', userController.deactivateUser)

export default router
