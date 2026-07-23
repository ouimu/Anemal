// Settings routes (Phase 1.5-B) — mounted at /api/settings.
// Clinic sections: clinic.profile/hours/payment/integrations permissions.
// Personal preferences: requirePlane('clinic') only — any authenticated clinic user.
import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/settings.controller'

const router = Router()
router.use(authMiddleware)

// S2.1 — clinic settings (8 endpoints)
router.get('/clinic',                     requirePlane('clinic'), requirePermission('clinic.profile.view'),        ctrl.getClinicSettings)
router.put('/clinic',                     requirePlane('clinic'), requirePermission('clinic.profile.edit'),        validate(ctrl.clinicProfileSchema),     ctrl.updateClinicProfile)
router.put('/clinic/notifications',       requirePlane('clinic'), requirePermission('clinic.integrations.edit'),   validate(ctrl.notificationsSchema),     ctrl.updateNotifications)
router.post('/clinic/notifications/test', requirePlane('clinic'), requirePermission('clinic.integrations.edit'),   validate(ctrl.notificationsTestSchema), ctrl.testNotifications)
router.put('/clinic/payment',             requirePlane('clinic'), requirePermission('clinic.payment.edit'),        validate(ctrl.paymentSchema),           ctrl.updatePayment)
router.put('/clinic/integrations',        requirePlane('clinic'), requirePermission('clinic.integrations.edit'),   validate(ctrl.integrationsSchema),      ctrl.updateIntegrations)
router.post('/clinic/integrations/test',  requirePlane('clinic'), requirePermission('clinic.integrations.edit'),   validate(ctrl.integrationsTestSchema),  ctrl.testIntegrations)
router.put('/clinic/hours',               requirePlane('clinic'), requirePermission('clinic.hours.edit'),          validate(ctrl.hoursSchema),             ctrl.updateHours)
router.get('/clinic/storage-config',      requirePlane('clinic'), requirePermission('clinic.profile.view'),        ctrl.getStorageConfig)
router.put('/clinic/storage-config',      requirePlane('clinic'), requirePermission('clinic.integrations.edit'),   validate(ctrl.storageConfigSchema),     ctrl.updateStorageConfig)

// S2.3 — personal preferences (any authenticated clinic user — plane check only)
router.get('/personal', requirePlane('clinic'), ctrl.getPersonalPreferences)
router.put('/personal', requirePlane('clinic'), validate(ctrl.personalPrefsSchema), ctrl.updatePersonalPreferences)

export default router
