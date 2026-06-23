import { Router } from 'express'
import { validate } from '../middlewares/validate.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane } from '../middlewares/permission.middleware'
import { loginRateLimiter } from '../middlewares/rate-limit.middleware'
import { handleLogin, loginSchema, handleSwitchBranch, switchBranchSchema, handleMe, handleRefresh, refreshSchema, handleLogout, logoutSchema } from '../controllers/auth.controller'

const router = Router()

// POST /auth/login — public endpoint; no auth middleware
router.post('/login', loginRateLimiter, validate(loginSchema), handleLogin)

// POST /auth/refresh — public; exchange refresh token for new access + refresh token pair
router.post('/refresh', loginRateLimiter, validate(refreshSchema), handleRefresh)

// POST /auth/logout — public; revoke the refresh token family
router.post('/logout', validate(logoutSchema), handleLogout)

// GET /auth/me — current clinic identity (roleIds from user_roles, resolved permissions)
router.get('/me', authMiddleware, requirePlane('clinic'), handleMe)

// POST /auth/switch-branch — re-issue token scoped to another branch (Phase 4)
// requirePlane('clinic') only — no permission code needed (any authenticated clinic user may switch branch)
router.post('/switch-branch', authMiddleware, requirePlane('clinic'), validate(switchBranchSchema), handleSwitchBranch)

export default router
