import { Router } from 'express'
import { validate } from '../middlewares/validate'
import { handleLogin, loginSchema } from '../controllers/authController'

const router = Router()

// POST /auth/login — public endpoint; no auth middleware
router.post('/login', validate(loginSchema), handleLogin)

export default router
