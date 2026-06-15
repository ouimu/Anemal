import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import authRoutes from './routes/auth.routes'
import platformAuthRoutes from './routes/platform-auth.routes'
import userRoutes from './routes/user.routes'
import adminRoutes from './routes/admin.routes'
import clinicRoutes from './routes/clinic.routes'
import ownerRoutes from './routes/owner.routes'
import petRoutes from './routes/pet.routes'
import searchRoutes from './routes/search.routes'
import appointmentRoutes from './routes/appointment.routes'
import medicalRecordRoutes from './routes/medical-record.routes'
import prescriptionRoutes from './routes/prescription.routes'
import vaccinationRoutes from './routes/vaccination.routes'
import productRoutes from './routes/product.routes'
import invoiceRoutes from './routes/invoice.routes'
import reportRoutes from './routes/report.routes'
import subscriptionRoutes from './routes/subscription.routes'
import branchRoutes from './routes/branch.routes'
import transferRoutes from './routes/transfer.routes'
import hospitalizationRoutes from './routes/hospitalization.routes'
import bloodBankRoutes from './routes/blood-bank.routes'
import groomingRoutes from './routes/grooming.routes'
import loyaltyRoutes from './routes/loyalty.routes'
import reminderRoutes from './routes/reminder.routes'
import auditRoutes from './routes/audit.routes'
import settingsRoutes from './routes/settings.routes'
import systemSettingsRoutes from './routes/system-settings.routes'
import uploadRoutes from './routes/upload.routes'
import roleRoutes from './routes/role.routes'
import { auditMiddleware } from './middlewares/audit.middleware'
import { notFound, errorHandler } from './middlewares/error-handler.middleware'

const app = express()

// Security & parsing
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Health check — no auth required
app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Audit trail — records successful state-changing requests (reads req.context lazily at finish)
app.use(auditMiddleware)

// Routes
app.use('/platform/auth',   platformAuthRoutes)
app.use('/auth',            authRoutes)
app.use('/users',           userRoutes)
app.use('/admin/system-settings', systemSettingsRoutes) // superadmin only — before /admin
app.use('/admin',           adminRoutes)
app.use('/clinic',          clinicRoutes)
app.use('/api/owners',      ownerRoutes)
app.use('/api/pets',        petRoutes)
app.use('/api/search',      searchRoutes)
app.use('/api/appointments',appointmentRoutes)
app.use('/api/medical-records', medicalRecordRoutes)
app.use('/api/prescriptions',   prescriptionRoutes)
app.use('/api/vaccinations',    vaccinationRoutes)
app.use('/api/products',        productRoutes)
app.use('/api/invoices',        invoiceRoutes)
app.use('/api/reports',         reportRoutes)
app.use('/api/subscription',    subscriptionRoutes)
app.use('/api/branches',        branchRoutes)
app.use('/api/inventory/transfers', transferRoutes)
app.use('/api/hospitalizations', hospitalizationRoutes)
app.use('/api/blood-bank',      bloodBankRoutes)
app.use('/api/grooming',        groomingRoutes)
app.use('/api/loyalty',         loyaltyRoutes)
app.use('/api/reminders',       reminderRoutes)
app.use('/api/audit',           auditRoutes)
app.use('/api/settings',        settingsRoutes)
app.use('/api/upload',          uploadRoutes)
app.use('/clinic/roles',        roleRoutes)

// 404 fallback + global error handler (must be last)
app.use(notFound)
app.use(errorHandler)

export default app
