// routes/dashboard.routes.ts
import { Router } from 'express';
import { tenantGuard } from '../middlewares/tenant.middleware';
import { prisma } from '../config/database';
import { successResponse } from '../middlewares/response.util';
import { AuthRequest } from '../middlewares/tenant.middleware';

const router = Router();
router.use(tenantGuard);

router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    const today    = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(); tomorrow.setHours(23,59,59,999);
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [todayApts, waitingQueue, invoicesTotal, lowStock, vacDue] = await Promise.all([
      prisma.appointments.count({
        where: { tenant_id: tenantId, appointment_date: { gte: today, lte: tomorrow } },
      }),
      prisma.appointments.count({
        where: { tenant_id: tenantId, is_walk_in: true, status: { in: ['scheduled','confirmed'] }, appointment_date: { gte: today, lte: tomorrow } },
      }),
      prisma.invoices.aggregate({
        where: { tenant_id: tenantId, payment_status: 'paid', issued_at: { gte: today } },
        _sum: { total: true },
      }),
      prisma.products.count({
        where: { tenant_id: tenantId, is_active: true, stock_qty: { lte: prisma.products.fields.min_stock_qty } },
      }).catch(() => 0),
      prisma.vaccinations.count({
        where: { tenant_id: tenantId, next_due_date: { gte: today, lte: in30Days } },
      }),
    ]);

    return res.json(successResponse({
      todayAppointments:  todayApts,
      waitingQueue,
      revenueToday:       Number(invoicesTotal._sum.total ?? 0),
      lowStockAlerts:     lowStock,
      vaccinationsDueSoon: vacDue,
    }));
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Stats unavailable' });
  }
});

export default router;
