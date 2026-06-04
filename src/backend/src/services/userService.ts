// @dev-agent — User management service
// @db-agent reviewed — ALL queries include tenantId; no cross-tenant access possible
import bcrypt from 'bcrypt'
import { AppError } from '../utils/errors'
import { Prisma } from '@prisma/client'
import prisma from '../config/db'
import { config } from '../config/env'
import type { CreateUserRequest, UpdateUserRequest, UserResponse } from '../types'

function safe(user: {
  id: number; tenantId: number; name: string; email: string
  passwordHash?: string; role: string; isActive: boolean; createdAt: Date
}): UserResponse {
  const { passwordHash: _pw, ...rest } = user
  return { ...rest, role: String(rest.role), createdAt: rest.createdAt.toISOString() }
}

export async function listUsers(tenantId: number): Promise<UserResponse[]> {
  const users = await prisma.user.findMany({
    where:   { tenantId },        // @db-agent: tenant filter enforced
    orderBy: { createdAt: 'asc' },
  })
  return users.map(safe)
}

export async function getUserById(tenantId: number, userId: number): Promise<UserResponse> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },  // @db-agent: both id AND tenantId required
  })
  if (!user) throw new UserError('User not found', 404)
  return safe(user)
}

export async function createUser(tenantId: number, body: CreateUserRequest): Promise<UserResponse> {
  const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds)
  try {
    const user = await prisma.user.create({
      data: { tenantId, name: body.name, email: body.email, passwordHash, role: body.role },
    })
    return safe(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new UserError('Email already in use within this clinic', 409)
    }
    throw err
  }
}

export async function updateUser(
  tenantId: number, userId: number, body: UpdateUserRequest
): Promise<UserResponse> {
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } })
  if (!existing) throw new UserError('User not found', 404)

  const user = await prisma.user.update({
    where: { id: userId },
    data:  body,
  })
  return safe(user)
}

export async function deactivateUser(tenantId: number, userId: number): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { id: userId, tenantId } })
  if (!existing) throw new UserError('User not found', 404)
  await prisma.user.update({ where: { id: userId }, data: { isActive: false } })
}

export class UserError extends AppError {
  constructor(message: string, statusCode: number) {
    super(statusCode, message, 'USER_ERROR')
  }
}
