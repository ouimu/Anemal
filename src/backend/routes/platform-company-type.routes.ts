/**
 * Platform company-type routes — mounts under /platform/company-types.
 *
 * Every route requires a valid platform-plane JWT (authMiddleware +
 * requirePlane('platform')). No clinic token is accepted here.
 *
 * @module platform-company-type.routes
 */

import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePlatformPermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import {
  createCompanyTypeSchema,
  updateCompanyTypeSchema,
  handleListCompanyTypes,
  handleCreateCompanyType,
  handleUpdateCompanyType,
  handleDeleteCompanyType,
} from '../controllers/platform-company-type.controller'

const router = Router()

// All company-type routes require platform-plane authentication
router.use(authMiddleware, requirePlane('platform'))

router.get('/',     requirePlatformPermission('platform.company_types.view'),   handleListCompanyTypes)
router.post('/',    requirePlatformPermission('platform.company_types.manage'), validate(createCompanyTypeSchema), handleCreateCompanyType)
router.patch('/:id', requirePlatformPermission('platform.company_types.manage'), validate(updateCompanyTypeSchema), handleUpdateCompanyType)
router.delete('/:id', requirePlatformPermission('platform.company_types.manage'), handleDeleteCompanyType)

export default router
