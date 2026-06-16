/**
 * Platform-auth routes — mounts under /platform/auth.
 *
 * POST /platform/auth/login is a public endpoint (no authMiddleware).
 * Future platform-plane protected routes will use:
 *   authMiddleware → requirePlane('platform') → requirePermission(...)
 *
 * @module platform-auth.routes
 */

import { Router } from 'express'
import { validate } from '../middlewares/validate.middleware'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane } from '../middlewares/permission.middleware'
import { handlePlatformLogin, platformLoginSchema, handlePlatformMe } from '../controllers/platform-auth.controller'

const router = Router()

// POST /platform/auth/login — public; no auth middleware
router.post('/login', validate(platformLoginSchema), handlePlatformLogin)

// GET /platform/auth/me — current platform identity + permissions stub
router.get('/me', authMiddleware, requirePlane('platform'), handlePlatformMe)

export default router
