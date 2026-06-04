// ==============================================
// routes/pets.routes.ts
// All routes protected by tenantGuard
// ==============================================

import { Router } from 'express';
import { tenantGuard, requireRole } from '../middlewares/tenant.middleware';
import { petsController } from '../controllers/pets.controller';

const router = Router();

// Apply tenantGuard to ALL pet routes
router.use(tenantGuard);

router.get('/search',   petsController.search);
router.get('/',         petsController.list);
router.get('/:id',      petsController.getById);
router.post('/',        petsController.create);
router.put('/:id',      petsController.update);

// Only admin or doctor can delete (soft delete)
router.delete('/:id',   requireRole('admin', 'doctor'), petsController.getById); // TODO: implement delete

export default router;
