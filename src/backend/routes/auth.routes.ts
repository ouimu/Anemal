import { Router } from 'express'
import { validate } from '../middlewares/validate.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane } from '../middlewares/permission.middleware'
import { handleLogin, loginSchema, handleSwitchBranch, switchBranchSchema, handleMe } from '../controllers/auth.controller'

const router = Router()

// POST /auth/login — public endpoint; no auth middleware
router.post('/login', validate(loginSchema), handleLogin)

// GET /auth/me — current clinic identity (roleIds from user_roles, resolved permissions)
router.get('/me', authMiddleware, requirePlane('clinic'), handleMe)

// POST /auth/switch-branch — re-issue token scoped to another branch (Phase 4)
// requirePlane('clinic') only — no permission code needed (any authenticated clinic user may switch branch)
router.post('/switch-branch', authMiddleware, requirePlane('clinic'), validate(switchBranchSchema), handleSwitchBranch)

export default router
