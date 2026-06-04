// routes/billing.routes.ts — stub (expand in Phase 3)
import { Router } from 'express';
import { tenantGuard } from '../middlewares/tenant.middleware';
const router = Router();
router.use(tenantGuard);
// TODO: invoice create, payment, PDF, QR code generation
router.get('/',    (_req, res) => res.json({ success: true, data: [], message: 'Billing endpoint — WIP' }));
router.post('/',   (_req, res) => res.status(201).json({ success: true, message: 'Invoice creation — WIP' }));
export default router;
