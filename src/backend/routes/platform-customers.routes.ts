/**
 * Platform-customers routes — mounts under /platform/customers.
 *
 * Every route requires a valid platform-plane JWT (authMiddleware +
 * requirePlane('platform')). No clinic token is accepted here.
 *
 * @module platform-customers.routes
 */

import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePlatformPermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  createCustomerSchema,
  updateCustomerSchema,
  setQuotaSchema,
  updateProvisioningSchema,
  createTenantAdminUserSchema,
  handleListCustomers,
  handleCreateCustomer,
  handleGetCustomer,
  handleUpdateCustomer,
  handleSuspendCustomer,
  handleReactivateCustomer,
  handleGetEffectiveQuota,
  handleSetQuotaOverride,
  handleGetProvisioning,
  handleUpdateProvisioning,
  handleGetCustomerUsage,
  handleCreateTenantAdminUser,
  handleDeactivateTenantAdminUser,
} from '../controllers/platform-customers.controller'

const router = Router()

// All platform-customers routes require platform-plane authentication
router.use(authMiddleware, requirePlane('platform'))

// Collection
router.get('/',    requirePlatformPermission('platform.customers.view'),   handleListCustomers)
router.post('/',   requirePlatformPermission('platform.customers.manage'), validate(createCustomerSchema), handleCreateCustomer)

// Single customer
router.get( '/:id',            requirePlatformPermission('platform.customers.view'),   handleGetCustomer)
router.put( '/:id',            requirePlatformPermission('platform.customers.manage'), validate(updateCustomerSchema), handleUpdateCustomer)
router.post('/:id/suspend',    requirePlatformPermission('platform.customers.manage'), handleSuspendCustomer)
router.post('/:id/reactivate', requirePlatformPermission('platform.customers.manage'), handleReactivateCustomer)

// Quota
router.get('/:id/quota', requirePlatformPermission('platform.customers.view'),   handleGetEffectiveQuota)
router.put('/:id/quota', requirePlatformPermission('platform.quotas.manage'),    validate(setQuotaSchema), handleSetQuotaOverride)

// Usage
router.get('/:id/usage', requirePlatformPermission('platform.usage.view'), handleGetCustomerUsage)

// Provisioning
router.get('/:id/provisioning', requirePlatformPermission('platform.provisioning.manage'), handleGetProvisioning)
router.put('/:id/provisioning', requirePlatformPermission('platform.provisioning.manage'), validate(updateProvisioningSchema), handleUpdateProvisioning)

// Clinic admin users (bounded platform→clinic-plane exception, ADR-0015)
router.post('/:id/admin-users', requirePlatformPermission('platform.customers.manage'), validate(createTenantAdminUserSchema), handleCreateTenantAdminUser)
router.patch('/:id/admin-users/:userId/deactivate', requirePlatformPermission('platform.customers.manage'), handleDeactivateTenantAdminUser)

export default router
