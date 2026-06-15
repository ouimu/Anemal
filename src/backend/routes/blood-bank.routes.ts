import { Router } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { requirePlane, requirePermission } from '../middlewares/permission.middleware'
import { validate } from '../middlewares/validate.middleware'
import * as ctrl from '../controllers/blood-bank.controller'
import { donorSchema, collectionSchema, transfusionSchema } from '../services/blood-bank.service'

const router = Router()
router.use(authMiddleware)

router.get('/donors',        requirePlane('clinic'), requirePermission('bloodbank.view'),   ctrl.listDonors)
router.post('/donors',       requirePlane('clinic'), requirePermission('bloodbank.manage'), validate(donorSchema),       ctrl.registerDonor)
router.get('/collections',   requirePlane('clinic'), requirePermission('bloodbank.view'),   ctrl.listBags)
router.post('/collections',  requirePlane('clinic'), requirePermission('bloodbank.manage'), validate(collectionSchema),  ctrl.recordCollection)
router.get('/transfusions',  requirePlane('clinic'), requirePermission('bloodbank.view'),   ctrl.listTransfusions)
router.post('/transfusions', requirePlane('clinic'), requirePermission('bloodbank.manage'), validate(transfusionSchema), ctrl.recordTransfusion)

export default router
