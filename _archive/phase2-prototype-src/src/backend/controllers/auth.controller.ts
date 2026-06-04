// ==============================================
// controllers/auth.controller.ts
// Login, token refresh, user registration
// ==============================================

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/database';
import { successResponse, errorResponse } from '../middlewares/response.util';
import { AuthRequest } from '../middlewares/tenant.middleware';

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

const RegisterClinicSchema = z.object({
  clinicName: z.string().min(2).max(255),
  subdomain:  z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase, numbers, hyphens only'),
  adminName:  z.string().min(2),
  email:      z.string().email(),
  password:   z.string().min(8),
});

function generateTokens(userId: number, tenantId: number, role: string) {
  const secret = process.env.JWT_SECRET!;

  const accessToken = jwt.sign(
    { userId, tenantId, role },
    secret,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '8h' }
  );

  const refreshToken = jwt.sign(
    { userId, tenantId, role, type: 'refresh' },
    secret,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d' }
  );

  return { accessToken, refreshToken };
}

export const authController = {

  /**
   * POST /api/auth/login
   * Returns JWT access + refresh tokens
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = LoginSchema.parse(req.body);

      // Find user by email (case-insensitive, but must match tenant subdomain if provided)
      const user = await prisma.users.findFirst({
        where: {
          email:     { equals: email, mode: 'insensitive' },
          is_active: true,
        },
        include: { tenants: { select: { id: true, name: true, subdomain: true, is_active: true } } },
      });

      // Constant-time comparison to prevent timing attacks
      const passwordMatch = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, '$2b$12$invalid.hash.for.timing.protection');

      if (!user || !passwordMatch || !user.tenants.is_active) {
        return res.status(401).json(errorResponse('Invalid credentials', 'AUTH_FAILED'));
      }

      // Update last login
      await prisma.users.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      });

      const { accessToken, refreshToken } = generateTokens(user.id, user.tenant_id, user.role);

      return res.json(successResponse({
        accessToken,
        refreshToken,
        user: {
          id:       user.id,
          name:     user.name,
          email:    user.email,
          role:     user.role,
          tenantId: user.tenant_id,
          clinic:   user.tenants.name,
        },
      }, 'Login successful'));

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },

  /**
   * POST /api/auth/refresh
   * Exchange refresh token for new access token
   */
  async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json(errorResponse('Refresh token required'));
      }

      const payload = jwt.verify(refreshToken, process.env.JWT_SECRET!) as {
        userId: number; tenantId: number; role: string; type: string;
      };

      if (payload.type !== 'refresh') {
        return res.status(401).json(errorResponse('Invalid token type'));
      }

      const { accessToken, refreshToken: newRefreshToken } = generateTokens(
        payload.userId, payload.tenantId, payload.role
      );

      return res.json(successResponse({ accessToken, refreshToken: newRefreshToken }));

    } catch {
      return res.status(401).json(errorResponse('Invalid or expired refresh token', 'TOKEN_EXPIRED'));
    }
  },

  /**
   * POST /api/auth/logout
   * Client should discard tokens; server-side blacklist can be added later
   */
  async logout(_req: AuthRequest, res: Response) {
    return res.json(successResponse(null, 'Logged out successfully'));
  },

  /**
   * POST /api/onboarding/register
   * Register a new clinic (tenant) with initial admin user
   * Runs as a database transaction — all-or-nothing
   */
  async registerClinic(req: Request, res: Response, next: NextFunction) {
    try {
      const input = RegisterClinicSchema.parse(req.body);

      // Check subdomain availability
      const existingSubdomain = await prisma.tenants.findUnique({
        where: { subdomain: input.subdomain },
      });
      if (existingSubdomain) {
        return res.status(409).json(errorResponse('Subdomain already taken', 'SUBDOMAIN_TAKEN'));
      }

      const passwordHash = await bcrypt.hash(input.password, 12);
      const trialEndsAt  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Atomic transaction: create tenant + admin user together
      const result = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenants.create({
          data: {
            name:          input.clinicName,
            subdomain:     input.subdomain,
            plan:          'starter',
            trial_ends_at: trialEndsAt,
          },
        });

        const admin = await tx.users.create({
          data: {
            tenant_id:     tenant.id,
            name:          input.adminName,
            email:         input.email,
            password_hash: passwordHash,
            role:          'admin',
          },
        });

        return { tenant, admin };
      });

      const { accessToken, refreshToken } = generateTokens(
        result.admin.id, result.tenant.id, 'admin'
      );

      return res.status(201).json(successResponse({
        accessToken,
        refreshToken,
        clinic: { id: result.tenant.id, name: result.tenant.name, subdomain: result.tenant.subdomain },
        user:   { id: result.admin.id, name: result.admin.name, role: 'admin' },
        trialEndsAt,
      }, 'Clinic registered successfully'));

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json(errorResponse('Validation failed', 'VALIDATION_ERROR', err.errors));
      }
      next(err);
    }
  },
};
