// app.ts — Express Application Entry Point — VetCare SaaS Backend
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes        from './routes/auth.routes';
import petsRoutes        from './routes/pets.routes';
import ownersRoutes      from './routes/owners.routes';
import appointmentRoutes from './routes/appointments.routes';
import emrRoutes         from './routes/emr.routes';
import inventoryRoutes   from './routes/inventory.routes';
import billingRoutes     from './routes/billing.routes';
import dashboardRoutes   from './routes/dashboard.routes';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 4000;

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Global rate limit
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

// Auth-specific stricter rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many login attempts. Please wait.' },
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API routes
const API = '/api';
app.use(`${API}/auth`,            authLimiter, authRoutes);
app.use(`${API}/pets`,            petsRoutes);
app.use(`${API}/owners`,          ownersRoutes);
app.use(`${API}/appointments`,    appointmentRoutes);
app.use(`${API}/medical-records`, emrRoutes);
app.use(`${API}/inventory`,       inventoryRoutes);
app.use(`${API}/billing`,         billingRoutes);
app.use(`${API}/dashboard`,       dashboardRoutes);

// 404
app.use((_req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  if (err.message?.includes('Unique constraint')) {
    return res.status(409).json({ success: false, message: 'Duplicate entry', code: 'CONFLICT' });
  }
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`🐾 VetCare API running on port ${PORT} [${process.env.NODE_ENV}]`);
});

export default app;
