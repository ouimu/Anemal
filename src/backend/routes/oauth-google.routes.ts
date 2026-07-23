// src/backend/routes/oauth-google.routes.ts
// Top-level, provider-generic public router (ADR-0023 §14) — deliberately
// NOT nested under /api/settings. settings.routes.ts applies
// router.use(authMiddleware) at its top, which 401s every request matching
// its mount prefix regardless of route existence; a same-prefix public
// sub-router only avoids that if registered before that line, an ordering
// dependency this route removes entirely by living at a different prefix.
import { Router } from 'express'
import { handleGoogleOAuthCallback } from '../controllers/oauth-google.controller'

const router = Router()
router.get('/google/callback', handleGoogleOAuthCallback)

export default router
