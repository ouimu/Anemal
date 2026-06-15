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
import { requirePlane } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  createCustomerSchema,
  updateCustomerSchema,
  setQuotaSchema,
  handleListCustomers,
  handleCreateCustomer,
  handleGetCustomer,
  handleUpdateCustomer,
  handleSuspendCustomer,
  handleReactivateCustomer,
  handleGetEffectiveQuota,
  handleSetQuotaOverride,
} from '../controllers/platform-customers.controller'

const router = Router()

// All platform-customers routes require platform-plane authentication
router.use(authMiddleware, requirePlane('platform'))

// Collection
router.get('/',    handleListCustomers)
router.post('/',   validate(createCustomerSchema), handleCreateCustomer)

// Single customer
router.get( '/:id',            handleGetCustomer)
router.put( '/:id',            validate(updateCustomerSchema), handleUpdateCustomer)
router.post('/:id/suspend',    handleSuspendCustomer)
router.post('/:id/reactivate', handleReactivateCustomer)

// Quota
router.get('/:id/quota', handleGetEffectiveQuota)
router.put('/:id/quota', validate(setQuotaSchema), handleSetQuotaOverride)

export default router
