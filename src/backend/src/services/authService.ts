// @dev-agent — Business logic only; no direct DB calls from controller
// @db-agent reviewed — tenantId resolved from subdomain before any user lookup
import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import prisma from '../config/db'
import { signToken } from '../config/jwt'
import type { LoginRequest, LoginResponse } from '../types'

export async function login(body: LoginRequest): Promise<LoginResponse> {
  // 1. Resolve tenant from subdomain
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain: body.subdomain },
  })
  if (!tenant || !tenant.isActive) {
    throw new AuthError('Invalid credentials', 401)
  }

  // 2. Find user scoped to this tenant
  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: body.email } },
  })
  if (!user || !user.isActive) {
    throw new AuthError('Invalid credentials', 401)
  }

  // 3. Verify password
  const passwordMatch = await bcrypt.compare(body.password, user.passwordHash)
  if (!passwordMatch) {
    throw new AuthError('Invalid credentials', 401)
  }

  // 4. Sign JWT — tenantId embedded
  const token = signToken({ userId: user.id, tenantId: tenant.id, role: user.role })

  return {
    token,
    userId:   user.id,
    tenantId: tenant.id,
    role:     user.role,
    name:     user.name,
  }
}

export class AuthError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'AUTH_ERROR')
  }
}
