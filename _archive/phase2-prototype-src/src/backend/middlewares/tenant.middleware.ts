// ==============================================
// middlewares/tenant.middleware.ts
// CRITICAL: This file enforces tenant isolation
// Every API request MUST pass through this middleware
// ==============================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';

export interface TokenPayload {
  userId: number;
  tenantId: number;
  role: 'admin' | 'doctor' | 'staff';
  iat: number;
  exp: number;
}

// Extend Express Request to carry tenant context
export interface AuthRequest extends Request {
  tenantId: number;
  userId: number;
  userRole: 'admin' | 'doctor' | 'staff';
}

/**
 * tenantGuard — MUST be applied to ALL protected routes
 * 
 * 1. Verifies JWT token
 * 2. Extracts tenantId, userId, role from token
 * 3. Sets PostgreSQL session variable for RLS
 * 4. Injects tenant context into req object
 */
export const tenantGuard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const secret = process.env.JWT_SECRET;

    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload = jwt.verify(token, secret) as TokenPayload;

    if (!payload.tenantId) {
      res.status(401).json({ success: false, message: 'Invalid token: missing tenant context' });
      return;
    }

    // Inject tenant context into request — use this in all controllers
    req.tenantId = payload.tenantId;
    req.userId   = payload.userId;
    req.userRole = payload.role;

    // Set PostgreSQL session variable for Row Level Security
    // This is the backup defense layer
    await prisma.$executeRaw`
      SELECT set_config('app.current_tenant_id', ${String(payload.tenantId)}, true)
    `;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

/**
 * requireRole — RBAC middleware factory
 * Usage: requireRole('admin') or requireRole('admin', 'doctor')
 */
export const requireRole = (...roles: Array<'admin' | 'doctor' | 'staff'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!roles.includes(req.userRole)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  };
};

// ==============================================
// Usage example in routes:
//
// import { tenantGuard, requireRole } from '../middlewares/tenant.middleware';
//
// router.get('/users', tenantGuard, requireRole('admin'), usersController.list);
// router.get('/pets', tenantGuard, petsController.list);
// router.delete('/pets/:id', tenantGuard, requireRole('admin', 'doctor'), petsController.delete);
// ==============================================
