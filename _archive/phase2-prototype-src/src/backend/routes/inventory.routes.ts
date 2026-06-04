// routes/inventory.routes.ts — stub (expand in Phase 3)
import { Router } from 'express';
import { tenantGuard } from '../middlewares/tenant.middleware';
const router = Router();
router.use(tenantGuard);
// TODO: products CRUD, stock-in, barcode scan, alerts
router.get('/', (_req, res) => res.json({ success: true, data: [], message: 'Inventory endpoint — WIP' }));
router.get('/alerts', (_req, res) => res.json({ success: true, data: { lowStock: [], nearExpiry: [] } }));
export default router;
