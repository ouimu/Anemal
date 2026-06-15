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
import { handlePlatformLogin, platformLoginSchema } from '../controllers/platform-auth.controller'

const router = Router()

// POST /platform/auth/login — public; no auth middleware
router.post('/login', validate(platformLoginSchema), handlePlatformLogin)

export default router
