// Settings routes (Phase 1.5-B) — mounted at /api/settings.
// Clinic sections: admin only. Personal preferences: any authenticated role.
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { rbacMiddleware } from '../middlewares/rbac.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/settings.controller'

const router = Router()
router.use(authMiddleware)

const adminOnly = rbacMiddleware(['admin'])

// S2.1 — clinic settings (8 endpoints)
router.get('/clinic',                     adminOnly, ctrl.getClinicSettings)
router.put('/clinic',                     adminOnly, validate(ctrl.clinicProfileSchema),     ctrl.updateClinicProfile)
router.put('/clinic/notifications',       adminOnly, validate(ctrl.notificationsSchema),     ctrl.updateNotifications)
router.post('/clinic/notifications/test', adminOnly, validate(ctrl.notificationsTestSchema), ctrl.testNotifications)
router.put('/clinic/payment',             adminOnly, validate(ctrl.paymentSchema),           ctrl.updatePayment)
router.put('/clinic/integrations',        adminOnly, validate(ctrl.integrationsSchema),      ctrl.updateIntegrations)
router.post('/clinic/integrations/test',  adminOnly, validate(ctrl.integrationsTestSchema),  ctrl.testIntegrations)
router.put('/clinic/hours',               adminOnly, validate(ctrl.hoursSchema),             ctrl.updateHours)

// S2.3 — personal preferences (all roles)
router.get('/personal', ctrl.getPersonalPreferences)
router.put('/personal', validate(ctrl.personalPrefsSchema), ctrl.updatePersonalPreferences)

export default router
