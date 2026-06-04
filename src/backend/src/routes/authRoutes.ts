import { Router } from 'express'
import { handleLogin } from '../controllers/authController'

const router = Router()

// POST /auth/login — public endpoint; no auth middleware
router.post('/login', handleLogin)

export default router
