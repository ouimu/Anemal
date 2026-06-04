import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { rbacMiddleware } from '../middlewares/rbac.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as userController from '../controllers/user.controller'
import { createUserSchema, updateUserSchema } from '../controllers/user.controller'

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
