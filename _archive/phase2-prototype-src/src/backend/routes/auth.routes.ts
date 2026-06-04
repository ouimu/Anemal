// ==============================================
// routes/auth.routes.ts
// Public routes — no tenantGuard required
// ==============================================

import { Router } from 'express';
import { tenantGuard } from '../middlewares/tenant.middleware';
import { authController } from '../controllers/auth.controller';

const router = Router();

// Public
router.post('/login',    authController.login);
router.post('/refresh',  authController.refresh);
router.post('/register', authController.registerClinic); // Onboarding

// Protected
router.post('/logout', tenantGuard, authController.logout);

export default router;
