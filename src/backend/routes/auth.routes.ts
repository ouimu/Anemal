import { Router } from 'express'
import { validate } from '../middlewares/validate.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import { handleLogin, loginSchema, handleSwitchBranch, switchBranchSchema } from '../controllers/auth.controller'

const router = Router()

// POST /auth/login — public endpoint; no auth middleware
router.post('/login', validate(loginSchema), handleLogin)

// POST /auth/switch-branch — re-issue token scoped to another branch (Phase 4)
router.post('/switch-branch', authMiddleware, validate(switchBranchSchema), handleSwitchBranch)

export default router
