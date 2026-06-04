// routes/emr.routes.ts
import { Router } from 'express';
import { tenantGuard, requireRole } from '../middlewares/tenant.middleware';
import { emrController } from '../controllers/emr.controller';

const router = Router();
router.use(tenantGuard);

router.get('/',                                           emrController.listByPet);
router.get('/:id',                                        emrController.getById);
router.post('/',                                          requireRole('admin','doctor'), emrController.create);
router.put('/:id',                                        requireRole('admin','doctor'), emrController.update);
router.post('/:id/complete',                              requireRole('admin','doctor'), emrController.markComplete);
router.post('/:id/prescriptions',                         requireRole('admin','doctor'), emrController.addPrescription);
router.delete('/:id/prescriptions/:prescriptionId',       requireRole('admin','doctor'), emrController.removePrescription);

export default router;
