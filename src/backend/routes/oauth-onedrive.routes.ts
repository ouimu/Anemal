// src/backend/routes/oauth-onedrive.routes.ts
// Top-level, public router — same reasoning as oauth-google.routes.ts (I-9):
// NOT nested under /api/settings, which globally applies authMiddleware.
import { Router } from 'express'
import { handleOneDriveOAuthCallback } from '../controllers/oauth-onedrive.controller'

const router = Router()
router.get('/onedrive/callback', handleOneDriveOAuthCallback)

export default router
