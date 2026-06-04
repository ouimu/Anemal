// routes/appointments.routes.ts
import { Router } from 'express';
import { tenantGuard } from '../middlewares/tenant.middleware';
import { appointmentsController } from '../controllers/appointments.controller';

const router = Router();
router.use(tenantGuard);

router.get('/today',      appointmentsController.todaySchedule);
router.get('/queue',      appointmentsController.walkInQueue);
router.get('/',           appointmentsController.calendar);
router.post('/',          appointmentsController.create);
router.put('/:id/status', appointmentsController.updateStatus);

export default router;
