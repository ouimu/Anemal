// routes/owners.routes.ts — stub (expand in Phase 2)
import { Router } from 'express';
import { tenantGuard } from '../middlewares/tenant.middleware';
const router = Router();
router.use(tenantGuard);
// TODO: implement GET / POST / PUT owners controllers
router.get('/', (_req, res) => res.json({ success: true, data: [], message: 'Owners endpoint — WIP' }));
export default router;
