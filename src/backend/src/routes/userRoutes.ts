import { Router } from 'express'
import { authMiddleware } from '../middlewares/authMiddleware'
import { rbacMiddleware } from '../middlewares/rbacMiddleware'
import * as userController from '../controllers/userController'

const router = Router()

// All user routes: authenticated + admin only
router.use(authMiddleware)
router.use(rbacMiddleware(['admin']))

router.get('/',      userController.listUsers)
router.get('/:id',   userController.getUser)
router.post('/',     userController.createUser)
router.put('/:id',   userController.updateUser)
router.delete('/:id', userController.deactivateUser)

export default router
